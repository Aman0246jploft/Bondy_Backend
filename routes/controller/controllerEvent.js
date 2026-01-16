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
} = require("../services/validations/eventValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

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
        formatResponseUrl(img)
      );
    }

    if (Array.isArray(event.shortTeaserVideo)) {
      event.shortTeaserVideo = event.shortTeaserVideo.map((video) =>
        formatResponseUrl(video)
      );
    }

    if (Array.isArray(event.mediaLinks)) {
      event.mediaLinks = event.mediaLinks.map((link) =>
        formatResponseUrl(link)
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

router.post(
  "/create",
  perApiLimiter(),
  checkRole([roleId.ORGANISER]),
  validateRequest(createEventSchema),
  createEvent
);

module.exports = router;
