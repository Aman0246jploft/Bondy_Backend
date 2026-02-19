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
} = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const {
  createEventSchema,
  getEventsSchema,
  getEventDetailsSchema,
  updateEventSchema,
  updateEventParamsSchema,
} = require("../services/validations/eventValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const jwt = require("jsonwebtoken");

// Create Event
const createEvent = async (req, res) => {
  try {
    const { venueAddress, ...eventData } = req.body;

    // Transform venueAddress to GeoJSON Point
    const location = {
      type: "Point",
      coordinates: [venueAddress.longitude, venueAddress.latitude],
      city: venueAddress.city,
      country: venueAddress.country,
      address: venueAddress.address,
    };

    let featureFee = 0;
    if (req.body.fetcherEvent) {
      const feeSetting = await GlobalSetting.findOne({
        key: "FEATURE_EVENT_FEE",
      });
      if (feeSetting && feeSetting.value) {
        featureFee = Number(feeSetting.value) || 0;
      }
    }

    const newEvent = new Event({
      ...eventData,
      venueAddress: location,
      venueName: req.body.venueName,
      createdBy: req.user.userId,
      featureEventFee: featureFee,
    });

    await newEvent.save();
    const event = newEvent.toObject();
    if (Array.isArray(event.posterImage)) {
      event.posterImage = event.posterImage.map((img) =>
        formatResponseUrl(img),
      );
    }

    if (Array.isArray(event.shortTeaserVideo)) {
      event.shortTeaserVideo = event.shortTeaserVideo.map((video) =>
        formatResponseUrl(video),
      );
    }

    if (Array.isArray(event.mediaLinks)) {
      event.mediaLinks = event.mediaLinks.map((link) =>
        formatResponseUrl(link),
      );
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENT_CREATED, {
      event: event,
    });
  } catch (error) {
    console.error("Error in createEvent:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Events with Filters
const getEvents = async (req, res) => {
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
      userId,
    } = req.query;

    let loginUser = null;
    if (req.user) {
      loginUser = req.user.userId;
    }
    const now = new Date();
    const skip = (page - 1) * limit;

    if (filter === "nearYou") {
      const baseMatch = {
        endDate: { $gte: now },
        isDraft: false,
        status: { $ne: "Past" },
      };

      if (categoryId) {
        baseMatch.eventCategory = new mongoose.Types.ObjectId(categoryId);
      }

      if (search) {
        baseMatch.$or = [
          { eventTitle: { $regex: search, $options: "i" } },
          { shortdesc: { $regex: search, $options: "i" } },
          { tags: { $regex: search, $options: "i" } },
        ];
      }

      // 🔹 CASE 1: lat + lng → GEO SEARCH
      if (latitude && longitude) {
        const events = await Event.aggregate([
          {
            $geoNear: {
              near: {
                type: "Point",
                coordinates: [parseFloat(longitude), parseFloat(latitude)],
              },
              distanceField: "distance",
              maxDistance: radius * 1000,
              spherical: true,
              query: baseMatch,
            },
          },
          { $skip: skip },
          { $limit: parseInt(limit) },
        ]);

        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.EVENTS_FETCHED,
          {
            events,
            page: parseInt(page),
            limit: parseInt(limit),
          },
        );
      }

      // 🔹 CASE 2: NO coords → GET USER LOCATION
      let city = null;
      let country = null;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
          const user = await User.findById(decoded.userId).lean();

          city = user?.location?.city || null;
          country = user?.location?.country || null;
        } catch (err) { }
      }

      // 🔹 CASE 3: CITY or COUNTRY FILTER
      if (city || country) {
        if (city) {
          baseMatch["venueAddress.city"] = city;
        } else {
          baseMatch["venueAddress.country"] = country;
        }

        const events = await Event.find(baseMatch)
          .sort({ startDate: 1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean();

        const total = await Event.countDocuments(baseMatch);

        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.EVENTS_FETCHED,
          {
            events,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
          },
        );
      }

      // 🔹 CASE 4: NOTHING FOUND → EMPTY RESPONSE
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.EVENTS_FETCHED,
        {
          events: [],
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      );
    }

    // Base query - ALWAYS exclude past events and drafts
    let query = {
      endDate: { $gte: now }, // Event must not have ended yet
      isDraft: false,
      status: { $ne: "Past" },
    };

    // Apply category filter if provided
    if (categoryId && categoryId !== "") {
      const catIds = categoryId.split(",");
      if (catIds.length > 1) {
        query.eventCategory = { $in: catIds };
      } else {
        query.eventCategory = categoryId;
      }
    }

    // Apply filter-specific logic
    switch (filter) {
      case "all":
        // No additional filters - just return all non-past, non-draft events
        break;

      case "recommended":
        // Try to identify user from token for personalization
        let userCategories = [];
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.split(" ")[1];
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            const user = await User.findById(decoded.userId).lean();

            if (user && user.categories && user.categories.length > 0) {
              userCategories = user.categories;
            }
          } catch (err) {
            // Token invalid or expired - treat as guest (no personalization)
            // No error response needed as per optional auth
          }
        }

        if (userCategories.length > 0) {
          // If user has preferences, filter by their categories
          query.eventCategory = { $in: userCategories };
        }
        console.log(query.eventCategory);
        // If no user categories or guestKey, just return upcoming events (base query already handles this)
        // We could add popularity sorting here if 'totalAttendees' was populated
        break;

      // case "nearYou":
      //   // Validate coordinates
      //   if (!latitude || !longitude) {
      //     return apiErrorRes(
      //       HTTP_STATUS.BAD_REQUEST,
      //       res,
      //       constantsMessage.LOCATION_REQUIRED,
      //     );
      //   }

      //   // Use geospatial query with $nearSphere
      //   query.venueAddress = {
      //     $nearSphere: {
      //       $geometry: {
      //         type: "Point",
      //         coordinates: [parseFloat(longitude), parseFloat(latitude)],
      //       },
      //       $maxDistance: radius * 1000, // Convert km to meters
      //     },
      //   };
      //   break;

      case "upcoming":
        // Events that haven't started yet
        query.startDate = { $gt: now };
        break;

      case "thisWeek":
        // Get current week's Monday 00:00 and Sunday 23:59
        const startOfWeek = new Date(now);
        const dayOfWeek = startOfWeek.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to Monday
        startOfWeek.setDate(startOfWeek.getDate() + diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6); // Sunday
        endOfWeek.setHours(23, 59, 59, 999);

        query.startDate = {
          $gte: startOfWeek,
          $lte: endOfWeek,
        };
        break;

      case "thisWeekend":
        // Get current week's Saturday 00:00 and Sunday 23:59
        const today = new Date(now);
        const currentDay = today.getDay();

        // Calculate Saturday
        const startOfWeekend = new Date(today);
        const daysUntilSaturday = currentDay === 0 ? -1 : 6 - currentDay;
        startOfWeekend.setDate(startOfWeekend.getDate() + daysUntilSaturday);
        startOfWeekend.setHours(0, 0, 0, 0);

        // Calculate Sunday
        const endOfWeekend = new Date(startOfWeekend);
        endOfWeekend.setDate(endOfWeekend.getDate() + 1);
        endOfWeekend.setHours(23, 59, 59, 999);

        query.startDate = {
          $gte: startOfWeekend,
          $lte: endOfWeekend,
        };
        break;

      case "thisYear":
        // Get current year's Jan 1 00:00 and Dec 31 23:59
        const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

        query.startDate = {
          $gte: startOfYear,
          $lte: endOfYear,
        };
        break;

      case "today":
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        query.startDate = {
          $gte: startOfToday,
          $lte: endOfToday,
        };
        break;

      case "nextWeek":
        const startOfNextWeek = new Date(now);
        const currentDayNW = startOfNextWeek.getDay();
        const diffNW = currentDayNW === 0 ? -6 : 1 - currentDayNW;
        startOfNextWeek.setDate(startOfNextWeek.getDate() + diffNW + 7); // Next Monday
        startOfNextWeek.setHours(0, 0, 0, 0);

        const endOfNextWeek = new Date(startOfNextWeek);
        endOfNextWeek.setDate(endOfNextWeek.getDate() + 6); // Next Sunday
        endOfNextWeek.setHours(23, 59, 59, 999);

        query.startDate = {
          $gte: startOfNextWeek,
          $lte: endOfNextWeek,
        };
        break;

      default:
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_FILTER_TYPE,
        );
    }

    // Add search functionality if provided
    if (search) {
      query.$or = [
        { eventTitle: { $regex: search, $options: "i" } },
        { shortdesc: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    // Execute query with pagination
    // Execute query with pagination
    let eventsQuery = Event.find(query)
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage");

    // Only apply explicit sort if NOT using geospatial query (nearYou)
    // $nearSphere automatically sorts by distance, and combining with other sorts is not allowed
    if (filter !== "nearYou") {
      eventsQuery = eventsQuery.sort({ startDate: 1 });
    }

    const events = await eventsQuery.skip(skip).limit(parseInt(limit)).lean();

    // Get total count for pagination
    const totalCount = await Event.countDocuments(query);

    // Check for logged-in user to determine isBooked status
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        viewerId = decoded.userId;
      } catch (err) {
        // Invalid token - treat as guest
      }
    }

    const bookedEventIds = new Set();
    if (viewerId) {
      const bookings = await Transaction.find({
        userId: viewerId,
        eventId: { $in: events.map((e) => e._id) },
        status: "PAID",
      }).select("eventId");
      bookings.forEach((b) => bookedEventIds.add(b.eventId.toString()));
    }

    // Format image URLs
    const formattedEvents = events.map((event) => {
      if (Array.isArray(event.posterImage)) {
        event.posterImage = event.posterImage.map((img) =>
          formatResponseUrl(img),
        );
      }

      if (Array.isArray(event.shortTeaserVideo)) {
        event.shortTeaserVideo = event.shortTeaserVideo.map((video) =>
          formatResponseUrl(video),
        );
      }

      if (Array.isArray(event.mediaLinks)) {
        event.mediaLinks = event.mediaLinks.map((link) =>
          formatResponseUrl(link),
        );
      }

      // Format category image
      if (event.eventCategory && event.eventCategory.image) {
        event.eventCategory.image = formatResponseUrl(
          event.eventCategory.image,
        );
      }

      // Format creator profile image
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

          if (hours > 0 && minutes > 0) {
            duration = `${hours}H ${minutes}min`;
          } else if (hours > 0) {
            duration = `${hours}H`;
          } else {
            duration = `${minutes}min`;
          }
        }
      }
      event.duration = duration;

      // Add seat statistics
      event.totalSeats = event.totalTickets || 0;
      event.leftSeats = event.ticketQtyAvailable || 0;
      event.acquiredSeats =
        (event.totalTickets || 0) - (event.ticketQtyAvailable || 0);

      // Add booking status
      event.isBooked = bookedEventIds.has(event._id.toString());

      return event;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENTS_FETCHED, {
      events: formattedEvents,

      total: totalCount,
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
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage")
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
      } catch (err) { }
    }
    event.isBooked = isBooked;

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
    if (event.startDate && event.endDate) {
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      const diffMs = end - start;
      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0 && minutes > 0)
          event.duration = `${hours}H ${minutes}min`;
        else if (hours > 0) event.duration = `${hours}H`;
        else event.duration = `${minutes}min`;
      }
    }

    // 3. Parallel Fetch for Related Data
    const [reviews, comments, totalAttendeesAgg, recentTransactions] =
      await Promise.all([
        // Top 5 Reviews
        Review.find({ entityId: eventId, entityModel: "Event" })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("userId", "firstName lastName profileImage")
          .lean(),

        // Top 5 Comments
        Comment.find({ event: eventId, parentComment: null })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("user", "firstName lastName profileImage")
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
          .populate("userId", "firstName lastName profileImage")
          .lean(),
      ]);

    const totalAttendees =
      totalAttendeesAgg.length > 0 ? totalAttendeesAgg[0].totalQty : 0;

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
      .populate("createdBy", "firstName lastName profileImage")
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
    let query = {};

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
      .populate("createdBy", "firstName lastName profileImage")
      .sort({ createdAt: -1 }) // Newest created first for Admin
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Event.countDocuments(query);

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

// Get Organizer Stats (Revenue & Attendees)
const getOrganizerStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    // fetch all events by this organizer
    const events = await Event.find({ createdBy: userId }).select("_id").lean();
    const eventIds = events.map((e) => e._id);

    if (eventIds.length === 0) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "Stats fetched successfully", {
        totalRevenue: 0,
        totalAttendees: 0,
      });
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

    return apiSuccessRes(HTTP_STATUS.OK, res, "Stats fetched successfully", {
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
      .populate("createdBy", "firstName lastName profileImage")
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
      .populate("userId", "firstName lastName profileImage")
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
        });
        seenUserIds.add(user._id.toString());
      }
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Event attendees fetched", {
      host: event.createdBy,
      eventTitle: event.eventTitle,
      attendees: uniqueUsers,
    });
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
      .populate("createdBy", "firstName lastName profileImage")
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
  perApiLimiter(),
  validateRequest(getEventsSchema),
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

router.get("/details/:eventId", perApiLimiter(), getEventDetails);

router.get("/attendees/:eventId", perApiLimiter(), getAllEventAttendees);

router.post(
  "/edit/:eventId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(updateEventSchema),
  updateEvent,
);

module.exports = router;
