const express = require("express");
const router = express.Router();
const { Course, Transaction, User, Wishlist, GlobalSetting } = require("../../db");
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
const { assignStaffSchema } = require("../services/validations/userValidation");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId, eventStatus, daysOfWeek } = require("../../utils/Role");
const { notifyCourseChange } = require("../services/serviceNotification");
const { default: mongoose } = require("mongoose");

// Create Course
const createCourse = async (req, res) => {
  try {
    const { venueAddress, isDraft: isDraftBody, ...courseData } = req.body;
    const userId = req.user.userId;

    let isDraftValue = isDraftBody === true;

    // Transform venueAddress to GeoJSON Point safely
    let location = undefined;
    if (venueAddress) {
      location = {};
      if (
        venueAddress.longitude !== undefined &&
        venueAddress.latitude !== undefined &&
        venueAddress.longitude !== null &&
        venueAddress.latitude !== null
      ) {
        location.type = "Point";
        location.coordinates = [
          Number(venueAddress.longitude),
          Number(venueAddress.latitude),
        ];

      }
      if (venueAddress.city) location.city = venueAddress.city;
      if (venueAddress.country) location.country = venueAddress.country;
      if (venueAddress.address) location.address = venueAddress.address;
      if (venueAddress.state) location.state = venueAddress.state;
      if (venueAddress.zipcode) location.zipcode = venueAddress.zipcode;

      if (Object.keys(location).length === 0) location = undefined;
    }

    const newCourse = new Course({
      ...courseData,
      venueAddress: location,
      createdBy: userId,
      isDraft: isDraftValue,
    });

    await newCourse.save();
    const courseObj = newCourse.toObject();

    // Format URLs
    if (Array.isArray(courseObj.posterImage)) {
      courseObj.posterImage = courseObj.posterImage.map(formatResponseUrl);
    }
    if (Array.isArray(courseObj.mediaLinks)) {
      courseObj.mediaLinks = courseObj.mediaLinks.map(formatResponseUrl);
    }
    if (Array.isArray(courseObj.shortTeaserVideo)) {
      courseObj.shortTeaserVideo = courseObj.shortTeaserVideo.map(formatResponseUrl);
    }

    const message = isDraftValue
      ? constantsMessage.DRAFT_SAVED
      : constantsMessage.COURSE_CREATED_SUCCESS;

    return apiSuccessRes(HTTP_STATUS.OK, res, message, {
      course: courseObj,
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
      radius = 100,
      categoryId,
      category,
      search,
      page = 1,
      limit = 10,
      userId,
      placement,
      startDate: customStartDate,
      endDate: customEndDate,
      fromDate,
      toDate,
      isDraft,
      timeOfDay,
      city,
      country,
      status,
      north,
      south,
      east,
      west,
      northEastLat,
      northEastLng,
      southWestLat,
      southWestLng,
      enrollmentType,
    } = req.query;

    const normalizeLongitude = (lng) => {
      if (Number.isNaN(lng)) return lng;
      return ((((lng + 180) % 360) + 360) % 360) - 180;
    };

    const normalizedCity =
      typeof city === "string" && city.trim() ? city.trim().toLowerCase() : "";
    const normalizedCountry =
      typeof country === "string" && country.trim()
        ? country.trim().toLowerCase()
        : "";
    const parsedNorth = Number(north ?? northEastLat);
    const parsedSouth = Number(south ?? southWestLat);
    const parsedEast = normalizeLongitude(Number(east ?? northEastLng));
    const parsedWest = normalizeLongitude(Number(west ?? southWestLng));
    const hasBounds =
      !Number.isNaN(parsedNorth) &&
      !Number.isNaN(parsedSouth) &&
      !Number.isNaN(parsedEast) &&
      !Number.isNaN(parsedWest);
    const parsedLatitude = Number(latitude);
    const parsedLongitude = normalizeLongitude(Number(longitude));
    const hasDirectGeoPoint =
      !Number.isNaN(parsedLatitude) && !Number.isNaN(parsedLongitude);
    const nearLatitude = hasDirectGeoPoint
      ? parsedLatitude
      : hasBounds
        ? (parsedNorth + parsedSouth) / 2
        : parsedLatitude;
    const nearLongitude = hasDirectGeoPoint
      ? parsedLongitude
      : hasBounds
        ? normalizeLongitude((parsedEast + parsedWest) / 2)
        : parsedLongitude;
    const hasGeoSearchPoint =
      !Number.isNaN(nearLatitude) && !Number.isNaN(nearLongitude);

    const targetCategory = categoryId || category;

    let loginUser = null;
    if (req.user) {
      loginUser = req.user.userId;
    }
    const now = new Date();
    const skip = (page - 1) * limit;

    const filters = filter.split(",").map((f) => f.trim().toLowerCase());

    // 1. Build Base Query
    let query = {};
    let startDateConditions = [];

    const isOrganizerList = filters.includes("organizer");
    if (isOrganizerList) {
      if (!loginUser) {
        console.warn(`[getCourses] Unauthorized attempt to access organizer list`);
        return apiErrorRes(
          HTTP_STATUS.UNAUTHORIZED,
          res,
          constantsMessage.LOGIN_REQUIRED_DRAFTS,
        );
      }
      query.createdBy = new mongoose.Types.ObjectId(loginUser);
      if (isDraft === "true" || isDraft === true || filters.includes("draft")) {
        query.isDraft = true;
      } else if (isDraft === "false" || isDraft === false) {
        query.isDraft = false;
      }
    } else {
      // Draft filter (explicit param or through filter string)
      if (isDraft === "true" || isDraft === true || filters.includes("draft")) {
        if (!loginUser) {
          console.warn(`[getCourses] Unauthorized attempt to access drafts`);
          return apiErrorRes(
            HTTP_STATUS.UNAUTHORIZED,
            res,
            constantsMessage.LOGIN_REQUIRED_DRAFTS,
          );
        }
        query.isDraft = true;
        query.createdBy = new mongoose.Types.ObjectId(loginUser);
      } else {
        query.isDraft = false;

        // Status query parameter or default time constraints
        if (status) {
          query.status = status;
        } else {
          // Default time constraints (active courses) - unless "past" filter is specifically requested
          if (!filters.includes("past")) {
            query.endDate = { $gte: now };
            query.status = { $ne: eventStatus.PAST };
          } else {
            query.endDate = { $lt: now };
          }
        }
      }
    }

    // CreatedBy filter
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.createdBy = new mongoose.Types.ObjectId(userId);
    }

    // Apply enrollmentType filter
    if (enrollmentType) {
      query.enrollmentType = enrollmentType;
    } else if (filters.includes("ongoing")) {
      query.enrollmentType = "Ongoing";
    } else if (filters.includes("fixedstart") || filters.includes("fixed_start") || filters.includes("fixed-start")) {
      query.enrollmentType = "fixedStart";
    }

    // Multiple Categories filter
    if (targetCategory && targetCategory !== "") {
      const catIds = targetCategory
        .split(",")
        .filter((id) => mongoose.Types.ObjectId.isValid(id.trim()));
      if (catIds.length > 1) {
        query.courseCategory = {
          $in: catIds.map((id) => new mongoose.Types.ObjectId(id.trim())),
        };
      } else if (catIds.length === 1) {
        query.courseCategory = new mongoose.Types.ObjectId(catIds[0].trim());
      }
    }

    // Custom Date Range filter (fromDate/toDate or customStartDate/customEndDate)
    const effectiveStartDate = customStartDate || fromDate;
    const effectiveEndDate = customEndDate || toDate;

    if (effectiveStartDate || effectiveEndDate) {
      if (effectiveStartDate) {
        const sD = new Date(effectiveStartDate);
        if (!isNaN(sD.getTime())) {
          startDateConditions.push({ $gte: sD });
        }
      }
      if (effectiveEndDate) {
        const eD = new Date(effectiveEndDate);
        if (!isNaN(eD.getTime())) {
          startDateConditions.push({ $lte: eD });
        }
      }
    }

    // Apply Time-based filters
    for (const f of filters) {
      switch (f) {
        case "upcoming":
          startDateConditions.push({ $gt: now });
          break;
        case "today":
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date(now);
          endOfToday.setHours(23, 59, 59, 999);
          startDateConditions.push({ $gte: startOfToday, $lte: endOfToday });
          break;
        case "tomorrow":
          const startOfTomorrow = new Date(now);
          startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
          startOfTomorrow.setHours(0, 0, 0, 0);
          const endOfTomorrow = new Date(startOfTomorrow);
          endOfTomorrow.setHours(23, 59, 59, 999);
          startDateConditions.push({
            $gte: startOfTomorrow,
            $lte: endOfTomorrow,
          });
          break;
        case "thisweek":
          const startOfWeek = new Date(now);
          const dayOfWeek = startOfWeek.getDay();
          const diffW = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          startOfWeek.setDate(startOfWeek.getDate() + diffW);
          startOfWeek.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          startDateConditions.push({ $gte: startOfWeek, $lte: endOfWeek });
          break;
        case "thisweekend":
          const tW = new Date(now);
          const currentDay = tW.getDay();
          const startOfWeekend = new Date(tW);
          const daysUntilSaturday = currentDay === 0 ? -1 : 6 - currentDay;
          startOfWeekend.setDate(startOfWeekend.getDate() + daysUntilSaturday);
          startOfWeekend.setHours(0, 0, 0, 0);
          const endOfWeekend = new Date(startOfWeekend);
          endOfWeekend.setDate(endOfWeekend.getDate() + 1);
          endOfWeekend.setHours(23, 59, 59, 999);
          startDateConditions.push({
            $gte: startOfWeekend,
            $lte: endOfWeekend,
          });
          break;
        case "thismonth":
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          startDateConditions.push({ $gte: startOfMonth, $lte: endOfMonth });
          break;
        case "happeningsoon":
          const soonEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
          startDateConditions.push({ $gte: now, $lte: soonEnd });
          break;
        case "thisyear":
          const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
          const endOfYear = new Date(
            now.getFullYear(),
            11,
            31,
            23,
            59,
            59,
            999,
          );
          startDateConditions.push({ $gte: startOfYear, $lte: endOfYear });
          break;
        case "nextweek":
          const startOfNextWeek = new Date(now);
          const currentDayNW = startOfNextWeek.getDay();
          const diffNW = currentDayNW === 0 ? -6 : 1 - currentDayNW;
          startOfNextWeek.setDate(startOfNextWeek.getDate() + diffNW + 7);
          startOfNextWeek.setHours(0, 0, 0, 0);
          const endOfNextWeek = new Date(startOfNextWeek);
          endOfNextWeek.setDate(endOfNextWeek.getDate() + 6);
          endOfNextWeek.setHours(23, 59, 59, 999);
          startDateConditions.push({
            $gte: startOfNextWeek,
            $lte: endOfNextWeek,
          });
          break;
        case "featured":
          query.isFeatured = true;
          break;
        case "recommended":
          let userCategories = [];
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const token = authHeader.split(" ")[1];
              const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
              const user = await User.findById(decoded.userId).lean();
              if (user?.categories?.length > 0)
                userCategories = user.categories;
            } catch (err) { }
          }
          if (userCategories.length > 0) {
            query.courseCategory = {
              $in: userCategories.map((id) => new mongoose.Types.ObjectId(id)),
            };
          }
          break;
      }
    }

    if (startDateConditions.length > 0) {
      if (startDateConditions.length === 1) {
        query.startDate = startDateConditions[0];
      } else {
        if (!query.$and) query.$and = [];
        startDateConditions.forEach((cond) => {
          query.$and.push({ startDate: cond });
        });
      }
    }

    // Search filter
    if (search) {
      query.$or = [
        { courseTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
        { longdesc: { $regex: search, $options: "i" } },
      ];
    }

    // Time of Day filter
    if (timeOfDay && timeOfDay.toLowerCase() !== "anytime") {
      const selectedSlots = timeOfDay
        .split(",")
        .map((t) => t.trim().toLowerCase());
      const expressions = [];

      if (selectedSlots.includes("morning")) {
        expressions.push({
          $and: [
            { $gte: [{ $hour: "$startDate" }, 6] },
            { $lt: [{ $hour: "$startDate" }, 12] },
          ],
        });
      }
      if (selectedSlots.includes("afternoon")) {
        expressions.push({
          $and: [
            { $gte: [{ $hour: "$startDate" }, 12] },
            { $lt: [{ $hour: "$startDate" }, 17] },
          ],
        });
      }
      if (selectedSlots.includes("evening")) {
        expressions.push({
          $or: [
            { $gte: [{ $hour: "$startDate" }, 17] },
            { $lt: [{ $hour: "$startDate" }, 6] },
          ],
        });
      }

      if (expressions.length > 0) {
        const timeExpr =
          expressions.length === 1 ? expressions[0] : { $or: expressions };
        if (query.$expr) {
          query.$expr = { $and: [query.$expr, timeExpr] };
        } else {
          query.$expr = timeExpr;
        }
      }
    }

    // Check for "nearYou" fallback if no coords
    if (filters.includes("nearyou") && !(latitude && longitude)) {
      let cityVal = null,
        countryVal = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
          const user = await User.findById(decoded.userId).lean();
          cityVal = user?.location?.city || null;
          countryVal = user?.location?.country || null;
        } catch (err) { }
      }
      if (cityVal) {
        query["venueAddress.city"] = cityVal;
      } else if (countryVal) {
        query["venueAddress.country"] = countryVal;
      } else if (!filters.includes("all") && filters.length === 1) {
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.SUCCESS,
          {
            courses: [],
            totalCourses: 0,
            totalPages: 0,
            currentPage: parseInt(page),
            coursesPerPage: parseInt(limit),
          },
        );
      }
    }

    let courses = [];
    let totalCount = 0;

    // Execute query with Geo search if coords present
    if (hasGeoSearchPoint) {
      const parsedRadius = Number(radius);
      const safeRadiusKm = Number.isNaN(parsedRadius)
        ? 100
        : Math.max(1, Math.min(parsedRadius, 500));
      const geoQuery = { ...query };

      if (hasBounds) {
        if (parsedWest <= parsedEast) {
          geoQuery.venueAddress = {
            $geoWithin: {
              $box: [
                [parsedWest, parsedSouth],
                [parsedEast, parsedNorth],
              ],
            },
          };
        }
      }

      const geoAgg = await Course.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [nearLongitude, nearLatitude],
            },
            distanceField: "distance",
            maxDistance: safeRadiusKm * 1000,
            spherical: true,
            query: geoQuery,
          },
        },
        {
          $lookup: {
            from: "PromotionPackage",
            localField: "activePromotionPackage",
            foreignField: "_id",
            as: "promoPkg",
          },
        },
        { $unwind: { path: "$promoPkg", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            isPromoMatch: {
              $cond: [
                {
                  $and: [
                    { $ne: [placement || null, null] },
                    { $isArray: "$promoPkg.placements" },
                    { $in: [placement, "$promoPkg.placements"] },
                  ],
                },
                1,
                0,
              ],
            },
            cityMatch: {
              $cond: [
                {
                  $and: [
                    { $ne: [normalizedCity || null, null] },
                    {
                      $eq: [
                        { $toLower: { $ifNull: ["$venueAddress.city", ""] } },
                        normalizedCity,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
            countryMatch: {
              $cond: [
                {
                  $and: [
                    { $ne: [normalizedCountry || null, null] },
                    {
                      $eq: [
                        {
                          $toLower: {
                            $ifNull: ["$venueAddress.country", ""],
                          },
                        },
                        normalizedCountry,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
        {
          $sort: (isOrganizerList || filters.includes("latest") || filters.includes("newest"))
            ? { createdAt: -1 }
            : {
              cityMatch: -1,
              countryMatch: -1,
              isPromoMatch: -1,
              isFeatured: -1,
              startDate: 1,
              endDate: 1,
              distance: 1,
            },
        },
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
        {
          $unwind: { path: "$courseCategory", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            pipeline: [
              { $project: { firstName: 1, lastName: 1, profileImage: 1, isVerified: 1 } },
            ],
            as: "createdBy",
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      ]);

      const countAgg = await Course.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [nearLongitude, nearLatitude],
            },
            distanceField: "distance",
            maxDistance: safeRadiusKm * 1000,
            spherical: true,
            query: geoQuery,
          },
        },
        { $count: "total" },
      ]);
      courses = geoAgg;
      totalCount = countAgg[0]?.total || 0;

      if (courses.length === 0 && safeRadiusKm < 500) {
        const fallbackGeoQuery = { ...query };
        delete fallbackGeoQuery.venueAddress;
        const fallbackMaxDistance = 500 * 1000;

        const fallbackAgg = await Course.aggregate([
          {
            $geoNear: {
              near: {
                type: "Point",
                coordinates: [nearLongitude, nearLatitude],
              },
              distanceField: "distance",
              maxDistance: fallbackMaxDistance,
              spherical: true,
              query: fallbackGeoQuery,
            },
          },
          {
            $lookup: {
              from: "PromotionPackage",
              localField: "activePromotionPackage",
              foreignField: "_id",
              as: "promoPkg",
            },
          },
          { $unwind: { path: "$promoPkg", preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              isPromoMatch: {
                $cond: [
                  {
                    $and: [
                      { $ne: [placement || null, null] },
                      { $isArray: "$promoPkg.placements" },
                      { $in: [placement, "$promoPkg.placements"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
          {
            $sort: (isOrganizerList || filters.includes("latest") || filters.includes("newest"))
              ? { createdAt: -1 }
              : {
                isPromoMatch: -1,
                isFeatured: -1,
                startDate: 1,
                endDate: 1,
                distance: 1,
              },
          },
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
          {
            $unwind: {
              path: "$courseCategory",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "createdBy",
              foreignField: "_id",
              pipeline: [
                {
                  $project: {
                    firstName: 1,
                    lastName: 1,
                    profileImage: 1,
                    isVerified: 1,
                  },
                },
              ],
              as: "createdBy",
            },
          },
          { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
        ]);

        const fallbackCountAgg = await Course.aggregate([
          {
            $geoNear: {
              near: {
                type: "Point",
                coordinates: [nearLongitude, nearLatitude],
              },
              distanceField: "distance",
              maxDistance: fallbackMaxDistance,
              spherical: true,
              query: fallbackGeoQuery,
            },
          },
          { $count: "total" },
        ]);

        courses = fallbackAgg;
        totalCount = fallbackCountAgg[0]?.total || 0;
      }
    } else {
      if (placement) {
        courses = await Course.aggregate([
          { $match: query },
          {
            $lookup: {
              from: "PromotionPackage",
              localField: "activePromotionPackage",
              foreignField: "_id",
              as: "promoPkg",
            },
          },
          { $unwind: { path: "$promoPkg", preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              isPromoMatch: {
                $cond: [
                  {
                    $and: [
                      { $ne: [placement || null, null] },
                      { $isArray: "$promoPkg.placements" },
                      { $in: [placement, "$promoPkg.placements"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
          {
            $sort: {
              isPromoMatch: -1,
              ...((isOrganizerList || filters.includes("latest") || filters.includes("newest"))
                ? { createdAt: -1 }
                : filters.includes("past")
                  ? { endDate: -1, startDate: -1 }
                  : filters.includes("draft")
                    ? { updatedAt: -1 }
                    : { isFeatured: -1, startDate: 1, endDate: 1 }),
            },
          },
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
          {
            $unwind: {
              path: "$courseCategory",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "createdBy",
              foreignField: "_id",
              pipeline: [
                {
                  $project: {
                    firstName: 1,
                    lastName: 1,
                    profileImage: 1,
                    isVerified: 1,
                  },
                },
              ],
              as: "createdBy",
            },
          },
          { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
        ]);
        totalCount = await Course.countDocuments(query);
      } else {
        const sortOrder = (isOrganizerList || filters.includes("latest") || filters.includes("newest"))
          ? { createdAt: -1 }
          : filters.includes("past")
            ? { endDate: -1, startDate: -1 }
            : filters.includes("draft")
              ? { updatedAt: -1 }
              : { isFeatured: -1, startDate: 1, endDate: 1 };
        courses = await Course.find(query)
          .populate("courseCategory")
          .populate("createdBy", "firstName lastName profileImage isVerified")
          .sort(sortOrder)
          .skip(skip)
          .limit(parseInt(limit))
          .lean();
        totalCount = await Course.countDocuments(query);
      }
    }

    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        viewerId = decoded.userId;
      } catch (err) { }
    }

    const courseIds = courses.map((c) => c._id);
    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID", bookingType: "COURSE" } },
      {
        $project: {
          courseId: 1,
          qty: 1,
          totalAmount: 1,
          batches: {
            $cond: {
              if: {
                $and: [
                  { $isArray: "$ongoingSlots" },
                  { $gt: [{ $size: "$ongoingSlots" }, 0] }
                ]
              },
              then: "$ongoingSlots.batchId",
              else: ["$batchId"]
            }
          }
        }
      },
      { $unwind: "$batches" },
      {
        $group: {
          _id: { course: "$courseId", batch: "$batches" },
          count: { $sum: "$qty" },
          revenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const bookingMap = {};
    const courseBookingMap = {};
    const courseRevenueMap = {};
    bookingCounts.forEach((b) => {
      const courseId = b._id.course.toString();
      const batchIdStr = b._id.batch ? b._id.batch.toString() : "null";
      bookingMap[`${courseId}_${batchIdStr}`] = b.count;
      courseBookingMap[courseId] = (courseBookingMap[courseId] || 0) + b.count;
      courseRevenueMap[courseId] = (courseRevenueMap[courseId] || 0) + (b.revenue || 0);
    });

    const bookedCourseIds = new Set();
    const bookedBatchMap = {};
    if (viewerId) {
      const bookings = await Transaction.find({
        userId: viewerId,
        courseId: { $in: courseIds },
        status: "PAID",
        bookingType: "COURSE",
      }).select("courseId batchId ongoingSlots");
      bookings.forEach((b) => {
        bookedCourseIds.add(b.courseId.toString());
        const cId = b.courseId.toString();
        if (!bookedBatchMap[cId]) bookedBatchMap[cId] = new Set();
        if (b.batchId) {
          bookedBatchMap[cId].add(b.batchId.toString());
        }
        if (b.ongoingSlots && Array.isArray(b.ongoingSlots)) {
          b.ongoingSlots.forEach((slot) => {
            if (slot.batchId) bookedBatchMap[cId].add(slot.batchId.toString());
          });
        }
      });
    }

    const formattedCourses = courses.map((course) => {
      if (Array.isArray(course.posterImage)) course.posterImage = course.posterImage.map(formatResponseUrl);
      if (Array.isArray(course.mediaLinks)) course.mediaLinks = course.mediaLinks.map(formatResponseUrl);
      if (Array.isArray(course.shortTeaserVideo)) course.shortTeaserVideo = course.shortTeaserVideo.map(formatResponseUrl);
      if (course.courseCategory?.image) course.courseCategory.image = formatResponseUrl(course.courseCategory.image);
      if (course.createdBy?.profileImage) course.createdBy.profileImage = formatResponseUrl(course.createdBy.profileImage);

      let courseTotalSeats = 0;
      let totalReservedExternally = 0;
      if (course.batches && Array.isArray(course.batches)) {
        course.batches = course.batches.map((batch) => {
          const batchId = batch._id?.toString();
          const acquired = bookingMap[`${course._id}_${batchId}`] || 0;
          const seats = batch.seats || 0;
          const reserved = batch.ReservedExternally || 0;
          courseTotalSeats += seats;
          totalReservedExternally += reserved;
          const available = Math.max(0, seats - acquired - reserved);
          const userBookedBatches = bookedBatchMap[course._id.toString()];
          return {
            ...batch,
            acquiredSeats: acquired,
            availableSeats: available,
            isFull: available <= 0,
            isBooked: userBookedBatches ? userBookedBatches.has(batchId) : false,
          };
        });
      }

      const acquiredTotal = courseBookingMap[course._id.toString()] || 0;
      const totalRevenue = courseRevenueMap[course._id.toString()] || 0;
      const leftSeats = Math.max(0, courseTotalSeats - acquiredTotal - totalReservedExternally);

      let earliestStartTime = "00:00";
      let latestEndTime = "23:59";
      if (course.batches && course.batches.length > 0) {
        const startTimes = course.batches.map((b) => b.startTime).filter(Boolean);
        const endTimes = course.batches.map((b) => b.endTime).filter(Boolean);
        if (startTimes.length > 0) {
          startTimes.sort();
          earliestStartTime = startTimes[0];
        }
        if (endTimes.length > 0) {
          endTimes.sort();
          latestEndTime = endTimes[endTimes.length - 1];
        }
      }

      const currentSchedule = {
        startDate: course.startDate,
        endDate: course.endDate,
        startTime: earliestStartTime,
        endTime: latestEndTime,
      };

      const sessionStatus = getSessionStatus(currentSchedule);

      let duration = null;
      let durationTranslation = null;
      if (earliestStartTime && latestEndTime) {
        const [sh, sm] = earliestStartTime.split(":").map(Number);
        const [eh, em] = latestEndTime.split(":").map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 1440;
        if (mins > 0) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          duration = h ? (m ? `${h} H ${m} min` : `${h} H`) : `${m} min`;
          durationTranslation = h ? (m ? `${h} Цаг ${m} мин` : `${h} Цаг`) : `${m} мин`;
        }
      }

      // 5a. Weekly Schedule (for Ongoing classes)
      let weeklySchedule = null;
      if (course.enrollmentType === "Ongoing" && course.batches && Array.isArray(course.batches)) {
        const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const scheduleByDay = {};
        for (const batch of course.batches) {
          if (batch.days && Array.isArray(batch.days)) {
            for (const day of batch.days) {
              if (!scheduleByDay[day]) scheduleByDay[day] = [];
              scheduleByDay[day].push({
                batchId: batch._id,
                batchName: batch.batchName,
                startTime: batch.startTime,
                endTime: batch.endTime,
                seats: batch.seats,
                availableSeats: batch.availableSeats,
                isFull: batch.isFull,
                isBooked: batch.isBooked,
              });
            }
          }
        }
        for (const day of Object.keys(scheduleByDay)) {
          scheduleByDay[day].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        }
        weeklySchedule = {};
        for (const day of dayOrder) {
          if (scheduleByDay[day]) weeklySchedule[day] = scheduleByDay[day];
        }
      }

      return {
        ...course,
        totalSeats: courseTotalSeats,
        acquiredSeats: acquiredTotal,
        leftSeats,
        currentSchedule,
        weeklySchedule,
        sessionStatus,
        isAvailable: !!currentSchedule && sessionStatus !== "PAST",
        duration,
        durationTranslation,
        isBooked: bookedCourseIds.has(course._id.toString()),
        totalRevenue,
        totalEnrollments: acquiredTotal,
      };
    });

    const grandTotalRevenue = formattedCourses.reduce(
      (sum, c) => sum + (c.totalRevenue || 0),
      0,
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      courses: formattedCourses,
      totalCourses: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: parseInt(page),
      coursesPerPage: parseInt(limit),
      grandTotalRevenue,
    });
  } catch (error) {
    console.error("Error in getCourses:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  };
}

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
      { $match: { courseId: { $in: courseIds }, status: "PAID", bookingType: "COURSE" } },
      { $group: { _id: "$courseId", count: { $sum: "$qty" } } },
    ]);

    const bookingMap = {};
    bookingCounts.forEach((b) => {
      bookingMap[b._id.toString()] = b.count;
    });

    const formattedCourses = courses.map((course) => {
      // Format images
      if (Array.isArray(course.posterImage)) course.posterImage = course.posterImage.map(formatResponseUrl);
      if (Array.isArray(course.mediaLinks)) course.mediaLinks = course.mediaLinks.map(formatResponseUrl);
      if (Array.isArray(course.shortTeaserVideo)) course.shortTeaserVideo = course.shortTeaserVideo.map(formatResponseUrl);
      if (course.courseCategory?.image) course.courseCategory.image = formatResponseUrl(course.courseCategory.image);
      if (course.createdBy?.profileImage) course.createdBy.profileImage = formatResponseUrl(course.createdBy.profileImage);

      // Dynamic total seats
      const totalSeats = course.batches && Array.isArray(course.batches)
        ? course.batches.reduce((sum, b) => sum + (b.seats || 0), 0)
        : 0;

      // Calculate duration
      let duration = null;
      let earliestStartTime = null;
      let latestEndTime = null;
      if (course.batches && course.batches.length > 0) {
        const startTimes = course.batches.map((b) => b.startTime).filter(Boolean);
        const endTimes = course.batches.map((b) => b.endTime).filter(Boolean);
        if (startTimes.length > 0) {
          startTimes.sort();
          earliestStartTime = startTimes[0];
        }
        if (endTimes.length > 0) {
          endTimes.sort();
          latestEndTime = endTimes[endTimes.length - 1];
        }
      }
      if (earliestStartTime && latestEndTime) {
        const [startH, startM] = earliestStartTime.split(":").map(Number);
        const [endH, endM] = latestEndTime.split(":").map(Number);
        let diffMins = endH * 60 + endM - (startH * 60 + startM);
        if (diffMins < 0) diffMins += 24 * 60;
        if (diffMins > 0) {
          const hours = Math.floor(diffMins / 60);
          const minutes = diffMins % 60;
          if (hours > 0 && minutes > 0) duration = `${hours} H ${minutes} min`;
          else if (hours > 0) duration = `${hours} H`;
          else duration = `${minutes} min`;
        }
      }
      course.duration = duration;

      // Calculate aggregated seat stats
      const acquiredSeats = bookingMap[course._id.toString()] || 0;
      const totalReserved = course.batches && Array.isArray(course.batches)
        ? course.batches.reduce((sum, b) => sum + (b.ReservedExternally || 0), 0)
        : 0;

      course.totalSeats = totalSeats;
      course.acquiredSeats = acquiredSeats;
      course.leftSeats = Math.max(0, totalSeats - acquiredSeats - totalReserved);

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
        constantsMessage.COURSE_NOT_FOUND || "Course not found",
      );
    }

    // 2. Verify ownership - only creator can update
    if (existingCourse.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.UNAUTHORIZED_COURSE_EDIT || "You are not authorized to edit this course",
      );
    }

    // 3. Prevent editing past courses
    const now = new Date();
    if (existingCourse.status === eventStatus.PAST || existingCourse.endDate < now) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Cannot edit a course that has already ended",
      );
    }

    // 4. Draft check: cannot change draft false (published course cannot revert to draft)
    if (existingCourse.isDraft === false && updateData.isDraft === true) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Once a course is published, it cannot be changed back to a draft"
      );
    }

    const targetIsDraft = updateData.isDraft !== undefined ? updateData.isDraft : existingCourse.isDraft;

    // 5. If published (or transitioning to published), enforce required fields
    if (!targetIsDraft) {
      const courseTitleVal = updateData.courseTitle || existingCourse.courseTitle;
      const courseCategoryVal = updateData.courseCategory || existingCourse.courseCategory;
      const startDateVal = updateData.startDate || existingCourse.startDate;
      const endDateVal = updateData.endDate || existingCourse.endDate;
      const totalSessionsVal = updateData.totalSessions || existingCourse.totalSessions;
      const priceVal = updateData.price !== undefined ? updateData.price : existingCourse.price;
      const venueAddressVal = updateData.venueAddress || existingCourse.venueAddress;
      const batchesVal = updateData.batches || existingCourse.batches;
      const enrollmentTypeVal = updateData.enrollmentType || existingCourse.enrollmentType;

      if (!courseTitleVal) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Course title is required for a published course");
      }
      if (!enrollmentTypeVal) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Enrollment type is required for a published course");
      }
      if (!courseCategoryVal) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Course category is required for a published course");
      }
      if (!startDateVal || !endDateVal) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Start and end dates are required for a published course");
      }
      if (totalSessionsVal === undefined || totalSessionsVal === null) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Total sessions is required for a published course");
      }
      if (priceVal === undefined || priceVal === null) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Price is required for a published course");
      }
      if (
        !venueAddressVal ||
        venueAddressVal.latitude === undefined ||
        venueAddressVal.longitude === undefined ||
        venueAddressVal.latitude === null ||
        venueAddressVal.longitude === null
      ) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Venue address with valid latitude and longitude is required for a published course"
        );
      }
      if (!batchesVal || !Array.isArray(batchesVal) || batchesVal.length === 0) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "At least one batch is required for a published course"
        );
      }

      // Ensure each batch in the batches array has required fields
      for (let i = 0; i < batchesVal.length; i++) {
        const b = batchesVal[i];
        if (!b.batchName || !b.startTime || !b.endTime || !b.days || !Array.isArray(b.days) || b.days.length === 0 || b.seats === undefined || b.seats === null) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            `Batch at index ${i} must have batchName, startTime, endTime, days, and seats`
          );
        }
      }
    }

    // 6. Time and Status Check
    const isLive = existingCourse.status === eventStatus.LIVE || (existingCourse.startDate <= now && existingCourse.endDate >= now);
    if (isLive) {
      if (updateData.startDate && new Date(updateData.startDate).getTime() !== new Date(existingCourse.startDate).getTime()) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Cannot modify the start date/time of a course that is already live"
        );
      }
    }

    // Ensure startDate is in the future for upcoming courses
    if (!isLive && !targetIsDraft) {
      const newStart = updateData.startDate ? new Date(updateData.startDate) : new Date(existingCourse.startDate);
      if (newStart < now) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Start date must be in the future for upcoming courses"
        );
      }
    }

    // Ensure endDate is in the future
    if (!targetIsDraft) {
      const newEnd = updateData.endDate ? new Date(updateData.endDate) : new Date(existingCourse.endDate);
      if (newEnd < now) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "End date must be in the future"
        );
      }
    }

    const newStart = updateData.startDate ? new Date(updateData.startDate) : new Date(existingCourse.startDate);
    const newEnd = updateData.endDate ? new Date(updateData.endDate) : new Date(existingCourse.endDate);
    if (newStart && newEnd && newStart >= newEnd) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Start date must be before end date"
      );
    }

    // Handle batch-specific seats limit check vs existing transactions (prevent reducing seats below paid count + reserved externally count)
    if (updateData.batches) {
      for (const batch of updateData.batches) {
        let enrolledCount = 0;
        if (batch._id) {
          enrolledCount = await Transaction.countDocuments({
            courseId: courseId,
            batchId: batch._id.toString(),
            status: "PAID",
          });
        }

        let existingBatch = null;
        if (batch._id && existingCourse.batches) {
          existingBatch = existingCourse.batches.find(b => b._id.toString() === batch._id.toString());
        }

        const seatsVal = batch.seats !== undefined ? batch.seats : (existingBatch ? existingBatch.seats : 0);
        const reservedVal = batch.ReservedExternally !== undefined ? batch.ReservedExternally : (existingBatch ? (existingBatch.ReservedExternally || 0) : 0);

        if (seatsVal < enrolledCount + reservedVal) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            `Seats limit (${seatsVal}) cannot be less than enrolled count (${enrolledCount}) + externally reserved seats (${reservedVal}) for batch "${batch.batchName || (existingBatch ? existingBatch.batchName : '') || batch._id || 'new batch'}"`,
          );
        }
      }
    }

    // 7. Update fields on the mongoose document
    const simpleFields = [
      "courseTitle",
      "shortdesc",
      "longdesc",
      "whatYouWillLearn",
      "courseCategory",
      "posterImage",
      "mediaLinks",
      "shortTeaserVideo",
      "startDate",
      "endDate",
      "totalSessions",
      "timeZone",
      "venueName",
      "price",
      "refundPolicy",
      "isDraft",
      "batches",
      "isFeatured",
      "featuredExpiry",
      "activePromotionPackage",
      "enrollmentType",
    ];

    simpleFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        existingCourse[field] = updateData[field];
      }
    });

    // 8. Transform venueAddress to GeoJSON if provided
    if (updateData.venueAddress) {
      existingCourse.venueAddress = {
        type: "Point",
        coordinates: [
          updateData.venueAddress.longitude,
          updateData.venueAddress.latitude,
        ],
        city: updateData.venueAddress.city || "",
        country: updateData.venueAddress.country || "",
        address: updateData.venueAddress.address || "",
        state: updateData.venueAddress.state || "",
        zipcode: updateData.venueAddress.zipcode || "",
      };
    }

    // 9. Save Mongoose document to trigger pre-save hooks
    await existingCourse.save();

    // 10. Fetch updated course and populate
    const updatedCourse = await Course.findById(courseId)
      .populate("courseCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .lean();

    if (!updatedCourse) {
      return apiErrorRes(
        HTTP_STATUS.SERVER_ERROR,
        res,
        constantsMessage.COURSE_UPDATE_FAILED,
      );
    }

    // 11. Format URLs
    if (Array.isArray(updatedCourse.posterImage)) {
      updatedCourse.posterImage = updatedCourse.posterImage.map(formatResponseUrl);
    }
    if (Array.isArray(updatedCourse.mediaLinks)) {
      updatedCourse.mediaLinks = updatedCourse.mediaLinks.map(formatResponseUrl);
    }
    if (Array.isArray(updatedCourse.shortTeaserVideo)) {
      updatedCourse.shortTeaserVideo = updatedCourse.shortTeaserVideo.map(formatResponseUrl);
    }
    if (updatedCourse.courseCategory?.image) {
      updatedCourse.courseCategory.image = formatResponseUrl(updatedCourse.courseCategory.image);
    }
    if (updatedCourse.createdBy?.profileImage) {
      updatedCourse.createdBy.profileImage = formatResponseUrl(updatedCourse.createdBy.profileImage);
    }

    const message = existingCourse.isDraft
      ? constantsMessage.DRAFT_UPDATED
      : constantsMessage.COURSE_UPDATED_SUCCESS;

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      message,
      { course: updatedCourse }
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
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .lean();

    if (!course) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);
    }

    // 2. Booking Aggregation (Per Batch for this Course)
    const bookings = await Transaction.aggregate([
      {
        $match: {
          courseId: course._id,
          status: "PAID",
          bookingType: "COURSE",
        },
      },
      {
        $project: {
          qty: 1,
          batches: {
            $cond: {
              if: {
                $and: [
                  { $isArray: "$ongoingSlots" },
                  { $gt: [{ $size: "$ongoingSlots" }, 0] }
                ]
              },
              then: "$ongoingSlots.batchId",
              else: ["$batchId"]
            }
          }
        }
      },
      { $unwind: "$batches" },
      {
        $group: {
          _id: "$batches",
          count: { $sum: "$qty" },
        },
      },
    ]);

    const bookingMap = {};
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
    const bookedBatchIds = new Set();

    if (authHeader?.startsWith("Bearer ")) {
      try {
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
        bookingType: "COURSE",
      }).select("batchId ongoingSlots");

      if (existingBookings.length > 0) {
        isBooked = true;
        existingBookings.forEach((b) => {
          if (b.batchId) bookedBatchIds.add(b.batchId.toString());
          if (b.ongoingSlots && Array.isArray(b.ongoingSlots)) {
            b.ongoingSlots.forEach((slot) => {
              if (slot.batchId) bookedBatchIds.add(slot.batchId.toString());
            });
          }
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

    // 4. Enrich Batches
    let courseTotalSeats = 0;
    let totalReservedExternally = 0;
    if (course.batches && Array.isArray(course.batches)) {
      course.batches = course.batches.map((batch) => {
        const batchId = batch._id?.toString();
        const acquired = bookingMap[batchId] || 0;
        const seats = batch.seats || 0;
        const reserved = batch.ReservedExternally || 0;
        courseTotalSeats += seats;
        totalReservedExternally += reserved;
        const available = Math.max(0, seats - acquired - reserved);

        return {
          ...batch,
          acquiredSeats: acquired,
          availableSeats: available,
          isFull: available <= 0,
          isBooked: bookedBatchIds.has(batchId),
        };
      });
    }

    // 5. Dynamic currentSchedule simulation
    let earliestStartTime = "00:00";
    let latestEndTime = "23:59";
    if (course.batches && course.batches.length > 0) {
      const startTimes = course.batches.map((b) => b.startTime).filter(Boolean);
      const endTimes = course.batches.map((b) => b.endTime).filter(Boolean);
      if (startTimes.length > 0) {
        startTimes.sort();
        earliestStartTime = startTimes[0];
      }
      if (endTimes.length > 0) {
        endTimes.sort();
        latestEndTime = endTimes[endTimes.length - 1];
      }
    }

    const currentSchedule = {
      startDate: course.startDate,
      endDate: course.endDate,
      startTime: earliestStartTime,
      endTime: latestEndTime,
    };
    const sessionStatus = getSessionStatus(currentSchedule);

    // 6. Formatting Images
    if (Array.isArray(course.posterImage)) course.posterImage = course.posterImage.map(formatResponseUrl);
    if (Array.isArray(course.mediaLinks)) course.mediaLinks = course.mediaLinks.map(formatResponseUrl);
    if (Array.isArray(course.shortTeaserVideo)) course.shortTeaserVideo = course.shortTeaserVideo.map(formatResponseUrl);
    if (course.courseCategory?.image) course.courseCategory.image = formatResponseUrl(course.courseCategory.image);
    if (course.createdBy?.profileImage) course.createdBy.profileImage = formatResponseUrl(course.createdBy.profileImage);

    // 7. Duration
    let duration = null;
    let durationTranslation = null;
    if (earliestStartTime && latestEndTime) {
      const [sh, sm] = earliestStartTime.split(":").map(Number);
      const [eh, em] = latestEndTime.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 1440;
      if (mins > 0) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        duration = h ? (m ? `${h} H ${m} min` : `${h} H`) : `${m} min`;
        durationTranslation = h ? (m ? `${h} Цаг ${m} мин` : `${h} Цаг`) : `${m} мин`;
      }
    }

    // 5a. Weekly Schedule (for Ongoing classes)
    let weeklySchedule = null;
    if (course.enrollmentType === "Ongoing" && course.batches && Array.isArray(course.batches)) {
      const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const scheduleByDay = {};

      for (const batch of course.batches) {
        if (batch.days && Array.isArray(batch.days)) {
          for (const day of batch.days) {
            if (!scheduleByDay[day]) scheduleByDay[day] = [];
            scheduleByDay[day].push({
              batchId: batch._id,
              batchName: batch.batchName,
              startTime: batch.startTime,
              endTime: batch.endTime,
              seats: batch.seats,
              availableSeats: batch.availableSeats,
              isFull: batch.isFull,
              isBooked: batch.isBooked,
            });
          }
        }
      }

      // Sort slots within each day by startTime, and order days correctly
      for (const day of Object.keys(scheduleByDay)) {
        scheduleByDay[day].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
      }

      // Build ordered result (only days that have slots)
      weeklySchedule = {};
      for (const day of dayOrder) {
        if (scheduleByDay[day]) weeklySchedule[day] = scheduleByDay[day];
      }
    }

    // 8. Final Object Construction
    const formattedCourse = {
      ...course,
      totalSeats: courseTotalSeats,
      currentSchedule,
      weeklySchedule,
      sessionStatus,
      isAvailable: !!currentSchedule && sessionStatus !== "PAST",
      duration,
      durationTranslation,
      acquiredSeats: totalAcquiredSeats,
      leftSeats: Math.max(0, courseTotalSeats - totalAcquiredSeats - totalReservedExternally),
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
    const { categoryId, search, page = 1, limit = 10, isDraft, enrollmentType } = req.query;

    const skip = (page - 1) * limit;
    let query = { createdBy: userId };

    // Apply category filter
    if (categoryId) {
      query.courseCategory = categoryId;
    }

    // Apply isDraft filter
    if (isDraft === "true" || isDraft === true) {
      query.isDraft = true;
    } else if (isDraft === "false" || isDraft === false) {
      query.isDraft = false;
    }

    // Apply enrollmentType filter
    if (enrollmentType) {
      query.enrollmentType = enrollmentType;
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
      { $match: { courseId: { $in: courseIds }, status: "PAID", bookingType: "COURSE" } },
      {
        $group: {
          _id: "$courseId",
          totalRevenue: { $sum: "$totalAmount" },
          totalEnrollments: { $sum: "$qty" },
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

    // Aggregate bookings by batch for detailed available seats calculation
    const bookingCounts = await Transaction.aggregate([
      { $match: { courseId: { $in: courseIds }, status: "PAID", bookingType: "COURSE" } },
      {
        $group: {
          _id: { course: "$courseId", batch: "$batchId" },
          count: { $sum: "$qty" },
        },
      },
    ]);

    const bookingMap = {};
    const courseBookingMap = {};
    bookingCounts.forEach((b) => {
      const courseId = b._id.course.toString();
      const batchIdStr = b._id.batch ? b._id.batch.toString() : "null";
      bookingMap[`${courseId}_${batchIdStr}`] = b.count;
      courseBookingMap[courseId] = (courseBookingMap[courseId] || 0) + b.count;
    });

    const formattedCourses = courses.map((course) => {
      // Format images
      if (Array.isArray(course.posterImage)) course.posterImage = course.posterImage.map(formatResponseUrl);
      if (Array.isArray(course.mediaLinks)) course.mediaLinks = course.mediaLinks.map(formatResponseUrl);
      if (Array.isArray(course.shortTeaserVideo)) course.shortTeaserVideo = course.shortTeaserVideo.map(formatResponseUrl);
      if (course.courseCategory?.image) course.courseCategory.image = formatResponseUrl(course.courseCategory.image);
      if (course.createdBy?.profileImage) course.createdBy.profileImage = formatResponseUrl(course.createdBy.profileImage);

      let courseTotalSeats = 0;
      let totalReservedExternally = 0;
      if (course.batches && Array.isArray(course.batches)) {
        course.batches = course.batches.map((batch) => {
          const batchId = batch._id?.toString();
          const acquired = bookingMap[`${course._id}_${batchId}`] || 0;
          const seats = batch.seats || 0;
          const reserved = batch.ReservedExternally || 0;
          courseTotalSeats += seats;
          totalReservedExternally += reserved;
          const available = Math.max(0, seats - acquired - reserved);
          return {
            ...batch,
            acquiredSeats: acquired,
            availableSeats: available,
            isFull: available <= 0,
          };
        });
      }

      const acquiredTotal = courseBookingMap[course._id.toString()] || 0;
      const leftSeats = Math.max(0, courseTotalSeats - acquiredTotal - totalReservedExternally);

      // Calculate schedule boundaries
      let earliestStartTime = "00:00";
      let latestEndTime = "23:59";
      if (course.batches && course.batches.length > 0) {
        const startTimes = course.batches.map((b) => b.startTime).filter(Boolean);
        const endTimes = course.batches.map((b) => b.endTime).filter(Boolean);
        if (startTimes.length > 0) {
          startTimes.sort();
          earliestStartTime = startTimes[0];
        }
        if (endTimes.length > 0) {
          endTimes.sort();
          latestEndTime = endTimes[endTimes.length - 1];
        }
      }

      const currentSchedule = {
        startDate: course.startDate,
        endDate: course.endDate,
        startTime: earliestStartTime,
        endTime: latestEndTime,
      };

      const sessionStatus = getSessionStatus(currentSchedule);

      // Duration calculations
      let duration = null;
      let durationTranslation = null;
      if (earliestStartTime && latestEndTime) {
        const [sh, sm] = earliestStartTime.split(":").map(Number);
        const [eh, em] = latestEndTime.split(":").map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 1440;
        if (mins > 0) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          duration = h ? (m ? `${h} H ${m} min` : `${h} H`) : `${m} min`;
          durationTranslation = h ? (m ? `${h} Цаг ${m} мин` : `${h} Цаг`) : `${m} мин`;
        }
      }

      const courseStats = statsMap[course._id.toString()] || {
        revenue: 0,
        enrollments: 0,
      };

      return {
        ...course,
        totalSeats: courseTotalSeats,
        acquiredSeats: acquiredTotal,
        leftSeats,
        currentSchedule,
        sessionStatus,
        isAvailable: !!currentSchedule && sessionStatus !== "PAST",
        duration,
        durationTranslation,
        totalRevenue: courseStats.revenue,
        totalEnrollments: courseStats.enrollments,
      };
    });

    const grandTotalRevenue = formattedCourses.reduce(
      (sum, c) => sum + (c.totalRevenue || 0),
      0,
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.SUCCESS, {
      totalCourses,
      currentPage: Number(page),
      totalPages,
      coursesPerPage: Number(limit),
      grandTotalRevenue,
      courses: formattedCourses,
    });
  } catch (error) {
    console.error("Error in getOrganizerCourses:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getBookingCutOffs = async (req, res) => {
  try {
    const setting = await GlobalSetting.findOne({ key: "BOOKING_CUT_OFF_CONFIG" });
    const options = setting?.value || [
      { key: "1h", label: "1 hour before session" },
      { key: "2h", label: "2 hours before session" },
      { key: "4h", label: "4 hours before session" },
      { key: "12h", label: "12 hours before session" },
      { key: "24h", label: "24 hours before session" },
      { key: "48h", label: "48 hours before session" }
    ];
    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Booking cut-off options retrieved successfully",
      options
    );
  } catch (error) {
    console.error("Error in getBookingCutOffs:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.get("/booking-cutoffs", perApiLimiter(), getBookingCutOffs);

// Get Courses with Filters
router.get(
  "/list",
  // perApiLimiter(),
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



const assignStaffToCourse = async (req, res) => {
  try {
    const { entityId: courseId, staffIds } = req.body;
    const organizerId = req.user.userId;

    const course = await Course.findById(courseId);
    if (!course) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Course not found");
    }

    if (course.createdBy.toString() !== organizerId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to assign staff to this course",
      );
    }

    const validStaffCount = await User.countDocuments({
      _id: { $in: staffIds },
      roleId: roleId.STAFF,
      isDeleted: false,
    });

    if (validStaffCount !== staffIds.length) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "One or more provided user IDs are not valid staff members",
      );
    }

    course.assignedStaff = staffIds;
    await course.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff successfully assigned to the course",
      { course },
    );
  } catch (error) {
    console.error("Error in assignStaffToCourse:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/assign-staff",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(assignStaffSchema),
  assignStaffToCourse,
);

module.exports = router;
