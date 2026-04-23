const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const {
  Event,
  Transaction,
  User,
  GlobalSetting,
  Review,
  Comment,
  Attendee,
  Wishlist,
} = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
  toObjectId,
} = require("../../utils/globalFunction");
const {
  createEventSchema,
  getEventsSchema,
  getEventDetailsSchema,
  updateEventSchema,
  updateEventParamsSchema,
  toggleEventSliderSchema,
} = require("../services/validations/eventValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId, userRole } = require("../../utils/Role");
const { notifyEventChange } = require("../services/serviceNotification");
const jwt = require("jsonwebtoken");

// Create Event
const createEvent = async (req, res) => {
  try {
    const { id, venueAddress, isDraft: isDraftBody, ...eventData } = req.body;
    const userId = req.user.userId;

    let event;
    let isDraftValue = isDraftBody === true;

    // Transform venueAddress to GeoJSON Point safely
    let location = undefined;
    if (venueAddress) {
      location = {};
      if (
        venueAddress.longitude !== undefined &&
        venueAddress.latitude !== undefined
      ) {
        location.type = "Point";
        location.coordinates = [venueAddress.longitude, venueAddress.latitude];
      }
      if (venueAddress.city) location.city = venueAddress.city;
      if (venueAddress.country) location.country = venueAddress.country;
      if (venueAddress.address) location.address = venueAddress.address;

      if (Object.keys(location).length === 0) location = undefined;
    }

    let featureFee = 0;
    if (req.body.fetcherEvent) {
      const feeSetting = await GlobalSetting.findOne({
        key: "FEATURE_EVENT_FEE",
      });
      if (feeSetting && feeSetting.value) {
        featureFee = Number(feeSetting.value) || 0;
      }
    }

    if (id) {
      // UPDATE existing event (Draft or Published)
      event = await Event.findById(id);
      if (!event) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          constantsMessage.EVENT_NOT_FOUND,
        );
      }

      if (event.createdBy.toString() !== userId) {
        return apiErrorRes(
          HTTP_STATUS.FORBIDDEN,
          res,
          constantsMessage.UNAUTHORIZED_EVENT_UPDATE,
        );
      }

      // Update fields
      Object.assign(event, eventData);

      // Update venueAddress safely
      if (venueAddress) {
        if (!event.venueAddress) {
          event.venueAddress = {};
        }

        if (
          venueAddress.longitude !== undefined &&
          venueAddress.latitude !== undefined
        ) {
          event.venueAddress.type = "Point";
          event.venueAddress.coordinates = [
            venueAddress.longitude,
            venueAddress.latitude,
          ];
        }
        if (venueAddress.city !== undefined)
          event.venueAddress.city = venueAddress.city;
        if (venueAddress.country !== undefined)
          event.venueAddress.country = venueAddress.country;
        if (venueAddress.address !== undefined)
          event.venueAddress.address = venueAddress.address;
      }

      if (req.body.venueName !== undefined)
        event.venueName = req.body.venueName;
      event.featureEventFee = featureFee;
      event.isDraft = isDraftValue;

      await event.save();
    } else {
      // CREATE new event
      event = new Event({
        ...eventData,
        venueAddress: location,
        venueName: req.body.venueName,
        createdBy: userId,
        featureEventFee: featureFee,
        isDraft: isDraftValue,
      });
      await event.save();
    }

    const eventObj = event.toObject();
    if (Array.isArray(eventObj.posterImage)) {
      eventObj.posterImage = eventObj.posterImage.map((img) =>
        formatResponseUrl(img),
      );
    }

    if (Array.isArray(eventObj.shortTeaserVideo)) {
      eventObj.shortTeaserVideo = eventObj.shortTeaserVideo.map((video) =>
        formatResponseUrl(video),
      );
    }

    if (Array.isArray(eventObj.mediaLinks)) {
      eventObj.mediaLinks = eventObj.mediaLinks.map((link) =>
        formatResponseUrl(link),
      );
    }

    const message = id
      ? isDraftValue
        ? constantsMessage.DRAFT_UPDATED
        : constantsMessage.EVENT_PUBLISHED_SUCCESS
      : isDraftValue
        ? constantsMessage.DRAFT_SAVED
        : constantsMessage.EVENT_CREATED;

    return apiSuccessRes(HTTP_STATUS.OK, res, message, {
      event: eventObj,
    });
  } catch (error) {
    console.error("Error in createEvent:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Events with Filters
// ─── Shared event formatter ────────────────────────────────────────────────

const checkFewSeatsAvailable = (available, total, percent = 10) => {
  if (!total || total <= 0) return false;
  return available <= (percent / 100) * total;
};
const formatEvent = (event, bookedEventIds = new Set()) => {
  if (Array.isArray(event.posterImage)) {
    event.posterImage = event.posterImage.map((img) => formatResponseUrl(img));
  }
  if (Array.isArray(event.shortTeaserVideo)) {
    event.shortTeaserVideo = event.shortTeaserVideo.map((v) =>
      formatResponseUrl(v),
    );
  }
  if (Array.isArray(event.mediaLinks)) {
    event.mediaLinks = event.mediaLinks.map((l) => formatResponseUrl(l));
  }
  if (event.eventCategory && event.eventCategory.image) {
    event.eventCategory.image = formatResponseUrl(event.eventCategory.image);
  }
  if (event.createdBy && event.createdBy.profileImage) {
    event.createdBy.profileImage = formatResponseUrl(
      event.createdBy.profileImage,
    );
  }
  // Duration
  let duration = null;
  if (event.startDate && event.endDate) {
    const diffMs = new Date(event.endDate) - new Date(event.startDate);
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      duration =
        hours > 0 && minutes > 0
          ? `${hours} H ${minutes} min`
          : hours > 0
            ? `${hours} H`
            : `${minutes} min`;
    }
  }
  event.duration = duration;
  event.totalSeats = event.totalTickets || 0;
  event.leftSeats = event.ticketQtyAvailable || 0;
  event.acquiredSeats =
    (event.totalTickets || 0) - (event.ticketQtyAvailable || 0);
  event.isFewSeatsAvailable = checkFewSeatsAvailable(
    event.leftSeats,
    event.totalSeats,
    10,
  );
  event.isBooked = bookedEventIds.has(event._id.toString());
  return event;
};
// ─────────────────────────────────────────────────────────────────────────────

const getEvents = async (req, res) => {
  try {
    const {
      filter = "all",
      latitude,
      longitude,
      radius = 100,
      categoryId: cid,
      category,
      search,
      page = 1,
      limit = 10,
      userId,
      placement,
      startDate: customStartDate,
      endDate: customEndDate,
      isDraft,
      timeOfDay,
      addToSlider,
    } = req.query;
    const queryEntries = Object.entries(req.query || {}).filter(
      ([, value]) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    );
    const bodyEntries = Object.entries(req.body || {}).filter(
      ([, value]) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    );

    const addToSliderInput =
      addToSlider !== undefined ? addToSlider : req.body?.addToSlider;
    const isAddToSliderTrueOnlyRequest =
      String(addToSliderInput).toLowerCase() === "true" &&
      ((queryEntries.length === 1 && queryEntries[0][0] === "addToSlider") ||
        (queryEntries.length === 0 &&
          bodyEntries.length === 1 &&
          bodyEntries[0][0] === "addToSlider"));

    if (isAddToSliderTrueOnlyRequest) {
      const simpleLimit = 10;
      const simpleQuery = { addToSlider: true, isDraft: false };

      const events = await Event.find(simpleQuery)
        .populate("eventCategory")
        .populate("createdBy", "firstName lastName profileImage isVerified")
        .sort({ fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1 })
        .limit(simpleLimit)
        .lean();
      const totalCount = await Event.countDocuments(simpleQuery);

      let viewerId = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
          viewerId = decoded.userId;
        } catch (err) {}
      }

      const bookedEventIds = new Set();
      if (viewerId && events.length > 0) {
        const bookings = await Transaction.find({
          userId: viewerId,
          eventId: { $in: events.map((e) => e._id) },
          status: "PAID",
        }).select("eventId");
        bookings.forEach((b) => bookedEventIds.add(b.eventId.toString()));
      }

      const formattedEvents = events.map((event) =>
        formatEvent(event, bookedEventIds),
      );

      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.EVENTS_FETCHED,
        {
          events: formattedEvents,
          total: totalCount,
          totalPages: Math.ceil(totalCount / simpleLimit),
          page: 1,
          limit: simpleLimit,
        },
      );
    }

    const categoryId = cid || category;

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

    // ... (Draft filter and Past filter logic remains same for now as they affect query.endDate or query.isDraft)

    // Draft filter (explicit param or through filter string)
    if (isDraft === "true" || isDraft === true || filters.includes("draft")) {
      if (!loginUser) {
        console.warn(`[getEvents] Unauthorized attempt to access drafts`);
        return apiErrorRes(
          HTTP_STATUS.UNAUTHORIZED,
          res,
          constantsMessage.LOGIN_REQUIRED_DRAFTS,
        );
      }
      query.isDraft = true;
      query.createdBy = loginUser;
      // console.log(`[getEvents] Draft filter active for creator: ${loginUser}`);
    } else {
      query.isDraft = false;

      // Default time constraints (active events) - unless "past" filter is specifically requested
      if (!filters.includes("past")) {
        query.endDate = { $gte: now };
        query.status = { $ne: "Past" };
        // console.log(`[getEvents] Filtering for Active/Upcoming events (endDate >= now)`);
      } else {
        query.endDate = { $lt: now };
        // console.log(`[getEvents] Filtering for Past events (endDate < now)`);
      }
    }

    // CreatedBy filter
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.createdBy = new mongoose.Types.ObjectId(userId);
      // console.log(`[getEvents] Filtering by creator userId: ${userId}`);
    }

    // Multiple Categories filter
    if (categoryId && categoryId !== "") {
      const catIds = categoryId
        .split(",")
        .filter((id) => mongoose.Types.ObjectId.isValid(id.trim()));
      if (catIds.length > 1) {
        query.eventCategory = {
          $in: catIds.map((id) => new mongoose.Types.ObjectId(id.trim())),
        };
        // console.log(`[getEvents] Filtering by categories: ${catIds}`);
      } else if (catIds.length === 1) {
        query.eventCategory = new mongoose.Types.ObjectId(catIds[0].trim());
        // console.log(`[getEvents] Filtering by single category: ${catIds[0]}`);
      }
    }

    // Custom Date Range filter
    // If query provides full ISO datetime, use exact value.
    // If query provides date-only (YYYY-MM-DD), expand to full local day range.
    if (customStartDate || customEndDate) {
      const hasExplicitTime = (value) =>
        typeof value === "string" && value.includes("T");

      if (customStartDate) {
        const sD = new Date(customStartDate);
        if (!isNaN(sD.getTime())) {
          if (!hasExplicitTime(customStartDate)) {
            sD.setHours(0, 0, 0, 0);
          }
          startDateConditions.push({ $gte: sD });
        }
      }
      if (customEndDate) {
        const eD = new Date(customEndDate);
        if (!isNaN(eD.getTime())) {
          if (!hasExplicitTime(customEndDate)) {
            eD.setHours(23, 59, 59, 999);
          }
          query.endDate = { ...query.endDate, $lte: eD };
        }
      }
    }

    // Apply Time-based filters
    for (const f of filters) {
      if (
        [
          "upcoming",
          "today",
          "tomorrow",
          "thisweek",
          "thisweekend",
          "thisyear",
          "nextweek",
          "recommended",
        ].includes(f)
      ) {
        // console.log(`[getEvents] Applying time-based filter: ${f}`);
      }
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
            } catch (err) {}
          }
          if (userCategories.length > 0) {
            query.eventCategory = {
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
        // Multiple conditions on the same field must be combined at top-level $and.
        if (!query.$and) query.$and = [];
        startDateConditions.forEach((cond) => {
          query.$and.push({ startDate: cond });
        });
      }
    }

    // Search filter
    if (search) {
      // console.log(`[getEvents] Search regex active for: ${search}`);
      query.$or = [
        { eventTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
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

    // console.log(`[getEvents] Final Query built:`, JSON.stringify(query, null, 2));

    // Check for "nearYou" fallback if no coords
    if (filters.includes("nearyou") && !(latitude && longitude)) {
      // console.log(`[getEvents] NearYou fallback triggered (no coordinates)`);
      let city = null,
        country = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
          const user = await User.findById(decoded.userId).lean();
          city = user?.location?.city || null;
          country = user?.location?.country || null;
        } catch (err) {}
      }
      if (city) {
        query["venueAddress.city"] = city;
        // console.log(`[getEvents] Fallback: Filtering by City: ${city}`);
      } else if (country) {
        query["venueAddress.country"] = country;
        // console.log(`[getEvents] Fallback: Filtering by Country: ${country}`);
      } else if (!filters.includes("all") && filters.length === 1) {
        // console.log(`[getEvents] Fallback: No location found for NearYou, returning empty result`);
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.EVENTS_FETCHED,
          {
            events: [],
            total: 0,
            totalPages: 0,
            page: parseInt(page),
            limit: parseInt(limit),
          },
        );
      }
    }

    let events = [];
    let totalCount = 0;

    // Execute query with Geo search if coords present
    if (latitude && longitude) {
      // console.log(`[getEvents] Executing GeoNear Aggregate Query (Radius: ${radius}km)`);
      const geoAgg = await Event.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            distanceField: "distance",
            maxDistance: radius * 1000,
            spherical: true,
            query: query,
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
          $sort: {
            isPromoMatch: -1,
            fetcherEvent: -1,
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
            localField: "eventCategory",
            foreignField: "_id",
            as: "eventCategory",
          },
        },
        {
          $unwind: { path: "$eventCategory", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            pipeline: [
              { $project: { firstName: 1, lastName: 1, profileImage: 1 } },
            ],
            as: "createdBy",
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      ]);

      const countAgg = await Event.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            distanceField: "distance",
            maxDistance: radius * 1000,
            spherical: true,
            query: query,
          },
        },
        { $count: "total" },
      ]);
      events = geoAgg;
      totalCount = countAgg[0]?.total || 0;
    } else {
      // Regular query (with optional placement sorting)
      if (placement) {
        // console.log(`[getEvents] Executing Aggregate Query with placement sorting: ${placement}`);
        events = await Event.aggregate([
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
              fetcherEvent: -1,
              ...(filters.includes("past")
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
              localField: "eventCategory",
              foreignField: "_id",
              as: "eventCategory",
            },
          },
          {
            $unwind: {
              path: "$eventCategory",
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
        totalCount = await Event.countDocuments(query);
      } else {
        // console.log(`[getEvents] Executing standard find/sort Query`);
        const sortOrder = filters.includes("past")
          ? { fetcherEvent: -1, endDate: -1, startDate: -1 }
          : filters.includes("draft")
            ? { updatedAt: -1 }
            : { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1 };
        events = await Event.find(query)
          .populate("eventCategory")
          .populate("createdBy", "firstName lastName profileImage isVerified")
          .sort(sortOrder)
          .skip(skip)
          .limit(parseInt(limit))
          .lean();
        totalCount = await Event.countDocuments(query);
      }
    }

    // console.log(`[getEvents] Fetched ${events.length} events (Total matched: ${totalCount})`);

    // Determine viewer status and format response
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        viewerId = decoded.userId;
        // console.log(`[getEvents] Viewer ID: ${viewerId}`);
      } catch (err) {}
    }

    const bookedEventIds = new Set();
    if (viewerId) {
      const bookings = await Transaction.find({
        userId: viewerId,
        eventId: { $in: events.map((e) => e._id) },
        status: "PAID",
      }).select("eventId");
      bookings.forEach((b) => bookedEventIds.add(b.eventId.toString()));
      // console.log(`[getEvents] Checked bookings for viewer. Found: ${bookedEventIds.size} bookings`);
    }

    const formattedEvents = events.map((event) =>
      formatEvent(event, bookedEventIds),
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, {
      events: formattedEvents,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getEvents:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admint Get Single Event Details
const getEventDetails = async (req, res) => {
  try {
    const { eventId } = req.params;

    // 1. Fetch Event with populated fields
    const event = await Event.findById(eventId)
      .populate("eventCategory")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .lean();

    if (!event) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.EVENT_NOT_FOUND,
      );
    }

    // 2. Determine Status & Booking
    const now = new Date();
    let status = "Upcoming";
    if (event.endDate < now) {
      status = "Past";
    } else if (now >= event.startDate && now <= event.endDate) {
      status = "Live";
    }
    // Override status in response
    event.status = status;

    // Check Booking Status (if logged in)
    let isBooked = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const userId = decoded.userId;

        // Check Transaction for confirmed booking
        const booking = await Transaction.findOne({
          userId: userId,
          eventId: eventId,
          status: "PAID",
        });
        if (booking) isBooked = true;
      } catch (err) {}
    }
    event.isBooked = isBooked;

    // Check Wishlist Status
    let isWishlisted = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const userId = decoded.userId;
        const wishlistItem = await Wishlist.findOne({
          userId: toObjectId(userId),
          entityId: toObjectId(eventId),
          entityModel: "Event",
        });
        if (wishlistItem) isWishlisted = true;
      } catch (err) {}
    }
    event.isWishlisted = isWishlisted;

    // Format Event Images
    if (Array.isArray(event.posterImage)) {
      event.posterImage = event.posterImage.map(formatResponseUrl);
    }
    if (Array.isArray(event.shortTeaserVideo)) {
      event.shortTeaserVideo = event.shortTeaserVideo.map(formatResponseUrl);
    }
    if (Array.isArray(event.mediaLinks)) {
      event.mediaLinks = event.mediaLinks.map(formatResponseUrl);
    }
    if (event.eventCategory?.image) {
      event.eventCategory.image = formatResponseUrl(event.eventCategory.image);
    }
    if (event.createdBy?.profileImage) {
      event.createdBy.profileImage = formatResponseUrl(
        event.createdBy.profileImage,
      );
    }

    // Calculate Duration
    let duration = null;
    let durationTranslation = null;
    
    if (event.startDate && event.endDate) {
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      const diffMs = end - start;
      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0 && minutes > 0) {
          duration = `${hours} H ${minutes} min`;
        } else if (hours > 0) {
          duration = `${hours} H`;
        } else {
          duration = `${minutes} min`;
        }
        durationTranslation = duration.replace(/H/g, "Цаг").replace(/min/g, "мин");
      }
    }
    event.duration = duration;
    event.durationTranslation = durationTranslation;

    // 3. Parallel Fetch for Related Data
    const [reviews, comments, totalAttendeesAgg, recentTransactions] =
      await Promise.all([
        // Top 5 Reviews
        Review.find({ entityId: eventId, entityModel: "Event" })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("userId", "firstName lastName profileImage isVerified")
          .lean(),

        // Top 5 Comments
        Comment.find({ event: eventId, parentComment: null })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("user", "firstName lastName profileImage isVerified")
          .lean(),

        // Total Attendees Count (Sum of qty from PAID event transactions)
        Transaction.aggregate([
          {
            $match: {
              eventId: new mongoose.Types.ObjectId(eventId),
              status: "PAID",
              bookingType: "EVENT",
            },
          },
          {
            $group: {
              _id: null,
              totalQty: { $sum: "$qty" },
            },
          },
        ]),

        // Recent Bookers (Transactions)
        Transaction.find({
          eventId: eventId,
          status: "PAID",
          bookingType: "EVENT",
        })
          .sort({ createdAt: -1 })
          .limit(10) // Limit to 10 to get some unique users
          .populate("userId", "firstName lastName profileImage isVerified")
          .lean(),
      ]);

    const totalAttendees =
      totalAttendeesAgg.length > 0 ? totalAttendeesAgg[0].totalQty : 0;

    // Sync event.totalAttendees with calculated totalAttendees
    event.totalAttendees = totalAttendees;
    // Deduplicate users for recent bookers
    const uniqueUsers = [];
    const seenUserIds = new Set();
    for (const t of recentTransactions) {
      if (t.userId && !seenUserIds.has(t.userId._id.toString())) {
        uniqueUsers.push({
          _id: t.userId._id,
          firstName: t.userId.firstName,
          lastName: t.userId.lastName,
          profileImage: formatResponseUrl(t.userId.profileImage),
        });
        seenUserIds.add(t.userId._id.toString());
      }
      if (uniqueUsers.length >= 5) break;
    }

    // Format Related Data
    const formattedReviews = reviews.map((r) => ({
      ...r,
      user: r.userId
        ? {
            ...r.userId,
            profileImage: formatResponseUrl(r.userId.profileImage),
          }
        : null,
    }));

    const formattedComments = comments.map((c) => ({
      ...c,
      user: c.user
        ? {
            ...c.user,
            profileImage: formatResponseUrl(c.user.profileImage),
          }
        : null,
    }));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.Event_DETAILS_FETCHED || "Event details fetched",
      {
        event,
        reviews: formattedReviews,
        comments: formattedComments,
        attendees: {
          total: totalAttendees,
          recent: uniqueUsers,
        },
      },
    );
  } catch (error) {
    console.error("Error in getEventDetails:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Events for Organizer
const getEventsByOrganizer = async (req, res) => {
  try {
    const { categoryId, search, page = 1, limit = 10, status } = req.query;
    const userId = req.user.userId;

    const skip = (page - 1) * limit;
    let query = { createdBy: userId };

    const now = new Date();

    // Apply status filter
    if (status && status !== "all") {
      if (status === "upcoming") {
        query.endDate = { $gte: now };
        query.startDate = { $gt: now };
      } else if (status === "past") {
        query.endDate = { $lt: now };
      } else if (status === "ongoing") {
        query.startDate = { $lte: now };
        query.endDate = { $gte: now };
      }
    }

    // Apply category filter
    if (categoryId && categoryId !== "") {
      query.eventCategory = categoryId;
    }

    // Apply search
    if (search) {
      query.$or = [
        { eventTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    // Execute query
    const events = await Event.find(query)
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Event.countDocuments(query);

    // Calculate Revenue
    const eventIds = events.map((e) => e._id);
    const revenues = await Transaction.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: "PAID",
          bookingType: "EVENT",
        },
      },
      {
        $group: {
          _id: "$eventId",
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const revenueMap = {};
    revenues.forEach((r) => {
      revenueMap[r._id.toString()] = r.totalRevenue;
    });

    // Format fields
    const formattedEvents = events.map((event) => {
      if (Array.isArray(event.posterImage)) {
        event.posterImage = event.posterImage.map((img) =>
          formatResponseUrl(img),
        );
      }
      if (event.eventCategory && event.eventCategory.image) {
        event.eventCategory.image = formatResponseUrl(
          event.eventCategory.image,
        );
      }
      if (event.createdBy && event.createdBy.profileImage) {
        event.createdBy.profileImage = formatResponseUrl(
          event.createdBy.profileImage,
        );
      }

      // Calculate Duration
      let duration = null;
      if (event.startDate && event.endDate) {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        const diffMs = end - start;
        if (diffMs > 0) {
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          if (hours > 0 && minutes > 0) duration = `${hours}H ${minutes}min`;
          else if (hours > 0) duration = `${hours}H`;
          else duration = `${minutes}min`;
        }
      }
      event.duration = duration;

      event.totalSeats = event.totalTickets || 0;
      event.leftSeats = event.ticketQtyAvailable || 0;
      event.acquiredSeats =
        (event.totalTickets || 0) - (event.ticketQtyAvailable || 0);

      // Status field logic
      let eventStatus = "Upcoming";
      if (event.endDate < now) {
        eventStatus = "Past";
      } else if (now >= event.startDate && now <= event.endDate) {
        eventStatus = "Ongoing";
      }
      event.status = eventStatus;

      // Add Revenue
      event.totalRevenue = revenueMap[event._id.toString()] || 0;

      return event;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, {
      events: formattedEvents,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getEventsByOrganizer:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin List API
const getEventsAdmin = async (req, res) => {
  try {
    const { categoryId, search, page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;
    let query = {
      isDraft: { $ne: true },
    };

    // Apply category filter
    if (categoryId && categoryId !== "") {
      query.eventCategory = categoryId;
    }

    // Apply search
    if (search) {
      query.$or = [
        { eventTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    // Execute query
    const events = await Event.find(query)
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .sort({ createdAt: -1 }) // Newest created first for Admin
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Event.countDocuments(query);

    // Format fields
    const formattedEvents = events.map((event) => {
      const now = new Date();
      if (Array.isArray(event.posterImage)) {
        event.posterImage = event.posterImage.map((img) =>
          formatResponseUrl(img),
        );
      }
      if (event.eventCategory && event.eventCategory.image) {
        event.eventCategory.image = formatResponseUrl(
          event.eventCategory.image,
        );
      }
      if (event.createdBy && event.createdBy.profileImage) {
        event.createdBy.profileImage = formatResponseUrl(
          event.createdBy.profileImage,
        );
      }

      // Calculate Duration (Same logic as public API)
      let duration = null;
      if (event.startDate && event.endDate) {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        const diffMs = end - start;
        if (diffMs > 0) {
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          if (hours > 0 && minutes > 0) duration = `${hours}H ${minutes}min`;
          else if (hours > 0) duration = `${hours}H`;
          else duration = `${minutes}min`;
        }
      }
      event.duration = duration;

      event.totalSeats = event.totalTickets || 0;
      event.leftSeats = event.ticketQtyAvailable || 0;
      event.acquiredSeats =
        (event.totalTickets || 0) - (event.ticketQtyAvailable || 0);

      if (event.startDate && event.endDate) {
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        if (now < startDate) event.status = "Upcoming";
        else if (now <= endDate) event.status = "Live";
        else event.status = "Past";
      }
      event.addToSlider = Boolean(event.addToSlider);

      return event;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, {
      events: formattedEvents,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getEventsAdmin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const toggleEventSlider = async (req, res) => {
  try {
    const { eventId, addToSlider } = req.body;
    const event = await Event.findById(eventId);

    if (!event) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.EVENT_NOT_FOUND,
      );
    }

    const now = new Date();
    let liveStatus = "Upcoming";

    if (event.startDate && event.endDate) {
      if (now < event.startDate) liveStatus = "Upcoming";
      else if (now <= event.endDate) liveStatus = "Live";
      else liveStatus = "Past";
    }

    event.addToSlider = addToSlider;
    await event.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.EVENT_SLIDER_UPDATED,
      {
        eventId: event._id,
        addToSlider: event.addToSlider,
        status: liveStatus,
      },
    );
  } catch (error) {
    console.error("Error in toggleEventSlider:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Organizer Stats (Revenue & Attendees)
const getOrganizerStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    // fetch all events by this organizer
    const events = await Event.find({ createdBy: userId }).select("_id").lean();
    const eventIds = events.map((e) => e._id);

    if (eventIds.length === 0) {
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.STATS_FETCHED,
        {
          totalRevenue: 0,
          totalAttendees: 0,
        },
      );
    }

    const stats = await Transaction.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: "PAID",
          bookingType: "EVENT",
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalAttendees: { $sum: "$qty" },
        },
      },
    ]);

    const result =
      stats.length > 0 ? stats[0] : { totalRevenue: 0, totalAttendees: 0 };

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.STATS_FETCHED, {
      totalRevenue: result.totalRevenue || 0,
      totalAttendees: result.totalAttendees || 0,
    });
  } catch (error) {
    console.error("Error in getOrganizerStats:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get All Event Attendees
const getAllEventAttendees = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { search } = req.query;

    const event = await Event.findById(eventId)
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .select("createdBy eventTitle")
      .lean();

    if (!event) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.EVENT_NOT_FOUND,
      );
    }

    // Format host image
    if (event.createdBy && event.createdBy.profileImage) {
      event.createdBy.profileImage = formatResponseUrl(
        event.createdBy.profileImage,
      );
    }

    // Fetch all PAID transactions for this event
    const transactions = await Transaction.find({
      eventId: eventId,
      status: "PAID",
      bookingType: "EVENT",
    })
      .populate("userId", "firstName lastName profileImage isVerified roleId")
      .sort({ createdAt: -1 })
      .lean();

    // Deduplicate users
    const uniqueUsers = [];
    const seenUserIds = new Set();

    for (const t of transactions) {
      if (t.userId && !seenUserIds.has(t.userId._id.toString())) {
        const user = t.userId;
        // Filter by search if provided
        if (search) {
          const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
          if (!fullName.includes(search.toLowerCase())) continue;
        }

        uniqueUsers.push({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImage: formatResponseUrl(user.profileImage),
          ticketsBought: t.qty, // Optional: show how many tickets they bought
          userRole: userRole[user.roleId] || "GUEST",
        });
        seenUserIds.add(user._id.toString());
      }
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.EVENT_ATTENDEES_FETCHED,
      {
        host: event.createdBy,
        eventTitle: event.eventTitle,
        attendees: uniqueUsers,
      },
    );
  } catch (error) {
    console.error("Error in getAllEventAttendees:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Update/Edit Event
const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;

    // 1. Check if event exists
    const existingEvent = await Event.findById(eventId).lean();
    if (!existingEvent) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.EVENT_NOT_FOUND,
      );
    }

    // 2. Check ownership - only the creator can edit
    if (existingEvent.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.UNAUTHORIZED_ACCESS ||
          "You are not authorized to edit this event",
      );
    }

    // 3. Prevent editing past events
    const now = new Date();
    if (existingEvent.endDate < now) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.CANNOT_EDIT_PAST_EVENT ||
          "Cannot edit an event that has already ended",
      );
    }

    // 4. Validate date logic if dates are being updated
    const startDate = updateData.startDate
      ? new Date(updateData.startDate)
      : new Date(existingEvent.startDate);
    const endDate = updateData.endDate
      ? new Date(updateData.endDate)
      : new Date(existingEvent.endDate);

    if (startDate >= endDate) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_DATE_RANGE ||
          "Start date must be before end date",
      );
    }

    // Prevent setting end date in the past
    if (endDate < now) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.CANNOT_SET_PAST_END_DATE ||
          "Cannot set end date in the past",
      );
    }

    // 5. Validate ticket quantity updates
    if (
      updateData.totalTickets !== undefined ||
      updateData.ticketQtyAvailable !== undefined
    ) {
      const totalTickets =
        updateData.totalTickets !== undefined
          ? updateData.totalTickets
          : existingEvent.totalTickets || 0;

      const ticketQtyAvailable =
        updateData.ticketQtyAvailable !== undefined
          ? updateData.ticketQtyAvailable
          : existingEvent.ticketQtyAvailable || 0;

      // Calculate sold tickets
      const soldTickets =
        (existingEvent.totalTickets || 0) -
        (existingEvent.ticketQtyAvailable || 0);

      // Cannot reduce total tickets below already sold
      if (totalTickets < soldTickets) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.CANNOT_REDUCE_TICKETS ||
            `Cannot reduce total tickets below ${soldTickets} (already sold)`,
        );
      }

      // Available tickets cannot exceed total tickets
      if (ticketQtyAvailable > totalTickets) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_TICKET_QTY ||
            "Available tickets cannot exceed total tickets",
        );
      }
    }

    // 6. Validate ticket sales dates if provided
    if (updateData.ticketSelesStartDate || updateData.ticketSelesEndDate) {
      const salesStart = updateData.ticketSelesStartDate
        ? new Date(updateData.ticketSelesStartDate)
        : existingEvent.ticketSelesStartDate
          ? new Date(existingEvent.ticketSelesStartDate)
          : null;

      const salesEnd = updateData.ticketSelesEndDate
        ? new Date(updateData.ticketSelesEndDate)
        : existingEvent.ticketSelesEndDate
          ? new Date(existingEvent.ticketSelesEndDate)
          : null;

      if (salesStart && salesEnd && salesStart >= salesEnd) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_SALES_DATE_RANGE ||
            "Ticket sales start date must be before end date",
        );
      }

      // Sales end date should be before or equal to event start date
      if (salesEnd && salesEnd > startDate) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.SALES_END_AFTER_EVENT_START ||
            "Ticket sales should end before event starts",
        );
      }
    }

    // 7. Validate age restriction if provided
    if (updateData.ageRestriction) {
      const { type, minAge, maxAge } = updateData.ageRestriction;

      if (type === "MIN_AGE" && (minAge === undefined || minAge < 0)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_AGE_RESTRICTION ||
            "Minimum age must be specified and non-negative for MIN_AGE type",
        );
      }

      if (type === "RANGE") {
        if (
          minAge === undefined ||
          maxAge === undefined ||
          minAge < 0 ||
          maxAge < 0
        ) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            constantsMessage.INVALID_AGE_RESTRICTION ||
              "Both minimum and maximum age must be specified and non-negative for RANGE type",
          );
        }
        if (minAge >= maxAge) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            constantsMessage.INVALID_AGE_RESTRICTION ||
              "Minimum age must be less than maximum age",
          );
        }
      }
    }

    // 8. Build update object
    const updateObject = {};

    // Simple fields
    const simpleFields = [
      "eventTitle",
      "eventCategory",
      "posterImage",
      "shortdesc",
      "longdesc",
      "tags",
      "venueName",
      "startDate",
      "endDate",
      "startTime",
      "endTime",
      "ticketName",
      "ticketQtyAvailable",
      "ticketSelesStartDate",
      "ticketSelesEndDate",
      "ticketPrice",
      "totalTickets",
      "refundPolicy",
      "addOns",
      "mediaLinks",
      "shortTeaserVideo",
      "accessAndPrivacy",
      "ageRestriction",
      "dressCode",
      "isDraft",
    ];

    simpleFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        updateObject[field] = updateData[field];
      }
    });

    // 9. Transform venueAddress to GeoJSON if provided
    if (updateData.venueAddress) {
      updateObject.venueAddress = {
        type: "Point",
        coordinates: [
          updateData.venueAddress.longitude,
          updateData.venueAddress.latitude,
        ],
        city: updateData.venueAddress.city,
        country: updateData.venueAddress.country,
        address: updateData.venueAddress.address,
      };
    }

    // 10. Handle feature event fee if fetcherEvent flag changes
    if (updateData.fetcherEvent !== undefined) {
      let featureFee = 0;
      if (updateData.fetcherEvent) {
        const feeSetting = await GlobalSetting.findOne({
          key: "FEATURE_EVENT_FEE",
        });
        if (feeSetting && feeSetting.value) {
          featureFee = Number(feeSetting.value) || 0;
        }
      }
      updateObject.featureEventFee = featureFee;
    }

    // 11. Perform the update
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $set: updateObject },
      { new: true, runValidators: true },
    )
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .lean();

    // 12. Format response URLs
    if (Array.isArray(updatedEvent.posterImage)) {
      updatedEvent.posterImage = updatedEvent.posterImage.map((img) =>
        formatResponseUrl(img),
      );
    }

    if (Array.isArray(updatedEvent.shortTeaserVideo)) {
      updatedEvent.shortTeaserVideo = updatedEvent.shortTeaserVideo.map(
        (video) => formatResponseUrl(video),
      );
    }

    if (Array.isArray(updatedEvent.mediaLinks)) {
      updatedEvent.mediaLinks = updatedEvent.mediaLinks.map((link) =>
        formatResponseUrl(link),
      );
    }

    if (updatedEvent.eventCategory?.image) {
      updatedEvent.eventCategory.image = formatResponseUrl(
        updatedEvent.eventCategory.image,
      );
    }

    if (updatedEvent.createdBy?.profileImage) {
      updatedEvent.createdBy.profileImage = formatResponseUrl(
        updatedEvent.createdBy.profileImage,
      );
    }

    // ── Notify Attendees of Major Changes (non-blocking) ───────────────────
    const majorChanges = [];
    if (
      updateData.startDate &&
      String(updateData.startDate) !== String(existingEvent.startDate)
    ) {
      majorChanges.push("date");
    }
    if (
      updateData.venueName &&
      updateData.venueName !== existingEvent.venueName
    ) {
      majorChanges.push("venue name");
    }
    if (
      updateData.venueAddress &&
      JSON.stringify(updateObject.venueAddress) !==
        JSON.stringify(existingEvent.venueAddress)
    ) {
      majorChanges.push("location");
    }

    if (majorChanges.length > 0) {
      (async () => {
        try {
          const attendees = await Transaction.distinct("userId", {
            eventId: eventId,
            status: "PAID",
            bookingType: "EVENT",
          });

          const changeDetail = `The event's ${majorChanges.join(", ")} has been updated. Please check the details.`;
          for (const attendeeId of attendees) {
            notifyEventChange(
              String(attendeeId),
              updatedEvent.eventTitle,
              eventId,
              changeDetail,
            ).catch((e) =>
              console.error("[Notification] notifyEventChange error:", e),
            );
          }
        } catch (err) {
          console.error(
            "[Notification] Error fetching attendees for update:",
            err,
          );
        }
      })();
    }
    // ────────────────────────────────────────────────────────────────────────

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.EVENT_UPDATED || "Event updated successfully",
      { event: updatedEvent },
    );
  } catch (error) {
    console.error("Error in updateEvent:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/create",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(createEventSchema),
  createEvent,
);
// this is for the customer Pannel
router.get(
  "/list",
  // perApiLimiter(),
  // validateRequest(getEventsSchema),
  getEvents,
);

// this is for the organizer Pannel
router.get(
  "/organizer/list",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  getEventsByOrganizer,
);

router.get(
  "/organizer/stats",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  getOrganizerStats,
);

router.get(
  "/admin/list",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(getEventsSchema),
  getEventsAdmin,
);

router.post(
  "/admin/slider-toggle",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(toggleEventSliderSchema),
  toggleEventSlider,
);

router.get("/details/:eventId", perApiLimiter(), getEventDetails);

router.get("/attendees/:eventId", perApiLimiter(), getAllEventAttendees);

router.post(
  "/edit/:eventId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  // validateRequest(updateEventSchema),
  updateEvent,
);

module.exports = router;
