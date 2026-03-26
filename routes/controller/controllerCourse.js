const express = require("express");
const router = express.Router();
const { Course, Transaction, User, Wishlist } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const {
  createCourseSchema,
  getCoursesSchema,
  updateCourseSchema,
  updateCourseParamsSchema,
} = require("../services/validations/courseValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

// Create Course
const createCourse = async (req, res) => {
  try {
    const { venueAddress, ...courseData } = req.body;

    // Transform venueAddress to GeoJSON Point
    const location = {
      type: "Point",
      coordinates: [venueAddress.longitude, venueAddress.latitude],
      city: venueAddress.city,
      country: venueAddress.country,
      address: venueAddress.address,
      state: venueAddress.state,
      zipcode: venueAddress.zipcode,
    };

    const newCourse = new Course({
      ...courseData,
      venueAddress: location,
      createdBy: req.user.userId,
    });

    await newCourse.save();
    const course = newCourse.toObject();

    // Format poster image URLs if any
    if (Array.isArray(course.posterImage)) {
      course.posterImage = course.posterImage.map((img) =>
        formatResponseUrl(img),
      );
    }

    // Format gallery image URLs if any
    if (Array.isArray(course.galleryImages)) {
      course.galleryImages = course.galleryImages.map((img) =>
        formatResponseUrl(img),
      );
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      course: course,
    });
  } catch (error) {
    console.error("Error in createCourse:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

function getSessionStatus(schedule) {
  if (!schedule) return "PAST";

  const now = new Date();
  const start = new Date(schedule.startDate);
  const end = new Date(schedule.endDate);

  if (now >= start && now <= end) return "LIVE";
  if (now < start) return "UPCOMING";
  return "PAST";
}

const getCourses = async (req, res) => {
  try {
    const {
      filter = "all",
      latitude,
      longitude,
      radius = 200,
      categoryId,
      userId,
      search,
      page = 1,
      limit = 10,
      startDate: customStartDate,
      endDate: customEndDate,
    } = req.query;

    const now = new Date();
    const skip = (page - 1) * limit;
    const filters = filter.split(",").map((f) => f.trim().toLowerCase());

    // ===============================
    // 1. Build MongoDB Query
    // ===============================
    let query = {};
    const mongoose = require("mongoose");

    // User ID
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.createdBy = new mongoose.Types.ObjectId(userId);
    }

    // Multiple Categories
    if (categoryId) {
      const catIds = categoryId
        .split(",")
        .filter((id) => mongoose.Types.ObjectId.isValid(id.trim()));
      if (catIds.length > 0) {
        query.courseCategory = { $in: catIds.map((id) => new mongoose.Types.ObjectId(id)) };
      }
    }

    // Search
    if (search) {
      query.$or = [
        { courseTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
      ];
    }

    // Time-based Conditions (to be used with $elemMatch on schedules)
    let scheduleAndConditions = [];

    // Custom Date Range
    if (customStartDate || customEndDate) {
      let dateCond = {};
      if (customStartDate) {
        const sD = new Date(customStartDate);
        if (!isNaN(sD.getTime())) {
          sD.setHours(0, 0, 0, 0);
          dateCond.$gte = sD;
        }
      }
      if (customEndDate) {
        const eD = new Date(customEndDate);
        if (!isNaN(eD.getTime())) {
          eD.setHours(23, 59, 59, 999);
          dateCond.$lte = eD;
        }
      }
      if (Object.keys(dateCond).length > 0) {
        scheduleAndConditions.push({ startDate: dateCond });
      }
    }

    // Apply specific filters
    for (const f of filters) {
      switch (f) {
        case "upcoming":
          query.$or = (query.$or || []).concat([
            { status: { $in: ["Upcoming", "Live"] } },
            { "schedules.startDate": { $gt: now } },
          ]);
          break;
        case "past":
          query.$or = (query.$or || []).concat([
            { status: "Past" },
            { schedules: { $not: { $elemMatch: { endDate: { $gte: now } } } } },
          ]);
          break;
        case "today":
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date(now);
          endOfToday.setHours(23, 59, 59, 999);
          scheduleAndConditions.push({ startDate: { $gte: startOfToday, $lte: endOfToday } });
          break;
        case "thisweek":
          const startOfWeek = new Date(now);
          const currentDay = startOfWeek.getDay();
          const diff = currentDay === 0 ? -6 : 1 - currentDay;
          startOfWeek.setDate(startOfWeek.getDate() + diff);
          startOfWeek.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          scheduleAndConditions.push({ startDate: { $gte: startOfWeek, $lte: endOfWeek } });
          break;
        case "nextweek":
          const startOfNextWeek = new Date(now);
          const currentDayNW = startOfNextWeek.getDay();
          const diffNW = currentDayNW === 0 ? -6 : 1 - currentDayNW;
          startOfNextWeek.setDate(startOfNextWeek.getDate() + diffNW + 7);
          startOfNextWeek.setHours(0, 0, 0, 0);
          const endOfNextWeek = new Date(startOfNextWeek);
          endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
          endOfNextWeek.setHours(23, 59, 59, 999);
          scheduleAndConditions.push({ startDate: { $gte: startOfNextWeek, $lte: endOfNextWeek } });
          break;
        case "recommended":
          let userCategories = [];
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const jwt = require("jsonwebtoken");
              const token = authHeader.split(" ")[1];
              const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
              const user = await User.findById(decoded.userId).lean();
              if (user?.categories?.length > 0) {
                userCategories = user.categories;
                query.courseCategory = { $in: userCategories.map((id) => new mongoose.Types.ObjectId(id)) };
              }
            } catch (err) { }
          }
          break;
      }
    }

    if (scheduleAndConditions.length > 0) {
      query.schedules = { $elemMatch: { $and: scheduleAndConditions } };
    }

    // nearYou fallback logic if no coords
    if (filters.includes("nearyou") && !(latitude && longitude)) {
      let city = null,
        country = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const jwt = require("jsonwebtoken");
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
          const user = await User.findById(decoded.userId).lean();
          city = user?.location?.city || null;
          country = user?.location?.country || null;
        } catch (err) { }
      }
      if (city) query["venueAddress.city"] = city;
      else if (country) query["venueAddress.country"] = country;
      else if (!filters.includes("all") && filters.length === 1) {
        return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
          totalCourses: 0,
          currentPage: Number(page),
          totalPages: 0,
          coursesPerPage: Number(limit),
          courses: [],
        });
      }
    }

    // ===============================
    // 2. Execute Query
    // ===============================
    let courses = [];
    let totalCoursesCount = 0;

    if (latitude && longitude) {
      const geoAggCourses = await Course.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] },
            distanceField: "distance",
            maxDistance: parseFloat(radius) * 1000,
            spherical: true,
            query: query,
          },
        },
        { $sort: { isFeatured: -1, distance: 1 } },
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: "categories",
            localField: "courseCategory",
            foreignField: "_id",
            as: "courseCategory",
          },
        },
        { $unwind: { path: "$courseCategory", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            pipeline: [{ $project: { firstName: 1, lastName: 1, profileImage: 1, isVerified: 1 } }],
            as: "createdBy",
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      ]);

      const countAgg = await Course.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] },
            distanceField: "distance",
            maxDistance: parseFloat(radius) * 1000,
            spherical: true,
            query: query,
          },
        },
        { $count: "total" },
      ]);
      courses = geoAggCourses;
      totalCoursesCount = countAgg[0]?.total || 0;
    } else {
      totalCoursesCount = await Course.countDocuments(query);
      courses = await Course.find(query)
        .populate("courseCategory")
        .populate("createdBy", "firstName lastName profileImage isVerified")
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();
    }

    // ===============================
    // 3. Data Enrichment & Formatting
    // ===============================
    const courseIds = courses.map((c) => c._id);
    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID" } },
      {
        $group: {
          _id: { course: "$courseId", schedule: "$scheduleId" },
          count: { $sum: 1 },
        },
      },
    ]);

    const bookingMap = {};
    const courseBookingMap = {};
    bookingCounts.forEach((b) => {
      const courseId = b._id.course.toString();
      const scheduleId = b._id.schedule ? b._id.schedule.toString() : "null";
      bookingMap[`${courseId}_${scheduleId}`] = b.count;
      courseBookingMap[courseId] = (courseBookingMap[courseId] || 0) + b.count;
    });

    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET_KEY);
        viewerId = decoded.userId;
      } catch { }
    }

    const bookedCourseIds = new Set();
    const bookedScheduleMap = {};
    if (viewerId) {
      const bookings = await Transaction.find({
        userId: viewerId,
        courseId: { $in: courseIds },
        status: "PAID",
      }).select("courseId scheduleId");
      bookings.forEach((b) => {
        bookedCourseIds.add(b.courseId.toString());
        if (b.scheduleId) {
          const cId = b.courseId.toString();
          if (!bookedScheduleMap[cId]) bookedScheduleMap[cId] = new Set();
          bookedScheduleMap[cId].add(b.scheduleId.toString());
        }
      });
    }

    // Helper: resolve current schedule
    function resolveCurrentSchedule(schedules = []) {
      return (
        schedules
          .map((s) => ({
            ...s,
            start: new Date(s.startDate),
            end: new Date(s.endDate),
          }))
          .filter((s) => s.end >= now)
          .sort((a, b) => a.start - b.start)[0] || null
      );
    }

    const formattedCourses = courses.map((course) => {
      if (course.schedules && Array.isArray(course.schedules)) {
        course.schedules = course.schedules.map((schedule) => {
          const schedId = schedule._id?.toString();
          const acquired = bookingMap[`${course._id}_${schedId}`] || 0;
          const total = course.totalSeats;
          const available = Math.max(0, total - acquired);
          const userBookedSchedules = bookedScheduleMap[course._id.toString()];
          return {
            ...schedule,
            totalSeats: total,
            acquiredSeats: acquired,
            availableSeats: available,
            isFull: available <= 0,
            isBooked: userBookedSchedules ? userBookedSchedules.has(schedId) : false,
          };
        });
      }

      const currentSchedule = resolveCurrentSchedule(course.schedules);
      const sessionStatus = getSessionStatus(currentSchedule);

      if (Array.isArray(course.posterImage)) course.posterImage = course.posterImage.map(formatResponseUrl);
      if (Array.isArray(course.galleryImages)) course.galleryImages = course.galleryImages.map(formatResponseUrl);
      if (course.courseCategory?.image) course.courseCategory.image = formatResponseUrl(course.courseCategory.image);
      if (course.createdBy?.profileImage) course.createdBy.profileImage = formatResponseUrl(course.createdBy.profileImage);

      let duration = null;
      if (currentSchedule?.startTime && currentSchedule?.endTime) {
        const [sh, sm] = currentSchedule.startTime.split(":").map(Number);
        const [eh, em] = currentSchedule.endTime.split(":").map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 1440;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        duration = h ? (m ? `${h}H ${m}min` : `${h}H`) : `${m}min`;
      }

      const acquiredTotal = courseBookingMap[course._id.toString()] || 0;
      return {
        ...course,
        currentSchedule,
        sessionStatus,
        isAvailable: !!currentSchedule,
        duration,
        acquiredSeats: acquiredTotal,
        leftSeats: Math.max(0, course.totalSeats - acquiredTotal),
        isBooked: bookedCourseIds.has(course._id.toString()),
      };
    });

    // Secondary sort: nearest schedule
    formattedCourses.sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      if (a.currentSchedule && !b.currentSchedule) return -1;
      if (!a.currentSchedule && b.currentSchedule) return 1;
      if (a.currentSchedule && b.currentSchedule) {
        return new Date(a.currentSchedule.startDate) - new Date(b.currentSchedule.startDate);
      }
      return 0;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      totalCourses: totalCoursesCount,
      currentPage: Number(page),
      totalPages: Math.ceil(totalCoursesCount / limit),
      coursesPerPage: Number(limit),
      courses: formattedCourses,
    });
  } catch (error) {
    console.error("Error in getCourses:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin List API
const getCoursesAdmin = async (req, res) => {
  try {
    const { categoryId, search, page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;
    let query = {};

    // Apply category filter
    if (categoryId) {
      query.courseCategory = categoryId;
    }

    // Apply search
    if (search) {
      query.$or = [
        { courseTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
      ];
    }

    const totalCourses = await Course.countDocuments(query);
    const totalPages = Math.ceil(totalCourses / limit);

    const courses = await Course.find(query)
      .populate("courseCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    const courseIds = courses.map((c) => c._id);
    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID" } },
      { $group: { _id: "$courseId", count: { $sum: 1 } } },
    ]);

    const bookingMap = {};
    bookingCounts.forEach((b) => {
      bookingMap[b._id.toString()] = b.count;
    });

    const formattedCourses = courses.map((course) => {
      // Format images
      if (Array.isArray(course.posterImage)) {
        course.posterImage = course.posterImage.map(formatResponseUrl);
      }
      if (Array.isArray(course.galleryImages)) {
        course.galleryImages = course.galleryImages.map(formatResponseUrl);
      }
      if (course.courseCategory && course.courseCategory.image) {
        course.courseCategory.image = formatResponseUrl(
          course.courseCategory.image,
        );
      }
      if (course.createdBy && course.createdBy.profileImage) {
        course.createdBy.profileImage = formatResponseUrl(
          course.createdBy.profileImage,
        );
      }

      // Calculate Duration
      let duration = null;
      if (course.schedules && course.schedules.length > 0) {
        const sched = course.schedules[0];
        if (sched.startTime && sched.endTime) {
          const [startH, startM] = sched.startTime.split(":").map(Number);
          const [endH, endM] = sched.endTime.split(":").map(Number);
          let diffMins = endH * 60 + endM - (startH * 60 + startM);
          if (diffMins < 0) diffMins += 24 * 60;

          if (diffMins > 0) {
            const hours = Math.floor(diffMins / 60);
            const minutes = diffMins % 60;
            if (hours > 0 && minutes > 0) duration = `${hours}H ${minutes}min`;
            else if (hours > 0) duration = `${hours}H`;
            else duration = `${minutes}min`;
          }
        }
      }
      course.duration = duration;

      // Calculate aggregated seat stats
      const totalSeats = course.totalSeats || 0;
      const acquiredSeats = bookingMap[course._id.toString()] || 0;

      course.totalSeats = totalSeats;
      course.acquiredSeats = acquiredSeats;
      course.leftSeats = Math.max(0, totalSeats - acquiredSeats);

      return course;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      totalCourses,
      currentPage: Number(page),
      totalPages,
      coursesPerPage: Number(limit),
      courses: formattedCourses,
    });
  } catch (error) {
    console.error("Error in getCoursesAdmin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Update Course
const updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;

    // 1. Check if course exists
    const existingCourse = await Course.findById(courseId);
    if (!existingCourse) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND || "Course not found",
      );
    }

    // 2. Verify ownership - only creator can update
    if (existingCourse.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.UNAUTHORIZED_ACCESS ||
        "You are not authorized to edit this course",
      );
    }

    // 3. Handle totalSeats update safely
    if (updateData.totalSeats !== undefined) {
      // Count total enrolled students across all schedules
      const enrolledCount = await Transaction.countDocuments({
        courseId: courseId,
        status: "PAID",
      });

      if (updateData.totalSeats < enrolledCount) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          `Cannot reduce total seats below ${enrolledCount} enrolled students`,
        );
      }
    }

    // 4. Transform venueAddress to GeoJSON if provided
    if (updateData.venueAddress) {
      updateData.venueAddress = {
        type: "Point",
        coordinates: [
          updateData.venueAddress.longitude,
          updateData.venueAddress.latitude,
        ],
        city: updateData.venueAddress.city,
        country: updateData.venueAddress.country,
        address: updateData.venueAddress.address,
        state: updateData.venueAddress.state,
        zipcode: updateData.venueAddress.zipcode,
      };
    }

    // 5. Validate schedules if provided
    if (updateData.schedules) {
      for (const schedule of updateData.schedules) {
        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        if (startDate >= endDate) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "Schedule start date must be before end date",
          );
        }
      }

      // Validate enrollment type vs schedules count
      const enrollmentType =
        updateData.enrollmentType || existingCourse.enrollmentType;
      if (
        enrollmentType === "fixedStart" &&
        updateData.schedules.length !== 1
      ) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Fixed start courses must have exactly one schedule",
        );
      }
    }

    // 6. Update the course
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $set: updateData },
      { new: true, runValidators: true },
    )
      .populate("courseCategory")
      .populate("createdBy", "firstName lastName profileImage isVerified");

    if (!updatedCourse) {
      return apiErrorRes(
        HTTP_STATUS.SERVER_ERROR,
        res,
        "Failed to update course",
      );
    }

    // 7. Format response
    const formattedCourse = updatedCourse.toObject();

    if (Array.isArray(formattedCourse.posterImage)) {
      formattedCourse.posterImage =
        formattedCourse.posterImage.map(formatResponseUrl);
    }
    if (Array.isArray(formattedCourse.galleryImages)) {
      formattedCourse.galleryImages =
        formattedCourse.galleryImages.map(formatResponseUrl);
    }
    if (formattedCourse.courseCategory?.image) {
      formattedCourse.courseCategory.image = formatResponseUrl(
        formattedCourse.courseCategory.image,
      );
    }
    if (formattedCourse.createdBy?.profileImage) {
      formattedCourse.createdBy.profileImage = formatResponseUrl(
        formattedCourse.createdBy.profileImage,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.SUCCESS || "Course updated successfully",
      { course: formattedCourse },
    );
  } catch (error) {
    console.error("Error in updateCourse:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/create",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(createCourseSchema),
  createCourse,
);

router.post(
  "/edit/:courseId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(updateCourseSchema),
  updateCourse,
);

// ---------------------------------------------------------
// Get Course Details
// ---------------------------------------------------------
const getCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.params;

    // 1. Fetch Course
    const course = await Course.findById(courseId)
      .populate("courseCategory")
      .populate("createdBy", "firstName lastName profileImage  isVerified")
      .lean();

    if (!course) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Course not found");
    }

    // 2. Booking Aggregation (Per Schedule for this Course)
    // We only need transactions for this specific course
    const bookings = await Transaction.aggregate([
      {
        $match: {
          courseId: course._id, // Match by ObjectId directly if course._id is ObjectId, or cast if needed (usually auto-cast in mongoose queries but in aggregate be careful)
          status: "PAID",
        },
      },
      {
        $group: {
          _id: "$scheduleId", // Group by scheduleId
          count: { $sum: 1 },
        },
      },
    ]);

    const bookingMap = {}; // scheduleId -> count
    let totalAcquiredSeats = 0;

    bookings.forEach((b) => {
      if (b._id) {
        bookingMap[b._id.toString()] = b.count;
      }
      totalAcquiredSeats += b.count;
    });

    // 3. Check if Viewer (User) has booked
    let viewerId = null;
    const authHeader = req.headers.authorization;
    let isBooked = false;
    const bookedScheduleIds = new Set();

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(
          authHeader.split(" ")[1],
          process.env.JWT_SECRET_KEY,
        );
        viewerId = decoded.userId;
      } catch { }
    }

    if (viewerId) {
      const existingBookings = await Transaction.find({
        userId: viewerId,
        courseId: course._id,
        status: "PAID",
      }).select("scheduleId");

      if (existingBookings.length > 0) {
        isBooked = true;
        existingBookings.forEach((b) => {
          if (b.scheduleId) bookedScheduleIds.add(b.scheduleId.toString());
        });
      }
    }

    // Check Wishlist Status
    let isWishlisted = false;
    if (viewerId) {
      const wishlistItem = await Wishlist.findOne({
        userId: viewerId,
        entityId: courseId,
        entityModel: "Course",
      });
      if (wishlistItem) isWishlisted = true;
    }

    // 4. Enrich Schedules
    if (course.schedules && Array.isArray(course.schedules)) {
      course.schedules = course.schedules.map((schedule) => {
        const schedId = schedule?._id?.toString();
        const acquired = bookingMap[schedId] || 0;
        const total = course.totalSeats;
        const available = Math.max(0, total - acquired);

        return {
          ...schedule,
          totalSeats: total,
          acquiredSeats: acquired,
          availableSeats: available,
          isFull: available <= 0,
          isBooked: bookedScheduleIds.has(schedId),
        };
      });
    }

    // 5. Helpers (Duplicate logic from getCourses for standalone consistency)
    function resolveCurrentSchedule(schedules = []) {
      const now = new Date();
      return (
        schedules
          .map((s) => ({
            ...s,
            start: new Date(s.startDate),
            end: new Date(s.endDate),
          }))
          .filter((s) => s.end >= now)
          .sort((a, b) => a.start - b.start)[0] || null
      );
    }

    const currentSchedule = resolveCurrentSchedule(course.schedules);
    const sessionStatus = getSessionStatus(currentSchedule);

    // 6. Formatting Images
    if (Array.isArray(course.posterImage)) {
      course.posterImage = course.posterImage.map(formatResponseUrl);
    }
    if (Array.isArray(course.galleryImages)) {
      course.galleryImages = course.galleryImages.map(formatResponseUrl);
    }
    if (course.courseCategory?.image) {
      course.courseCategory.image = formatResponseUrl(
        course.courseCategory.image,
      );
    }
    if (course.createdBy?.profileImage) {
      course.createdBy.profileImage = formatResponseUrl(
        course.createdBy.profileImage,
      );
    }

    // 7. Duration
    let duration = null;
    if (currentSchedule?.startTime && currentSchedule?.endTime) {
      const [sh, sm] = currentSchedule.startTime.split(":").map(Number);
      const [eh, em] = currentSchedule.endTime.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 1440;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      duration = h ? (m ? `${h}H ${m}min` : `${h}H`) : `${m}min`;
    }

    // 8. Final Object Construction
    const formattedCourse = {
      ...course,
      currentSchedule,
      sessionStatus,
      isAvailable: !!currentSchedule,
      duration,
      acquiredSeats: totalAcquiredSeats,
      leftSeats: Math.max(0, course.totalSeats - totalAcquiredSeats),
      isBooked,
      isWishlisted,
    };

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.SUCCESS,
      formattedCourse,
    );
  } catch (error) {
    console.error("Error in getCourseDetails:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// ---------------------------------------------------------
// Get Organizer Courses (for course management page)
// ---------------------------------------------------------
const getOrganizerCourses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { categoryId, search, page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;
    let query = { createdBy: userId };

    // Apply category filter
    if (categoryId) {
      query.courseCategory = categoryId;
    }

    // Apply search
    if (search) {
      query.$or = [
        { courseTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
      ];
    }

    const totalCourses = await Course.countDocuments(query);
    const totalPages = Math.ceil(totalCourses / limit);

    const courses = await Course.find(query)
      .populate("courseCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = courses.map((c) => c._id);

    // Aggregate revenue and enrollment stats
    const stats = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID" } },
      {
        $group: {
          _id: "$courseId",
          totalRevenue: { $sum: "$amount" },
          totalEnrollments: { $sum: 1 },
        },
      },
    ]);

    const statsMap = {};
    stats.forEach((stat) => {
      statsMap[stat._id.toString()] = {
        revenue: stat.totalRevenue,
        enrollments: stat.totalEnrollments,
      };
    });

    const formattedCourses = courses.map((course) => {
      // Format images
      if (Array.isArray(course.posterImage)) {
        course.posterImage = course.posterImage.map(formatResponseUrl);
      }
      if (Array.isArray(course.galleryImages)) {
        course.galleryImages = course.galleryImages.map(formatResponseUrl);
      }
      if (course.courseCategory?.image) {
        course.courseCategory.image = formatResponseUrl(
          course.courseCategory.image,
        );
      }
      if (course.createdBy?.profileImage) {
        course.createdBy.profileImage = formatResponseUrl(
          course.createdBy.profileImage,
        );
      }

      // Calculate duration from first schedule
      let duration = null;
      if (course.schedules && course.schedules.length > 0) {
        const sched = course.schedules[0];
        if (sched.startTime && sched.endTime) {
          const [startH, startM] = sched.startTime.split(":").map(Number);
          const [endH, endM] = sched.endTime.split(":").map(Number);
          let diffMins = endH * 60 + endM - (startH * 60 + startM);
          if (diffMins < 0) diffMins += 24 * 60;

          if (diffMins > 0) {
            const hours = Math.floor(diffMins / 60);
            const minutes = diffMins % 60;
            if (hours > 0 && minutes > 0) duration = `${hours}H ${minutes}min`;
            else if (hours > 0) duration = `${hours}H`;
            else duration = `${minutes}min`;
          }
        }
      }

      // Add stats
      const courseStats = statsMap[course._id.toString()] || {
        revenue: 0,
        enrollments: 0,
      };

      return {
        ...course,
        duration,
        totalRevenue: courseStats.revenue,
        totalEnrollments: courseStats.enrollments,
        leftSeats: Math.max(0, course.totalSeats - courseStats.enrollments),
      };
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      totalCourses,
      currentPage: Number(page),
      totalPages,
      coursesPerPage: Number(limit),
      courses: formattedCourses,
    });
  } catch (error) {
    console.error("Error in getOrganizerCourses:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Courses with Filters
router.get(
  "/list",
  perApiLimiter(),
  // validateRequest(getCoursesSchema),
  getCourses,
);

router.get("/details/:courseId", perApiLimiter(), getCourseDetails);

// Admin List API
router.get(
  "/admin/list",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(getCoursesSchema),
  getCoursesAdmin,
);

router.get(
  "/organizer/list",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  getOrganizerCourses,
);

module.exports = router;
