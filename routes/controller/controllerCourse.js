const express = require("express");
const router = express.Router();
const { Course, Transaction, User } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const {
  createCourseSchema,
} = require("../services/validations/courseValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const {
  getCoursesSchema,
} = require("../services/validations/courseValidation");
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      course: course,
    });
  } catch (error) {
    console.error("Error in createCourse:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};
const getCourses = async (req, res) => {
  try {
    const {
      filter = "all",
      latitude,
      longitude,
      radius = 50,
      categoryId,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const now = new Date();
    const skip = (page - 1) * limit;

    // ===============================
    //Helper: resolve current schedule
    // ===============================
    function resolveCurrentSchedule(schedules = []) {
      return schedules
        .map((s) => ({
          ...s,
          start: new Date(s.startDate),
          end: new Date(s.endDate),
        }))
        .filter((s) => s.end >= now)
        .sort((a, b) => a.start - b.start)[0] || null;
    }

    // ===============================
    // Base query (NO time logic here)
    // ===============================
    let query = {};

    if (categoryId) {
      query.courseCategory = categoryId;
    }

    if (search) {
      query.$or = [
        { courseTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
      ];
    }

    if (filter === "nearYou") {
      if (!latitude || !longitude) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.LOCATION_REQUIRED,
        );
      }

      query.venueAddress = {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: radius * 1000,
        },
      };
    }

    // ===============================
    // Fetch courses
    // ===============================
    let courses = await Course.find(query)
      .populate("courseCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage")
      .lean();

    // ===============================
    // Filter by time (JS, not Mongo)
    // ===============================
    if (filter === "upcoming") {
      courses = courses.filter((c) =>
        c.schedules.some((s) => new Date(s.startDate) > now)
      );
    }

    if (filter === "thisWeek") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      courses = courses.filter((c) =>
        c.schedules.some(
          (s) =>
            new Date(s.startDate) >= startOfWeek &&
            new Date(s.startDate) <= endOfWeek
        )
      );
    }

    // ===============================
    // Pagination AFTER filtering
    // ===============================
    const totalCourses = courses.length;
    const totalPages = Math.ceil(totalCourses / limit);

    courses = courses
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(skip, skip + Number(limit));

    // ===============================
    // Booking aggregation
    // ===============================
    const courseIds = courses.map((c) => c._id);

    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID" } },
      { $group: { _id: "$courseId", count: { $sum: 1 } } },
    ]);

    const bookingMap = {};
    bookingCounts.forEach((b) => {
      bookingMap[b._id.toString()] = b.count;
    });

    // ===============================
    // Logged-in user booking status
    // ===============================
    let viewerId = null;
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(
          authHeader.split(" ")[1],
          process.env.JWT_SECRET_KEY
        );
        viewerId = decoded.userId;
      } catch { }
    }

    const bookedCourseIds = new Set();

    if (viewerId) {
      const bookings = await Transaction.find({
        userId: viewerId,
        courseId: { $in: courseIds },
        status: "PAID",
      }).select("courseId");

      bookings.forEach((b) =>
        bookedCourseIds.add(b.courseId.toString())
      );
    }

    // ===============================
    // Final formatting
    // ===============================
    const formattedCourses = courses.map((course) => {
      const currentSchedule = resolveCurrentSchedule(course.schedules);

      // images
      if (Array.isArray(course.posterImage)) {
        course.posterImage = course.posterImage.map(formatResponseUrl);
      }
      if (course.courseCategory?.image) {
        course.courseCategory.image = formatResponseUrl(
          course.courseCategory.image
        );
      }
      if (course.createdBy?.profileImage) {
        course.createdBy.profileImage = formatResponseUrl(
          course.createdBy.profileImage
        );
      }

      // duration
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

      const acquiredSeats = bookingMap[course._id.toString()] || 0;

      return {
        ...course,
        currentSchedule,
        isAvailable: !!currentSchedule,
        duration,
        acquiredSeats,
        leftSeats: Math.max(0, course.totalSeats - acquiredSeats),
        isBooked: bookedCourseIds.has(course._id.toString()),
      };
    });

    // ===============================
    // Sort by nearest schedule
    // ===============================
    formattedCourses.sort((a, b) => {
      if (a.currentSchedule && !b.currentSchedule) return -1;
      if (!a.currentSchedule && b.currentSchedule) return 1;
      if (a.currentSchedule && b.currentSchedule) {
        return (
          new Date(a.currentSchedule.startDate) -
          new Date(b.currentSchedule.startDate)
        );
      }
      return 0;
    });

    // ===============================
    // Response
    // ===============================
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      totalCourses,
      currentPage: Number(page),
      totalPages,
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
      .populate("createdBy", "firstName lastName profileImage")
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

router.post(
  "/create",
  perApiLimiter(),
  checkRole([roleId.ORGANISER]),
  validateRequest(createCourseSchema),
  createCourse,
);

// Get Courses with Filters
router.get(
  "/list",
  perApiLimiter(),
  validateRequest(getCoursesSchema),
  getCourses,
);

router.get(
  "/admin/list",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(getCoursesSchema),
  getCoursesAdmin,
);

module.exports = router;
