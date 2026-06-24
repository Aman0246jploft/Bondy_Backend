const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { Attendee, Event, Transaction, User, Course } = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes, formatResponseUrl } = require("../../utils/globalFunction");
const {
  createAttendeesSchema,
  checkInSchema,
  scanQRSchema,
  verifySchema,
} = require("../services/validations/attendeeValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { roleId } = require("../../utils/Role");

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
      userId: transaction.userId._id || transaction.userId,
      firstName: transaction.userId.firstName || "Guest",
      lastName: transaction.userId.lastName || `Attendee ${i + 1}`,
      email: transaction.userId.email || "guest@example.com",
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

// 1. Create Attendees for a Transaction
const createAttendees = async (req, res) => {
  try {
    const { transactionId, attendees } = req.body;
    const userId = req.user.userId;

    // Verify Transaction
    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId,
      status: "PAID",
    })
      .populate("eventId")
      .populate("courseId");

    if (!transaction) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.TRANSACTION_NOT_FOUND_OR_NOT_PAID,
      );
    }

    // ✅ Check if event/course has expired
    const now = new Date();
    let targetItem = transaction.eventId || transaction.courseId;
    let endDate;

    if (transaction.bookingType === "EVENT") {
      endDate = transaction.eventId.endDate;
    } else {
      endDate = transaction.courseId.endDate || transaction.courseId.createdAt;
    }

    if (now > new Date(endDate)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Cannot create attendees - ${transaction.bookingType} has expired`,
        {
          item: {
            title: transaction.eventId
              ? transaction.eventId.eventTitle
              : transaction.courseId.courseTitle,
            endDate: endDate,
            status: "Expired",
          },
        },
      );
    }
    // Check if attendees count matches ticket quantity
    if (attendees.length !== transaction.qty) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `You must provide exactly ${transaction.qty} attendee(s)`,
      );
    }

    // Check if attendees already created for this transaction
    const existingAttendees = await Attendee.find({ transactionId });
    if (existingAttendees.length > 0) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Attendees already created for this transaction",
      );
    }

    // Generate ticket queue
    const ticketQueue = [];
    if (transaction.tickets && transaction.tickets.length > 0) {
      for (const t of transaction.tickets) {
        for (let i = 0; i < t.qty; i++) {
          ticketQueue.push({ ticketId: t.ticketId, ticketName: t.ticketName });
        }
      }
    } else {
      for (let i = 0; i < transaction.qty; i++) {
        ticketQueue.push({ ticketId: transaction.ticketId, ticketName: transaction.ticketName });
      }
    }

    // Create Attendees
    const attendeeDocuments = attendees.map((attendee, index) => {
      const ticketNumber = generateTicketNumber(
        transaction.eventId
          ? transaction.eventId._id
          : transaction.courseId._id,
        index + 1,
      );
      const ticketInfo = ticketQueue[index] || { ticketId: transaction.ticketId, ticketName: transaction.ticketName };

      return {
        transactionId: transaction._id,
        eventId: transaction.eventId ? transaction.eventId._id : null,
        courseId: transaction.courseId ? transaction.courseId._id : null,
        batchId: transaction.batchId || null,
        userId: transaction.userId,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        contactNumber: attendee.contactNumber || null,
        ticketNumber,
        qrCodeData: "", // Will be set after creation
        ticketId: ticketInfo.ticketId,
        ticketName: ticketInfo.ticketName,
      };
    });

    const createdAttendees = await Attendee.insertMany(attendeeDocuments);

    // Update QR codes with attendee IDs
    for (let i = 0; i < createdAttendees.length; i++) {
      createdAttendees[i].qrCodeData = generateAttendeeQRData(
        createdAttendees[i].ticketNumber,
        createdAttendees[i]._id,
      );
      await createdAttendees[i].save();
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.ATTENDEES_CREATED,
      {
        attendees: createdAttendees,
      },
    );
  } catch (error) {
    console.error("Error in createAttendees:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};
// 2. Get Attendees for an Event or Course (Organizer and Assigned Staff Allowed)
const getEventAttendees = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const { page = 1, limit = 50, search = "", checkedIn } = req.query;

    // Verify Event or Course
    let entity = await Event.findById(eventId);
    let isEvent = true;
    if (!entity) {
      entity = await Course.findById(eventId);
      isEvent = false;
    }

    if (!entity) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event or Course not found");
    }

    // Verify Event/Course Ownership or Assigned Staff
    const isCreator = entity.createdBy.toString() === userId;
    const isAssignedStaff = req.user.roleId === roleId.STAFF && entity.assignedStaff && entity.assignedStaff.some(id => id.toString() === userId);

    if (!isCreator && !isAssignedStaff) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to view attendees for this item",
      );
    }

    // Build query
    const query = isEvent ? { eventId } : { courseId: eventId };

    // Filter by check-in status
    if (checkedIn !== undefined) {
      query.isCheckedIn = checkedIn === "true";
    }

    // Search by name, email, ticket number, or bookingId
    if (search) {
      const txns = await Transaction.find({ bookingId: { $regex: search, $options: "i" } }).select("_id");
      const txnIds = txns.map((t) => t._id);

      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { ticketNumber: { $regex: search, $options: "i" } },
        { transactionId: { $in: txnIds } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [attendees, total] = await Promise.all([
      Attendee.find(query)
        .populate("userId", "firstName lastName email profileImage")
        .populate("transactionId", "bookingId totalAmount")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Attendee.countDocuments(query),
    ]);

    // Get statistics
    const stats = await Attendee.aggregate([
      { $match: isEvent ? { eventId: entity._id } : { courseId: entity._id } },
      {
        $group: {
          _id: null,
          totalAttendees: { $sum: 1 },
          checkedIn: {
            $sum: { $cond: [{ $eq: ["$isCheckedIn", true] }, 1, 0] },
          },
          notCheckedIn: {
            $sum: { $cond: [{ $eq: ["$isCheckedIn", false] }, 1, 0] },
          },
        },
      },
    ]);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.ATTENDEE_LIST_FETCHED,
      {
        attendees,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        stats: stats[0] || {
          totalAttendees: 0,
          checkedIn: 0,
          notCheckedIn: 0,
        },
      },
    );
  } catch (error) {
    console.error("Error in getEventAttendees:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 3. Get My Attendees (User's own tickets)
const getMyAttendees = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { eventId } = req.query;

    const query = { userId };
    if (eventId) {
      query.eventId = eventId;
    }

    const attendees = await Attendee.find(query)
      .populate("eventId")
      .populate("transactionId", "bookingId totalAmount")
      .sort({ createdAt: -1 });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.MY_ATTENDEES_FETCHED,
      {
        attendees,
      },
    );
  } catch (error) {
    console.error("Error in getMyAttendees:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Helper to execute attendee check-in based on course/event type
const executeAttendeeCheckIn = async (attendee, transaction, organizerId, selectedDate, batchId) => {
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD format

  const isEvent = transaction.bookingType === "EVENT" || !transaction.bookingType;

  if (isEvent) {
    if (attendee.isCheckedIn) {
      throw new Error(`Attendee already checked in at ${attendee.checkedInAt}`);
    }

    attendee.isCheckedIn = true;
    attendee.checkedInAt = now;
    attendee.checkedInBy = organizerId;
    if (!attendee.checkInHistory) attendee.checkInHistory = [];
    attendee.checkInHistory.push({
      checkedInAt: now,
      checkedInBy: organizerId,
      sessionDate: todayStr,
    });
    await attendee.save();

    const checkedInCount = await Attendee.countDocuments({
      transactionId: transaction._id,
      isCheckedIn: true,
    });
    transaction.checkedInQty = checkedInCount;
    transaction.isCheckedIn = checkedInCount >= transaction.qty;
    if (checkedInCount === 1) transaction.checkedInAt = now;
    transaction.checkedInBy = organizerId;
    await transaction.save();

    if (attendee.eventId) {
      await Event.findByIdAndUpdate(attendee.eventId, {
        $inc: { totalAttendees: 1 },
      });
    }

    return {
      message: "Checked in successfully",
      type: "EVENT",
      attendee: {
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        ticketNumber: attendee.ticketNumber,
      },
    };
  } else {
    // COURSE
    const course = await Course.findById(attendee.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    let isExpired = false;
    let actualEndDate = course.endDate || course.createdAt;
    if (transaction.passExpiryDate) {
      actualEndDate = transaction.passExpiryDate;
      isExpired = now > new Date(transaction.passExpiryDate);
    } else {
      isExpired = now > new Date(actualEndDate);
    }

    if (isExpired) {
      throw new Error(`${transaction.passType ? "Pass" : "Course"} has expired - Check-in not allowed`);
    }

    if (!attendee.checkInHistory) attendee.checkInHistory = [];

    if (course.enrollmentType === "fixedStart") {
      const totalSessions = course.totalSessions || 1;
      if (attendee.checkInHistory.length >= totalSessions) {
        throw new Error(`All sessions (${totalSessions}) for this course have already been checked in`);
      }

      if (attendee.checkInHistory.some(entry => entry.sessionDate === todayStr)) {
        throw new Error("Attendee already checked in for today's session");
      }

      const sessionIndex = attendee.checkInHistory.length + 1;
      attendee.checkInHistory.push({
        checkedInAt: now,
        checkedInBy: organizerId,
        sessionIndex,
        sessionDate: todayStr,
        batchId: transaction.batchId,
      });

      attendee.checkedInAt = now;
      attendee.checkedInBy = organizerId;
      if (attendee.checkInHistory.length >= totalSessions) {
        attendee.isCheckedIn = true;
      }
      await attendee.save();

      const fullyCheckedInCount = await Attendee.countDocuments({
        transactionId: transaction._id,
        isCheckedIn: true,
      });
      transaction.checkedInQty = fullyCheckedInCount;
      transaction.isCheckedIn = fullyCheckedInCount >= transaction.qty;
      if (fullyCheckedInCount === 1) transaction.checkedInAt = now;
      transaction.checkedInBy = organizerId;
      await transaction.save();

      return {
        message: `Checked in successfully (Session ${sessionIndex} of ${totalSessions})`,
        type: "COURSE_FIXED",
        attendee: {
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          ticketNumber: attendee.ticketNumber,
          sessionsAttended: attendee.checkInHistory.length,
          totalSessions,
        },
      };
    } else {
      // Ongoing course
      const slots = transaction.ongoingSlots || [];
      const daysOfWeekMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const currentDayOfWeek = daysOfWeekMap[now.getDay()];

      let targetSlot = null;

      // 1. If explicit batchId or selectedDate is provided
      if (batchId || selectedDate) {
        targetSlot = slots.find(s =>
          (!batchId || s.batchId === batchId) &&
          (!selectedDate || s.selectedDate === selectedDate || s.selectedDay === selectedDate)
        );
        if (!targetSlot && slots.length > 0) {
          throw new Error("Specified slot/date is not booked for this attendee");
        }
      }
      // 2. Otherwise auto-detect slot matching today
      else if (slots.length > 0) {
        targetSlot = slots.find(s => s.selectedDate === todayStr || s.selectedDay === currentDayOfWeek);
      }

      if (targetSlot) {
        const slotDate = targetSlot.selectedDate || todayStr;
        const alreadyCheckedIn = attendee.checkInHistory.some(entry =>
          entry.batchId === targetSlot.batchId && entry.sessionDate === slotDate
        );

        if (alreadyCheckedIn) {
          throw new Error(`Attendee already checked in for session on ${slotDate} (${targetSlot.selectedDay})`);
        }

        attendee.checkInHistory.push({
          checkedInAt: now,
          checkedInBy: organizerId,
          sessionDate: slotDate,
          batchId: targetSlot.batchId,
        });

        attendee.checkedInAt = now;
        attendee.checkedInBy = organizerId;

        const allSlotsChecked = slots.every(s =>
          attendee.checkInHistory.some(entry => entry.batchId === s.batchId && (entry.sessionDate === s.selectedDate || entry.sessionDate !== null))
        );

        if (allSlotsChecked || attendee.checkInHistory.length >= slots.length) {
          attendee.isCheckedIn = true;
        }
        await attendee.save();

        // Update check-in status on transaction's ongoingSlot subdocument
        const slotInTx = transaction.ongoingSlots.id(targetSlot._id);
        if (slotInTx) {
          slotInTx.isCheckedIn = true;
          slotInTx.checkedInAt = now;
          slotInTx.checkedInBy = organizerId;
        }

        const fullyCheckedInCount = await Attendee.countDocuments({
          transactionId: transaction._id,
          isCheckedIn: true,
        });
        transaction.checkedInQty = fullyCheckedInCount;
        transaction.isCheckedIn = fullyCheckedInCount >= transaction.qty;
        if (fullyCheckedInCount === 1) transaction.checkedInAt = now;
        transaction.checkedInBy = organizerId;
        await transaction.save();

        return {
          message: `Checked in successfully for session on ${slotDate} (${targetSlot.selectedDay})`,
          type: "COURSE_ONGOING_SESSION",
          attendee: {
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            ticketNumber: attendee.ticketNumber,
            batchId: targetSlot.batchId,
            sessionDate: slotDate,
            sessionsAttended: attendee.checkInHistory.length,
            totalSessions: slots.length,
          },
        };
      } else if (transaction.passType) {
        if (attendee.checkInHistory.some(entry => entry.sessionDate === todayStr)) {
          throw new Error("Attendee already checked in for today");
        }

        attendee.checkInHistory.push({
          checkedInAt: now,
          checkedInBy: organizerId,
          sessionDate: todayStr,
          batchId: "PASS",
        });
        attendee.checkedInAt = now;
        attendee.checkedInBy = organizerId;
        await attendee.save();

        return {
          message: "Pass checked in successfully for today",
          type: "COURSE_ONGOING_PASS",
          attendee: {
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            ticketNumber: attendee.ticketNumber,
            passExpiryDate: actualEndDate,
            passType: transaction.passType,
          },
        };
      } else {
        throw new Error(`No booked session matches today (${currentDayOfWeek}, ${todayStr})`);
      }
    }
  }
};

// 4. Check-in Attendee (Organizer Only)
const checkInAttendee = async (req, res) => {
  try {
    let { ticketNumber, entityId, selectedDate, batchId } = req.body;
    const userId = req.user.userId;

    let attendee = null;
    let transaction = null;

    // Handle scan QR inputs passed as ticketNumber (e.g., TICKET-... or ATTENDEE-...)
    if (ticketNumber.startsWith("TICKET-") || ticketNumber.startsWith("ATTENDEE-")) {
      if (ticketNumber.startsWith("ATTENDEE-")) {
        attendee = await Attendee.findOne({ qrCodeData: ticketNumber })
          .populate("eventId")
          .populate("courseId");
        if (attendee) {
          transaction = await Transaction.findById(attendee.transactionId);
        }
      } else {
        const parts = ticketNumber.split("-");
        const transactionId = parts[1];
        transaction = await Transaction.findById(transactionId);
        if (transaction) {
          await ensureAttendeesExist(transaction);
          attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
            .populate("eventId")
            .populate("courseId");
        }
      }
    }
    // Handle short Booking ID (BNDY-XXXXXX)
    else if (ticketNumber.startsWith("BNDY-")) {
      transaction = await Transaction.findOne({ bookingId: ticketNumber });
      if (!transaction) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Booking not found");
      }
      if (transaction.status !== "PAID") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Booking is not paid");
      }

      if (entityId) {
        const transactionEntityId = transaction.eventId?.toString() || transaction.courseId?.toString();
        if (transactionEntityId !== entityId) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "This booking does not belong to the selected event/course",
          );
        }
      }

      await ensureAttendeesExist(transaction);

      if (transaction.bookingType === "EVENT" || !transaction.bookingType) {
        const totalAttendeesCount = transaction.qty;
        const checkedInCount = await Attendee.countDocuments({ transactionId: transaction._id, isCheckedIn: true });
        if (checkedInCount >= totalAttendeesCount) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "All tickets for this booking are already checked in",
          );
        }
      }

      attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
        .populate("eventId")
        .populate("courseId");
      if (!attendee && transaction.bookingType === "COURSE") {
        attendee = await Attendee.findOne({ transactionId: transaction._id })
          .populate("eventId")
          .populate("courseId");
      }
    }
    // Handle User ID Scan (Profile QR)
    else if (mongoose.Types.ObjectId.isValid(ticketNumber)) {
      if (!entityId) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "entityId is required for User profile scans",
        );
      }
      const filter = {
        userId: ticketNumber,
        status: "PAID",
      };

      const targetEvent = await Event.findById(entityId);
      if (targetEvent) {
        filter.eventId = entityId;
      } else {
        filter.courseId = entityId;
      }

      transaction = await Transaction.findOne(filter);
      if (!transaction) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "No paid booking found for this user",
        );
      }

      await ensureAttendeesExist(transaction);

      if (transaction.bookingType === "EVENT" || !transaction.bookingType) {
        const totalAttendeesCount = transaction.qty;
        const checkedInCount = await Attendee.countDocuments({ transactionId: transaction._id, isCheckedIn: true });
        if (checkedInCount >= totalAttendeesCount) {
          return apiErrorRes(
            HTTP_STATUS.BAD_REQUEST,
            res,
            "All tickets for this booking are already checked in",
          );
        }
      }

      attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
        .populate("eventId")
        .populate("courseId");
      if (!attendee && transaction.bookingType === "COURSE") {
        attendee = await Attendee.findOne({ transactionId: transaction._id })
          .populate("eventId")
          .populate("courseId");
      }
    }
    // Default: Find by individual ticketNumber (TKT-...)
    else {
      attendee = await Attendee.findOne({ ticketNumber })
        .populate("eventId")
        .populate("courseId");
      if (attendee) {
        transaction = await Transaction.findById(attendee.transactionId);
      }
    }

    if (!attendee) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_NOT_FOUND);
    }

    if (!transaction) {
      transaction = await Transaction.findById(attendee.transactionId);
    }

    if (!transaction) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Transaction not found");
    }

    if (entityId) {
      const attendeeEntityId = attendee.eventId?._id?.toString() || attendee.courseId?._id?.toString();
      if (attendeeEntityId !== entityId) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "This ticket does not belong to the selected event/course",
        );
      }
    }

    const targetItem = attendee.eventId || attendee.courseId;
    const isCreator = targetItem.createdBy.toString() === userId;
    const isAssignedStaff = req.user.roleId === roleId.STAFF && targetItem.assignedStaff && targetItem.assignedStaff.some(id => id.toString() === userId);
    const isSuperAdmin = req.user.roleId === roleId.SUPER_ADMIN;

    if (!isCreator && !isAssignedStaff && !isSuperAdmin) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        `You are not authorized to check-in attendees for this ${attendee.eventId ? "event" : "course"}`,
      );
    }

    const checkInResult = await executeAttendeeCheckIn(attendee, transaction, userId, selectedDate, batchId);
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.CHECK_IN_SUCCESS, checkInResult);

  } catch (error) {
    console.error("Error in checkInAttendee:", error);
    return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, error.message);
  }
};

// 5. Get Attendee by Ticket Number (for verification)
const getAttendeeByTicket = async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const userId = req.user.userId;

    const attendee = await Attendee.findOne({ ticketNumber })
      .populate("eventId")
      .populate("courseId")
      .populate("userId", "firstName lastName email profileImage")
      .populate("transactionId", "bookingId totalAmount");

    if (!attendee) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_NOT_FOUND);
    }

    const targetItem = attendee.eventId || attendee.courseId;
    const isCreator = targetItem.createdBy.toString() === userId;
    const isAssignedStaff = req.user.roleId === roleId.STAFF && targetItem.assignedStaff && targetItem.assignedStaff.some(id => id.toString() === userId);

    if (!isCreator && !isAssignedStaff) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to view this ticket",
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.ATTENDEE_DETAILS_FETCHED,
      {
        attendee,
      },
    );
  } catch (error) {
    console.error("Error in getAttendeeByTicket:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 6. Scan QR Code and Check-in (Organizer Only)
const scanQRAndCheckIn = async (req, res) => {
  try {
    const { qrCodeData, eventId, courseId, selectedDate, batchId } = req.body;
    const organizerId = req.user.userId;

    if (!qrCodeData) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.QR_CODE_REQUIRED,
      );
    }

    let attendee = null;
    let transaction = null;
    let event = null;
    let endDate = null;
    let title = "";

    // Determine if it's a Transaction QR, Attendee QR, or User ID QR
    if (qrCodeData.startsWith("TICKET-")) {
      // Case 1: Transaction QR
      const parts = qrCodeData.split("-");
      const transactionId = parts[1];

      transaction = await Transaction.findById(transactionId)
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage");

      if (!transaction) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TRANSACTION_NOT_FOUND);
      }
      event = transaction.eventId || transaction.courseId;
      title = event ? event.eventTitle || event.courseTitle : "";
      if (transaction.bookingType === "EVENT") {
        endDate = event.endDate;
      } else {
        endDate = event.endDate || event.createdAt;
      }
    } else if (qrCodeData.startsWith("ATTENDEE-")) {
      // Case 2: Individual Attendee QR
      attendee = await Attendee.findOne({ qrCodeData })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage")
        .populate("transactionId", "bookingId totalAmount status");

      if (!attendee) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "Individual ticket not found",
        );
      }
      event = attendee.eventId || attendee.courseId;
      title = event ? event.eventTitle || event.courseTitle : "";
      if (attendee.eventId) {
        endDate = event.endDate;
      } else {
        endDate = event.endDate || event.createdAt;
      }
      transaction = attendee.transactionId;
    } else if (mongoose.Types.ObjectId.isValid(qrCodeData)) {
      // Case 3: User ID Scan (Profile QR)
      if (!eventId && !courseId) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "eventId or courseId is required for User profile scans",
        );
      }

      if (eventId) {
        event = await Event.findById(eventId);
        if (!event) {
          return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.EVENT_NOT_FOUND);
        }
      } else {
        const course = await Course.findById(courseId);
        if (!course) {
          return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COURSE_NOT_FOUND);
        }
        event = course;
      }

      // Find an active paid transaction for this user and event/course
      const filter = {
        userId: qrCodeData,
        status: "PAID",
      };
      if (eventId) filter.eventId = eventId;
      if (courseId) filter.courseId = courseId;

      transaction = await Transaction.findOne(filter)
        .populate("userId", "firstName lastName email profileImage")
        .populate("eventId")
        .populate("courseId");

      if (!transaction) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "No paid booking found for this user",
        );
      }
      event = transaction.eventId || transaction.courseId;
      title = event ? event.eventTitle || event.courseTitle : "";
      if (transaction.bookingType === "EVENT") {
        endDate = event.endDate;
      } else {
        endDate = event.endDate || event.createdAt;
      }
    } else {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_QR_FORMAT,
      );
    }

    // --- Common Validations ---
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.ENTITY_NOT_FOUND);
    }

    // Verify that the ticket matches the selected event/course context
    if (eventId && event._id.toString() !== eventId) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "This ticket does not belong to the selected event",
      );
    }
    if (courseId && event._id.toString() !== courseId) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "This ticket does not belong to the selected course",
      );
    }

    // Verify Event/Course Ownership or Assigned Staff
    const isCreator = event.createdBy.toString() === organizerId;
    const isAssignedStaff = req.user.roleId === roleId.STAFF && event.assignedStaff && event.assignedStaff.some(id => id.toString() === organizerId);
    const isSuperAdmin = req.user.roleId === roleId.SUPER_ADMIN;

    if (!isCreator && !isAssignedStaff && !isSuperAdmin) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to check-in attendees for this event/course",
      );
    }

    // Check if PAID
    if (transaction && transaction.status !== "PAID") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Transaction is not PAID",
      );
    }

    const now = new Date();
    let isExpired = false;
    let actualEndDate = endDate;
    if (transaction && transaction.bookingType === "COURSE" && transaction.passExpiryDate) {
      actualEndDate = transaction.passExpiryDate;
      isExpired = now > new Date(transaction.passExpiryDate);
    } else {
      isExpired = now > new Date(endDate);
    }

    if (isExpired) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `${transaction.bookingType === "COURSE" ? "Pass" : (transaction.bookingType || "Event")} has expired - Check-in not allowed`,
        {
          item: {
            title: title,
            endDate: actualEndDate,
            status: "Expired",
          },
          validationStatus: "EXPIRED",
        },
      );
    }

    // Perform Check-in
    if (!attendee) {
      let currentAttendees = await Attendee.find({
        transactionId: transaction._id,
      });

      if (currentAttendees.length === 0) {
        await ensureAttendeesExist(transaction);
      }

      let firstAvailable = await Attendee.findOne({
        transactionId: transaction._id,
        isCheckedIn: false,
      });

      if (!firstAvailable && transaction.bookingType === "COURSE") {
        firstAvailable = await Attendee.findOne({
          transactionId: transaction._id,
        });
      }

      if (!firstAvailable) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "No available attendee found to check-in",
        );
      }

      const checkInResult = await executeAttendeeCheckIn(firstAvailable, transaction, organizerId, selectedDate, batchId);

      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.CHECK_IN_SUCCESS, {
        type: "TRANSACTION",
        attendee: checkInResult.attendee,
        event: {
          eventTitle: title,
        },
        bookingId: transaction.bookingId,
        totalQty: transaction.qty,
        checkedInQty: transaction.checkedInQty,
        remainingQty: transaction.qty - transaction.checkedInQty,
        validationStatus: "SUCCESS",
      });
    } else {
      const checkInResult = await executeAttendeeCheckIn(attendee, transaction, organizerId, selectedDate, batchId);

      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.CHECK_IN_SUCCESS, {
        type: "ATTENDEE",
        attendee: checkInResult.attendee,
        event: {
          eventTitle: title,
        },
        validationStatus: "SUCCESS",
      });
    }
  } catch (error) {
    console.error("Error in scanQRAndCheckIn:", error);
    return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, error.message);
  }
};

// 7. Verify ticket details without check-in
const verifyTicket = async (req, res) => {
  try {
    let { code, entityId } = req.body;
    const userId = req.user.userId;

    if (!code) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Ticket code or QR code is required");
    }

    let attendee = null;
    let transaction = null;
    let event = null;
    let endDate = null;
    let title = "";
    let bookingType = "EVENT";

    // 1. Resolve code
    if (code.startsWith("TICKET-")) {
      const parts = code.split("-");
      const transactionId = parts[1];
      transaction = await Transaction.findById(transactionId)
        .populate({ path: "eventId", populate: { path: "eventCategory", select: "name" } })
        .populate({ path: "courseId", populate: { path: "courseCategory", select: "name" } })
        .populate("userId", "firstName lastName email profileImage");

      if (!transaction) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TRANSACTION_NOT_FOUND);
      }
      await ensureAttendeesExist(transaction);
      event = transaction.eventId || transaction.courseId;
      bookingType = transaction.bookingType;

      attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage");
      if (!attendee) {
        attendee = await Attendee.findOne({ transactionId: transaction._id })
          .populate("eventId")
          .populate("courseId")
          .populate("userId", "firstName lastName email profileImage");
      }
    } else if (code.startsWith("ATTENDEE-")) {
      attendee = await Attendee.findOne({ qrCodeData: code })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage")
        .populate("transactionId", "bookingId totalAmount status bookingType");

      if (!attendee) {
        const parts = code.split("-");
        if (parts.length >= 2) {
          const ticketNum = parts.slice(1, -2).join("-");
          attendee = await Attendee.findOne({ ticketNumber: ticketNum })
            .populate("eventId")
            .populate("courseId")
            .populate("userId", "firstName lastName email profileImage")
            .populate("transactionId", "bookingId totalAmount status bookingType");
        }
      }

      if (!attendee) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Individual ticket not found");
      }
      event = attendee.eventId || attendee.courseId;
      transaction = attendee.transactionId;
      bookingType = transaction ? transaction.bookingType : (attendee.eventId ? "EVENT" : "COURSE");
    } else if (code.startsWith("BNDY-")) {
      transaction = await Transaction.findOne({ bookingId: code })
        .populate({ path: "eventId", populate: { path: "eventCategory", select: "name" } })
        .populate({ path: "courseId", populate: { path: "courseCategory", select: "name" } })
        .populate("userId", "firstName lastName email profileImage");

      if (!transaction) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Booking not found");
      }
      await ensureAttendeesExist(transaction);
      event = transaction.eventId || transaction.courseId;
      bookingType = transaction.bookingType;

      attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage");
      if (!attendee) {
        attendee = await Attendee.findOne({ transactionId: transaction._id })
          .populate("eventId")
          .populate("courseId")
          .populate("userId", "firstName lastName email profileImage");
      }
    } else if (mongoose.Types.ObjectId.isValid(code)) {
      if (!entityId) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "entityId is required for User profile scans",
        );
      }
      const filter = {
        userId: code,
        status: "PAID",
      };
      const targetEvent = await Event.findById(entityId);
      if (targetEvent) {
        filter.eventId = entityId;
      } else {
        filter.courseId = entityId;
      }

      transaction = await Transaction.findOne(filter)
        .populate("userId", "firstName lastName email profileImage")
        .populate({ path: "eventId", populate: { path: "eventCategory", select: "name" } })
        .populate({ path: "courseId", populate: { path: "courseCategory", select: "name" } });

      if (!transaction) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "No paid booking found for this user",
        );
      }
      await ensureAttendeesExist(transaction);
      event = transaction.eventId || transaction.courseId;
      bookingType = transaction.bookingType;

      attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage");
      if (!attendee) {
        attendee = await Attendee.findOne({ transactionId: transaction._id })
          .populate("eventId")
          .populate("courseId")
          .populate("userId", "firstName lastName email profileImage");
      }
    } else {
      attendee = await Attendee.findOne({ ticketNumber: code })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage")
        .populate("transactionId", "bookingId totalAmount status bookingType");

      if (!attendee) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.TICKET_NOT_FOUND);
      }
      event = attendee.eventId || attendee.courseId;
      transaction = attendee.transactionId;
      bookingType = transaction ? transaction.bookingType : (attendee.eventId ? "EVENT" : "COURSE");
    }

    // --- Common Validations ---
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.ENTITY_NOT_FOUND);
    }

    if (entityId && event._id.toString() !== entityId) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `This ticket does not belong to the selected ${bookingType === "EVENT" ? "event" : "course"}`,
      );
    }

    const isCreator = event.createdBy.toString() === userId;
    const isAssignedStaff = req.user.roleId === roleId.STAFF && event.assignedStaff && event.assignedStaff.some(id => id.toString() === userId);
    const isSuperAdmin = req.user.roleId === roleId.SUPER_ADMIN;

    if (!isCreator && !isAssignedStaff && !isSuperAdmin) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        `You are not authorized to view details for this ${bookingType === "EVENT" ? "event" : "course"}`,
      );
    }

    if (transaction && transaction.status !== "PAID") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Transaction is not PAID",
      );
    }

    title = event.eventTitle || event.courseTitle;
    if (bookingType === "EVENT") {
      endDate = event.endDate;
    } else {
      endDate = event.endDate || event.createdAt;
    }
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-CA");
    let actualEndDate = endDate;
    let isExpired = now > new Date(endDate);
    if (transaction && transaction.bookingType === "COURSE" && transaction.passExpiryDate) {
      actualEndDate = transaction.passExpiryDate;
      isExpired = now > new Date(transaction.passExpiryDate);
    }

    const checkedInToday = !!(attendee && attendee.checkInHistory && attendee.checkInHistory.some(entry => entry.sessionDate === todayStr));

    let isValid = false;
    let message = "";
    let isAlreadyCheckedIn = false;
    let checkedInAt = null;

    if (bookingType === "EVENT") {
      isAlreadyCheckedIn = attendee ? attendee.isCheckedIn : (transaction ? transaction.isCheckedIn : false);
      checkedInAt = attendee ? attendee.checkedInAt : (transaction ? transaction.checkedInAt : null);
      isValid = !isExpired && !isAlreadyCheckedIn;
      message = isValid ? "Ticket is valid for check-in" : (isExpired ? "Event has expired" : "Already checked in");
    } else {
      const course = event;
      if (course.enrollmentType === "fixedStart") {
        const totalSessions = course.totalSessions || 1;
        const attended = attendee ? (attendee.checkInHistory ? attendee.checkInHistory.length : 0) : 0;

        isAlreadyCheckedIn = attendee ? attendee.isCheckedIn : false;
        checkedInAt = attendee ? attendee.checkedInAt : null;
        isValid = !isExpired && (attended < totalSessions) && !checkedInToday;
        message = isValid ? "Ticket is valid for check-in" : (isExpired ? "Course has expired" : (attended >= totalSessions ? "All sessions checked in" : "Already checked in today"));
      } else {
        if (transaction && transaction.passType) {
          isAlreadyCheckedIn = checkedInToday;
          isValid = !isExpired && !checkedInToday;
          message = isValid ? "Pass is valid for check-in" : (isExpired ? "Pass has expired" : "Already checked in today");
        } else {
          const daysOfWeekMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const currentDayOfWeek = daysOfWeekMap[now.getDay()];

          const slots = transaction ? (transaction.ongoingSlots || []) : [];
          const allSlotsCheckedIn = slots.length > 0 && slots.every(s => s.isCheckedIn);
          const matchingSlots = slots.filter(s => s.selectedDate === todayStr || s.selectedDay === currentDayOfWeek);

          const uncheckedSlot = matchingSlots.find(slot => {
            return attendee && !attendee.checkInHistory.some(entry => entry.sessionDate === todayStr && entry.batchId === slot.batchId);
          });

          isAlreadyCheckedIn = allSlotsCheckedIn || (matchingSlots.length > 0 && !uncheckedSlot);
          isValid = !isExpired && !!uncheckedSlot;
          message = isValid ? "Session is valid for check-in" : (isExpired ? "Course has expired" : (matchingSlots.length === 0 ? `No booked session matches today (${currentDayOfWeek})` : "Already checked in for today's session"));
        }
      }
    }

    const todayCheckInPass = !!(transaction && transaction.passType && checkedInToday);

    // Build booked tickets list from transaction.tickets[] or fallback to single ticket
    const bookedTickets = [];
    if (transaction && transaction.tickets && transaction.tickets.length > 0) {
      transaction.tickets.forEach(t => {
        bookedTickets.push({
          ticketId:   t.ticketId,
          ticketName: t.ticketName,
          qty:        t.qty,
          unitPrice:  t.basePrice,
          subtotal:   t.basePrice * t.qty,
        });
      });
    } else if (transaction && transaction.ticketName) {
      bookedTickets.push({
        ticketId:   transaction.ticketId || null,
        ticketName: transaction.ticketName,
        qty:        transaction.qty || 1,
        unitPrice:  transaction.basePrice,
        subtotal:   transaction.basePrice * (transaction.qty || 1),
      });
    }

    const totalQty = bookedTickets.reduce((sum, t) => sum + t.qty, 0) || (transaction ? transaction.qty : 0);

    // Category name (event uses eventCategory, course uses courseCategory)
    const categoryName = event
      ? (event.eventCategory?.name || event.courseCategory?.name || null)
      : null;

    // Venue details
    const venue = event
      ? {
          venueName:    event.venueName || "Online",
          address:      event.venueAddress?.address || null,
          city:         event.venueAddress?.city || null,
          state:        event.venueAddress?.state || null,
          country:      event.venueAddress?.country || null,
          coordinates:  event.venueAddress?.coordinates || null,
        }
      : null;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket verified successfully", {
      isValid,
      message,
      isExpired,
      isAlreadyCheckedIn,
      checkedInAt,
      checkedInToday,
      todayCheckInPass,
      bookingType,
      event: event ? {
        _id:        event._id,
        title,
        category:   categoryName,
        venue,
        startDate:  event.startDate,
        endDate:    actualEndDate,
        startTime:  event.startTime || null,
        endTime:    event.endTime || null,
        posterImage: Array.isArray(event.posterImage) && event.posterImage.length > 0
          ? formatResponseUrl(event.posterImage[0])
          : (event.posterImage ? formatResponseUrl(event.posterImage) : null),
      } : null,
      booking: transaction ? {
        bookingId:     transaction.bookingId,
        totalQty,
        totalAmount:   transaction.totalAmount,
        basePrice:     transaction.basePrice,
        discountAmount: transaction.discountAmount || 0,
        taxAmount:     transaction.taxAmount || 0,
        status:        transaction.status,
        tickets:       bookedTickets,
        passType:      transaction.passType || null,
        passExpiryDate: transaction.passExpiryDate || null,
        checkedInQty:  transaction.checkedInQty || 0,
        isCheckedIn:   transaction.isCheckedIn,
        qrCodeData:    transaction.qrCodeData || "",
        user: transaction.userId ? {
          _id:          transaction.userId._id,
          firstName:    transaction.userId.firstName,
          lastName:     transaction.userId.lastName,
          email:        transaction.userId.email,
          profileImage: transaction.userId.profileImage ? formatResponseUrl(transaction.userId.profileImage) : null,
        } : null,
      } : null,
      attendee: attendee ? {
        _id:             attendee._id,
        firstName:       attendee.firstName,
        lastName:        attendee.lastName,
        email:           attendee.email,
        ticketNumber:    attendee.ticketNumber,
        ticketName:      attendee.ticketName,
        qty:             attendee.qty || 1,
        isCheckedIn:     attendee.isCheckedIn,
        checkInHistory:  attendee.checkInHistory || [],
        sessionsAttended: attendee.checkInHistory ? attendee.checkInHistory.length : 0,
        profileImage: attendee.userId && attendee.userId.profileImage
          ? formatResponseUrl(attendee.userId.profileImage)
          : (transaction && transaction.userId && transaction.userId.profileImage
              ? formatResponseUrl(transaction.userId.profileImage)
              : null),
      } : null,
    });
  } catch (error) {
    console.error("Error in verifyTicket:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post(
  "/create",
  perApiLimiter(),
  validateRequest(createAttendeesSchema),
  createAttendees,
);

router.get("/event/:eventId", perApiLimiter(), getEventAttendees);

router.get("/my-attendees", perApiLimiter(), getMyAttendees);

router.post(
  "/check-in",

  validateRequest(checkInSchema),
  checkInAttendee,
);

router.get("/ticket/:ticketNumber", getAttendeeByTicket);

router.post(
  "/scan-qr",

  validateRequest(scanQRSchema),
  scanQRAndCheckIn,
);

router.post(
  "/verify",

  validateRequest(verifySchema),
  verifyTicket,
);

router.verifyTicket = verifyTicket;

module.exports = router;

