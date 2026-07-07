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
  EventView,
  Course,
  CourseView,
} = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
  toObjectId,
} = require("../../utils/globalFunction");
const { formatDateTimeByTimezone, adjustEventDateTime } = require("../../utils/timezoneHelper");
const {
  createEventSchema,
  getEventsSchema,
  getEventDetailsSchema,
  updateEventSchema,
  updateEventParamsSchema,
  toggleEventSliderSchema,
} = require("../services/validations/eventValidation");
const validateRequest = require("../../middlewares/validateRequest");
const { assignStaffSchema } = require("../services/validations/userValidation");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId, userRole, eventStatus } = require("../../utils/Role");
const { notifyEventChange } = require("../services/serviceNotification");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getKey, setKeyWithTime } = require("../services/serviceRedis");
const CONSTANTS = require("../../utils/constants");


// Create Event
const createEvent = async (req, res) => {
  try {
    const { id, venueAddress, isDraft: isDraftBody, ...eventData } = req.body;
    const userId = req.user.userId;

    // Sanitize empty strings for optional fields to avoid Cast/Enum validation errors in Mongoose
    if (eventData.eventCategory === "") {
      eventData.eventCategory = null;
    }
    if (eventData.refundPolicy === "") {
      eventData.refundPolicy = null;
    }

    let event;
    let isDraftValue = isDraftBody === true || isDraftBody === "true";

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
      if (venueAddress.state) location.state = venueAddress.state;
      if (venueAddress.zipcode) location.zipcode = venueAddress.zipcode;

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

      if (!event.isDraft && event.status === eventStatus.LIVE) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Your event is already live",
        );
      }

      const reservedVal = req.body.ReservedExternally !== undefined ? req.body.ReservedExternally : (event.ReservedExternally || 0);
      let ticketsVal = req.body.tickets;

      if (Array.isArray(ticketsVal)) {
        ticketsVal = ticketsVal.filter(t => t && Object.keys(t).length > 0 && t.ticketName && t.qty !== undefined);
      }

      if (!isDraftValue) {
        if (ticketsVal !== undefined && ticketsVal.length === 0) {
          ticketsVal = [{
            ticketName: "Free Entry",
            ticketShortDesc: "Free entry for this event",
            price: 0,
            qty: 999999,
          }];
          req.body.tickets = ticketsVal;
          eventData.tickets = ticketsVal;
        } else if (ticketsVal === undefined && (!event.tickets || event.tickets.length === 0)) {
          ticketsVal = [{
            ticketName: "Free Entry",
            ticketShortDesc: "Free entry for this event",
            price: 0,
            qty: 999999,
          }];
          req.body.tickets = ticketsVal;
          eventData.tickets = ticketsVal;
        }
      }

      if (!isDraftValue) {
        const finalTicketsVal = ticketsVal || event.tickets || [];
        const totalSeats = finalTicketsVal.reduce((sum, t) => sum + (t.qty || 0), 0);

        const eventBookings = await Transaction.aggregate([
          { $match: { eventId: event._id, status: "PAID", bookingType: "EVENT" } },
          { $group: { _id: null, bookedQty: { $sum: "$qty" } } },
        ]);
        const bookedQty = eventBookings.length > 0 ? eventBookings[0].bookedQty : 0;

        if (totalSeats < bookedQty + reservedVal) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            `Total event seats (${totalSeats}) cannot be less than booked count (${bookedQty}) + externally reserved seats (${reservedVal})`
          );
        }
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
        if (venueAddress.state !== undefined)
          event.venueAddress.state = venueAddress.state;
        if (venueAddress.zipcode !== undefined)
          event.venueAddress.zipcode = venueAddress.zipcode;
      }

      if (req.body.venueName !== undefined)
        event.venueName = req.body.venueName;
      event.featureEventFee = featureFee;
      event.isDraft = isDraftValue;

      await event.save();
    } else {
      let ticketsVal = req.body.tickets || [];

      if (Array.isArray(ticketsVal)) {
        ticketsVal = ticketsVal.filter(t => t && Object.keys(t).length > 0 && t.ticketName && t.qty !== undefined);
      }

      if (!isDraftValue && ticketsVal.length === 0) {
        ticketsVal = [{
          ticketName: "Free Entry",
          ticketShortDesc: "Free entry for this event",
          price: 0,
          qty: 999999,
        }];
        req.body.tickets = ticketsVal;
        eventData.tickets = ticketsVal;
      }

      if (!isDraftValue) {
        const reservedVal = req.body.ReservedExternally || 0;
        const totalSeats = ticketsVal.reduce((sum, t) => sum + (t.qty || 0), 0);

        if (totalSeats < reservedVal) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            `Total event seats (${totalSeats}) cannot be less than externally reserved seats (${reservedVal})`
          );
        }
      }

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
const formatEvent = (event, bookedEventIds = new Set(), bookedQty = 0, pendingQty = 0, userTimeZone = null) => {
  const displayTimeZone = event.timeZone;
  if (displayTimeZone) {
    if (event.startDate || event.startTime) {
      const startAdjusted = adjustEventDateTime(event.startDate, event.startTime, displayTimeZone);
      if (event.startDate) event.startDate = startAdjusted.date;
      if (event.startTime) event.startTime = startAdjusted.time;
    }
    if (event.endDate || event.endTime) {
      const endAdjusted = adjustEventDateTime(event.endDate, event.endTime, displayTimeZone);
      if (event.endDate) event.endDate = endAdjusted.date;
      if (event.endTime) event.endTime = endAdjusted.time;
    }
    event.timeZone = displayTimeZone;

    if (Array.isArray(event.tickets)) {
      event.tickets = event.tickets.map(t => {
        if (t.salesStart) t.salesStart = formatDateTimeByTimezone(t.salesStart, displayTimeZone);
        if (t.salesEnd) t.salesEnd = formatDateTimeByTimezone(t.salesEnd, displayTimeZone);
        return t;
      });
    }
  }

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

  // Calculate ticket statistics from the tickets array
  const totalTickets = Array.isArray(event.tickets)
    ? event.tickets.reduce((acc, t) => acc + (t.qty || 0), 0)
    : event.totalTickets || 0;

  event.totalTickets = totalTickets;
  event.totalSeats = totalTickets;
  event.totalBooked = bookedQty;
  event.totalacquirewithreserver = bookedQty + (event.ReservedExternally || 0);
  event.totalPendingTicket = pendingQty;

  const leftSeats = Math.max(0, totalTickets - bookedQty - (event.ReservedExternally || 0));
  event.leftSeats = leftSeats;
  event.ticketQtyAvailable = leftSeats;
  event.acquiredSeats = bookedQty;

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
    let loginUser = null;
    if (req.user) {
      loginUser = req.user.userId;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
          loginUser = decoded.userId;
        } catch (err) { }
      }
    }

    // // Redis Cache Check
    // const cacheKeyData = JSON.stringify(req.query) + (loginUser || "anonymous");
    // const cacheKeyHash = crypto.createHash("md5").update(cacheKeyData).digest("hex");
    // const cacheKey = `events:list:${cacheKeyHash}`;

    // const cachedData = await getKey(cacheKey);
    // if (cachedData && cachedData.statusCode === CONSTANTS.SUCCESS && cachedData.data) {
    //   return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, JSON.parse(cachedData.data));
    // }

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
      excludeMyEvents,
      timeOfDay,
      addToSlider,
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
      visibility,
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
        .sort({ startDate: 1, endDate: 1, fetcherEvent: -1, isFeatured: -1 })
        .limit(simpleLimit)
        .lean();
      const totalCount = await Event.countDocuments(simpleQuery);

      const bookedEventIds = new Set();
      if (loginUser && events.length > 0) {
        const bookings = await Transaction.find({
          userId: loginUser,
          eventId: { $in: events.map((e) => e._id) },
          status: "PAID",
        }).select("eventId");
        bookings.forEach((b) => bookedEventIds.add(b.eventId.toString()));
      }

      const bookedMap = new Map();
      const pendingMap = new Map();
      if (events.length > 0) {
        const bookingsObj = await Transaction.aggregate([
          { $match: { eventId: { $in: events.map((e) => e._id) }, status: "PAID", bookingType: "EVENT" } },
          { $group: { _id: "$eventId", bookedQty: { $sum: "$qty" } } },
        ]);
        bookingsObj.forEach((b) => bookedMap.set(b._id.toString(), b.bookedQty));

        const pendingObj = await Transaction.aggregate([
          { $match: { eventId: { $in: events.map((e) => e._id) }, status: "PENDING", bookingType: "EVENT" } },
          { $group: { _id: "$eventId", pendingQty: { $sum: "$qty" } } },
        ]);
        pendingObj.forEach((b) => pendingMap.set(b._id.toString(), b.pendingQty));
      }

      const formattedEvents = events.map((event) => {
        const eventIdStr = event._id.toString();
        const bookedQty = bookedMap.get(eventIdStr) || 0;
        const pendingQty = pendingMap.get(eventIdStr) || 0;
        return formatEvent(event, bookedEventIds, bookedQty, pendingQty);
      });

      const responseData = {
        events: formattedEvents,
        total: totalCount,
        totalPages: Math.ceil(totalCount / simpleLimit),
        page: 1,
        limit: simpleLimit,
      };

      // await setKeyWithTime(cacheKey, JSON.stringify(responseData), 5);

      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.EVENTS_FETCHED,
        responseData,
      );
    }

    const targetCategory = categoryId || category;

    const now = new Date();
    const skip = (page - 1) * limit;

    const filters = filter.split(",").map((f) => f.trim().toLowerCase());
    const shouldExcludeMyEvents =
      String(excludeMyEvents).toLowerCase() === "true" ||
      filters.includes("excludemyevents") ||
      filters.includes("notmycreated");

    // 1. Build Base Query
    let query = {};
    let startDateConditions = [];

    const isOrganizerList = filters.includes("organizer");
    if (isOrganizerList) {
      if (!loginUser) {
        console.warn(`[getEvents] Unauthorized attempt to access organizer list`);
        return apiErrorRes(
          HTTP_STATUS.UNAUTHORIZED,
          res,
          constantsMessage.LOGIN_REQUIRED_DRAFTS,
        );
      }
      query.createdBy = new mongoose.Types.ObjectId(loginUser);
      if (isDraft === "true" || isDraft === true || filters.includes("draft")) {
        query.isDraft = true;
      } else {
        query.isDraft = false;
      }

      // Status query parameter for organizer
      if (status) {
        const statusValues = (Array.isArray(status) ? status : status.split(","))
          .map((s) => {
            const trimmed = s.trim();
            const matched = Object.values(eventStatus).find(
              (val) => val.toLowerCase() === trimmed.toLowerCase()
            );
            return matched || trimmed;
          });
        if (statusValues.length > 1) {
          query.status = { $in: statusValues };
        } else {
          query.status = statusValues[0];
        }
      }
    } else {
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
      } else {
        query.isDraft = false;

        // Status query parameter or default time constraints
        if (status) {
          const statusValues = (Array.isArray(status) ? status : status.split(","))
            .map((s) => {
              const trimmed = s.trim();
              const matched = Object.values(eventStatus).find(
                (val) => val.toLowerCase() === trimmed.toLowerCase()
              );
              return matched || trimmed;
            });
          if (statusValues.length > 1) {
            query.status = { $in: statusValues };
          } else {
            query.status = statusValues[0];
          }
        } else {
          // Default time constraints (active events) - unless "past" filter is specifically requested
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
    } else if (shouldExcludeMyEvents && loginUser && !query.createdBy) {
      query.createdBy = { $ne: new mongoose.Types.ObjectId(loginUser) };
    }

    // Visibility filter
    // Default: only PUBLIC events are shown.
    // Pass filter=private or visibility=PRIVATE to see private events (only your own).
    const wantsPrivate =
      filters.includes("private") ||
      (typeof visibility === "string" &&
        visibility.trim().toUpperCase() === "PRIVATE");
    if (wantsPrivate) {
      if (!loginUser) {
        return apiErrorRes(
          HTTP_STATUS.UNAUTHORIZED,
          res,
          constantsMessage.LOGIN_REQUIRED_DRAFTS,
        );
      }
      query.visibility = "PRIVATE";
      // Private events are only visible to their creator
      if (!query.createdBy) {
        query.createdBy = new mongoose.Types.ObjectId(loginUser);
      }
    } else if (!isOrganizerList) {
      // For all non-organizer, non-private requests: show only PUBLIC events
      // Also include events where visibility is not set (null / missing field)
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { visibility: "PUBLIC" },
          { visibility: { $exists: false } },
          { visibility: null },
        ],
      });
    }

    // Multiple Categories filter
    if (targetCategory && targetCategory !== "") {
      const catIds = targetCategory
        .split(",")
        .filter((id) => mongoose.Types.ObjectId.isValid(id.trim()));
      if (catIds.length > 1) {
        query.eventCategory = {
          $in: catIds.map((id) => new mongoose.Types.ObjectId(id.trim())),
        };
      } else if (catIds.length === 1) {
        query.eventCategory = new mongoose.Types.ObjectId(catIds[0].trim());
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
        case "recommended":
          let userCategories = [];
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const token = authHeader.split(" ")[1];
              const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
              const user = await User.findById(decoded.userId).lean();
              console.log("44444444555", user?.categories)
              if (user?.categories?.length > 0)
                userCategories = user.categories;
            } catch (err) { }
          }
          if (userCategories.length > 0) {
            query.eventCategory = {
              $in: userCategories.map((id) => new mongoose.Types.ObjectId(id)),
            };
          } else {
            query.eventCategory = { $in: [] };
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

    // ─── Placement flags ────────────────────────────────────────────────────
    const isHomePagePlacement =
      placement === "homePage" &&
      String(addToSlider !== undefined ? addToSlider : req.body?.addToSlider).toLowerCase() === "true";
    const isExplorePagePlacement = placement === "explorePage";
    // ────────────────────────────────────────────────────────────────────────

    let events = [];
    let totalCount = 0;

    // ═══════════════════════════════════════════════════════════════════════
    // Case 2: explorePage — promoted events first, then remaining events
    // ═══════════════════════════════════════════════════════════════════════
    if (isExplorePagePlacement && !hasGeoSearchPoint) {
      // Step 1: fetch ALL promoted events for explorePage (no pagination — we
      //         need full set to deduplicate, but we cap at a reasonable max)
      const promotedEventIds = new Set();
      const promotedLookupPipeline = [
        { $match: { ...query, activePromotionPackage: { $ne: null } } },
        {
          $lookup: {
            from: "PromotionPackage",
            localField: "activePromotionPackage",
            foreignField: "_id",
            as: "promoPkg",
          },
        },
        { $unwind: { path: "$promoPkg", preserveNullAndEmptyArrays: false } },
        {
          $match: {
            "promoPkg.placements": "explorePage",
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "eventCategory",
            foreignField: "_id",
            as: "eventCategory",
          },
        },
        { $unwind: { path: "$eventCategory", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "User",
            localField: "createdBy",
            foreignField: "_id",
            pipeline: [
              { $project: { firstName: 1, lastName: 1, profileImage: 1, isVerified: 1 } },
            ],
            as: "createdBy",
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
        { $sort: { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1 } },
      ];

      const promotedEvents = await Event.aggregate(promotedLookupPipeline);
      promotedEvents.forEach((e) => promotedEventIds.add(e._id.toString()));

      // Step 2: fetch remaining events (excluding promoted IDs) with existing logic
      const remainingQuery = {
        ...query,
        ...(promotedEventIds.size > 0
          ? {
            _id: {
              $nin: [...promotedEventIds].map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
            },
          }
          : {}),
      };

      const sortOrder =
        filters.includes("latest") || filters.includes("newest")
          ? { createdAt: -1 }
          : filters.includes("past")
            ? { endDate: -1, startDate: -1 }
            : filters.includes("draft")
              ? { updatedAt: -1 }
              : isOrganizerList
                ? { startDate: 1, endDate: 1 }
                : { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1 };

      const remainingEvents = await Event.find(remainingQuery)
        .populate("eventCategory")
        .populate("createdBy", "firstName lastName profileImage isVerified")
        .sort(sortOrder)
        .lean();

      // Step 3: merge — promoted first, then remaining
      const merged = [...promotedEvents, ...remainingEvents];
      totalCount = merged.length;

      // Apply pagination manually on merged list
      events = merged.slice(parseInt(skip), parseInt(skip) + parseInt(limit));

      // ═══════════════════════════════════════════════════════════════════════
      // Execute query with Geo search if coords present
      // ═══════════════════════════════════════════════════════════════════════
    } else if (hasGeoSearchPoint) {
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

      const geoAgg = await Event.aggregate([
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
          $sort: (filters.includes("latest") || filters.includes("newest"))
            ? { createdAt: -1 }
            : isOrganizerList
              ? { startDate: 1, endDate: 1 }
              : {
                fetcherEvent: -1,
                isFeatured: -1,
                startDate: 1,
                endDate: 1,
                distance: 1,
                cityMatch: -1,
                countryMatch: -1,
                isPromoMatch: -1,
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
            from: "User",
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
      events = geoAgg;
      totalCount = countAgg[0]?.total || 0;

      if (events.length === 0 && safeRadiusKm < 500) {
        const fallbackGeoQuery = { ...query };
        delete fallbackGeoQuery.venueAddress;
        const fallbackMaxDistance = 500 * 1000;

        const fallbackAgg = await Event.aggregate([
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
            $sort: (filters.includes("latest") || filters.includes("newest"))
              ? { createdAt: -1 }
              : isOrganizerList
                ? { startDate: 1, endDate: 1 }
                : {
                  fetcherEvent: -1,
                  isFeatured: -1,
                  startDate: 1,
                  endDate: 1,
                  distance: 1,
                  isPromoMatch: -1,
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
              from: "User",
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

        const fallbackCountAgg = await Event.aggregate([
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

        events = fallbackAgg;
        totalCount = fallbackCountAgg[0]?.total || 0;
      }

      // ── homePage placement filter (geo path) ──────────────────────────────
      // We run a dedicated geo query for homePage promoted events instead of
      // post-filtering a paginated result, so no promoted event is ever missed.
      if (isHomePagePlacement) {
        const parsedRadiusHP = Number(radius);
        const safeRadiusKmHP = Number.isNaN(parsedRadiusHP)
          ? 500
          : Math.max(1, Math.min(parsedRadiusHP, 500));

        // Dedicated pipeline: geo → join PromotionPackage → filter homePage
        const homePageGeoAgg = await Event.aggregate([
          {
            $geoNear: {
              near: { type: "Point", coordinates: [nearLongitude, nearLatitude] },
              distanceField: "distance",
              maxDistance: safeRadiusKmHP * 1000,
              spherical: true,
              query: { ...query, activePromotionPackage: { $ne: null } },
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
          { $unwind: { path: "$promoPkg", preserveNullAndEmptyArrays: false } },
          { $match: { "promoPkg.placements": "homePage" } },
          {
            $lookup: {
              from: "categories",
              localField: "eventCategory",
              foreignField: "_id",
              as: "eventCategory",
            },
          },
          { $unwind: { path: "$eventCategory", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "User",
              localField: "createdBy",
              foreignField: "_id",
              pipeline: [
                { $project: { firstName: 1, lastName: 1, profileImage: 1, isVerified: 1 } },
              ],
              as: "createdBy",
            },
          },
          { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
          { $sort: { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1, distance: 1 } },
        ]);

        if (homePageGeoAgg.length > 0) {
          // Paginate manually on the full promoted set
          totalCount = homePageGeoAgg.length;
          events = homePageGeoAgg.slice(parseInt(skip), parseInt(skip) + parseInt(limit));
        } else {
          // Fallback: fetch events where addToSlider === true within geo radius
          const fallbackSliderAgg = await Event.aggregate([
            {
              $geoNear: {
                near: { type: "Point", coordinates: [nearLongitude, nearLatitude] },
                distanceField: "distance",
                maxDistance: safeRadiusKmHP * 1000,
                spherical: true,
                query: { addToSlider: true, isDraft: false },
              },
            },
            {
              $lookup: {
                from: "categories",
                localField: "eventCategory",
                foreignField: "_id",
                as: "eventCategory",
              },
            },
            { $unwind: { path: "$eventCategory", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "User",
                localField: "createdBy",
                foreignField: "_id",
                pipeline: [
                  { $project: { firstName: 1, lastName: 1, profileImage: 1, isVerified: 1 } },
                ],
                as: "createdBy",
              },
            },
            { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
            { $sort: { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1, distance: 1 } },
          ]);
          totalCount = fallbackSliderAgg.length;
          events = fallbackSliderAgg.slice(parseInt(skip), parseInt(skip) + parseInt(limit));
        }
      }
      // ─────────────────────────────────────────────────────────────────────

    } else {
      if (placement && !isExplorePagePlacement) {
        // ── homePage + addToSlider=true path (non-geo) ─────────────────────
        if (isHomePagePlacement) {
          // Run existing pipeline, then filter to homePage promotions
          const allPlacementEvents = await Event.aggregate([
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
                        { $isArray: "$promoPkg.placements" },
                        { $in: ["homePage", "$promoPkg.placements"] },
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
                ...((filters.includes("latest") || filters.includes("newest"))
                  ? { createdAt: -1 }
                  : filters.includes("past")
                    ? { endDate: -1, startDate: -1 }
                    : filters.includes("draft")
                      ? { updatedAt: -1 }
                      : isOrganizerList
                        ? { startDate: 1, endDate: 1 }
                        : { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1, isPromoMatch: -1 }),
              },
            },
            {
              $lookup: {
                from: "categories",
                localField: "eventCategory",
                foreignField: "_id",
                as: "eventCategory",
              },
            },
            { $unwind: { path: "$eventCategory", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "User",
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

          // Filter to only homePage promoted events
          const homePageEvents = allPlacementEvents.filter(
            (e) =>
              Array.isArray(e.promoPkg?.placements) &&
              e.promoPkg.placements.includes("homePage")
          );

          if (homePageEvents.length > 0) {
            // Apply pagination on matched set
            totalCount = homePageEvents.length;
            events = homePageEvents.slice(parseInt(skip), parseInt(skip) + parseInt(limit));
          } else {
            // Fallback: Event collection where addToSlider === true
            const sliderQuery = { addToSlider: true, isDraft: false };
            const sliderSortOrder =
              filters.includes("latest") || filters.includes("newest")
                ? { createdAt: -1 }
                : { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1 };
            events = await Event.find(sliderQuery)
              .populate("eventCategory")
              .populate("createdBy", "firstName lastName profileImage isVerified")
              .sort(sliderSortOrder)
              .skip(parseInt(skip))
              .limit(parseInt(limit))
              .lean();
            totalCount = await Event.countDocuments(sliderQuery);
          }
        } else {
          // Generic placement (not homePage, not explorePage) — existing logic
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
                ...((filters.includes("latest") || filters.includes("newest"))
                  ? { createdAt: -1 }
                  : filters.includes("past")
                    ? { endDate: -1, startDate: -1 }
                    : filters.includes("draft")
                      ? { updatedAt: -1 }
                      : isOrganizerList
                        ? { startDate: 1, endDate: 1 }
                        : { fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1, isPromoMatch: -1 }),
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
            { $unwind: { path: "$eventCategory", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "User",
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
        }
      } else if (!isExplorePagePlacement) {
        // No placement — existing plain find
        const sortOrder =
          filters.includes("latest") || filters.includes("newest")
            ? { createdAt: -1 }
            : filters.includes("past")
              ? { endDate: -1, startDate: -1 }
              : filters.includes("draft")
                ? { updatedAt: -1 }
                : isOrganizerList
                  ? { startDate: 1, endDate: 1 }
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
      // explorePage non-geo is handled above (isExplorePagePlacement block)
    }

    const bookedEventIds = new Set();
    let userTimeZone = null;
    if (loginUser) {
      const bookings = await Transaction.find({
        userId: loginUser,
        eventId: { $in: events.map((e) => e._id) },
        status: "PAID",
      }).select("eventId");
      bookings.forEach((b) => bookedEventIds.add(b.eventId.toString()));

      const u = await User.findById(loginUser).select("timeZone");
      if (u && u.timeZone) userTimeZone = u.timeZone;
    }

    const bookedMap = new Map();
    const pendingMap = new Map();
    const revenueMap = new Map();
    if (events.length > 0) {
      const bookingsObj = await Transaction.aggregate([
        { $match: { eventId: { $in: events.map((e) => e._id) }, status: "PAID", bookingType: "EVENT" } },
        {
          $group: {
            _id: "$eventId",
            bookedQty: { $sum: "$qty" },
            totalRevenue: { $sum: "$totalAmount" }
          }
        },

      ]);
      bookingsObj.forEach((b) => {
        bookedMap.set(b._id.toString(), b.bookedQty);
        revenueMap.set(b._id.toString(), b.totalRevenue || 0);
      });

      const pendingObj = await Transaction.aggregate([
        { $match: { eventId: { $in: events.map((e) => e._id) }, status: "PENDING", bookingType: "EVENT" } },
        { $group: { _id: "$eventId", pendingQty: { $sum: "$qty" } } },
      ]);
      pendingObj.forEach((b) => pendingMap.set(b._id.toString(), b.pendingQty));
    }

    const formattedEvents = events.map((event) => {
      const eventIdStr = event._id.toString();
      const bookedQty = bookedMap.get(eventIdStr) || 0;
      const pendingQty = pendingMap.get(eventIdStr) || 0;
      const formatted = formatEvent(event, bookedEventIds, bookedQty, pendingQty, userTimeZone);
      formatted.totalRevenue = revenueMap.get(eventIdStr) || 0;
      return formatted;
    });

    const responseData = {
      events: formattedEvents,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // await setKeyWithTime(cacheKey, JSON.stringify(responseData), 5);

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, responseData);
  } catch (error) {
    console.error("Error in getEvents:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getTopEvents = async (req, res) => {
  try {
    const now = new Date();
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isNaN(rawLimit) ? 10 : Math.min(Math.max(rawLimit, 1), 20);

    const query = {
      addToSlider: true,
      isDraft: false,
      endDate: { $gte: now },
    };

    const events = await Event.find(query)
      .sort({ fetcherEvent: -1, isFeatured: -1, startDate: 1, endDate: 1 })
      .limit(limit)
      .lean();

    const formattedEvents = events.map((event) => {
      const normalized = {
        ...event,
        status: now < new Date(event.startDate) ? "Upcoming" : "Live",
      };
      if (Array.isArray(normalized.posterImage)) {
        normalized.posterImage = normalized.posterImage.map((img) =>
          formatResponseUrl(img),
        );
      }
      if (Array.isArray(normalized.shortTeaserVideo)) {
        normalized.shortTeaserVideo = normalized.shortTeaserVideo.map((video) =>
          formatResponseUrl(video),
        );
      }
      if (Array.isArray(normalized.mediaLinks)) {
        normalized.mediaLinks = normalized.mediaLinks.map((link) =>
          formatResponseUrl(link),
        );
      }
      return normalized;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, {
      events: formattedEvents,
      total: formattedEvents.length,
      totalPages: 1,
      page: 1,
      limit,
    });
  } catch (error) {
    console.error("Error in getTopEvents:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admint Get Single Event Details
const getEventDetails = async (req, res) => {
  try {
    const { eventId } = req.params;

    const loggedInUserId = req.user?.userId || null;
    let userTimeZone = null;
    if (loggedInUserId) {
      const u = await User.findById(loggedInUserId).select("timeZone");
      if (u && u.timeZone) userTimeZone = u.timeZone;
    }

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

    // Record view in a non-blocking asynchronous way
    (async () => {
      try {
        const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;

        if (loggedInUserId) {
          const existingView = await EventView.findOne({ eventId, userId: loggedInUserId });
          if (!existingView) {
            await EventView.create({ eventId, userId: loggedInUserId, ipAddress });
          }
        } else if (ipAddress) {
          const existingView = await EventView.findOne({ eventId, ipAddress, userId: null });
          if (!existingView) {
            await EventView.create({ eventId, ipAddress });
          }
        }
      } catch (err) {
        console.error("Error logging event view:", err);
      }
    })();

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
    if (loggedInUserId) {
      try {
        // Check Transaction for confirmed booking
        const booking = await Transaction.findOne({
          userId: loggedInUserId,
          eventId: eventId,
          status: "PAID",
        });
        if (booking) isBooked = true;
      } catch (err) { }
    }
    event.isBooked = isBooked;

    // Check Wishlist Status
    let isWishlisted = false;

    if (loggedInUserId) {
      try {
        const wishlistItem = await Wishlist.findOne({
          userId: toObjectId(loggedInUserId),
          entityId: toObjectId(eventId),
          entityModel: "Event",
        });
        if (wishlistItem) isWishlisted = true;
      } catch (err) { }
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
    const [reviews, comments, totalAttendeesAgg, recentTransactions, ticketSalesAgg, rawSimilarEvents] =
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
              totalRevenue: { $sum: "$totalAmount" },
            },
          },
        ]),

        // Recent Bookers (Transactions) - fetch enough to get 5 unique users
        Transaction.find({
          eventId: eventId,
          status: "PAID",
          bookingType: "EVENT",
        })
          .sort({ createdAt: -1 })
          .limit(50) // Fetch more to ensure we get 5 unique users with full ticket data
          .populate("userId", "firstName lastName profileImage isVerified")
          .lean(),

        // Ticket-wise sales aggregation
        Transaction.aggregate([
          {
            $match: {
              eventId: new mongoose.Types.ObjectId(eventId),
              status: "PAID",
              bookingType: "EVENT"
            }
          },
          { $unwind: { path: "$tickets", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: {
                $ifNull: ["$tickets.ticketId", "$ticketId"]
              },
              soldQty: {
                $sum: {
                  $ifNull: ["$tickets.qty", "$qty"]
                }
              }
            }
          }
        ]),

        // 4 Similar Events in the same category
        event.eventCategory
          ? Event.find({
            eventCategory: event.eventCategory._id || event.eventCategory,
            _id: { $ne: eventId },
            isDraft: false,
            ...(loggedInUserId ? { createdBy: { $ne: loggedInUserId } } : {}),
          })
            .populate("eventCategory")
            .populate("createdBy", "firstName lastName profileImage isVerified")
            .limit(4)
            .lean()
          : Promise.resolve([])
      ]);

    const totalAttendees =
      totalAttendeesAgg.length > 0 ? totalAttendeesAgg[0].totalQty : 0;
    const totalRevenue =
      totalAttendeesAgg.length > 0 ? (totalAttendeesAgg[0].totalRevenue || 0) : 0;
    event.totalRevenue = totalRevenue;

    // Map ticket sales
    const ticketSalesMap = {};
    if (ticketSalesAgg && ticketSalesAgg.length > 0) {
      ticketSalesAgg.forEach(item => {
        if (item._id) {
          ticketSalesMap[item._id.toString()] = item.soldQty;
        }
      });
    }

    // Process tickets with sales info
    if (Array.isArray(event.tickets)) {
      event.tickets = event.tickets
        .map(t => {
          const ticketIdStr = t._id ? t._id.toString() : "";
          const soldQty = ticketSalesMap[ticketIdStr] || 0;
          const availableQty = Math.max(0, (t.qty || 0) - soldQty);
          return {
            ...t,
            soldQty,
            availableQty,
          };
        })
        .sort((a, b) => (a.price || 0) - (b.price || 0));
    }

    // Calculate overall ticket capacity and statistics
    const totalTicketCount = Array.isArray(event.tickets)
      ? event.tickets.reduce((sum, t) => sum + (t.qty || 0), 0)
      : event.totalTickets || 0;

    const reservedExternally = event.ReservedExternally || 0;
    // const availableSeats = Math.max(0, totalTicketCount - totalAttendees - reservedExternally);
    const availableSeats = Math.max(0, totalTicketCount - totalAttendees);

    event.totalTickets = totalTicketCount;
    event.totalSeats = totalTicketCount;
    // event.totalBooked = totalAttendees + reservedExternally;
    event.totalBooked = totalAttendees;
    event.totalacquirewithreserver = totalAttendees + reservedExternally;

    event.leftSeats = availableSeats;
    event.ticketQtyAvailable = availableSeats;
    event.acquiredSeats = totalAttendees;
    event.isFewSeatsAvailable = checkFewSeatsAvailable(
      availableSeats,
      totalTicketCount,
      10,
    );

    // Sync event.totalAttendees with calculated totalAttendees
    event.totalAttendees = totalAttendees;
    // Aggregate per-user ticket data from all recent transactions
    const userTransactionMap = {};
    for (const t of recentTransactions) {
      if (!t.userId) continue;
      const uid = t.userId._id.toString();
      if (!userTransactionMap[uid]) {
        userTransactionMap[uid] = {
          user: t.userId,
          totalTicketsBought: 0,
          ticketMap: {}, // ticketId -> { ticketName, qty }
        };
      }
      const entry = userTransactionMap[uid];
      // Sum total qty bought by this user
      entry.totalTicketsBought += t.qty || 0;
      // Break down by ticket type
      if (Array.isArray(t.tickets) && t.tickets.length > 0) {
        for (const tk of t.tickets) {
          const tkId = tk.ticketId ? tk.ticketId.toString() : "unknown";
          if (!entry.ticketMap[tkId]) {
            entry.ticketMap[tkId] = { ticketName: tk.ticketName || tk.name || "Ticket", qty: 0 };
          }
          entry.ticketMap[tkId].qty += tk.qty || 0;
        }
      } else {
        // Single-ticket transaction (no tickets array)
        const tkId = t.ticketId ? t.ticketId.toString() : "general";
        if (!entry.ticketMap[tkId]) {
          entry.ticketMap[tkId] = { ticketName: t.ticketName || t.ticketType || "General", qty: 0 };
        }
        entry.ticketMap[tkId].qty += t.qty || 0;
      }
    }

    // Build uniqueUsers list (up to 5)
    const uniqueUsers = Object.values(userTransactionMap)
      .slice(0, 5)
      .map(({ user, totalTicketsBought, ticketMap }) => ({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: formatResponseUrl(user.profileImage),
        totalTicketsBought,
        tickets: Object.values(ticketMap),
      }));

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

    const displayTimeZone = event.timeZone;
    if (displayTimeZone) {
      if (event.startDate || event.startTime) {
        const startAdjusted = adjustEventDateTime(event.startDate, event.startTime, displayTimeZone);
        if (event.startDate) event.startDate = startAdjusted.date;
        if (event.startTime) event.startTime = startAdjusted.time;
      }
      if (event.endDate || event.endTime) {
        const endAdjusted = adjustEventDateTime(event.endDate, event.endTime, displayTimeZone);
        if (event.endDate) event.endDate = endAdjusted.date;
        if (event.endTime) event.endTime = endAdjusted.time;
      }
      event.timeZone = displayTimeZone;
      if (Array.isArray(event.tickets)) {
        event.tickets = event.tickets.map(t => {
          if (t.salesStart) t.salesStart = formatDateTimeByTimezone(t.salesStart, displayTimeZone);
          if (t.salesEnd) t.salesEnd = formatDateTimeByTimezone(t.salesEnd, displayTimeZone);
          return t;
        });
      }
    }

    const similarEvents = (rawSimilarEvents || []).map(e => formatEvent(e, new Set(), 0, 0, userTimeZone));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.Event_DETAILS_FETCHED || "Event details fetched",
      {
        event,
        refundPolicy: event.refundPolicy || null,
        reviews: formattedReviews,
        comments: formattedComments,
        attendees: {
          total: totalAttendees,
          recent: uniqueUsers,
        },
        similarEvents,
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
    const { categoryId, search, page = 1, limit = 10, status, isDraft } = req.query;
    const userId = req.user.userId;

    const skip = (page - 1) * limit;
    let query = { createdBy: userId };

    // Apply draft filter
    if (isDraft === "true" || isDraft === true) {
      query.isDraft = true;
    } else if (isDraft === "false" || isDraft === false) {
      query.isDraft = false;
    }

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
    const { categoryId, search, page = 1, limit = 10, } = req.query;

    const skip = (page - 1) * limit;
    let query = {
      isDraft: false
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const event = await Event.findById(eventId)
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .populate("eventCategory", "name")
      .lean();

    if (!event) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.EVENT_NOT_FOUND,
      );
    }

    // Format host and event images
    if (event.createdBy && event.createdBy.profileImage) {
      event.createdBy.profileImage = formatResponseUrl(
        event.createdBy.profileImage,
      );
    }
    if (Array.isArray(event.posterImage)) {
      event.posterImage = event.posterImage.map(formatResponseUrl);
    }

    // Build aggregation pipeline to find unique users who purchased tickets
    const pipeline = [
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          status: "PAID",
          bookingType: "EVENT",
        },
      },
      {
        $lookup: {
          from: "User",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
    ];

    // Search filter on user name or email
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "user.firstName": { $regex: search, $options: "i" } },
            { "user.lastName": { $regex: search, $options: "i" } },
            { "user.email": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Group by userId to deduplicate, keeping the first user details and pushing all transactions
    pipeline.push({
      $group: {
        _id: "$userId",
        user: { $first: "$user" },
        transactions: { $push: "$$ROOT" },
      },
    });

    // Sort by firstName
    pipeline.push({ $sort: { "user.firstName": 1 } });

    // Facet for pagination
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: skip },
          { $limit: limit },
        ],
      },
    });

    const result = await Transaction.aggregate(pipeline);
    const total = result[0]?.metadata[0]?.total || 0;
    const paginatedData = result[0]?.data || [];

    const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

    const uniqueUsers = [];
    for (const item of paginatedData) {
      const user = item.user;
      const userTransactions = item.transactions;

      const ticketGroups = {};
      const txnDetails = [];

      for (const tr of userTransactions) {
        // Collect transaction details
        txnDetails.push({
          _id: tr._id,
          bookingId: tr.bookingId,
          qty: tr.qty,
          totalAmount: tr.totalAmount,
          status: tr.status,
          createdAt: tr.createdAt,
          ticketId: tr.ticketId,
          ticketName: tr.ticketName,
          tickets: tr.tickets || [],
        });

        const ticketItems = (tr.tickets && tr.tickets.length > 0)
          ? tr.tickets
          : [
            {
              ticketId: tr.ticketId,
              ticketName: tr.ticketName,
              qty: tr.qty,
              basePrice: tr.basePrice,
            },
          ];

        for (const ticketItem of ticketItems) {
          const key = ticketItem.ticketId || ticketItem.ticketName;
          if (!ticketGroups[key]) {
            ticketGroups[key] = {
              ticketId: ticketItem.ticketId,
              ticketName: ticketItem.ticketName,
              qty: 0,
              totalPrice: 0,
            };
          }
          ticketGroups[key].qty += ticketItem.qty;
          ticketGroups[key].totalPrice += ticketItem.basePrice;
        }
      }

      const tickets = Object.values(ticketGroups).map((tg) => ({
        ticketId: tg.ticketId,
        ticketName: tg.ticketName,
        qty: tg.qty,
        price: tg.qty ? roundToTwo(tg.totalPrice / tg.qty) : 0,
        totalPrice: tg.totalPrice,
      }));

      const totalTicketsBought = tickets.reduce((sum, tk) => sum + tk.qty, 0);

      uniqueUsers.push({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage ? formatResponseUrl(user.profileImage) : null,
        ticketsBought: totalTicketsBought,
        userRole: userRole[user.roleId] || "GUEST",
        tickets: tickets,
        transactions: txnDetails,
      });
    }

    let isEnrolled = false;
    let isEventHost = false;

    if (req.user && req.user.userId) {
      const viewerId = req.user.userId;
      const enrollmentTx = await Transaction.findOne({
        userId: viewerId,
        eventId: eventId,
        status: "PAID",
        bookingType: "EVENT",
      });
      if (enrollmentTx) {
        isEnrolled = true;
      }

      if (event.createdBy && event.createdBy._id) {
        isEventHost = event.createdBy._id.toString() === viewerId.toString();
      }
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.EVENT_ATTENDEES_FETCHED,
      {
        host: event.createdBy,
        event: event,
        isEnrolled: isEnrolled,
        eventHost: isEventHost,
        attendees: uniqueUsers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
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


    if (updateData.eventCategory === "") {
      updateData.eventCategory = null;
    }
    if (updateData.refundPolicy === "") {
      updateData.refundPolicy = null;
    }
    // 1. Check if event exists
    const existingEvent = await Event.findById(eventId);
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

    // 3. Prevent editing past events (unless it is a draft)
    const now = new Date();
    if (!existingEvent.isDraft && (existingEvent.status === eventStatus.PAST || existingEvent.endDate < now)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.CANNOT_EDIT_PAST_EVENT ||
        "Cannot edit an event that has already ended",
      );
    }

    // Prevent editing live events
    if (!existingEvent.isDraft && existingEvent.status === eventStatus.LIVE) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Your event is already live",
      );
    }

    // 4. Draft check: cannot change draft false (published event cannot revert to draft)
    if (existingEvent.isDraft === false && updateData.isDraft === true) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Once an event is published, it cannot be changed back to a draft"
      );
    }

    const targetIsDraft = updateData.isDraft === true || updateData.isDraft === "true" || (updateData.isDraft === undefined && existingEvent.isDraft);

    let reqTickets = updateData.tickets;
    if (Array.isArray(reqTickets)) {
      reqTickets = reqTickets.filter(t => t && Object.keys(t).length > 0 && t.ticketName && t.qty !== undefined);
    }

    if (!targetIsDraft) {
      if (reqTickets !== undefined && reqTickets.length === 0) {
        reqTickets = [{
          ticketName: "Free Entry",
          ticketShortDesc: "Free entry for this event",
          price: 0,
          qty: 999999,
        }];
        req.body.tickets = reqTickets;
        updateData.tickets = reqTickets;
      } else if (reqTickets === undefined && (!existingEvent.tickets || existingEvent.tickets.length === 0)) {
        reqTickets = [{
          ticketName: "Free Entry",
          ticketShortDesc: "Free entry for this event",
          price: 0,
          qty: 999999,
        }];
        req.body.tickets = reqTickets;
        updateData.tickets = reqTickets;
      }
    }

    // 5. If published (or transitioning to published), enforce required fields
    if (!targetIsDraft) {
      const title = updateData.eventTitle || existingEvent.eventTitle;
      const category = updateData.eventCategory || existingEvent.eventCategory;
      const startDateVal = updateData.startDate || existingEvent.startDate;
      const endDateVal = updateData.endDate || existingEvent.endDate;
      const venueAddressVal = updateData.venueAddress || existingEvent.venueAddress;
      const ticketsVal = updateData.tickets || existingEvent.tickets;

      if (!title) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Event title is required for a published event");
      }
      if (!category) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Event category is required for a published event");
      }
      if (!startDateVal || !endDateVal) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Start and end dates are required for a published event");
      }
      const hasValidCoords = (addr) => {
        if (!addr) return false;
        if (addr.latitude !== undefined && addr.longitude !== undefined && addr.latitude !== null && addr.longitude !== null) {
          return true;
        }
        if (Array.isArray(addr.coordinates) && addr.coordinates.length >= 2) {
          return addr.coordinates[0] !== undefined && addr.coordinates[0] !== null &&
            addr.coordinates[1] !== undefined && addr.coordinates[1] !== null;
        }
        return false;
      };

      if (!hasValidCoords(venueAddressVal)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Venue address with valid latitude and longitude is required for a published event"
        );
      }
      if (!ticketsVal || !Array.isArray(ticketsVal) || ticketsVal.length === 0) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "At least one ticket is required for a published event"
        );
      }

      // Ensure each ticket in the tickets array has required fields
      for (let i = 0; i < ticketsVal.length; i++) {
        const t = ticketsVal[i];
        if (!t.ticketName || t.price === undefined || t.price === null || t.qty === undefined || t.qty === null) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            `Ticket at index ${i} must have ticketName, price, and qty`
          );
        }
      }
    }

    // 6. Time and Status Check
    const isLive = existingEvent.status === eventStatus.LIVE || (existingEvent.startDate <= now && existingEvent.endDate >= now);
    if (isLive) {
      if (updateData.startDate && new Date(updateData.startDate).getTime() !== new Date(existingEvent.startDate).getTime()) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Cannot modify the start date/time of an event that is already live"
        );
      }
      if (updateData.startTime && updateData.startTime !== existingEvent.startTime) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Cannot modify the start date/time of an event that is already live"
        );
      }
    }

    const dateOrTimeModified =
      updateData.startDate !== undefined ||
      updateData.endDate !== undefined ||
      updateData.startTime !== undefined ||
      updateData.endTime !== undefined ||
      updateData.timeZone !== undefined;

    // Ensure startDate is in the future for upcoming events
    if (dateOrTimeModified && !isLive && !targetIsDraft) {
      const newStart = updateData.startDate ? new Date(updateData.startDate) : new Date(existingEvent.startDate);
      if (newStart < now) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Start date must be in the future for upcoming events"
        );
      }
    }

    // Ensure endDate is in the future
    if (dateOrTimeModified && !targetIsDraft) {
      const newEnd = updateData.endDate ? new Date(updateData.endDate) : new Date(existingEvent.endDate);
      if (newEnd < now) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "End date must be in the future"
        );
      }
    }

    if (dateOrTimeModified) {
      const newStartVal = updateData.startDate || existingEvent.startDate;
      const newEndVal = updateData.endDate || existingEvent.endDate;
      const newStartTime = updateData.startTime || existingEvent.startTime || "00:00";
      const newEndTime = updateData.endTime || existingEvent.endTime || "00:00";

      if (!targetIsDraft && newStartVal && newEndVal) {
        // Format dates as YYYY-MM-DD
        const formattedStartDate = new Date(newStartVal).toISOString().split("T")[0];
        const formattedEndDate = new Date(newEndVal).toISOString().split("T")[0];

        const startDateTime = new Date(`${formattedStartDate}T${newStartTime}`);
        const endDateTime = new Date(`${formattedEndDate}T${newEndTime}`);

        if (!isNaN(startDateTime.getTime()) && !isNaN(endDateTime.getTime()) && startDateTime >= endDateTime) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "Start date must be before end date"
          );
        }
      }
    }

    // 7. Validate age restriction if provided
    if (updateData.ageRestriction) {
      const { type, minAge, maxAge } = updateData.ageRestriction;
      if (type === "MIN_AGE" && (minAge === undefined || minAge < 0)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
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
            "Both minimum and maximum age must be specified and non-negative for RANGE type",
          );
        }
        if (minAge >= maxAge) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "Minimum age must be less than maximum age",
          );
        }
      }
    }

    // 7.5. Validate ReservedExternally vs total capacity and bookings
    const reservedVal = updateData.ReservedExternally !== undefined ? updateData.ReservedExternally : (existingEvent.ReservedExternally || 0);
    const ticketsVal = updateData.tickets || existingEvent.tickets || [];
    const totalSeats = ticketsVal.reduce((sum, t) => sum + (t.qty || 0), 0);

    const eventBookings = await Transaction.aggregate([
      { $match: { eventId: existingEvent._id, status: "PAID", bookingType: "EVENT" } },
      { $group: { _id: null, bookedQty: { $sum: "$qty" } } },
    ]);
    const bookedQty = eventBookings.length > 0 ? eventBookings[0].bookedQty : 0;

    if (totalSeats < bookedQty + reservedVal) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Total event seats (${totalSeats}) cannot be less than booked count (${bookedQty}) + externally reserved seats (${reservedVal})`
      );
    }
    // 8. Update fields on the mongoose document
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
      "timeZone",
      "refundPolicy",
      "addOns",
      "mediaLinks",
      "shortTeaserVideo",
      "accessAndPrivacy",
      "ageRestriction",
      "dressCode",
      "isDraft",
      "tickets",
      "ReservedExternally",
      "visibility",
      "notes",
      "showAttendees",
      "addToSlider",
      "assignedStaff",
    ];

    simpleFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        existingEvent[field] = updateData[field];
      }
    });

    // 9. Transform venueAddress to GeoJSON if provided
    if (updateData.venueAddress) {
      existingEvent.venueAddress = {
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

    // 10. Handle feature event fee if fetcherEvent flag changes
    if (updateData.fetcherEvent !== undefined) {
      existingEvent.fetcherEvent = updateData.fetcherEvent;
      let featureFee = 0;
      if (updateData.fetcherEvent) {
        const feeSetting = await GlobalSetting.findOne({
          key: "FEATURE_EVENT_FEE",
        });
        if (feeSetting && feeSetting.value) {
          featureFee = Number(feeSetting.value) || 0;
        }
      }
      existingEvent.featureEventFee = featureFee;
    }

    // 11. Save the Mongoose document to trigger pre-save hooks
    await existingEvent.save();

    // 12. Retrieve updated and populated event
    const updatedEvent = await Event.findById(eventId)
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage isVerified")
      .lean();

    // 13. Format response URLs
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
      JSON.stringify(updateData.venueAddress) !==
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

router.get("/top/list", getTopEvents);



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

const getRefundPolicies = async (req, res) => {
  try {
    const { refundPolicy } = require("../../utils/Role");
    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Refund policies retrieved successfully",
      Object.values(refundPolicy),
    );
  } catch (error) {
    console.error("Error in getRefundPolicies:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.get("/refund-policies", perApiLimiter(), getRefundPolicies);

router.get("/details/:eventId", perApiLimiter(), getEventDetails);

router.get("/attendees/:eventId", perApiLimiter(), getAllEventAttendees);

router.post(
  "/edit/:eventId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  // validateRequest(updateEventSchema),
  updateEvent,
);

const assignStaffToEvent = async (req, res) => {
  try {
    const { entityId: eventId, staffIds } = req.body;
    const organizerId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    if (event.createdBy.toString() !== organizerId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to assign staff to this event",
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

    event.assignedStaff = staffIds;
    await event.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff successfully assigned to the event",
      { event },
    );
  } catch (error) {
    console.error("Error in assignStaffToEvent:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/assign-staff",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(assignStaffSchema),
  assignStaffToEvent,
);

const parseDateRange = (query) => {
  const { filter, startDate, endDate } = query;
  let start = null;
  let end = null;

  if (filter === "7d") {
    start = new Date();
    start.setDate(start.getDate() - 7);
    end = new Date();
  } else if (filter === "30d") {
    start = new Date();
    start.setDate(start.getDate() - 30);
    end = new Date();
  } else if (filter === "thisMonth") {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = now;
  } else if (filter === "thisYear") {
    const now = new Date();
    start = new Date(now.getFullYear(), 0, 1);
    end = now;
  } else if (startDate || endDate) {
    if (startDate) start = new Date(startDate);
    if (endDate) end = new Date(endDate);
  }

  const dbFilter = {};
  if (start || end) {
    dbFilter.createdAt = {};
    if (start) dbFilter.createdAt.$gte = start;
    if (end) dbFilter.createdAt.$lte = end;
  }
  return dbFilter;
};

const getEventAnalytics = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.EVENT_NOT_FOUND,
      );
    }

    const isOwner = event.createdBy.toString() === userId;
    const isAdmin = req.user.roleId === roleId.SUPER_ADMIN;

    if (!isOwner && !isAdmin) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to view analytics for this event",
      );
    }

    const dateFilter = parseDateRange(req.query);

    const viewQuery = { eventId, ...dateFilter };
    const viewCount = await EventView.countDocuments(viewQuery);

    const transactionQuery = {
      eventId: eventId,
      status: "PAID",
      bookingType: "EVENT",
      ...dateFilter,
    };
    const transactions = await Transaction.find(transactionQuery);

    const totalBookingsCount = transactions.length;
    const totalTicketsSold = transactions.reduce((sum, t) => sum + (t.qty || 0), 0);
    const grossRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const organizerRevenue = transactions.reduce((sum, t) => sum + (t.organizerEarning || 0), 0);

    let bookingRate = 0;
    if (viewCount > 0) {
      bookingRate = Number(((totalBookingsCount / viewCount) * 100).toFixed(2));
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Event analytics retrieved successfully",
      {
        eventId: event._id,
        eventTitle: event.eventTitle,
        viewCount,
        totalBookings: totalBookingsCount,
        totalTicketsSold,
        bookingRate,
        grossRevenue,
        organizerRevenue,
      },
    );
  } catch (error) {
    console.error("Error in getEventAnalytics:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getOrganizerEventsAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;

    const type = req.query.type || "all";
    let events = [];
    let courses = [];

    if (type === "event") {
      events = await Event.find({ createdBy: userId })
        .populate("eventCategory", "name")
        .select("_id eventTitle posterImage eventCategory")
        .lean();
    } else if (type === "course") {
      courses = await Course.find({ createdBy: userId })
        .populate("courseCategory", "name")
        .select("_id courseTitle posterImage courseCategory")
        .lean();
    } else {
      const [fetchedEvents, fetchedCourses] = await Promise.all([
        Event.find({ createdBy: userId })
          .populate("eventCategory", "name")
          .select("_id eventTitle posterImage eventCategory")
          .lean(),
        Course.find({ createdBy: userId })
          .populate("courseCategory", "name")
          .select("_id courseTitle posterImage courseCategory")
          .lean()
      ]);
      events = fetchedEvents;
      courses = fetchedCourses;
    }

    const eventIds = events.map((e) => e._id);
    const courseIds = courses.map((c) => c._id);

    if (eventIds.length === 0 && courseIds.length === 0) {
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        "Organizer has no listings for analytics",
        {
          summary: {
            totalViews: 0,
            totalBookings: 0,
            totalTicketsSold: 0,
            averageBookingRate: 0,
            totalGrossRevenue: 0,
            totalOrganizerRevenue: 0,
          },
          events: [],
          listings: [],
        },
      );
    }

    const dateFilter = parseDateRange(req.query);

    const [eventViewsAgg, courseViewsAgg, eventTxAgg, courseTxAgg] = await Promise.all([
      EventView.aggregate([
        { $match: { eventId: { $in: eventIds }, ...dateFilter } },
        { $group: { _id: "$eventId", count: { $sum: 1 } } }
      ]),
      CourseView.aggregate([
        { $match: { courseId: { $in: courseIds }, ...dateFilter } },
        { $group: { _id: "$courseId", count: { $sum: 1 } } }
      ]),
      Transaction.aggregate([
        { $match: { eventId: { $in: eventIds }, status: "PAID", bookingType: "EVENT", ...dateFilter } },
        {
          $group: {
            _id: "$eventId",
            bookingsCount: { $sum: 1 },
            ticketsSold: { $sum: "$qty" },
            grossRevenue: { $sum: "$totalAmount" },
            organizerRevenue: { $sum: "$organizerEarning" }
          }
        }
      ]),
      Transaction.aggregate([
        { $match: { courseId: { $in: courseIds }, status: "PAID", bookingType: "COURSE", ...dateFilter } },
        {
          $group: {
            _id: "$courseId",
            bookingsCount: { $sum: 1 },
            ticketsSold: { $sum: "$qty" },
            grossRevenue: { $sum: "$totalAmount" },
            organizerRevenue: { $sum: "$organizerEarning" }
          }
        }
      ]),
    ]);

    const eventViewsMap = {};
    eventViewsAgg.forEach(item => { eventViewsMap[item._id.toString()] = item.count; });

    const courseViewsMap = {};
    courseViewsAgg.forEach(item => { courseViewsMap[item._id.toString()] = item.count; });

    const eventTxMap = {};
    eventTxAgg.forEach(item => { eventTxMap[item._id.toString()] = item; });

    const courseTxMap = {};
    courseTxAgg.forEach(item => { courseTxMap[item._id.toString()] = item; });

    const listingsList = [];

    events.forEach(event => {
      const idStr = event._id.toString();
      const views = eventViewsMap[idStr] || 0;
      const txInfo = eventTxMap[idStr] || { bookingsCount: 0, ticketsSold: 0, grossRevenue: 0, organizerRevenue: 0 };
      const bookingRate = views > 0 ? Number(((txInfo.bookingsCount / views) * 100).toFixed(2)) : 0;
      const poster = Array.isArray(event.posterImage) && event.posterImage.length > 0 ? formatResponseUrl(event.posterImage[0]) : null;

      let categoryName = "Event";
      if (event.eventCategory && event.eventCategory.name) {
        categoryName = event.eventCategory.name.charAt(0).toUpperCase() + event.eventCategory.name.slice(1);
      }

      listingsList.push({
        eventId: event._id,
        eventTitle: event.eventTitle,
        id: event._id,
        title: event.eventTitle,
        type: "Event",
        categoryName,
        posterImage: poster,
        viewCount: views,
        views,
        totalBookings: txInfo.bookingsCount,
        bookings: txInfo.bookingsCount,
        ticketsSold: txInfo.ticketsSold,
        bookingRate,
        grossRevenue: txInfo.grossRevenue,
        revenue: txInfo.grossRevenue,
        organizerRevenue: txInfo.organizerRevenue,
      });
    });

    courses.forEach(course => {
      const idStr = course._id.toString();
      const views = courseViewsMap[idStr] || 0;
      const txInfo = courseTxMap[idStr] || { bookingsCount: 0, ticketsSold: 0, grossRevenue: 0, organizerRevenue: 0 };
      const bookingRate = views > 0 ? Number(((txInfo.bookingsCount / views) * 100).toFixed(2)) : 0;
      const poster = Array.isArray(course.posterImage) && course.posterImage.length > 0 ? formatResponseUrl(course.posterImage[0]) : null;

      let categoryName = "Course";
      if (course.courseCategory && course.courseCategory.name) {
        categoryName = course.courseCategory.name.charAt(0).toUpperCase() + course.courseCategory.name.slice(1);
      }

      listingsList.push({
        eventId: course._id,
        eventTitle: course.courseTitle,
        id: course._id,
        title: course.courseTitle,
        type: "Course",
        categoryName,
        posterImage: poster,
        viewCount: views,
        views,
        totalBookings: txInfo.bookingsCount,
        bookings: txInfo.bookingsCount,
        ticketsSold: txInfo.ticketsSold,
        bookingRate,
        grossRevenue: txInfo.grossRevenue,
        revenue: txInfo.grossRevenue,
        organizerRevenue: txInfo.organizerRevenue,
      });
    });

    // Sort by revenue descending
    listingsList.sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || b.views - a.views);

    const totalViews = listingsList.reduce((sum, item) => sum + item.views, 0);
    const totalBookings = listingsList.reduce((sum, item) => sum + item.bookings, 0);
    const totalTicketsSold = listingsList.reduce((sum, item) => sum + item.ticketsSold, 0);
    const totalGrossRevenue = listingsList.reduce((sum, item) => sum + item.revenue, 0);
    const totalOrganizerRevenue = listingsList.reduce((sum, item) => sum + item.organizerRevenue, 0);

    let averageBookingRate = 0;
    if (totalViews > 0) {
      averageBookingRate = Number(((totalBookings / totalViews) * 100).toFixed(2));
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const paginatedList = listingsList.slice(skip, skip + limit);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Organizer events and courses analytics summary retrieved successfully",
      {
        summary: {
          totalViews,
          totalBookings,
          totalTicketsSold,
          averageBookingRate,
          bookingRate: averageBookingRate,
          totalGrossRevenue,
          totalOrganizerRevenue,
        },
        // events: paginatedList,
        // courses: paginatedList,
        listings: paginatedList,
        pagination: {
          total: listingsList.length,
          page,
          limit,
          totalPages: Math.ceil(listingsList.length / limit),
        },
      },
    );
  } catch (error) {
    console.error("Error in getOrganizerEventsAnalytics:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.get(
  "/analytics/summary",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  getOrganizerEventsAnalytics,
);

router.get(
  "/analytics/:eventId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  getEventAnalytics,
);

module.exports = router;
module.exports.getEvents = getEvents;
