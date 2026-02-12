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

    // ===============================
    // Base query (NO time logic here)
    // ===============================
    let query = {};

    if (categoryId) {
      const catIds = categoryId.split(",");
      if (catIds.length > 1) {
        query.courseCategory = { $in: catIds };
      } else {
        query.courseCategory = categoryId;
      }
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
        (c.schedules || []).some((s) => new Date(s.startDate) > now),
      );
    }

    if (filter === "thisWeek") {
      const startOfWeek = new Date(now);
      const currentDay = startOfWeek.getDay();
      const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust to Monday
      startOfWeek.setDate(startOfWeek.getDate() + diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
      endOfWeek.setHours(23, 59, 59, 999);

      courses = courses.filter((c) =>
        (c.schedules || []).some(
          (s) =>
            new Date(s.startDate) >= startOfWeek &&
            new Date(s.startDate) <= endOfWeek,
        ),
      );
    }

    if (filter === "today") {
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      courses = courses.filter((c) =>
        (c.schedules || []).some(
          (s) =>
            new Date(s.startDate) >= startOfToday &&
            new Date(s.startDate) <= endOfToday,
        ),
      );
    }

    if (filter === "nextWeek") {
      const startOfNextWeek = new Date(now);
      const currentDayNW = startOfNextWeek.getDay();
      const diffNW = currentDayNW === 0 ? -6 : 1 - currentDayNW;
      startOfNextWeek.setDate(startOfNextWeek.getDate() + diffNW + 7); // Next Monday
      startOfNextWeek.setHours(0, 0, 0, 0);

      const endOfNextWeek = new Date(startOfNextWeek);
      endOfNextWeek.setDate(endOfNextWeek.getDate() + 6); // Next Sunday
      endOfNextWeek.setHours(23, 59, 59, 999);

      courses = courses.filter((c) =>
        (c.schedules || []).some(
          (s) =>
            new Date(s.startDate) >= startOfNextWeek &&
            new Date(s.startDate) <= endOfNextWeek,
        ),
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

    // Aggregate by Course (for general stats if needed) and Schedule
    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID" } },
      {
        $group: {
          _id: { course: "$courseId", schedule: "$scheduleId" },
          count: { $sum: 1 },
        },
      },
    ]);

    const bookingMap = {}; // Map: "courseId_scheduleId" -> count
    const courseBookingMap = {}; // Map: "courseId" -> count (total for course)

    bookingCounts.forEach((b) => {
      const courseId = b._id.course.toString();
      const scheduleId = b._id.schedule ? b._id.schedule.toString() : "null";

      // Per schedule count
      const key = `${courseId}_${scheduleId}`;
      bookingMap[key] = b.count;

      // Total course count
      courseBookingMap[courseId] = (courseBookingMap[courseId] || 0) + b.count;
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
          process.env.JWT_SECRET_KEY,
        );
        viewerId = decoded.userId;
      } catch { }
    }

    const bookedCourseIds = new Set(); // Set of "courseId"
    const bookedScheduleMap = {}; // Map: "courseId" -> Set of "scheduleId"

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
          if (!bookedScheduleMap[cId]) {
            bookedScheduleMap[cId] = new Set();
          }
          bookedScheduleMap[cId].add(b.scheduleId.toString());
        }
      });
    }

    // ===============================
    // Final formatting
    // ===============================
    const formattedCourses = courses.map((course) => {
      // Enrich schedules with seat info
      if (course.schedules && Array.isArray(course.schedules)) {
        course.schedules = course.schedules.map((schedule) => {
          const schedId = schedule._id.toString();
          const acquired = bookingMap[`${course._id}_${schedId}`] || 0;
          const total = course.totalSeats; // Course-level total seats applies to each schedule
          const available = Math.max(0, total - acquired);

          // Check if this specific schedule is booked by user
          const userBookedSchedules = bookedScheduleMap[course._id.toString()];
          const isScheduleBooked = userBookedSchedules
            ? userBookedSchedules.has(schedId)
            : false;

          return {
            ...schedule,
            totalSeats: total,
            acquiredSeats: acquired,
            availableSeats: available,
            isFull: available <= 0,
            isBooked: isScheduleBooked,
          };
        });
      }

      const currentSchedule = resolveCurrentSchedule(course.schedules);
      const sessionStatus = getSessionStatus(currentSchedule);

      // images
      if (Array.isArray(course.posterImage)) {
        course.posterImage = course.posterImage.map(formatResponseUrl);
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

      // Use course-level booking map for total acquired seats across all schedules (or specific logic?)
      // Usually "acquiredSeats" on the course object implies generic popularity or total constraints?
      // For "Ongoing" or "fixedStart", totalSeats is usually per schedule (class capacity).
      // But let's stick to the requested aggregation logic.
      const acquiredSeats = courseBookingMap[course._id.toString()] || 0;

      return {
        ...course,
        currentSchedule,
        sessionStatus,
        isAvailable: !!currentSchedule,
        duration,
        acquiredSeats,
        leftSeats: Math.max(0, course.totalSeats - acquiredSeats), // This might be misleading if it aggregates all schedules vs course capacity, but keeping consistent with prev logic
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
  checkRole([roleId.ORGANIZER]),
  validateRequest(createCourseSchema),
  createCourse,
);

// ---------------------------------------------------------
// Get Course Details
// ---------------------------------------------------------
const getCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.params;

    // 1. Fetch Course
    const course = await Course.findById(courseId)
      .populate("courseCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage")
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

    // 4. Enrich Schedules
    if (course.schedules && Array.isArray(course.schedules)) {
      course.schedules = course.schedules.map((schedule) => {
        const schedId = schedule._id.toString();
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

// Get Courses with Filters
router.get(
  "/list",
  perApiLimiter(),
  validateRequest(getCoursesSchema),
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

module.exports = router;
