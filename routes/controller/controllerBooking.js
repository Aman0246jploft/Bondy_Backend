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
  CancellationReason,
} = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction"); const {
  initiateBookingSchema,
  confirmPaymentSchema,
  cancelBookingSchema,
  cancelEventSchema,
  cancelCourseSchema,
  scanQRCodeSchema,
  adjustCourseReservedSeatsSchema,
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
const getCourseBatchBookedCount = async (courseId, batchId, selectedDay = null) => {
  const match = {
    courseId: courseId,
    status: "PAID",
  };
  if (selectedDay) {
    match.$or = [
      { batchId: String(batchId), selectedDate: selectedDay },
      { batchId: String(batchId), selectedDay: selectedDay },
      { "ongoingSlots": { $elemMatch: { batchId: String(batchId), selectedDate: selectedDay } } },
      { "ongoingSlots": { $elemMatch: { batchId: String(batchId), selectedDay: selectedDay } } }
    ];
  } else {
    match.$or = [
      { batchId: String(batchId) },
      { "ongoingSlots.batchId": String(batchId) }
    ];
  }
  const result = await Transaction.aggregate([
    { $match: match },
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

/**
 * Check if the course booking cut-off time has been reached
 */
const isBookingCutOffReached = (course, batch, selectedDay) => {
  if (!course.bookingCutOff) return false;

  const match = course.bookingCutOff.match(/^(\d+)h$/i);
  if (!match) return false;
  const cutOffHours = parseInt(match[1], 10);
  const cutOffMs = cutOffHours * 60 * 60 * 1000;

  const now = new Date();
  let sessionStart = null;

  if (course.enrollmentType === "Ongoing" && selectedDay && batch?.startTime) {
    let targetDate = null;
    if (String(selectedDay).includes("-")) {
      targetDate = new Date(selectedDay);
    } else {
      const daysMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const cleanDay = String(selectedDay).substring(0, 3);
      const targetDay = daysMap[cleanDay];
      if (targetDay !== undefined) {
        targetDate = new Date();
        const currentDay = now.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd < 0) {
          daysToAdd += 7;
        }
        targetDate.setDate(now.getDate() + daysToAdd);
        if (daysToAdd === 0) {
          const [hours, minutes] = batch.startTime.split(":").map(Number);
          const temp = new Date(targetDate);
          temp.setHours(hours, minutes, 0, 0);
          if (temp < now) {
            targetDate.setDate(targetDate.getDate() + 7);
          }
        }
      }
    }

    if (targetDate) {
      sessionStart = targetDate;
      const [hours, minutes] = batch.startTime.split(":").map(Number);
      sessionStart.setHours(hours, minutes, 0, 0);
    }
  } else if (course.enrollmentType === "fixedStart" && course.startDate) {
    sessionStart = new Date(course.startDate);
  }

  if (sessionStart) {
    const msUntilStart = sessionStart.getTime() - now.getTime();
    if (msUntilStart < cutOffMs) {
      return true;
    }
  }

  return false;
};


// ════════════════════════════════════════════════════════════════════════════
// 1. CALCULATE BOOKING (Preview — No Transaction Created)
// ════════════════════════════════════════════════════════════════════════════

const calculateBooking = async (req, res) => {
  try {
    const { eventId, courseId, batchId, ticketId, qty, tickets, discountCode, ongoingSlots, selectedDay, passType } = req.body;

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
        const cleanOngoingSlots = Array.isArray(ongoingSlots)
          ? ongoingSlots.filter((s) => s && s.batchId && (s.selectedDay || s.selectedDate))
          : [];
        const slotsToValidate = cleanOngoingSlots.length > 0
          ? cleanOngoingSlots
          : (batchId ? [{ batchId, selectedDay, selectedDate: req.body.selectedDate }] : []);

        if (!passType && slotsToValidate.length === 0) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one ongoing slot is required");
        }

        if (slotsToValidate.length > 0) {
          for (const slot of slotsToValidate) {
            const batch = course.batches.id(slot.batchId);
            if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, `Batch not found: ${slot.batchId}`);
            if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch inactive: ${batch.batchName || slot.batchId}`);

            const dateStr = slot.selectedDate || (slot.selectedDay && slot.selectedDay.includes("-") ? slot.selectedDay : null) || req.body.selectedDate || (selectedDay && selectedDay.includes("-") ? selectedDay : null);
            if (isBookingCutOffReached(course, batch, dateStr)) {
              return apiErrorRes(
                HTTP_STATUS.BAD_REQUEST,
                res,
                `Booking is closed for slot: ${batch.batchName || slot.batchId} (cut-off time reached)`
              );
            }

            let reservedVal = batch.ReservedExternally || 0;
            if (dateStr && batch.reservedDates) {
              const resRec = batch.reservedDates.find((r) => r.date === dateStr);
              if (resRec) reservedVal = resRec.seats;
            }

            const bookedCount = await getCourseBatchBookedCount(course._id, slot.batchId, dateStr);
            const available = batch.seats - reservedVal - bookedCount;
            if (available < qty) {
              return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch full: ${batch.batchName || slot.batchId}`);
            }
          }
        }
      } else {
        const batch = course.batches.id(batchId);
        if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);
        if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_INACTIVE);

        if (isBookingCutOffReached(course, batch)) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "Booking is closed for this course (cut-off time reached)"
          );
        }

        const bookedCount = await getCourseBatchBookedCount(course._id, batchId);
        const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
        if (available < qty) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_FULL);
        }
      }

      if (course.enrollmentType === "Ongoing") {
        const cleanOngoingSlots = Array.isArray(ongoingSlots)
          ? ongoingSlots.filter((s) => s && s.batchId && s.selectedDay)
          : [];
        const slotsCount = cleanOngoingSlots.length > 0
          ? cleanOngoingSlots.length
          : ((batchId && (selectedDay || req.body.selectedDay)) ? 1 : 0);

        let passPrice = 0;
        let passName = "";
        if (passType === "1_month") {
          if (!course.oneMonthPassEnabled) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "1 Month Pass is not enabled for this class");
          }
          passPrice = roundToTwo(course.oneMonthPassPrice * qty);
          passName = "1 Month Pass";
        } else if (passType === "3_month") {
          if (!course.threeMonthPassEnabled) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "3 Month Pass is not enabled for this class");
          }
          passPrice = roundToTwo(course.threeMonthPassPrice * qty);
          passName = "3 Month Pass";
        }

        let slotPrice = 0;
        let slotName = "";
        if (slotsCount > 0) {
          slotPrice = roundToTwo(course.price * slotsCount * qty);
          slotName = `${slotsCount} Session${slotsCount > 1 ? "s" : ""}`;
        }

        if (passPrice === 0 && slotPrice === 0) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one ongoing slot or pass selection is required");
        }

        basePrice = passPrice + slotPrice;
        if (passName && slotName) {
          ticketName = `${passName} + ${slotName}`;
        } else {
          ticketName = passName || slotName;
        }
      } else {
        basePrice = roundToTwo(course.price * qty);
        ticketName = "Course Enrollment";
      }
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
    const { eventId, courseId, batchId, ticketId, qty, tickets, discountCode, ongoingSlots, selectedDay, passType } = req.body;
    const userId = req.user.userId;

    let bookingType;
    let totalBasePrice = 0;
    let ticketName = null;
    const ticketItems = [];
    let event = null;
    let course = null;

    // ── EVENT BOOKING ──
    if (eventId) {
      event = await Event.findById(eventId);
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
      course = await Course.findById(courseId);
      if (!course) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);
      if (course.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.COURSE_NOT_ACTIVE);

      if (course.enrollmentType === "Ongoing") {
        const cleanOngoingSlots = Array.isArray(ongoingSlots)
          ? ongoingSlots.filter((s) => s && s.batchId && (s.selectedDay || s.selectedDate))
          : [];
        if (!passType && cleanOngoingSlots.length === 0) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one ongoing slot selection is required");
        }

        if (cleanOngoingSlots.length > 0) {
          for (const slot of cleanOngoingSlots) {
            const batch = course.batches.id(slot.batchId);
            if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, `Batch not found: ${slot.batchId}`);
            if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch inactive: ${batch.batchName || slot.batchId}`);

            const dateStr = slot.selectedDate || (slot.selectedDay && slot.selectedDay.includes("-") ? slot.selectedDay : null) || req.body.selectedDate || (selectedDay && selectedDay.includes("-") ? selectedDay : null);
            if (isBookingCutOffReached(course, batch, dateStr)) {
              return apiErrorRes(
                HTTP_STATUS.BAD_REQUEST,
                res,
                `Booking is closed for slot: ${batch.batchName || slot.batchId} (cut-off time reached)`
              );
            }

            const bookedCount = await getCourseBatchBookedCount(course._id, slot.batchId, dateStr);
            const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
            if (available < qty) {
              return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Batch full: ${batch.batchName || slot.batchId}`);
            }
          }
        }
      } else {
        const batch = course.batches.id(batchId);
        if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);
        if (batch.status === "Cancelled") return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_INACTIVE);

        if (isBookingCutOffReached(course, batch)) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "Booking is closed for this course (cut-off time reached)"
          );
        }

        const bookedCount = await getCourseBatchBookedCount(course._id, batchId);
        const available = batch.seats - (batch.ReservedExternally || 0) - bookedCount;
        if (available < qty) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.BATCH_FULL);
        }
      }

      if (course.enrollmentType === "Ongoing") {
        const cleanOngoingSlots = Array.isArray(ongoingSlots)
          ? ongoingSlots.filter((s) => s && s.batchId && (s.selectedDay || s.selectedDate))
          : [];
        const slotsCount = cleanOngoingSlots.length > 0
          ? cleanOngoingSlots.length
          : ((batchId && (selectedDay || req.body.selectedDay)) ? 1 : 0);

        let passPrice = 0;
        let passName = "";
        if (passType === "1_month") {
          if (!course.oneMonthPassEnabled) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "1 Month Pass is not enabled for this class");
          }
          passPrice = roundToTwo(course.oneMonthPassPrice * qty);
          passName = "1 Month Pass";
        } else if (passType === "3_month") {
          if (!course.threeMonthPassEnabled) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "3 Month Pass is not enabled for this class");
          }
          passPrice = roundToTwo(course.threeMonthPassPrice * qty);
          passName = "3 Month Pass";
        }

        let slotPrice = 0;
        let slotName = "";
        if (slotsCount > 0) {
          slotPrice = roundToTwo(course.price * slotsCount * qty);
          slotName = `${slotsCount} Session${slotsCount > 1 ? "s" : ""}`;
        }

        if (passPrice === 0 && slotPrice === 0) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one ongoing slot or pass selection is required");
        }

        totalBasePrice = passPrice + slotPrice;
        if (passName && slotName) {
          ticketName = `${passName} + ${slotName}`;
        } else {
          ticketName = passName || slotName;
        }
      } else {
        totalBasePrice = roundToTwo(course.price * qty);
        ticketName = "Course Enrollment";
      }
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

      if (totalFinalAmount === 0) {
        transaction.status = "PAID";
        transaction.paymentId = `FREE_BOOKING_${Date.now()}`;
        transaction.qrCodeData = generateQRData(transaction._id, userId);
        transaction.commissionAmount = 0;
        transaction.organizerEarning = 0;
      }

      await transaction.save();

      if (totalFinalAmount === 0) {
        const item = event;
        const organizerId = item.createdBy?._id || item.createdBy;
        const itemTitle = item.eventTitle || "Event";

        notifyBookingConfirmed(
          userId,
          bookingType,
          itemTitle,
          String(transaction._id),
        ).catch((e) => console.error("[Notification] notifyBookingConfirmed:", e));

        User.findById(userId).select("firstName lastName")
          .then((buyer) => {
            const buyerName = buyer ? `${buyer.firstName} ${buyer.lastName}` : "A customer";
            notifyOrganizerNewBooking(
              String(organizerId),
              buyerName,
              bookingType,
              itemTitle,
              String(item._id),
            ).catch((e) => console.error("[Notification] notifyOrganizerNewBooking:", e));
          });

        if (discountCode) {
          PromoCode.updateOne(
            { code: discountCode },
            { $inc: { usedCount: 1 } },
          ).catch((e) => console.error("[Promo] increment usage failed:", e));
        }

        const transactionObj = transaction.toObject();
        formatItemMedia(transactionObj, bookingType);

        return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_CONFIRMED, {
          transactionId: transaction._id,
          bookingId: transaction.bookingId,
          transaction: transactionObj,
        });
      }

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
      const cleanOngoingSlots = Array.isArray(ongoingSlots)
        ? ongoingSlots.filter((s) => s && s.batchId && (s.selectedDay || s.selectedDate))
        : [];
      const isOngoing = cleanOngoingSlots.length > 0;
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
        batchId: isOngoing ? cleanOngoingSlots[0].batchId : batchId,
        selectedDay: isOngoing ? cleanOngoingSlots[0].selectedDay : (selectedDay || null),
        selectedDate: isOngoing ? cleanOngoingSlots[0].selectedDate : (req.body.selectedDate || null),
        ongoingSlots: isOngoing ? cleanOngoingSlots : [],
        ticketName: ticketName || null,
        passType: passType || null,
      };

      const transaction = new Transaction(transactionData);

      if (totalFinalAmount === 0) {
        transaction.status = "PAID";
        transaction.paymentId = `FREE_BOOKING_${Date.now()}`;
        transaction.qrCodeData = generateQRData(transaction._id, userId);
        transaction.commissionAmount = 0;
        transaction.organizerEarning = 0;

        if (passType) {
          const days = passType === "1_month" ? 30 : passType === "3_month" ? 90 : null;
          if (days) {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + days);
            transaction.passExpiryDate = expiry;
          }
        }
      }

      await transaction.save();

      if (totalFinalAmount === 0) {
        const item = course;
        const organizerId = item.createdBy?._id || item.createdBy;
        const itemTitle = item.courseTitle || "Course";

        notifyBookingConfirmed(
          userId,
          bookingType,
          itemTitle,
          String(transaction._id),
        ).catch((e) => console.error("[Notification] notifyBookingConfirmed:", e));

        User.findById(userId).select("firstName lastName")
          .then((buyer) => {
            const buyerName = buyer ? `${buyer.firstName} ${buyer.lastName}` : "A customer";
            notifyOrganizerNewBooking(
              String(organizerId),
              buyerName,
              bookingType,
              itemTitle,
              String(item._id),
            ).catch((e) => console.error("[Notification] notifyOrganizerNewBooking:", e));
          });

        if (discountCode) {
          PromoCode.updateOne(
            { code: discountCode },
            { $inc: { usedCount: 1 } },
          ).catch((e) => console.error("[Promo] increment usage failed:", e));
        }

        const transactionObj = transaction.toObject();
        formatItemMedia(transactionObj, bookingType);

        return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_CONFIRMED, {
          transactionId: transaction._id,
          bookingId: transaction.bookingId,
          transaction: transactionObj,
        });
      }

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
      const transactionObj = transaction.toObject();
      formatItemMedia(transactionObj, transaction.bookingType);
      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BOOKING_CONFIRMED, {
        transaction: transactionObj,
      });
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

      const hasSlots = transaction.batchId || (transaction.ongoingSlots && transaction.ongoingSlots.length > 0);
      if (hasSlots) {
        const slotsToCheck = transaction.ongoingSlots && transaction.ongoingSlots.length > 0
          ? transaction.ongoingSlots
          : [{ batchId: transaction.batchId }];
        for (const slot of slotsToCheck) {
          const batch = course.batches.id(slot.batchId);
          if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);

          const dateStr = slot.selectedDay || transaction.selectedDay;
          let reservedVal = batch.ReservedExternally || 0;
          if (dateStr && batch.reservedDates) {
            const resRec = batch.reservedDates.find((r) => r.date === dateStr);
            if (resRec) reservedVal = resRec.seats;
          }

          const bookedCount = await getCourseBatchBookedCount(course._id, slot.batchId, dateStr);
          const available = batch.seats - reservedVal - bookedCount;
          if (available < transaction.qty) {
            transaction.status = "REFUND_INITIATED";
            await transaction.save();
            return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_INITIATED_SEATS, {
              transaction: transaction.toObject(),
            });
          }
        }
      }
    }

    // ── Commission & Earnings ──
    let commissionAmount = 0;
    let organizerEarning = 0;
    if (transaction.totalAmount > 0) {
      const commissionResult = await calculateCommission(transaction);
      commissionAmount = commissionResult.commissionAmount;
      organizerEarning = commissionResult.organizerEarning;
    }

    // ── Update Transaction to PAID ──
    transaction.status = "PAID";
    transaction.paymentId = transaction.totalAmount === 0
      ? `FREE_BOOKING_${Date.now()}`
      : `MOCK_PAY_${Date.now()}`;
    transaction.qrCodeData = generateQRData(transaction._id, userId);
    transaction.commissionAmount = commissionAmount;
    transaction.organizerEarning = organizerEarning;

    if (transaction.bookingType === "COURSE" && transaction.passType) {
      const days = transaction.passType === "1_month" ? 30 : transaction.passType === "3_month" ? 90 : null;
      if (days) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);
        transaction.passExpiryDate = expiry;
      }
    }

    await transaction.save();

    // ── Credit Organizer ──
    const { item, organizerId, itemTitle } = resolveBookingItem(transaction);
    if (organizerEarning > 0) {
      await creditOrganizerWallet(organizerId, organizerEarning, transaction, itemTitle);
    }

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
// 4. REFUND PREVIEW (Preview refund policy and amount before cancellation)
// ════════════════════════════════════════════════════════════════════════════

const previewRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
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

    const { item, organizerId, itemTitle } = resolveBookingItem(transaction);
    if (!item) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);
    }

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

    const policyValue = item.refundPolicy || refundPolicyEnum.NO_REFUND;
    const { eligible, refundPercentage } = checkRefundEligibility(policyValue, startDate);

    const refundAmount = eligible
      ? roundToTwo(transaction.totalAmount * (refundPercentage / 100))
      : 0;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Refund preview calculated successfully", {
      transactionId: transaction._id,
      bookingId: transaction.bookingId,
      totalAmount: transaction.totalAmount,
      refundPolicy: policyValue,
      eligible,
      refundPercentage,
      estimatedRefundAmount: refundAmount,
    });
  } catch (error) {
    console.error("Error in previewRefund:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 5. CANCEL BOOKING (User cancels their own booking)
// ════════════════════════════════════════════════════════════════════════════

const cancelBooking = async (req, res) => {
  try {
    const { transactionId, reason } = req.body;
    const userId = req.user.userId;

    if (reason) {
      const validReason = await CancellationReason.findOne({ reason, isActive: true });
      if (!validReason) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_CANCELLATION_REASON);
      }
    }

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


const getCancellationReasons = async (req, res) => {
  try {
    const reasons = await CancellationReason.find({ isActive: true });
    const formattedReasons = reasons.map((item) => ({
      id: item._id,
      reason: item.reason,
    }));
    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.CANCELLATION_REASONS_FETCHED,
      formattedReasons
    );
  } catch (error) {
    console.error("Error in getCancellationReasons:", error);
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
    const { courseId, batchId, date, reason } = req.body;
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
      // Cancel specific batch or a specific date of the batch
      const batch = course.batches.id(batchId);
      if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND);

      if (date) {
        // Cancel a specific date only
        if (!batch.cancelledDates) batch.cancelledDates = [];
        const alreadyCancelled = batch.cancelledDates.some((cd) => cd.date === date);
        if (alreadyCancelled) {
          return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "This specific date is already cancelled for this batch");
        }
        batch.cancelledDates.push({ date, reason: reason || "Slot cancelled by organizer" });
        await course.save();

        // Cancel PENDING transactions for this specific date
        await Transaction.updateMany(
          {
            courseId: course._id,
            status: "PENDING",
            bookingType: "COURSE",

            "ongoingSlots": { $elemMatch: { batchId: String(batchId), selectedDay: date } }
          },
          {
            $set: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancelledBy: userId,
              refundReason: reason || `Slot on ${date} cancelled by organizer`
            }
          }
        );

        // Delete attendee records for this specific date (if any)
        await Attendee.deleteMany({ courseId: course._id, batchId: String(batchId), selectedDay: date });

        filter = {
          ...filter,
          "ongoingSlots": { $elemMatch: { batchId: String(batchId), selectedDay: date } }
        };
        cancelMessage = `Batch slot on ${date} cancelled successfully`;
      } else {
        // Cancel entire batch
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
      }
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
      txn.refundReason = reason || (date ? `Slot on ${date} cancelled` : batchId ? "Batch cancelled by organizer" : "Course cancelled by organizer");
      txn.cancelledAt = new Date();
      txn.cancelledBy = userId;
      txn.refundedAt = new Date();
      await txn.save();

      if (txn.organizerEarning > 0) {
        await deductOrganizerWallet(
          organizerId,
          txn.organizerEarning,
          txn,
          `${date ? "Slot" : batchId ? "Batch" : "Course"} cancelled: ${course.courseTitle}`,
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

const adjustCourseReservedSeats = async (req, res) => {
  try {
    const { courseId, batchId, date, ReservedExternally } = req.body;
    const userId = req.user.userId;

    const course = await Course.findById(courseId);
    if (!course) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND || "Course not found");

    // Authorization check
    if (
      course.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, "You are not authorized to edit this course");
    }

    const batch = course.batches.id(batchId);
    if (!batch) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.BATCH_NOT_FOUND || "Batch not found");

    if (batch.status === "Cancelled") {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Cannot adjust reserved seats for a cancelled batch");
    }
    // Check availability limit
    const enrolledCount = await getCourseBatchBookedCount(courseId, batchId, date || null);
    if (batch.seats < enrolledCount + ReservedExternally) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Seats limit (${batch.seats}) cannot be less than enrolled count (${enrolledCount}) + externally reserved seats (${ReservedExternally})`
      );
    }

    if (date) {
      if (!batch.reservedDates) batch.reservedDates = [];
      const index = batch.reservedDates.findIndex((r) => r.date === date);
      if (index > -1) {
        batch.reservedDates[index].seats = ReservedExternally;
      } else {
        batch.reservedDates.push({ date, seats: ReservedExternally });
      }
    } else {
      batch.ReservedExternally = ReservedExternally;
    }

    await course.save();
    return apiSuccessRes(HTTP_STATUS.OK, res, "Reserved seats updated successfully", {
      courseId: course._id,
      batchId: batch._id,
      date,
      ReservedExternally,
    });
  } catch (error) {
    console.error("Error in adjustCourseReservedSeats:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 7. GET TICKET LIST (User's bookings)
// ════════════════════════════════════════════════════════════════════════════

const getTicketList = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, bookingType, page = 1, limit = 10 } = req.query;

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

      if (t.bookingType === "COURSE" && t.passExpiryDate) {
        const expiry = new Date(t.passExpiryDate);
        if (type === "upcoming") return expiry >= now;
        if (type === "past") return expiry < now;
        return true;
      }

      if (t.bookingType === "COURSE" && t.courseId?.enrollmentType === "Ongoing" && !t.passType) {
        const selectedDayName = t.selectedDay || (t.ongoingSlots && t.ongoingSlots[0] && t.ongoingSlots[0].selectedDay);
        if (selectedDayName) {
          const daysMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const targetDay = daysMap[selectedDayName.substring(0, 3)];
          if (targetDay !== undefined) {
            const start = new Date(t.createdAt);
            const currentDay = start.getDay();
            let daysToAdd = targetDay - currentDay;
            if (daysToAdd < 0) daysToAdd += 7;
            const sessionDate = new Date(start);
            sessionDate.setDate(start.getDate() + daysToAdd);
            sessionDate.setHours(23, 59, 59, 999);

            if (type === "upcoming") return sessionDate >= now;
            if (type === "past") return sessionDate < now;
            return true;
          }
        }
      }

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

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;
    const paginatedTickets = tickets.slice(startIndex, endIndex);

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TICKET_LIST_FETCHED, {
      tickets: paginatedTickets,
      pagination: {
        total: tickets.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(tickets.length / limitNum),
      },
    });
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

    if (transaction.bookingType === "COURSE" && transaction.courseId) {
      const course = transaction.courseId;
      const upcoming = [];
      const past = [];
      const now = new Date();

      if (course.enrollmentType === "fixedStart" && transaction.batchId) {
        const batch = course.batches.find(b => b._id.toString() === transaction.batchId.toString());
        if (batch && batch.days && batch.days.length > 0) {
          const daysMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const targetDays = batch.days.map(d => daysMap[d.substring(0, 3)]).filter(d => d !== undefined);

          let current = new Date(course.startDate);
          const end = new Date(course.endDate);
          const timing = `${batch.startTime} - ${batch.endTime}`;

          let count = 0;
          while (current <= end && count < 1000) {
            if (targetDays.includes(current.getDay())) {
              const sessionDate = new Date(current);
              const formattedDate = sessionDate.toISOString().split("T")[0];
              const sessionInfo = {
                batchId: transaction.batchId,
                selectedDay: Object.keys(daysMap).find(key => daysMap[key] === sessionDate.getDay()),
                date: formattedDate,
                timing,
                venueAddress: course.venueAddress || null,
              };

              const compareDate = new Date(sessionDate);
              if (batch.startTime) {
                const [h, m] = batch.startTime.split(":").map(Number);
                compareDate.setHours(h, m, 0, 0);
              }

              if (compareDate >= now) {
                upcoming.push(sessionInfo);
              } else {
                past.push(sessionInfo);
              }
            }
            current.setDate(current.getDate() + 1);
            count++;
          }
        }
      } else if (course.enrollmentType === "Ongoing" && !transaction.passType) {
        const slots = transaction.ongoingSlots && transaction.ongoingSlots.length > 0
          ? transaction.ongoingSlots
          : (transaction.batchId ? [{ batchId: transaction.batchId, selectedDay: transaction.selectedDay }] : []);

        const getOngoingSessionDate = (createdAt, selectedDay) => {
          const daysMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const targetDay = daysMap[selectedDay.substring(0, 3)];
          if (targetDay === undefined) return null;
          const start = new Date(createdAt);
          const currentDay = start.getDay();
          let daysToAdd = targetDay - currentDay;
          if (daysToAdd < 0) daysToAdd += 7;
          const sessionDate = new Date(start);
          sessionDate.setDate(start.getDate() + daysToAdd);
          return sessionDate;
        };

        for (const slot of slots) {
          let sessionDate = null;
          if (slot.selectedDate) {
            sessionDate = new Date(slot.selectedDate);
          } else if (slot.selectedDay) {
            sessionDate = getOngoingSessionDate(transaction.createdAt, slot.selectedDay);
          }
          if (!sessionDate) continue;

          const batch = course.batches.find(b => b._id.toString() === slot.batchId.toString());
          const timing = batch ? `${batch.startTime} - ${batch.endTime}` : "";
          const formattedDate = sessionDate.toISOString().split("T")[0];

          const sessionInfo = {
            batchId: slot.batchId,
            selectedDay: slot.selectedDay,
            date: formattedDate,
            timing,
            venueAddress: course.venueAddress || null,
          };

          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);

          const oneWeekAhead = new Date(startOfToday);
          oneWeekAhead.setDate(oneWeekAhead.getDate() + 7);
          oneWeekAhead.setHours(23, 59, 59, 999);

          const oneWeekAgo = new Date(startOfToday);
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          oneWeekAgo.setHours(0, 0, 0, 0);

          if (sessionDate >= startOfToday && sessionDate <= oneWeekAhead) {
            upcoming.push(sessionInfo);
          } else if (sessionDate < startOfToday && sessionDate >= oneWeekAgo) {
            past.push(sessionInfo);
          }
        }
      }

      transactionObj.upcoming = upcoming;
      transactionObj.past = past;
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TICKET_DETAIL_FETCHED, {
      ticket: transactionObj,
    });
  } catch (error) {
    console.error("Error in getTicketDetail:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// Helper to generate unique ticket number
const generateTicketNumber = (eventId, index) => {
  const timestamp = Date.now().toString().slice(-6);
  const eventPrefix = eventId.toString().slice(-4).toUpperCase();
  return `TKT-${eventPrefix}-${timestamp}-${index}`;
};

// Helper to generate QR data for attendee
const generateAttendeeQRData = (ticketNumber, attendeeId) => {
  return `ATTENDEE-${ticketNumber}-${attendeeId}-${Date.now()}`;
};

// Helper to auto-create attendees for a PAID transaction if none exist
const ensureAttendeesExist = async (transaction) => {
  const currentAttendees = await Attendee.find({ transactionId: transaction._id });
  if (currentAttendees.length > 0) {
    return currentAttendees;
  }

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

  const attendeeDocs = [];
  for (let i = 0; i < transaction.qty; i++) {
    const ticketNumber = generateTicketNumber(
      transaction.eventId
        ? transaction.eventId._id || transaction.eventId
        : transaction.courseId._id || transaction.courseId,
      i + 1,
    );
    const ticketInfo = ticketQueue[i] || { ticketId: transaction.ticketId, ticketName: transaction.ticketName };

    attendeeDocs.push({
      transactionId: transaction._id,
      eventId: transaction.eventId
        ? transaction.eventId._id || transaction.eventId
        : null,
      courseId: transaction.courseId
        ? transaction.courseId._id || transaction.courseId
        : null,
      batchId: transaction.batchId || null,
      userId: transaction.userId?._id || transaction.userId,
      firstName: transaction.userId?.firstName || "Guest",
      lastName: transaction.userId?.lastName || `Attendee ${i + 1}`,
      email: transaction.userId?.email || "guest@example.com",
      ticketNumber,
      qrCodeData: "",
      isCheckedIn: false,
      ticketId: ticketInfo.ticketId,
      ticketName: ticketInfo.ticketName,
    });
  }
  const created = await Attendee.insertMany(attendeeDocs);
  for (let doc of created) {
    doc.qrCodeData = generateAttendeeQRData(doc.ticketNumber, doc._id);
    await doc.save();
  }
  return created;
};

// 9. SCAN QR CODE (Gate Keeper)
// ════════════════════════════════════════════════════════════════════════════

const scanQRCode = async (req, res) => {
  try {
    const { qrCodeData } = req.body;
    req.body.code = qrCodeData;
    const attendeeRouter = require("./controllerAttendee");
    return attendeeRouter.verifyTicket(req, res);
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
    const { status, search, page = 1, limit = 10 } = req.query;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);
    if (!event) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);

    if (
      event.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, "You don't have permission to view this event's attendees");
    }

    let filter = { eventId: event._id, status: "PAID", bookingType: "EVENT" };

    if (status === "checked-in") {
      filter.checkedInQty = { $gt: 0 };
    } else if (status === "not-checked-in") {
      filter.$or = [{ checkedInQty: { $exists: false } }, { checkedInQty: 0 }];
    } else if (status === "fully-checked-in") {
      filter.$expr = { $gte: [{ $ifNull: ["$checkedInQty", 0] }, "$qty"] };
    } else if (status === "partial") {
      filter.checkedInQty = { $gt: 0 };
      filter.$expr = { $lt: [{ $ifNull: ["$checkedInQty", 0] }, "$qty"] };
    }

    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } }
        ]
      }).select("_id");
      const userIds = users.map((u) => u._id);

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { bookingId: { $regex: search, $options: "i" } },
          { userId: { $in: userIds } }
        ]
      });
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Transaction.countDocuments(filter);

    const transactions = await Transaction.find(filter)
      .populate("userId", "firstName lastName email profileImage contactNumber countryCode roleId")
      .populate("checkedInBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const attendees = transactions.map((transaction) => {
      const user = transaction.userId;
      const checkedInByUser = transaction.checkedInBy;

      return {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        totalAmount: transaction.totalAmount || 0,
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
      totalAttendees: totalCount,
      totalCheckedInTickets: attendees.reduce((sum, a) => sum + a.tickets.checkedInQty, 0),
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      limit: limitNum,
      attendees,
    });
  } catch (error) {
    console.error("Error in getEventAttendeesList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


// ════════════════════════════════════════════════════════════════════════════
// 10.b GET COURSE ENROLLED USERS (Organizer/Admin)
// ════════════════════════════════════════════════════════════════════════════

const getCourseAttendeesList = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status, batchId, search, date, page = 1, limit = 10 } = req.query;
    const userId = req.user.userId;

    const course = await Course.findById(courseId);
    if (!course) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.COURSE_NOT_FOUND || "Course not found",
      );
    }

    if (
      course.createdBy.toString() !== userId.toString() &&
      req.user.roleId !== roleId.SUPER_ADMIN
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You don't have permission to view this course's attendees",
      );
    }

    let filter = { courseId: course._id, status: "PAID", bookingType: "COURSE" };

    if (status === "checked-in") {
      filter.checkedInQty = { $gt: 0 };
    } else if (status === "not-checked-in") {
      filter.$or = [{ checkedInQty: { $exists: false } }, { checkedInQty: 0 }];
    } else if (status === "fully-checked-in") {
      filter.$expr = { $gte: [{ $ifNull: ["$checkedInQty", 0] }, "$qty"] };
    } else if (status === "partial") {
      filter.checkedInQty = { $gt: 0 };
      filter.$expr = { $lt: [{ $ifNull: ["$checkedInQty", 0] }, "$qty"] };
    }

    if (batchId && date) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { batchId: batchId, selectedDay: date },
          {
            ongoingSlots: {
              $elemMatch: {
                batchId: batchId,
                $or: [
                  { selectedDay: date },
                  { selectedDate: date }
                ]
              }
            }
          }
        ]
      });
    } else {
      if (batchId) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { batchId: batchId },
            { "ongoingSlots.batchId": batchId }
          ]
        });
      }
      if (date) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { selectedDay: date },
            { "ongoingSlots.selectedDay": date },
            { "ongoingSlots.selectedDate": date }
          ]
        });
      }
    }

    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } }
        ]
      }).select("_id");
      const userIds = users.map((u) => u._id);

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { bookingId: { $regex: search, $options: "i" } },
          { userId: { $in: userIds } }
        ]
      });
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const mongoose = require("mongoose");
    let external = 0;
    let booked = 0;
    let available = 0;

    const aggMatch = {
      courseId: new mongoose.Types.ObjectId(courseId),
      status: "PAID",
      bookingType: "COURSE"
    };

    if (batchId) {
      const batchObjId = batchId.toString();
      if (date) {
        aggMatch.$or = [
          { batchId: batchObjId, selectedDay: date },
          {
            ongoingSlots: {
              $elemMatch: {
                batchId: batchObjId,
                $or: [
                  { selectedDay: date },
                  { selectedDate: date }
                ]
              }
            }
          }
        ];
      } else {
        aggMatch.$or = [
          { batchId: batchObjId },
          { "ongoingSlots.batchId": batchObjId }
        ];
      }
    } else if (date) {
      aggMatch.$or = [
        { selectedDay: date },
        { "ongoingSlots.selectedDay": date },
        { "ongoingSlots.selectedDate": date }
      ];
    }

    if (batchId) {
      const batch = course.batches.find((b) => b._id.toString() === batchId.toString());
      if (batch) {
        if (date) {
          const reservedDateEntry = batch.reservedDates?.find((rd) => rd.date === date);
          external = reservedDateEntry ? reservedDateEntry.seats : (batch.ReservedExternally || 0);
        } else {
          external = batch.ReservedExternally || 0;
        }

        const bookedAgg = await Transaction.aggregate([
          { $match: aggMatch },
          { $group: { _id: null, totalQty: { $sum: "$qty" } } },
        ]);
        booked = bookedAgg.length > 0 ? bookedAgg[0].totalQty : 0;

        const totalSeats = batch.seats || 0;
        available = Math.max(0, totalSeats - booked - external);
      }
    } else {
      let totalSeats = 0;
      for (const batch of (course.batches || [])) {
        if (batch.status === "Active") {
          totalSeats += batch.seats || 0;
          if (date) {
            const reservedDateEntry = batch.reservedDates?.find((rd) => rd.date === date);
            external += reservedDateEntry ? reservedDateEntry.seats : (batch.ReservedExternally || 0);
          } else {
            external += batch.ReservedExternally || 0;
          }
        }
      }

      const bookedAgg = await Transaction.aggregate([
        { $match: aggMatch },
        { $group: { _id: null, totalQty: { $sum: "$qty" } } },
      ]);
      booked = bookedAgg.length > 0 ? bookedAgg[0].totalQty : 0;

      available = Math.max(0, totalSeats - booked - external);
    }

    // ── When NO batchId filter: deduplicate by userId (one entry per unique student) ──
    if (!batchId) {
      // Get distinct userIds that match the filter
      const allMatchingTxns = await Transaction.find(filter)
        .populate("userId", "firstName lastName email profileImage contactNumber countryCode roleId")
        .sort({ createdAt: -1 });

      // Group transactions by userId
      const userMap = new Map();
      for (const txn of allMatchingTxns) {
        const uid = txn.userId?._id?.toString();
        if (!uid) continue;

        if (!userMap.has(uid)) {
          userMap.set(uid, { txn, allTxns: [txn] });
        } else {
          userMap.get(uid).allTxns.push(txn);
        }
      }

      const uniqueUsers = Array.from(userMap.values());
      const totalUnique = uniqueUsers.length;
      const paginated = uniqueUsers.slice(skip, skip + limitNum);

      const attendees = paginated.map(({ txn, allTxns }) => {
        const user = txn.userId;

        // Collect all batches this user is enrolled in across all their transactions
        const enrolledBatches = [];
        let totalCheckedIn = 0;
        let totalQty = 0;

        for (const t of allTxns) {
          totalQty += t.qty || 0;
          totalCheckedIn += t.checkedInQty || 0;

          if (t.batchId && course.batches && Array.isArray(course.batches)) {
            const found = course.batches.find((b) => b._id.toString() === t.batchId.toString());
            if (found) {
              enrolledBatches.push({
                batchId: found._id,
                batchName: found.batchName,
                startTime: found.startTime,
                endTime: found.endTime,
                days: found.days,
                bookingId: t.bookingId,
              });
            }
          }

          if (t.ongoingSlots && Array.isArray(t.ongoingSlots) && course.batches && Array.isArray(course.batches)) {
            for (const slot of t.ongoingSlots) {
              const found = course.batches.find((b) => b._id.toString() === slot.batchId.toString());
              if (found && !enrolledBatches.find((eb) => eb.batchId.toString() === found._id.toString())) {
                enrolledBatches.push({
                  batchId: found._id,
                  batchName: found.batchName,
                  startTime: found.startTime,
                  endTime: found.endTime,
                  days: found.days,
                  bookingId: t.bookingId,
                });
              }
            }
          }
        }

        return {
          transactionId: txn._id,
          bookingId: txn.bookingId,
          totalAmount: txn.totalAmount || 0,
          enrolledBatches,
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
          qty: totalQty,
          checkedInQty: totalCheckedIn,
          remainingQty: totalQty - totalCheckedIn,
          isFullyCheckedIn: totalCheckedIn >= totalQty,
          bookingDate: txn.createdAt,
        };
      });

      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.ATTENDEE_LIST_FETCHED || "Attendees list fetched successfully",
        {
          course: {
            _id: course._id,
            courseTitle: course.courseTitle,
            startDate: course.startDate,
            endDate: course.endDate,
            posterImage: Array.isArray(course.posterImage) ? course.posterImage.map(formatResponseUrl) : [],
          },
          ReservedExternally: external,
          availableSeats: available,
          acquiredSeats: booked + external,
          totalAttendees: totalUnique,
          totalCheckedInTickets: attendees.reduce((sum, a) => sum + a.checkedInQty, 0),
          totalPages: Math.ceil(totalUnique / limitNum),
          currentPage: pageNum,
          limit: limitNum,
          attendees,
        },
      );
    }

    // ── When batchId IS passed: keep original per-transaction behavior ──
    const totalCount = await Transaction.countDocuments(filter);

    const transactions = await Transaction.find(filter)
      .populate("userId", "firstName lastName email profileImage contactNumber countryCode roleId")
      .populate("checkedInBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const attendees = transactions.map((transaction) => {
      const user = transaction.userId;
      const checkedInByUser = transaction.checkedInBy;

      let batchDetails = null;
      if (transaction.batchId && course.batches && Array.isArray(course.batches)) {
        const found = course.batches.find((b) => b._id.toString() === transaction.batchId.toString());
        if (found) {
          batchDetails = {
            batchId: found._id,
            batchName: found.batchName,
            startTime: found.startTime,
            endTime: found.endTime,
          };
        }
      }

      let slotsWithDetails = [];
      if (transaction.ongoingSlots && Array.isArray(transaction.ongoingSlots) && course.batches && Array.isArray(course.batches)) {
        slotsWithDetails = transaction.ongoingSlots.map((slot) => {
          const found = course.batches.find((b) => b._id.toString() === slot.batchId.toString());
          return {
            batchId: slot.batchId,
            selectedDay: slot.selectedDay,
            batchName: found ? found.batchName : null,
            startTime: found ? found.startTime : null,
            endTime: found ? found.endTime : null,
          };
        });
      }

      return {
        transactionId: transaction._id,
        bookingId: transaction.bookingId,
        totalAmount: transaction.totalAmount || 0,
        batchDetails,
        ongoingSlots: slotsWithDetails,
        selectedDay: transaction.selectedDay,
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
        qty: transaction.qty,
        checkedInQty: transaction.checkedInQty || 0,
        remainingQty: transaction.qty - (transaction.checkedInQty || 0),
        isFullyCheckedIn: (transaction.checkedInQty || 0) >= transaction.qty,
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
      constantsMessage.ATTENDEE_LIST_FETCHED || "Attendees list fetched successfully",
      {
        course: {
          _id: course._id,
          courseTitle: course.courseTitle,
          startDate: course.startDate,
          endDate: course.endDate,
          posterImage: Array.isArray(course.posterImage) ? course.posterImage.map(formatResponseUrl) : [],
        },
        ReservedExternally: external,
        availableSeats: available,
        acquiredSeats: booked + external,
        totalAttendees: totalCount,
        totalCheckedInTickets: attendees.reduce((sum, a) => sum + a.checkedInQty, 0),
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum,
        attendees,
      },
    );
  } catch (error) {
    console.error("Error in getCourseAttendeesList:", error);
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
router.get("/cancellation-reasons", perApiLimiter(), getCancellationReasons);
router.get("/refund-preview/:transactionId", perApiLimiter(), previewRefund);
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

router.post(
  "/adjust-course-reserved-seats",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(adjustCourseReservedSeatsSchema),
  adjustCourseReservedSeats,
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
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN, roleId.STAFF]),
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
  "/course/:courseId/attendees",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  getCourseAttendeesList,
);
router.get(
  "/event/:eventId/stats",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  getEventAttendeeStats,
);

module.exports = router;
