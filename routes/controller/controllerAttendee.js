const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { Attendee, Event, Transaction, User, Course } = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes, formatResponseUrl, verifyQRPayload } = require("../../utils/globalFunction");
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

/**
 * Record a scan attempt in the attendee's scanHistory audit trail.
 * Non-fatal — never blocks the main scan flow.
 *
 * @param {Attendee} attendee    - Mongoose Attendee document
 * @param {string}   scannedBy   - User._id of the scanner
 * @param {string}   scanResult  - "SUCCESS" | "ALREADY_CHECKED_IN" | "TAMPERED" | "EXPIRED" | "CANCELLED" | "INVALID"
 * @param {string}   [notes]     - Optional extra context
 */
const recordScanAudit = async (attendee, scannedBy, scanResult, notes = null) => {
  try {
    attendee.scanHistory = attendee.scanHistory || [];
    attendee.scanHistory.push({
      scannedAt: new Date(),
      scannedBy,
      scanResult,
      notes,
    });
    await attendee.save();
  } catch (auditErr) {
    console.error("[ScanAudit] Failed to record scan:", auditErr.message);
  }
};

/**
 * Resolve an Attendee from the new secure QR format (STKТ.*).
 *
 * 1. Detects the secure QR prefix
 * 2. Fetches the transaction's HMAC secret (ticketSecretKey)
 * 3. Verifies the HMAC signature
 * 4. Returns the Attendee document if valid, or throws with a descriptive error
 *
 * @param {string} qrString  - The full QR code string
 * @returns {{ attendee: Attendee, transaction: Transaction, verifyResult: object }|null}
 *          Returns null if qrString is not the secure format (caller should handle legacy)
 */
const resolveAttendeeFromSecureQR = async (qrString) => {
  if (!qrString || (!qrString.startsWith("STKТ.") && !qrString.startsWith("STKT."))) {
    return null; // not secure format — let caller handle legacy
  }

  // Extract attendeeId from the payload (without verifying yet, for the DB fetch)
  try {
    const parts = qrString.split(".");
    if (parts.length !== 3) throw new Error("Malformed QR");

    // Decode payload (unverified at this point — only used to find the record)
    const rawPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const { attendeeId, transactionId } = rawPayload;

    if (!attendeeId || !transactionId) throw new Error("Payload missing required fields");

    // Fetch transaction WITH the secret key (select: false field)
    const txnWithSecret = await Transaction.findById(transactionId).select("+ticketSecretKey");
    if (!txnWithSecret || !txnWithSecret.ticketSecretKey) {
      throw new Error("TAMPERED: Could not find transaction or secret key for this QR");
    }

    // Now verify the HMAC signature
    const verifyResult = verifyQRPayload(qrString, txnWithSecret.ticketSecretKey);
    if (!verifyResult.valid) {
      throw new Error(`TAMPERED: ${verifyResult.error}`);
    }

    // Fetch the Attendee document
    const attendee = await Attendee.findById(attendeeId)
      .populate("eventId")
      .populate("courseId")
      .populate("userId", "firstName lastName email profileImage contactNumber");

    if (!attendee) throw new Error("Ticket not found — may have been deleted");

    // Re-fetch transaction with full data for check-in
    const transaction = await Transaction.findById(transactionId)
      .populate("eventId")
      .populate("courseId")
      .populate("userId", "firstName lastName email profileImage");

    return { attendee, transaction, verifyResult };
  } catch (err) {
    throw err; // Re-throw for caller to handle
  }
};

/**
 * Resolve and consume a subBookingId QR code in one atomic step.
 *
 * - Finds the transaction whose tickets[].qrs[] has the matching subBookingId
 * - Rejects immediately if that specific QR is already checked in
 * - Stamps isCheckedIn=true / checkedInAt / checkedInBy on that QR entry (arrayFilters)
 * - Returns { transaction, ticketId } so the caller can find the right Attendee
 *
 * @param {string} subBookingId  e.g. "BNDY-133947-2"
 * @param {string} scannedBy     userId of the organizer/staff doing the scan
 * @returns {{ transaction, ticketId, qrEntry }} or throws with a descriptive error
 */
