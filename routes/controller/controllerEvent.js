const express = require("express");
const router = express.Router();
const { Event } = require("../../db");
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
} = require("../services/validations/eventValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const jwt = require("jsonwebtoken");
const { User } = require("../../db");

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

    const newEvent = new Event({
      ...eventData,
      venueAddress: location,
      venueName: req.body.venueName,
      createdBy: req.user.userId,
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
    } = req.query;

    const now = new Date();
    const skip = (page - 1) * limit;

    // Base query - ALWAYS exclude past events and drafts
    let query = {
      endDate: { $gte: now }, // Event must not have ended yet
      isDraft: false,
      status: { $ne: "Past" },
    };

    // Apply category filter if provided
    if (categoryId && categoryId !== "") {
      query.eventCategory = categoryId;
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

      case "nearYou":
        // Validate coordinates
        if (!latitude || !longitude) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            constantsMessage.LOCATION_REQUIRED,
          );
        }

        // Use geospatial query with $nearSphere
        query.venueAddress = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            $maxDistance: radius * 1000, // Convert km to meters
          },
        };
        break;

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
    const events = await Event.find(query)
      .populate("eventCategory", "name image")
      .populate("createdBy", "firstName lastName profileImage")
      .sort({ startDate: 1 }) // Sort by earliest events first
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalCount = await Event.countDocuments(query);

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

router.post(
  "/create",
  perApiLimiter(),
  checkRole([roleId.ORGANISER]),
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

module.exports = router;
