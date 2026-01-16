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
  scanQRCodeSchema,
} = require("../services/validations/bookingValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

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

    // Format event URLs if present
    const transactionObj = transaction.toObject();
    const event = transactionObj.eventId;

    if (event) {
      if (Array.isArray(event.posterImage)) {
        event.posterImage = event.posterImage.map((img) =>
          formatResponseUrl(img)
        );
      }
      if (Array.isArray(event.mediaLinks)) {
        event.mediaLinks = event.mediaLinks.map((link) =>
          formatResponseUrl(link)
        );
      }
      if (Array.isArray(event.shortTeaserVideo)) {
        event.shortTeaserVideo = event.shortTeaserVideo.map((video) =>
          formatResponseUrl(video)
        );
      }
    }

    // Add check-in status information
    const checkInStatus = {
      checkedInQty: transaction.checkedInQty || 0,
      totalQty: transaction.qty,
      remainingQty: transaction.qty - (transaction.checkedInQty || 0),
      isFullyCheckedIn: (transaction.checkedInQty || 0) >= transaction.qty,
      checkedInAt: transaction.checkedInAt,
    };

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket detail fetched", {
      ticket: {
        ...transactionObj,
        checkInStatus,
      },
    });
  } catch (error) {
    console.error("Error in getTicketDetail:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 5. Scan QR Code (Gate Keeper)
const scanQRCode = async (req, res) => {
  try {
    const { qrCodeData } = req.body;
    const gateKeeperId = req.user.userId;

    // Parse QR code data (format: TICKET-{transactionId}-{userId}-{timestamp})
    const qrParts = qrCodeData.split("-");
    if (qrParts.length < 4 || qrParts[0] !== "TICKET") {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "Invalid QR code format",
        data: null,
      });
    }

    const transactionId = qrParts[1];
    const userId = qrParts[2];

    // Find transaction with event populated
    const transaction = await Transaction.findById(transactionId).populate(
      "eventId"
    );

    if (!transaction) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "Transaction not found",
        data: null,
      });
    }

    // Validate QR code matches transaction
    if (transaction.qrCodeData !== qrCodeData) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "QR code does not match transaction",
        data: null,
      });
    }

    // Check if transaction is paid
    if (transaction.status !== "PAID") {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: `Ticket is not paid. Current status: ${transaction.status}`,
        data: {
          transactionId: transaction._id,
          bookingId: transaction.bookingId,
          status: transaction.status,
        },
      });
    }

    // Check if event exists
    if (!transaction.eventId) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "Event not found",
        data: null,
      });
    }

    const event = transaction.eventId;
    const now = new Date();

    // Check if event has ended (expired)
    if (new Date(event.endDate) < now) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "EXPIRED",
        message: "Event has ended",
        data: {
          transactionId: transaction._id,
          bookingId: transaction.bookingId,
          eventTitle: event.eventTitle,
          endDate: event.endDate,
        },
      });
    }

    // Check if event hasn't started yet (optional - you might want to allow early check-in)
    // if (new Date(event.startDate) > now) {
    //   return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
    //     status: "NOT_STARTED",
    //     message: "Event has not started yet",
    //     data: {
    //       transactionId: transaction._id,
    //       bookingId: transaction.bookingId,
    //       eventTitle: event.eventTitle,
    //       startDate: event.startDate,
    //     },
    //   });
    // }

    // Check if all tickets from this transaction are already checked in
    if (transaction.checkedInQty >= transaction.qty) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "ALREADY_CHECKED_IN",
        message: "All tickets from this booking have already been checked in",
        data: {
          transactionId: transaction._id,
          bookingId: transaction.bookingId,
          totalQty: transaction.qty,
          checkedInQty: transaction.checkedInQty,
          eventTitle: event.eventTitle,
        },
      });
    }

    // All validations passed - proceed with check-in
    const previousCheckedInQty = transaction.checkedInQty || 0;
    const newCheckedInQty = previousCheckedInQty + 1;

    // Update transaction
    transaction.checkedInQty = newCheckedInQty;
    transaction.isCheckedIn = newCheckedInQty >= transaction.qty;

    // Set first check-in time if this is the first check-in
    if (previousCheckedInQty === 0) {
      transaction.checkedInAt = now;
    }

    // Update who checked in (gate keeper)
    transaction.checkedInBy = gateKeeperId;
    await transaction.save();

    // Update event total attendees count
    await Event.findByIdAndUpdate(event._id, {
      $inc: { totalAttendees: 1 },
    });

    // Format event data for response
    const eventObj = event.toObject ? event.toObject() : event;
    if (eventObj.posterImage && Array.isArray(eventObj.posterImage)) {
      eventObj.posterImage = eventObj.posterImage.map((img) =>
        formatResponseUrl(img)
      );
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
      status: "OK",
      message: "Ticket checked in successfully",
      data: {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        totalQty: transaction.qty,
        checkedInQty: newCheckedInQty,
        remainingQty: transaction.qty - newCheckedInQty,
        isFullyCheckedIn: newCheckedInQty >= transaction.qty,
        event: {
          _id: event._id,
          eventTitle: event.eventTitle,
          startDate: event.startDate,
          endDate: event.endDate,
          venueName: event.venueName,
          posterImage: eventObj.posterImage,
        },
        checkedInAt: transaction.checkedInAt,
      },
    });
  } catch (error) {
    console.error("Error in scanQRCode:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 6. Get Event Attendees List (Organizer)
const getEventAttendeesList = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query; // 'all', 'checked-in', 'not-checked-in', 'partial'
    const userId = req.user.userId;

    // Find event and verify ownership
    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    // Check if user is the organizer or admin
    if (
      event.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== 1 // SUPER_ADMIN
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You don't have permission to view this event's attendees"
      );
    }

    // Build query filter
    let filter = {
      eventId: event._id,
      status: "PAID",
    };

    // Apply status filter if provided
    if (status === "checked-in") {
      filter.checkedInQty = { $gt: 0 };
    } else if (status === "not-checked-in") {
      filter.$or = [{ checkedInQty: { $exists: false } }, { checkedInQty: 0 }];
    } else if (status === "fully-checked-in") {
      // This will be handled in the code below
    }

    // Get all paid transactions for this event
    const transactions = await Transaction.find(filter)
      .populate(
        "userId",
        "firstName lastName email profileImage contactNumber countryCode"
      )
      .populate("checkedInBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    // Filter for fully checked in if needed
    let filteredTransactions = transactions;
    if (status === "fully-checked-in") {
      filteredTransactions = transactions.filter(
        (t) => (t.checkedInQty || 0) >= t.qty
      );
    } else if (status === "partial") {
      filteredTransactions = transactions.filter(
        (t) => (t.checkedInQty || 0) > 0 && (t.checkedInQty || 0) < t.qty
      );
    }

    // Format attendees list
    const attendees = filteredTransactions.map((transaction) => {
      const user = transaction.userId;
      const checkedInByUser = transaction.checkedInBy;

      return {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        user: {
          _id: user?._id,
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          profileImage: user?.profileImage
            ? formatResponseUrl(user.profileImage)
            : null,
          contactNumber: user?.contactNumber,
          countryCode: user?.countryCode,
        },
        tickets: {
          totalQty: transaction.qty,
          checkedInQty: transaction.checkedInQty || 0,
          remainingQty: transaction.qty - (transaction.checkedInQty || 0),
          isFullyCheckedIn: (transaction.checkedInQty || 0) >= transaction.qty,
        },
        checkInInfo: {
          checkedInAt: transaction.checkedInAt,
          checkedInBy: checkedInByUser
            ? {
                _id: checkedInByUser._id,
                firstName: checkedInByUser.firstName,
                lastName: checkedInByUser.lastName,
                email: checkedInByUser.email,
              }
            : null,
        },
        bookingDate: transaction.createdAt,
      };
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Attendees list fetched successfully",
      {
        event: {
          _id: event._id,
          eventTitle: event.eventTitle,
          startDate: event.startDate,
          endDate: event.endDate,
        },
        totalAttendees: attendees.length,
        totalCheckedInTickets: attendees.reduce(
          (sum, a) => sum + a.tickets.checkedInQty,
          0
        ),
        attendees,
      }
    );
  } catch (error) {
    console.error("Error in getEventAttendeesList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 7. Get Event Attendee Statistics (Organizer)
const getEventAttendeeStats = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    // Find event and verify ownership
    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    // Check if user is the organizer or admin
    if (
      event.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== 1 // SUPER_ADMIN
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You don't have permission to view this event's statistics"
      );
    }

    // Get all paid transactions for this event
    const transactions = await Transaction.find({
      eventId: event._id,
      status: "PAID",
    })
      .populate("userId", "firstName lastName email")
      .sort({ createdAt: -1 });

    // Calculate statistics
    const totalBookings = transactions.length;
    const totalTicketsSold = transactions.reduce((sum, t) => sum + t.qty, 0);
    const totalTicketsCheckedIn = transactions.reduce(
      (sum, t) => sum + (t.checkedInQty || 0),
      0
    );
    const totalTicketsPending = totalTicketsSold - totalTicketsCheckedIn;
    const fullyCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) >= t.qty
    ).length;
    const partiallyCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) > 0 && (t.checkedInQty || 0) < t.qty
    ).length;
    const notCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) === 0
    ).length;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Attendee statistics fetched", {
      event: {
        _id: event._id,
        eventTitle: event.eventTitle,
        startDate: event.startDate,
        endDate: event.endDate,
        totalTickets: event.totalTickets,
        ticketQtyAvailable: event.ticketQtyAvailable,
      },
      statistics: {
        totalAttendees: event.totalAttendees || 0,
        totalBookings,
        totalTicketsSold,
        totalTicketsCheckedIn,
        totalTicketsPending,
        fullyCheckedInBookings,
        partiallyCheckedInBookings,
        notCheckedInBookings,
      },
      transactions: transactions.map((t) => ({
        _id: t._id,
        bookingId: t.bookingId,
        userId: t.userId,
        qty: t.qty,
        checkedInQty: t.checkedInQty || 0,
        isFullyCheckedIn: (t.checkedInQty || 0) >= t.qty,
        checkedInAt: t.checkedInAt,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error in getEventAttendeeStats:", error);
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

// QR Code Scanning (Gate Keeper - Organizer or Admin)
router.post(
  "/scan-qr",
  perApiLimiter(),
  checkRole([roleId.ORGANISER, roleId.SUPER_ADMIN]),
  validateRequest(scanQRCodeSchema),
  scanQRCode
);

// Get Event Attendees List (Organizer or Admin)
router.get(
  "/event/:eventId/attendees",
  perApiLimiter(),
  checkRole([roleId.ORGANISER, roleId.SUPER_ADMIN]),
  getEventAttendeesList
);

// Get Event Attendee Statistics (Organizer or Admin)
router.get(
  "/event/:eventId/stats",
  perApiLimiter(),
  checkRole([roleId.ORGANISER, roleId.SUPER_ADMIN]),
  getEventAttendeeStats
);

module.exports = router;