const resolveSubBookingQR = async (subBookingId, scannedBy) => {
  // 1. Find transaction atomically — only match if that specific QR is NOT yet checked in.
  // We use nested $elemMatch because tickets and qrs are both arrays (nested array structure).
  const transaction = await Transaction.findOneAndUpdate(
    {
      tickets: {
        $elemMatch: {
          qrs: {
            $elemMatch: { subBookingId, isCheckedIn: false }
          }
        }
      }
    },
    {
      $set: {
        "tickets.$[ticket].qrs.$[qr].isCheckedIn": true,
        "tickets.$[ticket].qrs.$[qr].checkedInAt": new Date(),
        "tickets.$[ticket].qrs.$[qr].checkedInBy": scannedBy,
      },
    },
    {
      arrayFilters: [
        { "ticket.qrs.subBookingId": subBookingId },
        { "qr.subBookingId": subBookingId },
      ],
      new: true,
    },
  )
    .populate({ path: "eventId", populate: { path: "eventCategory", select: "name" } })
    .populate({ path: "courseId", populate: { path: "courseCategory", select: "name" } })
    .populate("userId", "firstName lastName email profileImage");

  if (!transaction) {
    // Either the QR doesn't exist at all, or it's already been checked in
    // Do a read-only lookup to distinguish the two cases
    const existing = await Transaction.findOne({
      "tickets.qrs.subBookingId": subBookingId,
    });
    if (!existing) {
      throw new Error("TICKET_NOT_FOUND: No ticket found for this QR code");
    }
    throw new Error("ALREADY_CHECKED_IN: This QR code has already been scanned and checked in");
  }

  // Find which ticket type this QR belongs to
  let foundTicket = null;
  let foundQREntry = null;
  for (const t of transaction.tickets) {
    if (t.qrs) {
      const qr = t.qrs.find((q) => q.subBookingId === subBookingId);
      if (qr) {
        foundTicket = t;
        foundQREntry = qr;
        break;
      }
    }
  }

  return { transaction, ticketId: foundTicket?.ticketId, qrEntry: foundQREntry };
};

/**
 * Resolve a per-slot QR code (ongoing course session).
 *
 * - Finds the transaction whose ongoingSlots[].subBookingId matches
 * - Returns { transaction, slot } so the caller can proceed with the attendee check-in.
 * - Validation (day matching, daily double-scan prevention) is handled by executeAttendeeCheckIn.
 *
 * @param {string} subBookingId  e.g. "BNDY-554421-SLOT-1"
 * @param {string} scannedBy     userId of the scanner
 */
