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

    // Base query/Pipeline
    // For courses, we filter based on schedules.
    // We want courses that have at least one schedule meeting the criteria.
    // However, basic 'find' with 'elemMatch' is simplest.
    // Exclude deleted/drafts if any (Course model doesn't show isDraft, but let's assume active).
    // Course model doesn't have isDraft or status field shown in previous view, but usually we filter by date.

    let query = {
      // Ensure at least one schedule ends in the future (not fully past)
      schedules: { $elemMatch: { endDate: { $gte: now } } },
    };

    // Apply category filter if provided
    if (categoryId) {
      query.courseCategory = categoryId;
    }

    switch (filter) {
      case "all":
        break;

      case "recommended":
        // Try to identify user from token for personalization
        let userCategories = [];
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.split(" ")[1];
          try {
            // We need jwt import if not global, but controllerCourse didn't import jwt.
            // Assuming we need to add imports.
            const jwt = require("jsonwebtoken");
            const { User } = require("../../db");
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            const user = await User.findById(decoded.userId).lean();
            if (user && user.categories && user.categories.length > 0) {
              userCategories = user.categories;
            }
          } catch (err) {
            // Ignore
          }
        }

        if (userCategories.length > 0) {
          query.courseCategory = { $in: userCategories };
        }
        break;

      case "nearYou":
        if (!latitude || !longitude) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            constantsMessage.LOCATION_REQUIRED,
          );
        }
        // $nearSphere works on top-level venueAddress
        query["venueAddress"] = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            $maxDistance: radius * 1000,
          },
        };
        break;

      case "upcoming":
        query.schedules = { $elemMatch: { startDate: { $gt: now } } };
        break;

      case "thisWeek":
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
        endOfWeek.setHours(23, 59, 59, 999);

        query.schedules = {
          $elemMatch: {
            startDate: { $gte: startOfWeek, $lte: endOfWeek },
          },
        };
        break;

      case "thisWeekend":
        const friday = new Date(now);
        friday.setDate(now.getDate() - now.getDay() + 5);
        // Adjust if today is past Friday?
        // Simpler logic: This coming weekend relative to 'now'
        // If today is Sunday, 'This Weekend' covers it.
        // Let's use strict current week's Sat/Sun.
        const saturday = new Date(now);
        saturday.setDate(now.getDate() - now.getDay() + 6);
        saturday.setHours(0, 0, 0, 0);
        const sunday = new Date(saturday);
        sunday.setDate(saturday.getDate() + 1);
        sunday.setHours(23, 59, 59, 999);

        query.schedules = {
          $elemMatch: {
            startDate: { $gte: saturday, $lte: sunday },
          },
        };
        break;

      case "thisYear":
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        const endOfYear = new Date(
          new Date().getFullYear(),
          11,
          31,
          23,
          59,
          59,
        );
        query.schedules = {
          $elemMatch: {
            startDate: { $gte: startOfYear, $lte: endOfYear },
          },
        };
        break;
    }

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
      .sort({ createdAt: -1 })
      .lean();

    // Aggregate acquired seats from Transactions
    const courseIds = courses.map((c) => c._id);
    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID" } },
      { $group: { _id: "$courseId", count: { $sum: 1 } } },
    ]);

    const bookingMap = {};
    bookingCounts.forEach((b) => {
      bookingMap[b._id.toString()] = b.count;
    });

    // Check for logged-in user to determine isBooked status
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        viewerId = decoded.userId;
      } catch (err) {
        // Invalid token - treat as guest
      }
    }

    const bookedCourseIds = new Set();
    if (viewerId) {
      const bookings = await Transaction.find({
        userId: viewerId,
        courseId: { $in: courseIds },
        status: "PAID",
      }).select("courseId");
      bookings.forEach((b) => bookedCourseIds.add(b.courseId.toString()));
    }

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

      // Add booking status
      course.isBooked = bookedCourseIds.has(course._id.toString());

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
