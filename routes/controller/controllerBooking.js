require("dotenv").config();
const express = require("express");
const router = express.Router();
const {
  User,
  Event,
  Transaction,
  Tax,
  PromoCode,
  Course,
  GlobalSetting,
  Attendee,
  WalletHistory,
} = require("../../db");
const CONSTANTS = require("../../utils/constants");
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
    const { eventId, courseId, scheduleId, qty, discountCode } = req.body;
    const userId = req.user.userId;

    let targetItem;
    let baseTicketPrice;
    let bookingType;

    if (eventId) {
      targetItem = await Event.findById(eventId);
      if (!targetItem) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
      }
      if (targetItem.ticketQtyAvailable < qty) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Not enough tickets available",
        );
      }
      baseTicketPrice = targetItem.ticketPrice;
      bookingType = "EVENT";
    } else if (courseId) {
      targetItem = await Course.findById(courseId);
      if (!targetItem) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Course not found");
      }
      const schedule = targetItem.schedules.id(scheduleId);
      if (!schedule) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Schedule not found");
      }
      if (targetItem.totalSeats - schedule.presentCount < qty) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Not enough seats available",
        );
      }
      baseTicketPrice = targetItem.price;
      bookingType = "COURSE";
    } else {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Either eventId or courseId must be provided",
      );
    }

    // Calculate Base Price
    const basePrice = roundToTwo(baseTicketPrice * qty);
    let finalAmount = basePrice;
    let discountAmount = 0;
    let taxAmount = 0;

    // Apply Discount Code (reused logic)
    if (discountCode) {
      const code = await PromoCode.findOne({
        code: discountCode,
        active: true,
      });

      if (!code) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Invalid discount code",
        );
      }

      const now = new Date();
      if (now < code.validFrom || now > code.validUntil) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Discount code expired",
        );
      }

      if (code.maxUsage > 0 && code.usedCount >= code.maxUsage) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Discount code usage limit exceeded",
        );
      }

      if (code.discountType === "percentage") {
        discountAmount = roundToTwo((basePrice * code.discountValue) / 100);
      } else {
        discountAmount = roundToTwo(code.discountValue);
      }

      if (discountAmount > basePrice) discountAmount = basePrice;
      finalAmount -= discountAmount;
    }

    // Apply Taxes (reused logic)
    const taxes = await Tax.find({ active: true });
    const appliedTaxIds = [];

    taxes.forEach((tax) => {
      let taxVal = 0;
      if (tax.type === "percentage") {
        taxVal = roundToTwo((finalAmount * tax.value) / 100);
      } else {
        taxVal = roundToTwo(tax.value);
      }
      taxAmount += taxVal;
      appliedTaxIds.push(tax._id);
    });

    taxAmount = roundToTwo(taxAmount);
    finalAmount = roundToTwo(finalAmount + taxAmount);

    const bookingId = `BNDY-${Math.floor(100000 + Math.random() * 900000)}`;

    const transactionData = {
      userId,
      bookingId,
      qty,
      basePrice,
      discountAmount,
      taxAmount,
      totalAmount: finalAmount,
      discountCode: discountCode || null,
      appliedTaxIds,
      status: "PENDING",
      bookingType,
    };

    if (bookingType === "EVENT") {
      transactionData.eventId = eventId;
    } else {
      transactionData.courseId = courseId;
      transactionData.scheduleId = scheduleId;
    }

    const transaction = new Transaction(transactionData);
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
    const { eventId, courseId, scheduleId, qty, discountCode } = req.body;

    let targetItem;
    let baseTicketPrice;

    if (eventId) {
      targetItem = await Event.findById(eventId);
      if (!targetItem) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
      }
      if (targetItem.ticketQtyAvailable < qty) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Not enough tickets available",
        );
      }
      baseTicketPrice = targetItem.ticketPrice;
    } else if (courseId) {
      targetItem = await Course.findById(courseId);
      if (!targetItem) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Course not found");
      }
      const schedule = targetItem.schedules.id(scheduleId);
      if (!schedule) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Schedule not found");
      }
      if (targetItem.totalSeats - schedule.presentCount < qty) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Not enough seats available",
        );
      }

      baseTicketPrice = targetItem.price;
    }

    // Calculate Base Price
    const basePrice = roundToTwo(baseTicketPrice * qty);
    let finalAmount = basePrice;
    let discountAmount = 0;
    let taxAmount = 0;
    // Apply Discount Code (reused logic from existing calculateBooking)
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
        if (discountAmount > basePrice) discountAmount = basePrice;
        finalAmount -= discountAmount;
      }
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
        appliedTaxes,
      },
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
    })
      .populate("eventId")
      .populate("courseId");

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Transaction not found");
    }

    if (transaction.status === "PAID") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Transaction already paid",
      );
    }

    if (transaction.status === "CANCELLED" || transaction.status === "FAILED") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Transaction is in invalid state to pay",
      );
    }

    // Verify availability and reduce inventory atomically
    if (transaction.bookingType === "EVENT") {
      const updatedEvent = await Event.findOneAndUpdate(
        {
          _id: transaction.eventId._id,
          ticketQtyAvailable: { $gte: transaction.qty },
        },
        { $inc: { ticketQtyAvailable: -transaction.qty } },
        { new: true },
      );

      if (!updatedEvent) {
        transaction.status = "REFUND_INITIATED";
        await transaction.save();
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          "Tickets no longer available. Refund initiated.",
          { transaction: transaction.toObject() },
        );
      }
    } else if (transaction.bookingType === "COURSE") {
      // Calculate max allowed attendees based on total seats
      const totalSeats = transaction.courseId.totalSeats;
      const maxPresentCount = totalSeats - transaction.qty;

      const updatedCourse = await Course.findOneAndUpdate(
        {
          _id: transaction.courseId._id,
          schedules: {
            $elemMatch: {
              _id: transaction.scheduleId,
              presentCount: { $lte: maxPresentCount },
            },
          },
        },
        { $inc: { "schedules.$[elem].presentCount": transaction.qty } },
        {
          arrayFilters: [{ "elem._id": transaction.scheduleId }],
          new: true,
        },
      );

      if (!updatedCourse) {
        // Double check if it was just because of seats or something else
        const courseCheck = await Course.findById(transaction.courseId._id);
        const scheduleCheck = courseCheck?.schedules.id(transaction.scheduleId);

        if (
          scheduleCheck &&
          courseCheck.totalSeats - scheduleCheck.presentCount <
          transaction.qty
        ) {
          transaction.status = "REFUND_INITIATED";
          await transaction.save();
          return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            "Seats no longer available. Refund initiated.",
            { transaction: transaction.toObject() },
          );
        }
      }
    }

    // Calculate Commission and Earnings
    let commissionPercentage = 0;

    const globalConfig = await GlobalSetting.findOne({
      key: process.env.COMMISSION_CONFIG,
    });
    if (globalConfig && globalConfig.value) {
      if (transaction.bookingType === "EVENT") {
        commissionPercentage = globalConfig.value.eventCommission || 0;
      } else {
        commissionPercentage = globalConfig.value.courseCommission || 0;
      }
    }

    const netBasePrice = transaction.basePrice - transaction.discountAmount;

    const commissionAmount = roundToTwo(
      netBasePrice * (commissionPercentage / 100),
    );
    const organizerEarning = roundToTwo(netBasePrice - commissionAmount);

    // Update Transaction to PAID
    transaction.status = "PAID";
    transaction.paymentId = `MOCK_PAY_${Date.now()}`;
    transaction.qrCodeData = generateQRData(transaction._id, userId);
    transaction.commissionAmount = commissionAmount;
    transaction.organizerEarning = organizerEarning;
    await transaction.save();

    // Update Organizer Earning Status
    const item = transaction.eventId || transaction.courseId;
    const organizerId = item.createdBy;
    await User.findByIdAndUpdate(organizerId, {
      $inc: {
        totalEarnings: organizerEarning,
        payoutBalance: organizerEarning,
      },
    });

    // Create Wallet History Entry
    const walletEntry = new WalletHistory({
      userId: organizerId,
      amount: organizerEarning,
      type: "TICKET_SALE",
      transactionId: transaction._id,
      balanceAfter: (await User.findById(organizerId)).payoutBalance, // Fetch fresh or calculate
      description: `Ticket Sale: ${transaction.bookingType === "EVENT"
        ? transaction.eventId.eventTitle || "Event"
        : transaction.courseId.courseTitle || "Course"
        }`,
    });
    await walletEntry.save();

    if (transaction.discountCode) {
      await PromoCode.updateOne(
        { code: transaction.discountCode },
        { $inc: { usedCount: 1 } },
      );
    }

    const transactionObj = transaction.toObject();

    // Format URLs for Event or Course
    if (transaction.bookingType === "EVENT" && transactionObj.eventId) {
      const event = transactionObj.eventId;
      event.posterImage = (event.posterImage || []).map(formatResponseUrl);
      event.mediaLinks = (event.mediaLinks || []).map(formatResponseUrl);
      event.shortTeaserVideo = (event.shortTeaserVideo || []).map(
        formatResponseUrl,
      );
    } else if (
      transaction.bookingType === "COURSE" &&
      transactionObj.courseId
    ) {
      const course = transactionObj.courseId;
      course.posterImage = (course.posterImage || []).map(formatResponseUrl);
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Payment successful. Booking confirmed.",
      {
        transaction: transactionObj,
      },
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
    const { type } = req.query;

    const filter = { userId, status: "PAID" };
    const transactions = await Transaction.find(filter)
      .populate("eventId")
      .populate("courseId")
      .sort({ createdAt: -1 });

    const now = new Date();
    const result = transactions.filter((t) => {
      const item = t.eventId || t.courseId;
      if (!item) return false;

      let endDate;
      if (t.bookingType === "EVENT") {
        endDate = item.endDate;
      } else {
        const schedule = item.schedules.id(t.scheduleId);
        endDate = schedule ? schedule.endDate : item.createdAt; // fallback
      }

      if (type === "upcoming") return new Date(endDate) >= now;
      if (type === "past") return new Date(endDate) < now;
      return true;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket list fetched", {
      tickets: result,
    });
  } catch (error) {
    console.error("Error in getTicketList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getTicketDetail = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId,
    })
      .populate("eventId")
      .populate("courseId")
      .populate("userId");

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found");
    }

    const transactionObj = transaction.toObject();
    if (transaction.bookingType === "EVENT" && transactionObj.eventId) {
      const event = transactionObj.eventId;
      event.posterImage = (event.posterImage || []).map(formatResponseUrl);
      event.mediaLinks = (event.mediaLinks || []).map(formatResponseUrl);
      event.shortTeaserVideo = (event.shortTeaserVideo || []).map(
        formatResponseUrl,
      );
    } else if (
      transaction.bookingType === "COURSE" &&
      transactionObj.courseId
    ) {
      const course = transactionObj.courseId;
      course.posterImage = (course.posterImage || []).map(formatResponseUrl);
    }

    // const checkInStatus = {
    //   checkedInQty: transaction.checkedInQty || 0,
    //   totalQty: transaction.qty,
    //   remainingQty: transaction.qty - (transaction.checkedInQty || 0),
    //   isFullyCheckedIn: (transaction.checkedInQty || 0) >= transaction.qty,
    //   checkedInAt: transaction.checkedInAt,
    // };

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket detail fetched", {
      ticket: { ...transactionObj },
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

    const qrParts = qrCodeData.split("-");
    if (qrParts.length < 4 || qrParts[0] !== "TICKET") {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "Invalid QR code format",
        data: null,
      });
    }

    const transactionId = qrParts[1];
    const transaction = await Transaction.findById(transactionId)
      .populate("eventId")
      .populate("courseId")
      .populate("userId");

    if (!transaction) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "Transaction not found",
        data: null,
      });
    }

    if (transaction.qrCodeData !== qrCodeData) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "QR code mismatch",
        data: null,
      });
    }

    if (transaction.status !== "PAID") {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: `Ticket status: ${transaction.status}`,
        data: { transactionId: transaction._id, status: transaction.status },
      });
    }

    const item = transaction.eventId || transaction.courseId;
    if (!item) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "INVALID",
        message: "Event or Course not found",
        data: null,
      });
    }

    const now = new Date();
    let endDate;
    let title;

    if (transaction.bookingType === "EVENT") {
      endDate = item.endDate;
      title = item.eventTitle;
    } else {
      const schedule = item.schedules.id(transaction.scheduleId);
      endDate = schedule ? schedule.endDate : item.createdAt;
      title = item.courseTitle;
    }

    if (new Date(endDate) < now) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "EXPIRED",
        message: "Booking has expired",
        data: { transactionId: transaction._id, title, endDate },
      });
    }

    if (transaction.checkedInQty >= transaction.qty) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
        status: "ALREADY_CHECKED_IN",
        message: "All tickets checked in",
        data: { transactionId: transaction._id, totalQty: transaction.qty },
      });
    }

    const newCheckedInQty = (transaction.checkedInQty || 0) + 1;
    transaction.checkedInQty = newCheckedInQty;
    transaction.isCheckedIn = newCheckedInQty >= transaction.qty;
    if (newCheckedInQty === 1) transaction.checkedInAt = now;
    transaction.checkedInBy = gateKeeperId;
    await transaction.save();

    // ✅ Sync with Attendee table
    const currentAttendees = await Attendee.find({
      transactionId: transaction._id,
    });
    if (currentAttendees.length > 0) {
      // If individual tickets exist, mark the first available one as checked in?
      // Or just mark all if it's a TICKET- scan. TICKET- usually means the whole transaction.
      // But let's be more precise: if it's a TICKET- scan, we mark ONE more as checked in if possible.
      const firstAvailable = await Attendee.findOne({
        transactionId: transaction._id,
        isCheckedIn: false,
      });
      if (firstAvailable) {
        firstAvailable.isCheckedIn = true;
        firstAvailable.checkedInAt = now;
        firstAvailable.checkedInBy = gateKeeperId;
        await firstAvailable.save();
      }
    } else {
      // If no attendees exist, auto-create the first one (or all)
      // For simplicity and consistency with controllerAttendee.js,
      // let's create a placeholder attendee if none exist to make the flow robust.
      const ticketNumber = `TKT-AUTO-${transaction._id.toString().slice(-4)}-${newCheckedInQty}`;
      const newAttendee = new Attendee({
        transactionId: transaction._id,
        eventId: transaction.eventId
          ? transaction.eventId._id || transaction.eventId
          : null,
        courseId: transaction.courseId
          ? transaction.courseId._id || transaction.courseId
          : null,
        scheduleId: transaction.scheduleId || null,
        userId: transaction?.userId?._id || transaction?.userId,
        firstName: transaction?.userId?.firstName || "Guest", // Fallback
        lastName:
          transaction?.userId?.lastName || `Attendee ${newCheckedInQty}`,
        email: transaction?.userId?.email || "guest@example.com",
        ticketNumber,
        isCheckedIn: true,
        checkedInAt: now,
        qrCodeData,
        checkedInBy: gateKeeperId,
      });
      await newAttendee.save();
    }

    if (transaction.bookingType === "EVENT") {
      await Event.findByIdAndUpdate(item._id, { $inc: { totalAttendees: 1 } });
    } else {
      await Course.updateOne(
        { _id: item._id, "schedules._id": transaction.scheduleId },
        { $inc: { "schedules.$.presentCount": 1 } },
      );
    }

    const itemObj = item.toObject ? item.toObject() : item;
    itemObj.posterImage = (itemObj.posterImage || []).map(formatResponseUrl);

    return apiSuccessRes(HTTP_STATUS.OK, res, "QR code scanned", {
      status: "OK",
      message: "Checked in successfully",
      data: {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        totalQty: transaction.qty,
        checkedInQty: newCheckedInQty,
        remainingQty: transaction.qty - newCheckedInQty,
        item: {
          _id: item._id,
          title,
          posterImage: itemObj.posterImage,
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
      req.user.roleId !== roleId.SUPER_ADMIN // SUPER_ADMIN
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You don't have permission to view this event's attendees",
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
        "firstName lastName email profileImage contactNumber countryCode",
      )
      .populate("checkedInBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    // Filter for fully checked in if needed
    let filteredTransactions = transactions;
    if (status === "fully-checked-in") {
      filteredTransactions = transactions.filter(
        (t) => (t.checkedInQty || 0) >= t.qty,
      );
    } else if (status === "partial") {
      filteredTransactions = transactions.filter(
        (t) => (t.checkedInQty || 0) > 0 && (t.checkedInQty || 0) < t.qty,
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
          0,
        ),
        attendees,
      },
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
      req.user.roleId !== roleId.SUPER_ADMIN // SUPER_ADMIN
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You don't have permission to view this event's statistics",
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
      0,
    );
    const totalTicketsPending = totalTicketsSold - totalTicketsCheckedIn;
    const fullyCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) >= t.qty,
    ).length;
    const partiallyCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) > 0 && (t.checkedInQty || 0) < t.qty,
    ).length;
    const notCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) === 0,
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
  initiateBooking,
);

router.post(
  "/calculate",
  perApiLimiter(),
  validateRequest(initiateBookingSchema), // Reusing initiate schema as inputs are same
  calculateBooking,
);

router.post(
  "/confirm-payment",
  perApiLimiter(),
  validateRequest(confirmPaymentSchema),
  confirmPayment,
);

router.get("/list", perApiLimiter(), getTicketList);
router.get("/detail/:transactionId", perApiLimiter(), getTicketDetail);

// QR Code Scanning (Gate Keeper - Organizer or Admin)
router.post(
  "/scan-qr",
  perApiLimiter(),
  checkRole([roleId.ORGANISER, roleId.SUPER_ADMIN]),
  validateRequest(scanQRCodeSchema),
  scanQRCode,
);

// Get Event Attendees List (Organizer or Admin)
router.get(
  "/event/:eventId/attendees",
  perApiLimiter(),
  checkRole([roleId.ORGANISER, roleId.SUPER_ADMIN]),
  getEventAttendeesList,
);

// Get Event Attendee Statistics (Organizer or Admin)
router.get(
  "/event/:eventId/stats",
  perApiLimiter(),
  checkRole([roleId.ORGANISER, roleId.SUPER_ADMIN]),
  getEventAttendeeStats,
);

module.exports = router;