const resolveSlotQR = async (subBookingId, scannedBy) => {
  const transaction = await Transaction.findOne({
    "ongoingSlots.subBookingId": subBookingId,
  })
    .populate({ path: "courseId", populate: { path: "courseCategory", select: "name" } })
    .populate("userId", "firstName lastName email profileImage");

  if (!transaction) {
    throw new Error("TICKET_NOT_FOUND: No session found for this QR code");
  }

  const slot = transaction.ongoingSlots.find((s) => s.subBookingId === subBookingId);
  return { transaction, slot };
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
        // Always use the actual check-in date (or manually passed selectedDate) for history logging,
        // ignoring targetSlot.selectedDate so that recurring scans log the correct day.
        const slotDate = selectedDate || todayStr;
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

        // Note: For recurring ongoing courses, we intentionally do NOT set attendee.isCheckedIn = true
        // so they can keep scanning every week.
        await attendee.save();

        // Update check-in timestamps on transaction's ongoingSlot subdocument
        const slotInTx = transaction.ongoingSlots.id(targetSlot._id);
        if (slotInTx) {
          // Intentionally NOT setting slotInTx.isCheckedIn = true to keep it recurring forever
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
        // TICKET- format — detect per-ticket (TICKET-BNDY-XXXXXX-N-txnId) vs legacy (TICKET-txnId-...)
        const parts = ticketNumber.split("-");
        let transactionId;
        let matchedSubBookingId = null;

        if (parts[1] === "BNDY") {
          // Detect: TICKET-BNDY-XXXXXX-SLOT-N-txnId-ts  (ongoing course slot)
          //      vs TICKET-BNDY-XXXXXX-N-txnId-ts        (event ticket)
          const isSlotQR = parts[3] === "SLOT";
          if (isSlotQR) {
            const matchedSubBookingId = `${parts[1]}-${parts[2]}-SLOT-${parts[4]}`; // BNDY-554421-SLOT-1
            try {
              const resolved = await resolveSlotQR(matchedSubBookingId, userId);
              transaction = resolved.transaction;
              await ensureAttendeesExist(transaction);
              attendee = await Attendee.findOne({
                transactionId: transaction._id,
                isCheckedIn: false,
              }).populate("courseId");
              if (!attendee) {
                attendee = await Attendee.findOne({ transactionId: transaction._id }).populate("courseId");
              }
            } catch (qrErr) {
              const isAlready = qrErr.message && qrErr.message.startsWith("ALREADY_CHECKED_IN");
              return apiErrorRes(
                isAlready ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND,
                res,
                isAlready ? "This session has already been scanned and checked in" : "Session not found for this QR code",
              );
            }
          } else {
            // Per-ticket event QR: TICKET-BNDY-XXXXXX-N-txnId-ts
            const matchedSubBookingId = `${parts[1]}-${parts[2]}-${parts[3]}`;
            try {
              const resolved = await resolveSubBookingQR(matchedSubBookingId, userId);
              transaction = resolved.transaction;
              await ensureAttendeesExist(transaction);
              attendee = await Attendee.findOne({
                transactionId: transaction._id,
                ticketId: resolved.ticketId,
                isCheckedIn: false,
              }).populate("eventId").populate("courseId");
              if (!attendee) {
                attendee = await Attendee.findOne({
                  transactionId: transaction._id,
                  ticketId: resolved.ticketId,
                }).populate("eventId").populate("courseId");
              }
            } catch (qrErr) {
              const isAlready = qrErr.message && qrErr.message.startsWith("ALREADY_CHECKED_IN");
              return apiErrorRes(
                isAlready ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND,
                res,
                isAlready ? "This QR code has already been scanned and checked in" : "Ticket not found for this QR code",
              );
            }
          }
        } else {
          transactionId = parts[1];
          transaction = await Transaction.findById(transactionId);
          if (transaction) {
            await ensureAttendeesExist(transaction);
            attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
              .populate("eventId")
              .populate("courseId");
          }
        }
      }
    }
    // Handle sub-booking ID (BNDY-531806-1) or parent booking ID (BNDY-531806)
    else if (ticketNumber.startsWith("BNDY-")) {
      const bndyParts = ticketNumber.split("-");
      const isSubBooking = bndyParts.length === 3; // BNDY-531806-1 has 3 parts

      if (isSubBooking) {
        // Sub-booking ID (BNDY-531806-1) — resolve atomically via resolveSubBookingQR
        try {
          const resolved = await resolveSubBookingQR(ticketNumber, userId);
          transaction = resolved.transaction;
          await ensureAttendeesExist(transaction);
          attendee = await Attendee.findOne({
            transactionId: transaction._id,
            ticketId: resolved.ticketId,
            isCheckedIn: false,
          }).populate("eventId").populate("courseId");
          if (!attendee) {
            attendee = await Attendee.findOne({
              transactionId: transaction._id,
              ticketId: resolved.ticketId,
            }).populate("eventId").populate("courseId");
          }
        } catch (qrErr) {
          const isAlready = qrErr.message && qrErr.message.startsWith("ALREADY_CHECKED_IN");
          return apiErrorRes(
            isAlready ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND,
            res,
            isAlready ? "This QR code has already been scanned and checked in" : "Ticket not found for this sub-booking ID",
          );
        }
      } else {
        // Parent booking ID (BNDY-531806) — original behaviour
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

    // Determine if it's a Secure QR, Transaction QR, Attendee QR, or User ID QR

    // ── Case 0: NEW Secure QR format (STKТ.* / STKT.*) ───────────────────────
    if (qrCodeData.startsWith("STKТ.") || qrCodeData.startsWith("STKT.")) {
      let secureResolved;
      try {
        secureResolved = await resolveAttendeeFromSecureQR(qrCodeData);
      } catch (secureErr) {
        const isTampered = secureErr.message && secureErr.message.includes("TAMPERED");
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          isTampered ? constantsMessage.TAMPERED_QR : constantsMessage.TICKET_NOT_FOUND,
        );
      }

      if (!secureResolved) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TAMPERED_QR);
      }

      const { attendee: secureAttendee, transaction: secureTxn } = secureResolved;

      // Validate ticket status BEFORE check-in
      if (secureAttendee.status === "CANCELLED") {
        await recordScanAudit(secureAttendee, organizerId, "CANCELLED", "Ticket is cancelled");
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TICKET_CANCELLED);
      }
      if (secureAttendee.status === "REFUNDED") {
        await recordScanAudit(secureAttendee, organizerId, "CANCELLED", "Ticket is refunded");
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.TICKET_REFUNDED);
      }

      // Authorization: must be creator, assigned staff, or super admin
      const secureEvent = secureAttendee.eventId || secureAttendee.courseId;
      if (!secureEvent) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.ENTITY_NOT_FOUND);
      }
      const isCreatorSec = secureEvent.createdBy.toString() === organizerId;
      const isStaffSec = req.user.roleId === roleId.STAFF && secureEvent.assignedStaff &&
        secureEvent.assignedStaff.some(id => id.toString() === organizerId);
      const isAdminSec = req.user.roleId === roleId.SUPER_ADMIN;
      if (!isCreatorSec && !isStaffSec && !isAdminSec) {
        return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, "You are not authorized to check-in attendees for this event/course");
      }

      // Perform check-in
      try {
        const checkInResult = await executeAttendeeCheckIn(secureAttendee, secureTxn, organizerId, selectedDate, batchId);
        // Record successful scan in audit log
        await recordScanAudit(secureAttendee, organizerId, "SUCCESS", `Checked in ticket #${secureAttendee.ticketIndex}`);
        return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.CHECK_IN_SUCCESS, {
          type: "SECURE_TICKET",
          attendee: checkInResult.attendee,
          event: { eventTitle: secureEvent.eventTitle || secureEvent.courseTitle },
          bookingId: secureTxn?.bookingId,
          totalQty: secureTxn?.qty,
          checkedInQty: secureTxn?.checkedInQty,
          validationStatus: "SUCCESS",
        });
      } catch (checkInErr) {
        const isAlreadyIn = checkInErr.message && checkInErr.message.toLowerCase().includes("already checked");
        await recordScanAudit(
          secureAttendee,
          organizerId,
          isAlreadyIn ? "ALREADY_CHECKED_IN" : "INVALID",
          checkInErr.message,
        );
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, checkInErr.message);
      }
    }

    if (qrCodeData.startsWith("TICKET-")) {
      // Case 1: Transaction QR or Per-ticket QR
      const parts = qrCodeData.split("-");

      if (parts[1] === "BNDY") {
        // Detect: TICKET-BNDY-XXXXXX-SLOT-N-txnId-ts  (ongoing course slot)
        //      vs TICKET-BNDY-XXXXXX-N-txnId-ts        (event ticket)
        const isSlotQR = parts[3] === "SLOT";
        if (isSlotQR) {
          const matchedSubBookingId = `${parts[1]}-${parts[2]}-SLOT-${parts[4]}`; // BNDY-554421-SLOT-1
          try {
            const resolved = await resolveSlotQR(matchedSubBookingId, organizerId);
            transaction = resolved.transaction;
            await ensureAttendeesExist(transaction);
            event = transaction.courseId;
            title = event ? event.courseTitle : "";
            endDate = event?.endDate || event?.createdAt;
            attendee = await Attendee.findOne({
              transactionId: transaction._id,
              isCheckedIn: false,
            }).populate("courseId").populate("userId", "firstName lastName email profileImage");
            if (!attendee) {
              attendee = await Attendee.findOne({ transactionId: transaction._id })
                .populate("courseId").populate("userId", "firstName lastName email profileImage");
            }
          } catch (qrErr) {
            const isAlready = qrErr.message && qrErr.message.startsWith("ALREADY_CHECKED_IN");
            return apiErrorRes(
              isAlready ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND,
              res,
              isAlready ? "This session has already been scanned and checked in" : "Session not found for this QR code",
            );
          }
        } else {
          // Per-ticket event QR: TICKET-BNDY-XXXXXX-N-transactionId-timestamp
          const matchedSubBookingId = `${parts[1]}-${parts[2]}-${parts[3]}`;
          try {
            const resolved = await resolveSubBookingQR(matchedSubBookingId, organizerId);
            transaction = resolved.transaction;
            await ensureAttendeesExist(transaction);
            event = transaction.eventId || transaction.courseId;
            title = event ? event.eventTitle || event.courseTitle : "";
            endDate = transaction.bookingType === "EVENT" ? event?.endDate : (event?.endDate || event?.createdAt);

            attendee = await Attendee.findOne({
              transactionId: transaction._id,
              ticketId: resolved.ticketId,
              isCheckedIn: false,
            }).populate("eventId").populate("courseId").populate("userId", "firstName lastName email profileImage");
            if (!attendee) {
              attendee = await Attendee.findOne({
                transactionId: transaction._id,
                ticketId: resolved.ticketId,
              }).populate("eventId").populate("courseId").populate("userId", "firstName lastName email profileImage");
            }
          } catch (qrErr) {
            const isAlready = qrErr.message && qrErr.message.startsWith("ALREADY_CHECKED_IN");
            return apiErrorRes(
              isAlready ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND,
              res,
              isAlready ? "This QR code has already been scanned and checked in" : "Ticket not found for this QR code",
            );
          }
        }
      } else {
        // Legacy format: TICKET-transactionId-userId-timestamp
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
        endDate = transaction.bookingType === "EVENT" ? event?.endDate : (event?.endDate || event?.createdAt);
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

    // ── Secure QR format (STKТ.* / STKT.*) — highest priority ───────────────
    if (code.startsWith("STKТ.") || code.startsWith("STKT.")) {
      let secureResolved;
      try {
        secureResolved = await resolveAttendeeFromSecureQR(code);
      } catch (secureErr) {
        const isTampered = secureErr.message && secureErr.message.includes("TAMPERED");
        return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket verification result", {
          isValid: false,
          validationStatus: isTampered ? "TAMPERED" : "INVALID",
          message: isTampered ? constantsMessage.TAMPERED_QR : "Ticket not found or invalid",
          isExpired: false,
          isAlreadyCheckedIn: false,
          event: null,
          booking: null,
          attendee: null,
        });
      }

      if (!secureResolved) {
        return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket verification result", {
          isValid: false,
          validationStatus: "TAMPERED",
          message: constantsMessage.TAMPERED_QR,
          event: null, booking: null, attendee: null,
        });
      }

      const { attendee: secureAtt, transaction: secureTxn } = secureResolved;

      // ── Authorization check ──
      const secureEvent = secureAtt.eventId || secureAtt.courseId;
      if (secureEvent) {
        const isCreator = secureEvent.createdBy.toString() === userId;
        const isStaff = req.user.roleId === roleId.STAFF && secureEvent.assignedStaff &&
          secureEvent.assignedStaff.some(id => id.toString() === userId);
        const isAdmin = req.user.roleId === roleId.SUPER_ADMIN;
        if (!isCreator && !isStaff && !isAdmin) {
          return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, `You are not authorized to verify tickets for this ${secureAtt.eventId ? "event" : "course"}`);
        }
      }

      // ── Status checks ──
      const now = new Date();
      const todayStr = now.toLocaleDateString("en-CA");

      if (secureAtt.status === "CANCELLED") {
        await recordScanAudit(secureAtt, userId, "CANCELLED", "Ticket is cancelled");
        return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket verification result", {
          isValid: false,
          validationStatus: "CANCELLED",
          message: constantsMessage.TICKET_CANCELLED,
          isExpired: false,
          isAlreadyCheckedIn: false,
          event: secureEvent ? { _id: secureEvent._id, title: secureEvent.eventTitle || secureEvent.courseTitle } : null,
          booking: null,
          attendee: { _id: secureAtt._id, ticketNumber: secureAtt.ticketNumber, status: secureAtt.status },
        });
      }
      if (secureAtt.status === "REFUNDED") {
        await recordScanAudit(secureAtt, userId, "CANCELLED", "Ticket is refunded");
        return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket verification result", {
          isValid: false,
          validationStatus: "CANCELLED",
          message: constantsMessage.TICKET_REFUNDED,
          isExpired: false,
          isAlreadyCheckedIn: false,
          event: secureEvent ? { _id: secureEvent._id, title: secureEvent.eventTitle || secureEvent.courseTitle } : null,
          booking: null,
          attendee: { _id: secureAtt._id, ticketNumber: secureAtt.ticketNumber, status: secureAtt.status },
        });
      }

      // ── Expiry check ──
      let isExpired = false;
      let actualEndDate = secureEvent?.endDate;
      if (secureTxn?.passExpiryDate) {
        actualEndDate = secureTxn.passExpiryDate;
        isExpired = now > new Date(secureTxn.passExpiryDate);
      } else if (actualEndDate) {
        isExpired = now > new Date(actualEndDate);
      }

      // ── Already checked in? ──
      const isAlreadyCheckedIn = secureAtt.bookingType === "COURSE"
        ? (secureAtt.checkInHistory || []).some(e => e.sessionDate === todayStr)
        : secureAtt.isCheckedIn;

      const isValid = !isExpired && !isAlreadyCheckedIn;
      const scanResultCode = isExpired ? "EXPIRED" : (isAlreadyCheckedIn ? "ALREADY_CHECKED_IN" : "SUCCESS");

      // Record scan in audit trail
      await recordScanAudit(secureAtt, userId, scanResultCode, isValid ? "Verify-only scan" : null);

      const vTitle = secureEvent?.eventTitle || secureEvent?.courseTitle || "";

      return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket verified successfully", {
        isValid,
        validationStatus: scanResultCode,
        message: isValid
          ? "Ticket is valid for check-in"
          : (isExpired ? "Ticket has expired" : "This ticket has already been checked in"),
        isExpired,
        isAlreadyCheckedIn,
        checkedInAt: secureAtt.checkedInAt || null,
        checkedInToday: (secureAtt.checkInHistory || []).some(e => e.sessionDate === todayStr),
        bookingType: secureTxn?.bookingType || (secureAtt.eventId ? "EVENT" : "COURSE"),
        event: secureEvent ? {
          _id: secureEvent._id,
          title: vTitle,
          startDate: secureEvent.startDate,
          endDate: actualEndDate,
          posterImage: Array.isArray(secureEvent.posterImage) && secureEvent.posterImage.length > 0
            ? formatResponseUrl(secureEvent.posterImage[0])
            : (secureEvent.posterImage ? formatResponseUrl(secureEvent.posterImage) : null),
        } : null,
        booking: secureTxn ? {
          bookingId: secureTxn.bookingId,
          totalQty: secureTxn.qty,
          totalAmount: secureTxn.totalAmount,
          status: secureTxn.status,
          checkedInQty: secureTxn.checkedInQty || 0,
          passType: secureTxn.passType || null,
          passExpiryDate: secureTxn.passExpiryDate || null,
        } : null,
        attendee: {
          _id: secureAtt._id,
          firstName: secureAtt.firstName,
          lastName: secureAtt.lastName,
          email: secureAtt.email,
          ticketNumber: secureAtt.ticketNumber,
          ticketName: secureAtt.ticketName,
          ticketIndex: secureAtt.ticketIndex,
          isPass: secureAtt.isPass,
          status: secureAtt.status,
          isCheckedIn: secureAtt.isCheckedIn,
          checkInHistory: secureAtt.checkInHistory || [],
          sessionsAttended: (secureAtt.checkInHistory || []).length,
          profileImage: secureAtt.userId?.profileImage ? formatResponseUrl(secureAtt.userId.profileImage) : null,
        },
      });
    }

    let matchedQrEntry = null;

    if (code.startsWith("TICKET-")) {
      const parts = code.split("-");
      let transactionId;
      let matchedSubBookingId = null;

      // Check if it matches the per-ticket format: TICKET-BNDY-XXXXXX-N-transactionId-timestamp
      // Or the slot format: TICKET-BNDY-XXXXXX-SLOT-N-transactionId-timestamp
      if (parts[1] === "BNDY") {
        const isSlotQR = parts[3] === "SLOT";
        if (isSlotQR) {
          matchedSubBookingId = `${parts[1]}-${parts[2]}-SLOT-${parts[4]}`; // e.g. BNDY-455300-SLOT-1
          transactionId = parts[5];
        } else {
          matchedSubBookingId = `${parts[1]}-${parts[2]}-${parts[3]}`; // e.g. BNDY-455300-1
          transactionId = parts[4];
        }
      } else {
        transactionId = parts[1];
      }

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

      if (matchedSubBookingId) {
        const isSlotQR = parts[3] === "SLOT";
        if (isSlotQR) {
          // Find the specific slot in ongoingSlots
          const slot = transaction.ongoingSlots?.find(s => s.subBookingId === matchedSubBookingId);
          if (slot) matchedQrEntry = slot;

          attendee = await Attendee.findOne({
            transactionId: transaction._id,
            isCheckedIn: false,
          })
            .populate("courseId")
            .populate("userId", "firstName lastName email profileImage");
          if (!attendee) {
            attendee = await Attendee.findOne({ transactionId: transaction._id })
              .populate("courseId")
              .populate("userId", "firstName lastName email profileImage");
          }
        } else {
          // Find the specific ticket inside the tickets array matching our subBookingId via the qrs array
          const matchedTicket = transaction.tickets.find((t) => t.qrs && t.qrs.some(qr => qr.subBookingId === matchedSubBookingId));
          if (matchedTicket) {
            matchedQrEntry = matchedTicket.qrs.find(qr => qr.subBookingId === matchedSubBookingId);
            attendee = await Attendee.findOne({
              transactionId: transaction._id,
              ticketId: matchedTicket.ticketId,
              isCheckedIn: false,
            })
              .populate("eventId")
              .populate("courseId")
              .populate("userId", "firstName lastName email profileImage");
            if (!attendee) {
              attendee = await Attendee.findOne({
                transactionId: transaction._id,
                ticketId: matchedTicket.ticketId,
              })
                .populate("eventId")
                .populate("courseId")
                .populate("userId", "firstName lastName email profileImage");
            }
          }
        }
      }

      // Fallback if no specific attendee is loaded yet
      if (!attendee) {
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
      }
    } else if (code.startsWith("ATTENDEE-")) {
      // Always try exact match first (handles both old and new format)
      attendee = await Attendee.findOne({ qrCodeData: code })
        .populate("eventId")
        .populate("courseId")
        .populate("userId", "firstName lastName email profileImage")
        .populate("transactionId", "bookingId totalAmount status bookingType");

      if (!attendee) {
        const parts = code.split("-");
        // New format: ATTENDEE-BNDY-XXXXXX-TKT-XXXX-timestamp-attendeeId-timestamp
        // Old format: ATTENDEE-TKT-XXXX-timestamp-attendeeId-timestamp
        // In new format parts[1] = "BNDY", so ticketNum starts at index 3
        // In old format parts[1] = "TKT", so ticketNum starts at index 1
        const hasBndy = parts[1] === "BNDY";
        // The last 2 parts are always attendeeId and timestamp; ticketNum is between
        const ticketStartIdx = hasBndy ? 3 : 1;
        const ticketNum = parts.slice(ticketStartIdx, -2).join("-");
        if (ticketNum) {
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
      // Detect sub-booking IDs (BNDY-455300-1) vs parent booking IDs (BNDY-455300)
      // A sub-booking ID has 3 dash-separated segments; a parent has 2.
      const bndyParts = code.split("-");
      const isSubBooking = bndyParts.length === 3; // e.g. ["BNDY", "455300", "1"]

      if (isSubBooking) {
        // Find the transaction that contains this subBookingId in its tickets[].qrs
        const parentBookingId = `${bndyParts[0]}-${bndyParts[1]}`; // BNDY-455300
        transaction = await Transaction.findOne({
          bookingId: parentBookingId,
          "tickets.qrs.subBookingId": code,
        })
          .populate({ path: "eventId", populate: { path: "eventCategory", select: "name" } })
          .populate({ path: "courseId", populate: { path: "courseCategory", select: "name" } })
          .populate("userId", "firstName lastName email profileImage");

        if (!transaction) {
          return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found for this sub-booking ID");
        }
        await ensureAttendeesExist(transaction);
        event = transaction.eventId || transaction.courseId;
        bookingType = transaction.bookingType;

        // Find the matched ticket type to pick the right attendee by ticketId
        const matchedTicket = transaction.tickets.find((t) => t.qrs && t.qrs.some(qr => qr.subBookingId === code));
        if (matchedTicket) {
          matchedQrEntry = matchedTicket.qrs.find(qr => qr.subBookingId === code);
          attendee = await Attendee.findOne({
            transactionId: transaction._id,
            ticketId: matchedTicket.ticketId,
            isCheckedIn: false,
          })
            .populate("eventId")
            .populate("courseId")
            .populate("userId", "firstName lastName email profileImage");
          if (!attendee) {
            attendee = await Attendee.findOne({
              transactionId: transaction._id,
              ticketId: matchedTicket.ticketId,
            })
              .populate("eventId")
              .populate("courseId")
              .populate("userId", "firstName lastName email profileImage");
          }
        }

        // Fallback to any attendee on the transaction
        if (!attendee) {
          attendee = await Attendee.findOne({ transactionId: transaction._id, isCheckedIn: false })
            .populate("eventId")
            .populate("courseId")
            .populate("userId", "firstName lastName email profileImage");
        }
      } else {
        // Parent booking ID — existing behaviour
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
      } // end else (parent BNDY)
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
      if (matchedQrEntry) {
        isAlreadyCheckedIn = matchedQrEntry.isCheckedIn;
        checkedInAt = matchedQrEntry.checkedInAt;
      } else {
        isAlreadyCheckedIn = attendee ? attendee.isCheckedIn : (transaction ? transaction.isCheckedIn : false);
        checkedInAt = attendee ? attendee.checkedInAt : (transaction ? transaction.checkedInAt : null);
      }
      isValid = !isExpired && !isAlreadyCheckedIn;
      message = isValid ? "Ticket is valid for check-in" : (isExpired ? "Event has expired" : "Already checked in");
    } else {
      const course = event;
      if (course.enrollmentType === "fixedStart") {
        const totalSessions = course.totalSessions || 1;
        const attended = attendee ? (attendee.checkInHistory ? attendee.checkInHistory.length : 0) : 0;

        if (matchedQrEntry) {
          isAlreadyCheckedIn = matchedQrEntry.isCheckedIn;
        } else {
          isAlreadyCheckedIn = attendee ? attendee.isCheckedIn : false;
        }
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
          ticketId: t.ticketId,
          ticketName: t.ticketName,
          qty: t.qty,
          unitPrice: t.basePrice,
          subtotal: t.basePrice * t.qty,
        });
      });
    } else if (transaction && transaction.ticketName) {
      bookedTickets.push({
        ticketId: transaction.ticketId || null,
        ticketName: transaction.ticketName,
        qty: transaction.qty || 1,
        unitPrice: transaction.basePrice,
        subtotal: transaction.basePrice * (transaction.qty || 1),
      });
    }

    const totalQty = bookedTickets.reduce((sum, t) => sum + t.qty, 0) || (transaction ? transaction.qty : 0);

    // Populate userId with contactNumber dynamically if needed
    if (transaction && transaction.populate) {
      await transaction.populate("userId", "firstName lastName email profileImage contactNumber");
    }
    if (attendee && attendee.populate) {
      await attendee.populate("userId", "firstName lastName email profileImage contactNumber");
    }

    // Category name (event uses eventCategory, course uses courseCategory)
    const categoryName = event
      ? (event.eventCategory?.name || event.courseCategory?.name || null)
      : null;

    // Venue details
    const venue = event
      ? {
        venueName: event.venueName || "Online",
        address: event.venueAddress?.address || null,
        city: event.venueAddress?.city || null,
        state: event.venueAddress?.state || null,
        country: event.venueAddress?.country || null,
        coordinates: event.venueAddress?.coordinates || null,
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
        _id: event._id,
        title,
        category: categoryName,
        venue,
        startDate: event.startDate,
        endDate: actualEndDate,
        startTime: event.startTime || null,
        endTime: event.endTime || null,
        posterImage: Array.isArray(event.posterImage) && event.posterImage.length > 0
          ? formatResponseUrl(event.posterImage[0])
          : (event.posterImage ? formatResponseUrl(event.posterImage) : null),
      } : null,
      booking: transaction ? {
        bookingId: transaction.bookingId,
        totalQty,
        totalAmount: transaction.totalAmount,
        basePrice: transaction.basePrice,
        discountAmount: transaction.discountAmount || 0,
        taxAmount: transaction.taxAmount || 0,
        status: transaction.status,
        tickets: bookedTickets,
        passType: transaction.passType || null,
        passExpiryDate: transaction.passExpiryDate || null,
        checkedInQty: transaction.checkedInQty || 0,
        isCheckedIn: transaction.isCheckedIn,
        qrCodeData: transaction.qrCodeData || "",
        batchId: transaction.batchId || null,
        ongoingSlots: transaction.ongoingSlots || [],
        user: transaction.userId ? {
          _id: transaction.userId._id,
          firstName: transaction.userId.firstName,
          lastName: transaction.userId.lastName,
          email: transaction.userId.email,
          profileImage: transaction.userId.profileImage ? formatResponseUrl(transaction.userId.profileImage) : null,
          contactNumber: transaction.userId.contactNumber || null,
        } : null,
      } : null,
      attendee: attendee ? {
        _id: attendee._id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        contactNumber: attendee.contactNumber || (attendee.userId && attendee.userId.contactNumber) || (transaction && transaction.userId && transaction.userId.contactNumber) || null,
        ticketNumber: attendee.ticketNumber,
        ticketName: attendee.ticketName,
        qty: attendee.qty || 1,
        isCheckedIn: attendee.isCheckedIn,
        checkInHistory: attendee.checkInHistory || [],
        sessionsAttended: attendee.checkInHistory ? attendee.checkInHistory.length : 0,
        profileImage: attendee.userId && attendee.userId.profileImage
          ? formatResponseUrl(attendee.userId.profileImage)
          : (transaction && transaction.userId && transaction.userId.profileImage
            ? formatResponseUrl(transaction.userId.profileImage)
            : null),
        batchId: attendee.batchId || null,
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

