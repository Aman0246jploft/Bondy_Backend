const express = require("express");
const router = express.Router();
const { User, Event, Transaction, Tax, PromoCode } = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const {
  initiateBookingSchema,
  confirmPaymentSchema,
} = require("../services/validations/bookingValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");

// Helper to round amount to 2 decimal places
const roundToTwo = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// Helper to generate unique QR string
const generateQRData = (transactionId, userId) => {
  return `TICKET-${transactionId}-${userId}-${Date.now()}`;
};

// 1. Initiate Booking (Calculate & Create Pending Transaction)
const initiateBooking = async (req, res) => {
  try {
    const { eventId, qty, discountCode } = req.body;
    const userId = req.user.userId;

    // Fetch Event
    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    // Check availability
    if (event.ticketQtyAvailable < qty) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Not enough tickets available"
      );
    }

    // Calculate Base Price
    const basePrice = roundToTwo(event.ticketPrice * qty);
    let finalAmount = basePrice;
    let discountAmount = 0;
    let taxAmount = 0;

    // Apply Discount Code
    if (discountCode) {
      const code = await PromoCode.findOne({
        code: discountCode,
        active: true,
      });

      if (!code) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Invalid discount code"
        );
      }

      // Check validity dates
      const now = new Date();
      if (now < code.validFrom || now > code.validUntil) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Discount code expired"
        );
      }

      // Check usage limits
      if (code.maxUsage > 0 && code.usedCount >= code.maxUsage) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Discount code usage limit exceeded"
        );
      }

      if (code.discountType === "percentage") {
        discountAmount = roundToTwo((basePrice * code.discountValue) / 100);
      } else {
        discountAmount = roundToTwo(code.discountValue);
      }

      // Ensure discount doesn't exceed total
      if (discountAmount > basePrice) discountAmount = basePrice;

      finalAmount -= discountAmount;
    }

    // Apply Taxes
    // Fetch all active taxes
    const taxes = await Tax.find({ active: true });
    const appliedTaxIds = [];

    taxes.forEach((tax) => {
      let taxVal = 0;
      if (tax.type === "percentage") {
        taxVal = roundToTwo((finalAmount * tax.value) / 100); // Tax usually on discounted price? Or base? Assuming discounted for now.
      } else {
        taxVal = roundToTwo(tax.value);
      }
      taxAmount += taxVal;
      appliedTaxIds.push(tax._id);
    });

    taxAmount = roundToTwo(taxAmount);
    finalAmount = roundToTwo(finalAmount + taxAmount);

    // Generate Booking ID (e.g., BNDY-782392)
    const bookingId = `BNDY-${Math.floor(100000 + Math.random() * 900000)}`;

    // Create Transaction Record
    const transaction = new Transaction({
      userId,
      eventId,
      bookingId,
      qty,
      basePrice,
      discountAmount,
      taxAmount,
      totalAmount: finalAmount, // Round if needed?
      discountCode: discountCode || null,
      appliedTaxIds,
      status: "PENDING",
    });

    await transaction.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Booking initiated", {
      transactionId: transaction._id,
      bookingId: transaction.bookingId,
      breakdown: {
        basePrice,
        discountAmount,
        taxAmount,
        totalAmount: finalAmount,
      },
    });
  } catch (error) {
    console.error("Error in initiateBooking:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 1.5 Calculate Booking (Preview - No Transaction)
const calculateBooking = async (req, res) => {
  try {
    const { eventId, qty, discountCode } = req.body;

    // Fetch Event
    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    // Check availability
    if (event.ticketQtyAvailable < qty) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Not enough tickets available"
      );
    }

    // Calculate Base Price
    const basePrice = roundToTwo(event.ticketPrice * qty);
    let finalAmount = basePrice;
    let discountAmount = 0;
    let taxAmount = 0;

    // Apply Discount Code
    // if (discountCode) {
    //   const code = await PromoCode.findOne({
    //     code: discountCode,
    //     active: true,
    //   });

    //   if (!code) {
    //     return apiErrorRes(
    //       HTTP_STATUS.BAD_REQUEST,
    //       res,
    //       "Invalid discount code"
    //     );
    //   }

    //   // Check validity dates
    //   const now = new Date();
    //   if (now < code.validFrom || now > code.validUntil) {
    //     return apiErrorRes(
    //       HTTP_STATUS.BAD_REQUEST,
    //       res,
    //       "Discount code expired"
    //     );
    //   }

    //   // Check usage limits
    //   if (code.maxUsage > 0 && code.usedCount >= code.maxUsage) {
    //     return apiErrorRes(
    //       HTTP_STATUS.BAD_REQUEST,
    //       res,
    //       "Discount code usage limit exceeded"
    //     );
    //   }

    //   if (code.discountType === "percentage") {
    //     discountAmount = roundToTwo((basePrice * code.discountValue) / 100);
    //   } else {
    //     discountAmount = roundToTwo(code.discountValue);
    //   }

    //   // Ensure discount doesn't exceed total
    //   if (discountAmount > basePrice) discountAmount = basePrice;

    //   finalAmount -= discountAmount;
    // }
    // Apply Discount Code (optional)
    if (discountCode) {
      const code = await PromoCode.findOne({
        code: discountCode,
        active: true,
      });

      const now = new Date();

      const isValidCoupon =
        code &&
        now >= code.validFrom &&
        now <= code.validUntil &&
        !(code.maxUsage > 0 && code.usedCount >= code.maxUsage);

      if (isValidCoupon) {
        if (code.discountType === "percentage") {
          discountAmount = roundToTwo((basePrice * code.discountValue) / 100);
        } else {
          discountAmount = roundToTwo(code.discountValue);
        }

        // Ensure discount doesn't exceed base price
        if (discountAmount > basePrice) discountAmount = basePrice;

        finalAmount -= discountAmount;
      }
      // ❌ If coupon is invalid → do nothing, continue without discount
    }

    // Apply Taxes
    const taxes = await Tax.find({ active: true });
    const appliedTaxes = [];

    taxes.forEach((tax) => {
      let taxVal = 0;
      if (tax.type === "percentage") {
        taxVal = roundToTwo((finalAmount * tax.value) / 100);
      } else {
        taxVal = roundToTwo(tax.value);
      }
      taxAmount += taxVal;
      appliedTaxes.push({ ...tax.toObject(), calculatedAmount: taxVal });
    });

    taxAmount = roundToTwo(taxAmount);
    finalAmount = roundToTwo(finalAmount + taxAmount);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Booking calculation successful",
      {
        breakdown: {
          basePrice,
          discountAmount,
          taxAmount,
          totalAmount: finalAmount,
        },
        appliedTaxes, // Returning details of taxes applied for frontend display
      }
    );
  } catch (error) {
    console.error("Error in calculateBooking:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2. Pay Now (Mock Payment Gateway)
const confirmPayment = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId,
    }).populate("eventId");

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Transaction not found");
    }

    if (transaction.status === "PAID") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Transaction already paid"
      );
    }

    if (transaction.status === "CANCELLED" || transaction.status === "FAILED") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Transaction is in invalid state to pay"
      );
    }

    // MOCK Payment Success
    // In real scenario, verify signature/paymentId from gateway

    // Update Transaction
    transaction.status = "PAID";
    transaction.paymentId = `MOCK_PAY_${Date.now()}`;
    transaction.qrCodeData = generateQRData(transaction._id, userId);
    await transaction.save();

    // Reduce Ticket Inventory
    // Potential Race condition here if not careful, but for this level:
    await Event.findByIdAndUpdate(transaction.eventId._id, {
      $inc: { ticketQtyAvailable: -transaction.qty },
    });

    // Increment Discount Usage if used
    if (transaction.discountCode) {
      await PromoCode.updateOne(
        { code: transaction.discountCode },
        { $inc: { usedCount: 1 } }
      );
    }

    /* ------------ FORMAT RESPONSE URLs (ALL ARRAYS) ------------ */

    const transactionObj = transaction.toObject();
    const event = transactionObj.eventId;

    if (event) {
      event.posterImage = Array.isArray(event.posterImage)
        ? event.posterImage.map((e) => formatResponseUrl(e))
        : [];
      console.log("Event after formatting posterImage:", event.posterImage);

      event.mediaLinks = Array.isArray(event.mediaLinks)
        ? event.mediaLinks.map((link) => formatResponseUrl(link))
        : [];

      event.shortTeaserVideo = Array.isArray(event.shortTeaserVideo)
        ? event.shortTeaserVideo.map((video) => formatResponseUrl(video))
        : [];
    }

    /* ----------------------------------------------------------- */

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Payment successful. Ticket Booked.",
      {
        transaction: transactionObj,
      }
    );
  } catch (error) {
    console.error("Error in confirmPayment:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 3. Get Ticket List
const getTicketList = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type } = req.query; // type = 'upcoming' | 'past' | 'all'

    let filter = { userId, status: "PAID" };

    const transactions = await Transaction.find(filter)
      .populate("eventId")
      .sort({ createdAt: -1 });

    let result = transactions;

    if (type) {
      const now = new Date();
      result = transactions.filter((t) => {
        if (!t.eventId) return false;

        if (type === "upcoming") {
          return new Date(t.eventId.endDate) >= now;
        } else if (type === "past") {
          return new Date(t.eventId.endDate) < now;
        }
        return true;
      });
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket list fetched", {
      tickets: result,
    });
  } catch (error) {
    console.error("Error in getTicketList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 4. Get Ticket Detail
const getTicketDetail = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId,
    }).populate("eventId");

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found");
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket detail fetched", {
      ticket: transaction,
    });
  } catch (error) {
    console.error("Error in getTicketDetail:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post(
  "/initiate",
  perApiLimiter(),
  validateRequest(initiateBookingSchema),
  initiateBooking
);

router.post(
  "/calculate",
  perApiLimiter(),
  validateRequest(initiateBookingSchema), // Reusing initiate schema as inputs are same
  calculateBooking
);

router.post(
  "/confirm-payment",
  perApiLimiter(),
  validateRequest(confirmPaymentSchema),
  confirmPayment
);

router.get("/list", perApiLimiter(), getTicketList);
router.get("/detail/:transactionId", perApiLimiter(), getTicketDetail);

module.exports = router;
