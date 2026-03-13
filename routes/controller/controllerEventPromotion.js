const express = require("express");
const router = express.Router();
const { PromotionPackage, Event, Transaction, User } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const validateRequest = require("../../middlewares/validateRequest");
const { checkoutPromotionSchema } = require("../services/validations/eventPromotionValidation");
const { notifyPromotion, queueNotification } = require("../services/serviceNotification");

// Get Active Packages for Organizer
const getActivePackages = async (req, res) => {
  try {
    const packages = await PromotionPackage.find({ isActive: true, packageType: "EVENT" }).lean();
    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Active promotion packages fetched successfully.",
      packages,
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

// Checkout Promotion
const checkoutPromotion = async (req, res) => {
  try {
    const { eventId, packageId } = req.body;
    const userId = req.user.userId;

    // Verify Event
    const event = await Event.findOne({ _id: eventId, createdBy: userId });
    if (!event) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Event not found or you are not the organizer.",
      );
    }

    // Verify Package
    const pkg = await PromotionPackage.findOne({ _id: packageId, isActive: true });
    if (!pkg) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Promotion package not found or inactive.",
      );
    }

    // Check if event is already featured and active
    if (event.isFeatured && event.featuredExpiry && event.featuredExpiry > new Date()) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "This event is already actively featured.",
      );
    }

    const bookingId = `PROM-${Math.floor(100000 + Math.random() * 900000)}`;

    // Create Transaction
    const transaction = new Transaction({
      userId,
      eventId,
      bookingType: "PROMOTION",
      promotionPackageId: packageId,
      bookingId,
      qty: 1,
      basePrice: pkg.price,
      totalAmount: pkg.price,
      status: "PAID", // Assuming instant successful payment for now
      paymentId: `MOCK_Q_PAY_${Date.now()}`
    });

    await transaction.save();

    // Update Event Status
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + pkg.durationInDays);

    event.isFeatured = true;
    event.featuredExpiry = expiryDate;
    event.activePromotionPackage = pkg._id;
    await event.save();

    // Notify Admin (non-blocking via queue)
    const adminUser = await User.findOne({ roleId: 1 });
    if (adminUser) {
      queueNotification({
        recipient: String(adminUser._id),
        sender: null,
        type: "SYSTEM",
        title: "New Event Promotion Purchased",
        message: `Organizer of event "${event.eventTitle}" purchased a ${pkg.durationInDays}-day promotion.`,
        relatedId: String(event._id),
        onModel: "Event",
      }).catch((e) => console.error("[Notification] admin event promo:", e));
    }

    // Notify Organizer (non-blocking via queue)
    notifyPromotion(
      String(userId),
      "Event",
      event.eventTitle,
      String(event._id),
      pkg.durationInDays
    ).catch((e) => console.error("[Notification] notifyPromotion (event):", e));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Promotion successfully purchased and activated.",
      {
        transaction,
        event: {
          _id: event._id,
          isFeatured: event.isFeatured,
          featuredExpiry: event.featuredExpiry
        }
      },
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

router.get("/packages", perApiLimiter(), getActivePackages);
router.post(
  "/checkout",
  perApiLimiter(),
  validateRequest(checkoutPromotionSchema),
  checkoutPromotion,
);

module.exports = router;
