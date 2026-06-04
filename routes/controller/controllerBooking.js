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
  Wishlist,
} = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const {
  initiateBookingSchema,
  confirmPaymentSchema,
  cancelBookingSchema,
  cancelEventSchema,
  cancelCourseSchema,
  scanQRCodeSchema,
} = require("../services/validations/bookingValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId, userRole, refundPolicy: refundPolicyEnum } = require("../../utils/Role");
const constantsMessage = require("../../utils/constantsMessage");
const {
  notifyBookingConfirmed,
  notifyOrganizerNewBooking,
} = require("../services/serviceNotification");

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const generateQRData = (transactionId, userId) =>
  `TICKET-${transactionId}-${userId}-${Date.now()}`;

const generateBookingId = () =>
  `BNDY-${Math.floor(100000 + Math.random() * 900000)}`;

/**
 * Count PAID tickets for a given event ticketId
 */
const getEventTicketBookedCount = async (eventId, ticketId) => {
  const result = await Transaction.aggregate([
    {
      $match: {
        eventId: eventId,
        status: "PAID",
        $or: [
          { ticketId: String(ticketId) },
          { "tickets.ticketId": String(ticketId) },
        ],
      },
    },
    {
      $project: {
        quantity: {
          $cond: {
            if: { $isArray: "$tickets" },
            then: {
              $reduce: {
                input: "$tickets",
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $cond: [
                        { $eq: ["$$this.ticketId", String(ticketId)] },
                        "$$this.qty",
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            else: {
              $cond: [
                { $eq: ["$ticketId", String(ticketId)] },
                "$qty",
                0,
              ],
            },
          },
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$quantity" } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
};

/**
 * Count PAID seats for a given course batchId
 */
const getCourseBatchBookedCount = async (courseId, batchId) => {
  const result = await Transaction.aggregate([
    {
      $match: {
        courseId: courseId,
        status: "PAID",
        $or: [
          { batchId: String(batchId) },
          { "ongoingSlots.batchId": String(batchId) }
        ]
      },
    },
    { $group: { _id: null, total: { $sum: "$qty" } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
};

/**
 * Apply promo code and return discount details
 */
const applyPromoCode = async (discountCode, basePrice) => {
  let discountAmount = 0;
  let promoApplied = false;
  let promoMessage = "";

  if (!discountCode) return { discountAmount, promoApplied, promoMessage };

  const code = await PromoCode.findOne({ code: discountCode, active: true });

  if (!code) {
    return { discountAmount: 0, promoApplied: false, promoMessage: constantsMessage.INVALID_OR_EXPIRED_PROMO };
  }

  const now = new Date();
  const isValid =
    now >= code.validFrom &&
    now <= code.validUntil &&
    !(code.maxUsage > 0 && code.usedCount >= code.maxUsage);

  if (!isValid) {
    return { discountAmount: 0, promoApplied: false, promoMessage: constantsMessage.INVALID_OR_EXPIRED_PROMO };
  }

  if (code.discountType === "percentage") {
    discountAmount = roundToTwo((basePrice * code.discountValue) / 100);
  } else {
    discountAmount = roundToTwo(code.discountValue);
  }

  if (discountAmount > basePrice) discountAmount = basePrice;
  promoApplied = true;
  promoMessage = constantsMessage.PROMO_APPLIED;

  return { discountAmount, promoApplied, promoMessage };
};

/**
 * Apply active taxes and return tax details
 */
const applyTaxes = async (amountAfterDiscount) => {
  const taxes = await Tax.find({ active: true });
  const appliedTaxIds = [];
  const appliedTaxes = [];
  let taxAmount = 0;

  taxes.forEach((tax) => {
    let taxVal = 0;
    if (tax.type === "percentage") {
      taxVal = roundToTwo((amountAfterDiscount * tax.value) / 100);
    } else {
      taxVal = roundToTwo(tax.value);
    }
    taxAmount += taxVal;
    appliedTaxIds.push(tax._id);
    appliedTaxes.push({ ...tax.toObject(), calculatedAmount: taxVal });
  });

  taxAmount = roundToTwo(taxAmount);
  return { taxAmount, appliedTaxIds, appliedTaxes };
};

/**
 * Resolve the event or course item from a transaction, and determine the organizer
 */
const resolveBookingItem = (transaction) => {
  const item = transaction.eventId || transaction.courseId;
  const organizerId = item?.createdBy?._id || item?.createdBy;
  const itemTitle =
    transaction.bookingType === "EVENT"
      ? item?.eventTitle || "Event"
      : item?.courseTitle || "Course";
  return { item, organizerId, itemTitle };
};

/**
 * Calculate commission + organizer earning from transaction
 */
const calculateCommission = async (transaction) => {
  let commissionPercentage = 0;
  const globalConfig = await GlobalSetting.findOne({ key: "COMMISSION_CONFIG" });
  if (globalConfig && globalConfig.value) {
    commissionPercentage = parseFloat(globalConfig.value) || 0;
  }

  const netBasePrice = transaction.basePrice - transaction.discountAmount;
  const commissionAmount = roundToTwo(netBasePrice * (commissionPercentage / 100));
  const organizerEarning = roundToTwo(netBasePrice - commissionAmount);

  return { commissionAmount, organizerEarning };
};

/**
 * Credit organizer wallet + create wallet history entry
 */
const creditOrganizerWallet = async (organizerId, earning, transaction, itemTitle) => {
  await User.findByIdAndUpdate(organizerId, {
    $inc: { totalEarnings: earning, payoutBalance: earning },
  });

  const freshOrganizer = await User.findById(organizerId);
  const walletEntry = new WalletHistory({
    userId: organizerId,
    amount: earning,
    type: transaction.bookingType === "COURSE" ? "COURSE_SALE" : "TICKET_SALE",
    transactionId: transaction._id,
    balanceAfter: freshOrganizer.payoutBalance,
    description: `${transaction.bookingType === "COURSE" ? "Course" : "Ticket"} Sale: ${itemTitle}`,
  });
  await walletEntry.save();
};

/**
 * Deduct organizer wallet on refund + create wallet history entry
 */
const deductOrganizerWallet = async (organizerId, amount, transaction, reason) => {
  await User.findByIdAndUpdate(organizerId, {
    $inc: { totalEarnings: -amount, payoutBalance: -amount },
  });

  const freshOrganizer = await User.findById(organizerId);
  const walletEntry = new WalletHistory({
    userId: organizerId,
    amount: -amount,
    type: "CANCELLATION_DEDUCTION",
    transactionId: transaction._id,
    balanceAfter: freshOrganizer.payoutBalance,
    description: `Cancellation Deduction: ${reason || "Booking cancelled"}`,
  });
  await walletEntry.save();
};

/**
 * Check refund eligibility based on refund policy and event/course start date
 */
const checkRefundEligibility = (refundPolicyValue, startDate) => {
  const now = new Date();
  const start = new Date(startDate);
  const hoursUntilStart = (start - now) / (1000 * 60 * 60);

  if (refundPolicyValue === refundPolicyEnum.NO_REFUND) {
    return { eligible: false, refundPercentage: 0 };
  }
  if (refundPolicyValue === refundPolicyEnum.ONE_DAY_BEFORE) {
    return hoursUntilStart >= 24
      ? { eligible: true, refundPercentage: 100 }
      : { eligible: false, refundPercentage: 0 };
  }
  if (refundPolicyValue === refundPolicyEnum.SEVEN_DAYS_BEFORE) {
    return hoursUntilStart >= 168 // 7 * 24
      ? { eligible: true, refundPercentage: 100 }
      : { eligible: false, refundPercentage: 0 };
  }

  // Default: no refund
  return { eligible: false, refundPercentage: 0 };
};

/**
 * Format media URLs on an event or course object
 */
const formatItemMedia = (tObj, bookingType) => {
  if (bookingType === "EVENT" && tObj.eventId) {
    const ev = tObj.eventId;
    ev.posterImage = (ev.posterImage || []).map(formatResponseUrl);
    ev.mediaLinks = (ev.mediaLinks || []).map(formatResponseUrl);
    ev.shortTeaserVideo = (ev.shortTeaserVideo || []).map(formatResponseUrl);
    if (ev.eventCategory?.image) {
      ev.eventCategory.image = formatResponseUrl(ev.eventCategory.image);
    }
    if (ev.createdBy?.profileImage) {
      ev.createdBy.profileImage = formatResponseUrl(ev.createdBy.profileImage);
    }
  } else if (bookingType === "COURSE" && tObj.courseId) {
    const co = tObj.courseId;
    co.posterImage = (co.posterImage || []).map(formatResponseUrl);
    if (co.courseCategory?.image) {
      co.courseCategory.image = formatResponseUrl(co.courseCategory.image);
    }
    if (co.createdBy?.profileImage) {
      co.createdBy.profileImage = formatResponseUrl(co.createdBy.profileImage);
    }
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 1. CALCULATE BOOKING (Preview — No Transaction Created)
// ════════════════════════════════════════════════════════════════════════════

const calculateBooking = async (req, res) => {
  try {
    const { eventId, courseId, batchId, ticketId, qty, tickets, discountCode, ongoingSlots, selectedDay } = req.body;

    let basePrice = 0;
    let ticketName = null;

    // ── EVENT BOOKING ──
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);
      if (event.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.EVENT_NOT_ACTIVE);

      if (tickets && Array.isArray(tickets) && tickets.length > 0) {
        for (const item of tickets) {
          const ticket = event.tickets.id(item.ticketId);
          if (!ticket) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, `Ticket type not found for ticketId: ${item.ticketId}`);

          const now = new Date();
          if (ticket.salesStart && now < new Date(ticket.salesStart)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Sales not started for ticket type: ${ticket.ticketName}`);
          }
          if (ticket.salesEnd && now > new Date(ticket.salesEnd)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Sales ended for ticket type: ${ticket.ticketName}`);
          }

          const bookedCount = await getEventTicketBookedCount(event._id, item.ticketId);
          const available = ticket.qty - bookedCount;
          if (available < item.qty) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Not enough tickets available for: ${ticket.ticketName}`);
          }

          basePrice += roundToTwo(ticket.price * item.qty);
        }
      } else {
        let ticket = event.tickets.id(ticketId);
        if (!ticket && event.tickets.length > 0) {
          ticket = event.tickets[0];
          ticketId = ticket._id.toString();
        }
        if (!ticket) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_TYPE_NOT_FOUND);

        const now = new Date();
        if (ticket.salesStart && now < new Date(ticket.salesStart)) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TICKET_SALES_NOT_STARTED);
        }
        if (ticket.salesEnd && now > new Date(ticket.salesEnd)) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TICKET_SALES_ENDED);
        }

        const bookedCount = await getEventTicketBookedCount(event._id, ticketId);
        const available = ticket.qty - bookedCount;
        if (available < qty) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.NOT_ENOUGH_TICKETS_FOR_TYPE);
        }

        basePrice = roundToTwo(ticket.price * qty);
        ticketName = ticket.ticketName;
      }
    }
    // ── COURSE BOOKING ──
    else if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);
      if (course.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.COURSE_NOT_ACTIVE);

      if (course.enrollmentType === "Ongoing") {
        const slotsToValidate = ongoingSlots && ongoingSlots.length > 0
          ? ongoingSlots
          : (batchId ? [{ batchId, selectedDay }] : []);

        if (slotsToValidate.length === 0) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one ongoing slot is required");
        }

        for (const slot of slotsToValidate) {
          const batch = course.batches.id(slot.batchId);
          if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, `Batch not found: ${slot.batchId}`);
          if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch inactive: ${batch.batchName || slot.batchId}`);

          const bookedCount = await getCourseBatchBookedCount(course._id, slot.batchId);
          const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
          if (available < qty) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch full: ${batch.batchName || slot.batchId}`);
          }
        }
      } else {
        const batch = course.batches.id(batchId);
        if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);
        if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_INACTIVE);

        const bookedCount = await getCourseBatchBookedCount(course._id, batchId);
        const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
        if (available < qty) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_FULL);
        }
      }

      basePrice = roundToTwo(course.price * qty);
    } else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.EVENT_OR_COURSE_ID_REQUIRED);
    }

    // Calculate pricing
    const { discountAmount, promoApplied, promoMessage } = await applyPromoCode(discountCode, basePrice);
    let finalAmount = roundToTwo(basePrice - discountAmount);

    const { taxAmount, appliedTaxes } = await applyTaxes(finalAmount);
    finalAmount = roundToTwo(finalAmount + taxAmount);

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_CALCULATION_SUCCESS, {
      ticketName,
      breakdown: {
        basePrice: roundToTwo(basePrice),
        discountAmount: roundToTwo(discountAmount),
        taxAmount: roundToTwo(taxAmount),
        totalAmount: roundToTwo(finalAmount),
        promoApplied,
        promoMessage,
      },
      appliedTaxes: appliedTaxes.map((tax) => ({
        ...tax,
        value: roundToTwo(tax.value),
        calculatedAmount: roundToTwo(tax.calculatedAmount),
      })),
    });
  } catch (error) {
    console.error("Error in calculateBooking:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 2. INITIATE BOOKING (Create Pending Transaction)
// ════════════════════════════════════════════════════════════════════════════

const initiateBooking = async (req, res) => {
  try {
    const { eventId, courseId, batchId, ticketId, qty, tickets, discountCode, ongoingSlots, selectedDay } = req.body;
    const userId = req.user.userId;

    let bookingType;
    let totalBasePrice = 0;
    const ticketItems = [];

    // ── EVENT BOOKING ──
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);
      if (event.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.EVENT_NOT_ACTIVE);

      bookingType = "EVENT";

      if (tickets && Array.isArray(tickets) && tickets.length > 0) {
        for (const item of tickets) {
          const ticket = event.tickets.id(item.ticketId);
          if (!ticket) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, `Ticket type not found for ticketId: ${item.ticketId}`);

          const now = new Date();
          if (ticket.salesStart && now < new Date(ticket.salesStart)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Sales not started for ticket type: ${ticket.ticketName}`);
          }
          if (ticket.salesEnd && now > new Date(ticket.salesEnd)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Sales ended for ticket type: ${ticket.ticketName}`);
          }

          const bookedCount = await getEventTicketBookedCount(event._id, item.ticketId);
          const available = ticket.qty - bookedCount;
          if (available < item.qty) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Not enough tickets available for: ${ticket.ticketName}`);
          }

          const base = roundToTwo(ticket.price * item.qty);
          totalBasePrice += base;
          ticketItems.push({
            ticketId: item.ticketId,
            ticketName: ticket.ticketName,
            qty: item.qty,
            basePrice: base,
          });
        }
      } else {
        let ticket = event.tickets.id(ticketId);
        if (!ticket && event.tickets.length > 0) {
          ticket = event.tickets[0];
          ticketId = ticket._id.toString();
        }
        if (!ticket) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_TYPE_NOT_FOUND);

        const now = new Date();
        if (ticket.salesStart && now < new Date(ticket.salesStart)) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TICKET_SALES_NOT_STARTED);
        }
        if (ticket.salesEnd && now > new Date(ticket.salesEnd)) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TICKET_SALES_ENDED);
        }

        const bookedCount = await getEventTicketBookedCount(event._id, ticketId);
        const available = ticket.qty - bookedCount;
        if (available < qty) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.NOT_ENOUGH_TICKETS_FOR_TYPE);
        }

        const base = roundToTwo(ticket.price * qty);
        totalBasePrice = base;
        ticketItems.push({
          ticketId,
          ticketName: ticket.ticketName,
          qty,
          basePrice: base,
        });
      }
    }
    // ── COURSE BOOKING ──
    else if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);
      if (course.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.COURSE_NOT_ACTIVE);

      if (course.enrollmentType === "Ongoing") {
        if (!ongoingSlots || ongoingSlots.length === 0) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one ongoing slot selection is required");
        }

        for (const slot of ongoingSlots) {
          const batch = course.batches.id(slot.batchId);
          if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, `Batch not found: ${slot.batchId}`);
          if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch inactive: ${batch.batchName || slot.batchId}`);

          const bookedCount = await getCourseBatchBookedCount(course._id, slot.batchId);
          const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
          if (available < qty) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch full: ${batch.batchName || slot.batchId}`);
          }
        }
      } else {
        const batch = course.batches.id(batchId);
        if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);
        if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_INACTIVE);

        const bookedCount = await getCourseBatchBookedCount(course._id, batchId);
        const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
        if (available < qty) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_FULL);
        }
      }

      totalBasePrice = roundToTwo(course.price * qty);
      bookingType = "COURSE";
    } else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.EVENT_OR_COURSE_ID_REQUIRED);
    }

    // Calculate pricing
    let totalDiscountAmount = 0;
    if (discountCode) {
      const code = await PromoCode.findOne({ code: discountCode, active: true });
      if (!code) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OR_EXPIRED_PROMO);
      }

      const now = new Date();
      if (now < code.validFrom || now > code.validUntil) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OR_EXPIRED_PROMO);
      }
      if (code.maxUsage > 0 && code.usedCount >= code.maxUsage) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OR_EXPIRED_PROMO);
      }

      if (code.discountType === "percentage") {
        totalDiscountAmount = roundToTwo((totalBasePrice * code.discountValue) / 100);
      } else {
        totalDiscountAmount = roundToTwo(code.discountValue);
      }
      if (totalDiscountAmount > totalBasePrice) totalDiscountAmount = totalBasePrice;
    }

    let remainingAmount = roundToTwo(totalBasePrice - totalDiscountAmount);
    const { taxAmount: totalTaxAmount, appliedTaxIds } = await applyTaxes(remainingAmount);
    const totalFinalAmount = roundToTwo(remainingAmount + totalTaxAmount);

    if (bookingType === "EVENT") {
      const transactionData = {
        userId,
        bookingId: generateBookingId(),
        qty: ticketItems.reduce((sum, item) => sum + item.qty, 0),
        basePrice: totalBasePrice,
        discountAmount: totalDiscountAmount,
        taxAmount: totalTaxAmount,
        totalAmount: totalFinalAmount,
        discountCode: discountCode || null,
        appliedTaxIds,
        status: "PENDING",
        bookingType,
        eventId,
        ticketId: ticketItems[0].ticketId,
        ticketName: ticketItems.map(t => `${t.ticketName} (x${t.qty})`).join(", "),
        tickets: ticketItems,
      };

      const transaction = new Transaction(transactionData);
      await transaction.save();

      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_INITIATED, {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        breakdown: {
          basePrice: roundToTwo(totalBasePrice),
          discountAmount: roundToTwo(totalDiscountAmount),
          taxAmount: roundToTwo(totalTaxAmount),
          totalAmount: roundToTwo(totalFinalAmount),
        },
      });
    } else {
      const isOngoing = ongoingSlots && ongoingSlots.length > 0;
      const transactionData = {
        userId,
        bookingId: generateBookingId(),
        qty,
        basePrice: totalBasePrice,
        discountAmount: totalDiscountAmount,
        taxAmount: totalTaxAmount,
        totalAmount: totalFinalAmount,
        discountCode: discountCode || null,
        appliedTaxIds,
        status: "PENDING",
        bookingType,
        courseId,
        batchId: isOngoing ? ongoingSlots[0].batchId : batchId,
        selectedDay: isOngoing ? ongoingSlots[0].selectedDay : (selectedDay || null),
        ongoingSlots: isOngoing ? ongoingSlots : [],
      };

      const transaction = new Transaction(transactionData);
      await transaction.save();

      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_INITIATED, {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        breakdown: {
          basePrice: roundToTwo(totalBasePrice),
          discountAmount: roundToTwo(totalDiscountAmount),
          taxAmount: roundToTwo(totalTaxAmount),
          totalAmount: roundToTwo(totalFinalAmount),
        },
      });
    }
  } catch (error) {
    console.error("Error in initiateBooking:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 3. CONFIRM PAYMENT (Mock Payment Gateway)
// ════════════════════════════════════════════════════════════════════════════

const confirmPayment = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({ _id: transactionId, userId })
      .populate("eventId")
      .populate("courseId");

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TRANSACTION_NOT_FOUND);
    }
    if (transaction.status === "PAID") {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TRANSACTION_ALREADY_PAID);
    }
    if (["CANCELLED", "FAILED", "REFUNDED"].includes(transaction.status)) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_TRANSACTION_STATE);
    }

    // ── Verify availability atomically ──
    if (transaction.bookingType === "EVENT") {
      const event = transaction.eventId;
      if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);

      const ticketsToCheck = transaction.tickets && transaction.tickets.length > 0
        ? transaction.tickets
        : [{ ticketId: transaction.ticketId, qty: transaction.qty, ticketName: transaction.ticketName }];

      for (const item of ticketsToCheck) {
        const ticket = event.tickets.id(item.ticketId);
        if (!ticket) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_TYPE_NOT_FOUND);

        const bookedCount = await getEventTicketBookedCount(event._id, item.ticketId);
        if (ticket.qty - bookedCount < item.qty) {
          transaction.status = "REFUND_INITIATED";
          await transaction.save();
          return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_INITIATED_TICKETS, {
            transaction: transaction.toObject(),
          });
        }
      }
    } else if (transaction.bookingType === "COURSE") {
      const course = transaction.courseId;
      if (!course) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);

      const slotsToCheck = transaction.ongoingSlots && transaction.ongoingSlots.length > 0
        ? transaction.ongoingSlots
        : [{ batchId: transaction.batchId }];

      for (const slot of slotsToCheck) {
        const batch = course.batches.id(slot.batchId);
        if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);

        const bookedCount = await getCourseBatchBookedCount(course._id, slot.batchId);
        const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
        if (available < transaction.qty) {
          transaction.status = "REFUND_INITIATED";
          await transaction.save();
          return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_INITIATED_SEATS, {
            transaction: transaction.toObject(),
          });
        }
      }
    }

    // ── Commission & Earnings ──
    const { commissionAmount, organizerEarning } = await calculateCommission(transaction);

    // ── Update Transaction to PAID ──
    transaction.status = "PAID";
    transaction.paymentId = `MOCK_PAY_${Date.now()}`;
    transaction.qrCodeData = generateQRData(transaction._id, userId);
    transaction.commissionAmount = commissionAmount;
    transaction.organizerEarning = organizerEarning;
    await transaction.save();

    // ── Credit Organizer ──
    const { item, organizerId, itemTitle } = resolveBookingItem(transaction);
    await creditOrganizerWallet(organizerId, organizerEarning, transaction, itemTitle);

    // ── Notifications (non-blocking) ──
    notifyBookingConfirmed(
      userId,
      transaction.bookingType,
      itemTitle,
      String(transaction._id),
    ).catch((e) => console.error("[Notification] notifyBookingConfirmed:", e));

    const buyer = await User.findById(userId).select("firstName lastName");
    const buyerName = buyer ? `${buyer.firstName} ${buyer.lastName}` : "A customer";
    notifyOrganizerNewBooking(
      String(organizerId),
      buyerName,
      transaction.bookingType,
      itemTitle,
      String(item?._id),
    ).catch((e) => console.error("[Notification] notifyOrganizerNewBooking:", e));

    // ── Increment promo code usage ──
    if (transaction.discountCode) {
      await PromoCode.updateOne(
        { code: transaction.discountCode },
        { $inc: { usedCount: 1 } },
      );
    }

    // ── Format response ──
    const transactionObj = transaction.toObject();
    formatItemMedia(transactionObj, transaction.bookingType);

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_CONFIRMED, {
      transaction: transactionObj,
    });
  } catch (error) {
    console.error("Error in confirmPayment:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 4. CANCEL BOOKING (User cancels their own booking)
// ════════════════════════════════════════════════════════════════════════════

const cancelBooking = async (req, res) => {
  try {
    const { transactionId, reason } = req.body;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({ _id: transactionId, userId })
      .populate("eventId")
      .populate("courseId");

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TRANSACTION_NOT_FOUND);
    }
    if (["CANCELLED", "REFUND_INITIATED", "REFUNDED"].includes(transaction.status)) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.ALREADY_CANCELLED);
    }
    if (transaction.status !== "PAID") {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_TRANSACTION_STATE);
    }
    if (transaction.isCheckedIn || transaction.checkedInQty > 0) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.CANNOT_CANCEL_CHECKED_IN);
    }

    // Determine the item & refund policy
    const { item, organizerId, itemTitle } = resolveBookingItem(transaction);
    if (!item) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);
    }

    // Check if event/course has already ended
    const now = new Date();
    let startDate, endDate;
    if (transaction.bookingType === "EVENT") {
      startDate = item.startDate;
      endDate = item.endDate;
    } else {
      startDate = item.startDate;
      endDate = item.endDate;
    }

    if (endDate && new Date(endDate) < now) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.CANNOT_CANCEL_PAST);
    }

    // Check refund policy
    const policyValue = item.refundPolicy || refundPolicyEnum.NO_REFUND;
    const { eligible, refundPercentage } = checkRefundEligibility(policyValue, startDate);

    const refundAmount = eligible
      ? roundToTwo(transaction.totalAmount * (refundPercentage / 100))
      : 0;

    // Update transaction
    transaction.status = refundAmount > 0 ? "REFUNDED" : "CANCELLED";
    transaction.refundAmount = refundAmount;
    transaction.refundReason = reason || "User cancelled";
    transaction.cancelledAt = now;
    transaction.cancelledBy = userId;
    if (refundAmount > 0) {
      transaction.refundedAt = now;
    }
    await transaction.save();

    // If refund, deduct from organizer wallet
    if (refundAmount > 0 && transaction.organizerEarning > 0) {
      await deductOrganizerWallet(
        organizerId,
        transaction.organizerEarning,
        transaction,
        `User cancelled booking for ${itemTitle}`,
      );
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_CANCELLED, {
      transactionId: transaction._id,
      bookingId: transaction.bookingId,
      status: transaction.status,
      refundAmount,
      refundPolicy: policyValue,
      refundEligible: eligible,
    });
  } catch (error) {
    console.error("Error in cancelBooking:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 5. CANCEL EVENT (Organizer/Admin cancels entire event — bulk refund)
// ════════════════════════════════════════════════════════════════════════════

const cancelEvent = async (req, res) => {
  try {
    const { eventId, reason } = req.body;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);

    if (event.status === "Cancelled") {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Event is already cancelled");
    }

    // Authorization check
    if (
      event.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, constantsMessage.CANCEL_EVENT_UNAUTHORIZED);
    }

    // Cancel the event
    event.status = "Cancelled";
    await event.save();

    // Cancel all PENDING transactions for this event so they cannot be paid
    await Transaction.updateMany(
      { eventId: event._id, status: "PENDING", bookingType: "EVENT" },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: userId,
          refundReason: reason || "Event cancelled by organizer"
        }
      }
    );

    // Delete attendee records associated with the event
    await Attendee.deleteMany({ eventId: event._id });

    // Remove event from user wishlists
    await Wishlist.deleteMany({ entityId: event._id, entityModel: "Event" });

    // Find all PAID transactions for this event
    const paidTransactions = await Transaction.find({
      eventId: event._id,
      status: "PAID",
      bookingType: "EVENT",
    });

    let totalRefunded = 0;
    let refundedCount = 0;
    const organizerId = event.createdBy;

    for (const txn of paidTransactions) {
      const refundAmount = txn.totalAmount;

      txn.status = "REFUNDED";
      txn.refundAmount = refundAmount;
      txn.refundReason = reason || "Event cancelled by organizer";
      txn.cancelledAt = new Date();
      txn.cancelledBy = userId;
      txn.refundedAt = new Date();
      await txn.save();

      // Deduct from organizer wallet
      if (txn.organizerEarning > 0) {
        await deductOrganizerWallet(
          organizerId,
          txn.organizerEarning,
          txn,
          `Event cancelled: ${event.eventTitle}`,
        );
      }

      totalRefunded += refundAmount;
      refundedCount++;
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EVENT_CANCELLED, {
      eventId: event._id,
      eventTitle: event.eventTitle,
      totalBookingsRefunded: refundedCount,
      totalAmountRefunded: roundToTwo(totalRefunded),
    });
  } catch (error) {
    console.error("Error in cancelEvent:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 6. CANCEL COURSE / BATCH (Organizer/Admin cancels course or specific batch)
// ════════════════════════════════════════════════════════════════════════════

const cancelCourse = async (req, res) => {
  try {
    const { courseId, batchId, reason } = req.body;
    const userId = req.user.userId;

    const course = await Course.findById(courseId);
    if (!course) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);

    // Authorization check
    if (
      course.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, constantsMessage.CANCEL_COURSE_UNAUTHORIZED);
    }

    let filter = { courseId: course._id, status: "PAID", bookingType: "COURSE" };
    let cancelMessage;

    if (batchId) {
      // Cancel specific batch
      const batch = course.batches.id(batchId);
      if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);

      batch.status = "Cancelled";
      await course.save();

      // Cancel PENDING transactions for this batch
      await Transaction.updateMany(
        {
          courseId: course._id,
          status: "PENDING",
          bookingType: "COURSE",
          $or: [
            { batchId: String(batchId) },
            { "ongoingSlots.batchId": String(batchId) }
          ]
        },
        {
          $set: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledBy: userId,
            refundReason: reason || "Batch cancelled by organizer"
          }
        }
      );

      // Delete attendee records for this batch
      await Attendee.deleteMany({ courseId: course._id, batchId: String(batchId) });

      filter = {
        ...filter,
        $or: [
          { batchId: String(batchId) },
          { "ongoingSlots.batchId": String(batchId) }
        ]
      };
      cancelMessage = constantsMessage.BATCH_CANCELLED;
    } else {
      // Cancel entire course
      course.status = "Cancelled";
      // Cancel all active batches too
      course.batches.forEach((b) => {
        if (b.status === "Active") b.status = "Cancelled";
      });
      await course.save();

      // Cancel all PENDING transactions for this course
      await Transaction.updateMany(
        { courseId: course._id, status: "PENDING", bookingType: "COURSE" },
        {
          $set: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledBy: userId,
            refundReason: reason || "Course cancelled by organizer"
          }
        }
      );

      // Delete attendee records for the course
      await Attendee.deleteMany({ courseId: course._id });

      // Remove course from user wishlists
      await Wishlist.deleteMany({ entityId: course._id, entityModel: "Course" });

      cancelMessage = constantsMessage.COURSE_CANCELLED;
    }

    // Find all PAID transactions
    const paidTransactions = await Transaction.find(filter);

    let totalRefunded = 0;
    let refundedCount = 0;
    const organizerId = course.createdBy;

    for (const txn of paidTransactions) {
      const refundAmount = txn.totalAmount;

      txn.status = "REFUNDED";
      txn.refundAmount = refundAmount;
      txn.refundReason = reason || (batchId ? "Batch cancelled by organizer" : "Course cancelled by organizer");
      txn.cancelledAt = new Date();
      txn.cancelledBy = userId;
      txn.refundedAt = new Date();
      await txn.save();

      if (txn.organizerEarning > 0) {
        await deductOrganizerWallet(
          organizerId,
          txn.organizerEarning,
          txn,
          `${batchId ? "Batch" : "Course"} cancelled: ${course.courseTitle}`,
        );
      }

      totalRefunded += refundAmount;
      refundedCount++;
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, cancelMessage, {
      courseId: course._id,
      courseTitle: course.courseTitle,
      batchId: batchId || null,
      totalBookingsRefunded: refundedCount,
      totalAmountRefunded: roundToTwo(totalRefunded),
    });
  } catch (error) {
    console.error("Error in cancelCourse:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 7. GET TICKET LIST (User's bookings)
// ════════════════════════════════════════════════════════════════════════════

const getTicketList = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, bookingType } = req.query;

    const filter = { userId, status: { $in: ["PAID", "CANCELLED", "REFUNDED"] } };
    if (bookingType) filter.bookingType = bookingType;

    const transactions = await Transaction.find(filter)
      .populate({
        path: "eventId",
        populate: [
          { path: "eventCategory", model: "Category" },
          { path: "createdBy", model: "User", select: "firstName lastName email profileImage roleId" },
        ],
      })
      .populate({
        path: "courseId",
        populate: [
          { path: "courseCategory", model: "Category" },
          { path: "createdBy", model: "User", select: "firstName lastName email profileImage roleId" },
        ],
      })
      .sort({ createdAt: -1 });

    const now = new Date();
    const filtered = transactions.filter((t) => {
      const item = t.eventId || t.courseId;
      if (!item) return false;

      const endDate = item.endDate;

      if (type === "upcoming") return endDate && new Date(endDate) >= now;
      if (type === "past") return endDate && new Date(endDate) < now;
      return true;
    });

    const tickets = filtered.map((t) => {
      const tObj = t.toObject();
      formatItemMedia(tObj, t.bookingType);

      if (tObj.userId?.profileImage) {
        tObj.userId.profileImage = formatResponseUrl(tObj.userId.profileImage);
      }

      return tObj;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TICKET_LIST_FETCHED, { tickets });
  } catch (error) {
    console.error("Error in getTicketList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 8. GET TICKET DETAIL
// ════════════════════════════════════════════════════════════════════════════

const getTicketDetail = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({ _id: transactionId, userId })
      .populate({
        path: "userId",
        populate: { path: "categories", model: "Category" },
      })
      .populate({
        path: "eventId",
        populate: [
          { path: "eventCategory", model: "Category" },
          { path: "createdBy", model: "User", select: "firstName lastName email profileImage" },
        ],
      })
      .populate({
        path: "courseId",
        populate: [
          { path: "courseCategory", model: "Category" },
          { path: "createdBy", model: "User", select: "firstName lastName email profileImage" },
        ],
      });

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_NOT_FOUND);
    }

    const transactionObj = transaction.toObject();
    formatItemMedia(transactionObj, transaction.bookingType);

    if (transactionObj.userId?.profileImage) {
      transactionObj.userId.profileImage = formatResponseUrl(transactionObj.userId.profileImage);
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TICKET_DETAIL_FETCHED, {
      ticket: transactionObj,
    });
  } catch (error) {
    console.error("Error in getTicketDetail:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 9. SCAN QR CODE (Gate Keeper)
// ════════════════════════════════════════════════════════════════════════════

const scanQRCode = async (req, res) => {
  try {
    const { qrCodeData } = req.body;
    const gateKeeperId = req.user.userId;

    const qrParts = qrCodeData.split("-");
    if (qrParts.length < 4 || qrParts[0] !== "TICKET") {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
        status: "INVALID",
        message: "Invalid QR code format",
        data: null,
      });
    }

    const txnId = qrParts[1];
    const transaction = await Transaction.findById(txnId)
      .populate("eventId")
      .populate("courseId")
      .populate("userId");

    if (!transaction) {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
        status: "INVALID",
        message: "Transaction not found",
        data: null,
      });
    }

    if (transaction.qrCodeData !== qrCodeData) {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
        status: "INVALID",
        message: "QR code mismatch",
        data: null,
      });
    }

    if (transaction.status !== "PAID") {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
        status: "INVALID",
        message: `Ticket status: ${transaction.status}`,
        data: { transactionId: transaction._id, status: transaction.status },
      });
    }

    const item = transaction.eventId || transaction.courseId;
    if (!item) {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
        status: "INVALID",
        message: "Event or Course not found",
        data: null,
      });
    }

    const now = new Date();
    const endDate = item.endDate;
    const title = transaction.bookingType === "EVENT" ? item.eventTitle : item.courseTitle;

    if (endDate && new Date(endDate) < now) {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
        status: "EXPIRED",
        message: "Booking has expired",
        data: { transactionId: transaction._id, title, endDate },
      });
    }

    if (transaction.checkedInQty >= transaction.qty) {
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
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

    // Sync with Attendee table
    const currentAttendees = await Attendee.find({ transactionId: transaction._id });
    if (currentAttendees.length > 0) {
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
      const ticketQueue = [];
      if (transaction.tickets && transaction.tickets.length > 0) {
        for (const t of transaction.tickets) {
          for (let j = 0; j < t.qty; j++) {
            ticketQueue.push({ ticketId: t.ticketId, ticketName: t.ticketName });
          }
        }
      } else {
        for (let j = 0; j < transaction.qty; j++) {
          ticketQueue.push({ ticketId: transaction.ticketId, ticketName: transaction.ticketName });
        }
      }
      const ticketInfo = ticketQueue[newCheckedInQty - 1] || { ticketId: transaction.ticketId, ticketName: transaction.ticketName };

      const ticketNumber = `TKT-AUTO-${transaction._id.toString().slice(-4)}-${newCheckedInQty}`;
      const newAttendee = new Attendee({
        transactionId: transaction._id,
        eventId: transaction.eventId ? transaction.eventId._id || transaction.eventId : null,
        courseId: transaction.courseId ? transaction.courseId._id || transaction.courseId : null,
        batchId: transaction.batchId || null,
        userId: transaction?.userId?._id || transaction?.userId,
        firstName: transaction?.userId?.firstName || "Guest",
        lastName: transaction?.userId?.lastName || `Attendee ${newCheckedInQty}`,
        email: transaction?.userId?.email || "guest@example.com",
        ticketNumber,
        isCheckedIn: true,
        checkedInAt: now,
        qrCodeData,
        checkedInBy: gateKeeperId,
        ticketId: ticketInfo.ticketId,
        ticketName: ticketInfo.ticketName,
      });
      await newAttendee.save();
    }

    const itemObj = item.toObject ? item.toObject() : item;
    itemObj.posterImage = (itemObj.posterImage || []).map(formatResponseUrl);

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.QR_SCANNED, {
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


// ════════════════════════════════════════════════════════════════════════════
// 10. GET EVENT ATTENDEES LIST (Organizer)
// ════════════════════════════════════════════════════════════════════════════

const getEventAttendeesList = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);

    if (
      event.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, "You don't have permission to view this event's attendees");
    }

    let filter = { eventId: event._id, status: "PAID" };
    if (status === "checked-in") filter.checkedInQty = { $gt: 0 };
    else if (status === "not-checked-in") {
      filter.$or = [{ checkedInQty: { $exists: false } }, { checkedInQty: 0 }];
    }

    const transactions = await Transaction.find(filter)
      .populate("userId", "firstName lastName email profileImage contactNumber countryCode roleId")
      .populate("checkedInBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    let filteredTransactions = transactions;
    if (status === "fully-checked-in") {
      filteredTransactions = transactions.filter((t) => (t.checkedInQty || 0) >= t.qty);
    } else if (status === "partial") {
      filteredTransactions = transactions.filter(
        (t) => (t.checkedInQty || 0) > 0 && (t.checkedInQty || 0) < t.qty,
      );
    }

    const attendees = filteredTransactions.map((transaction) => {
      const user = transaction.userId;
      const checkedInByUser = transaction.checkedInBy;

      return {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        ticketName: transaction.ticketName,
        user: {
          _id: user?._id,
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          profileImage: user?.profileImage ? formatResponseUrl(user.profileImage) : null,
          contactNumber: user?.contactNumber,
          countryCode: user?.countryCode,
          userRole: user?.roleId ? userRole[user.roleId] : null,
        },
        tickets: {
          totalQty: transaction.qty,
          checkedInQty: transaction.checkedInQty || 0,
          remainingQty: transaction.qty - (transaction.checkedInQty || 0),
          isFullyCheckedIn: (transaction.checkedInQty || 0) >= transaction.qty,
          details: (transaction.tickets && transaction.tickets.length > 0)
            ? transaction.tickets.map((t) => ({
                ticketId: t.ticketId,
                ticketName: t.ticketName,
                qty: t.qty,
                price: t.qty ? roundToTwo(t.basePrice / t.qty) : 0,
                totalPrice: t.basePrice,
              }))
            : [
                {
                  ticketId: transaction.ticketId,
                  ticketName: transaction.ticketName,
                  qty: transaction.qty,
                  price: transaction.qty ? roundToTwo(transaction.basePrice / transaction.qty) : 0,
                  totalPrice: transaction.basePrice,
                },
              ],
        },
        checkInInfo: {
          checkedInAt: transaction.checkedInAt,
          checkedInBy: checkedInByUser
            ? { _id: checkedInByUser._id, firstName: checkedInByUser.firstName, lastName: checkedInByUser.lastName, email: checkedInByUser.email }
            : null,
        },
        bookingDate: transaction.createdAt,
      };
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.ATTENDEE_LIST_FETCHED, {
      event: {
        _id: event._id,
        eventTitle: event.eventTitle,
        startDate: event.startDate,
        endDate: event.endDate,
      },
      totalAttendees: attendees.length,
      totalCheckedInTickets: attendees.reduce((sum, a) => sum + a.tickets.checkedInQty, 0),
      attendees,
    });
  } catch (error) {
    console.error("Error in getEventAttendeesList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 11. GET EVENT ATTENDEE STATS (Organizer)
// ════════════════════════════════════════════════════════════════════════════

const getEventAttendeeStats = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);

    if (
      event.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, "You don't have permission to view this event's statistics");
    }

    const transactions = await Transaction.find({ eventId: event._id, status: "PAID" })
      .populate("userId", "firstName lastName email roleId")
      .sort({ createdAt: -1 });

    const totalBookings = transactions.length;
    const totalTicketsSold = transactions.reduce((sum, t) => sum + t.qty, 0);
    const totalTicketsCheckedIn = transactions.reduce((sum, t) => sum + (t.checkedInQty || 0), 0);
    const totalTicketsPending = totalTicketsSold - totalTicketsCheckedIn;
    const fullyCheckedInBookings = transactions.filter((t) => (t.checkedInQty || 0) >= t.qty).length;
    const partiallyCheckedInBookings = transactions.filter(
      (t) => (t.checkedInQty || 0) > 0 && (t.checkedInQty || 0) < t.qty,
    ).length;
    const notCheckedInBookings = transactions.filter((t) => (t.checkedInQty || 0) === 0).length;

    // Query checked-in attendee counts grouped by ticketId
    const attendees = await Attendee.find({ eventId: event._id, isCheckedIn: true }).select("ticketId transactionId").lean();
    const checkedInMap = {};
    for (const att of attendees) {
      let key = att.ticketId;
      if (!key) {
        // Fallback: find transaction root ticketId
        const txnObj = transactions.find(t => String(t._id) === String(att.transactionId));
        key = txnObj ? txnObj.ticketId : "unknown";
      }
      if (key) {
        checkedInMap[key] = (checkedInMap[key] || 0) + 1;
      }
    }

    // Per-ticket-type breakdown
    const ticketBreakdown = {};
    for (const t of transactions) {
      if (t.tickets && t.tickets.length > 0) {
        for (const item of t.tickets) {
          const key = item.ticketId || "unknown";
          if (!ticketBreakdown[key]) {
            ticketBreakdown[key] = { ticketId: key, ticketName: item.ticketName || "Unknown", totalSold: 0, totalCheckedIn: 0 };
          }
          ticketBreakdown[key].totalSold += item.qty;
        }
      } else {
        const key = t.ticketId || "unknown";
        if (!ticketBreakdown[key]) {
          ticketBreakdown[key] = { ticketId: key, ticketName: t.ticketName || "Unknown", totalSold: 0, totalCheckedIn: 0 };
        }
        ticketBreakdown[key].totalSold += t.qty;
      }
    }

    // Populate checkedIn count for each ticket type in the breakdown
    for (const key of Object.keys(ticketBreakdown)) {
      ticketBreakdown[key].totalCheckedIn = checkedInMap[key] || 0;
    }

    // Total tickets available across all ticket types
    const totalTicketsAvailable = event.tickets.reduce((sum, tk) => sum + tk.qty, 0);

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.ATTENDEE_STATS_FETCHED, {
      event: {
        _id: event._id,
        eventTitle: event.eventTitle,
        startDate: event.startDate,
        endDate: event.endDate,
        totalTicketsAvailable,
      },
      statistics: {
        totalBookings,
        totalTicketsSold,
        totalTicketsCheckedIn,
        totalTicketsPending,
        fullyCheckedInBookings,
        partiallyCheckedInBookings,
        notCheckedInBookings,
      },
      ticketBreakdown: Object.values(ticketBreakdown),
      transactions: transactions.map((t) => ({
        _id: t._id,
        bookingId: t.bookingId,
        userId: t.userId,
        ticketName: t.ticketName,
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


// ════════════════════════════════════════════════════════════════════════════
// 12. GET RECENT BOOKINGS (Organizer or Admin)
// ════════════════════════════════════════════════════════════════════════════

const getRecentBookings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      organizerId,
      eventId,
      courseId,
      status,
      bookingType,
      limit = 10,
      page = 1,
    } = req.query;

    let filter = {};

    if (bookingType) {
      filter.bookingType = bookingType;
    } else {
      filter.bookingType = { $in: ["EVENT", "COURSE"] };
    }

    if (status) filter.status = status;

    if (req.user.roleId === roleId.ORGANIZER) {
      const [myEvents, myCourses] = await Promise.all([
        Event.find({ createdBy: userId }).select("_id"),
        Course.find({ createdBy: userId }).select("_id"),
      ]);

      const myEventIds = myEvents.map((e) => e._id);
      const myCourseIds = myCourses.map((c) => c._id);

      let scopeFilter = {
        $or: [
          { eventId: { $in: myEventIds } },
          { courseId: { $in: myCourseIds } },
        ],
      };

      if (eventId) filter.eventId = eventId;
      if (courseId) filter.courseId = courseId;

      filter = { $and: [filter, scopeFilter] };
    } else if (req.user.roleId === roleId.SUPER_ADMIN) {
      if (organizerId) {
        const [orgEvents, orgCourses] = await Promise.all([
          Event.find({ createdBy: organizerId }).select("_id"),
          Course.find({ createdBy: organizerId }).select("_id"),
        ]);
        const orgEventIds = orgEvents.map((e) => e._id);
        const orgCourseIds = orgCourses.map((c) => c._id);

        filter.$or = [
          { eventId: { $in: orgEventIds } },
          { courseId: { $in: orgCourseIds } },
        ];
      }

      if (eventId) filter.eventId = eventId;
      if (courseId) filter.courseId = courseId;
    } else {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, constantsMessage.UNAUTHORIZED_ACCESS);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .populate("userId", "firstName lastName email profileImage contactNumber countryCode roleId")
        .populate({
          path: "eventId",
          select: "eventTitle eventCategory startDate endDate posterImage createdBy",
          populate: [
            { path: "eventCategory", select: "name" },
            { path: "createdBy", select: "firstName lastName email" },
          ],
        })
        .populate({
          path: "courseId",
          select: "courseTitle courseCategory posterImage createdBy",
          populate: [
            { path: "courseCategory", select: "name" },
            { path: "createdBy", select: "firstName lastName email" },
          ],
        })
        .populate("promotionPackageId", "packageName price duration")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter),
    ]);

    const formattedBookings = transactions.map((t) => {
      const u = t.userId;
      let itemName = "Unknown Item";
      let categoryName = null;

      if (t.bookingType === "EVENT" && t.eventId) {
        itemName = t.eventId.eventTitle;
        categoryName = t.eventId.eventCategory?.name || null;
      } else if (t.bookingType === "COURSE" && t.courseId) {
        itemName = t.courseId.courseTitle;
        categoryName = t.courseId.courseCategory?.name || null;
      } else if (t.bookingType === "PROMOTION" && t.promotionPackageId) {
        itemName = t.promotionPackageId.packageName;
      }

      return {
        _id: t._id,
        userName: u ? `${u.firstName} ${u.lastName}`.trim() : "Guest",
        userProfileImage: u && u.profileImage ? formatResponseUrl(u.profileImage) : null,
        totalTickets: t.qty,
        ticketName: t.ticketName,
        eventName: itemName,
        categoryName,
        bookingDate: t.createdAt,
        status: t.status,
        userId: u?._id,
        userRole: u?.roleId ? userRole[u.roleId] : null,
      };
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.RECENT_BOOKINGS_FETCHED, {
      bookings: formattedBookings,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("Error in getRecentBookings:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 13. GET PUBLIC TICKET DETAIL
// ════════════════════════════════════════════════════════════════════════════

const getPublicTicketDetail = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findById(transactionId)
      .populate({ path: "userId", select: "firstName lastName email profileImage" })
      .populate({
        path: "eventId",
        populate: [
          { path: "eventCategory", model: "Category" },
          { path: "createdBy", model: "User", select: "firstName lastName email profileImage" },
        ],
      })
      .populate({
        path: "courseId",
        populate: [
          { path: "courseCategory", model: "Category" },
          { path: "createdBy", model: "User", select: "firstName lastName email profileImage" },
        ],
      });

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_NOT_FOUND);
    }

    const transactionObj = transaction.toObject();
    formatItemMedia(transactionObj, transaction.bookingType);

    if (transactionObj.userId?.profileImage) {
      transactionObj.userId.profileImage = formatResponseUrl(transactionObj.userId.profileImage);
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PUBLIC_TICKET_DETAIL_FETCHED, {
      ticket: transactionObj,
    });
  } catch (error) {
    console.error("Error in getPublicTicketDetail:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 14. GENERATE TICKET URLS (Share & Download)
// ════════════════════════════════════════════════════════════════════════════

const generateTicketUrls = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.userId;

    const transaction = await Transaction.findOne({ _id: transactionId, userId });
    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_NOT_FOUND_OR_UNAUTHORIZED);
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://bondy-user.tasksplan.com";
    const shareUrl = `${frontendUrl}/public/ticket?id=${transactionId}`;
    const downloadUrl = `${frontendUrl}/public/ticket?id=${transactionId}&download=true`;

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TICKET_URLS_GENERATED, {
      shareUrl,
      downloadUrl,
    });
  } catch (error) {
    console.error("Error in generateTicketUrls:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Booking Flow
router.post("/calculate", validateRequest(initiateBookingSchema), calculateBooking);
router.post("/initiate", perApiLimiter(), validateRequest(initiateBookingSchema), initiateBooking);
router.post("/confirm-payment", perApiLimiter(), validateRequest(confirmPaymentSchema), confirmPayment);

// Ticket Management
router.get("/list", perApiLimiter(), getTicketList);
router.get("/detail/:transactionId", perApiLimiter(), getTicketDetail);

// Cancellation & Refund
router.post("/cancel", perApiLimiter(), validateRequest(cancelBookingSchema), cancelBooking);
router.post(
  "/cancel-event",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(cancelEventSchema),
  cancelEvent,
);
router.post(
  "/cancel-course",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(cancelCourseSchema),
  cancelCourse,
);

// Recent Bookings (Organizer/Admin)
router.get(
  "/recent",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  getRecentBookings,
);

// Public Ticket APIs
router.get("/public/detail/:transactionId", getPublicTicketDetail);
router.get("/public/generate-urls/:transactionId", generateTicketUrls);

// QR Code Scanning (Gate Keeper)
router.post(
  "/scan-qr",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(scanQRCodeSchema),
  scanQRCode,
);

// Event Attendees (Organizer/Admin)
router.get(
  "/event/:eventId/attendees",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  getEventAttendeesList,
);
router.get(
  "/event/:eventId/stats",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  getEventAttendeeStats,
);

module.exports = router;
