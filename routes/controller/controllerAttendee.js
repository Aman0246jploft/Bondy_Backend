const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { Attendee, Event, Transaction, User } = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const Joi = require("joi");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");

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

// Validation Schemas
const createAttendeesSchema = Joi.object({
  transactionId: Joi.string().required(),
  attendees: Joi.array()
    .items(
      Joi.object({
        firstName: Joi.string().trim().required(),
        lastName: Joi.string().trim().required(),
        email: Joi.string().email().required(),
        contactNumber: Joi.string().trim().optional(),
      }),
    )
    .min(1)
    .required(),
});

const checkInSchema = Joi.object({
  ticketNumber: Joi.string().required(),
});

const scanQRSchema = Joi.object({
  qrCodeData: Joi.string().required(),
  eventId: Joi.string().optional(), // Required for User profile scans
});

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
    }).populate("eventId");

    if (!transaction) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Transaction not found or not paid",
      );
    }

    // ✅ Check if event has expired
    const event = transaction.eventId;
    const now = new Date();

    if (now > new Date(event.endDate)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Cannot create attendees - Event has expired",
        {
          event: {
            eventTitle: event.eventTitle,
            endDate: event.endDate,
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

    // Create Attendees
    const attendeeDocuments = attendees.map((attendee, index) => {
      const ticketNumber = generateTicketNumber(transaction.eventId, index + 1);
      return {
        transactionId: transaction._id,
        eventId: transaction.eventId,
        userId: transaction.userId,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        contactNumber: attendee.contactNumber || null,
        ticketNumber,
        qrCodeData: "", // Will be set after creation
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
      "Attendees created successfully",
      {
        attendees: createdAttendees,
      },
    );
  } catch (error) {
    console.error("Error in createAttendees:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2. Get Attendees for an Event (Organizer Only)
const getEventAttendees = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const { page = 1, limit = 50, search = "", checkedIn } = req.query;

    // Verify Event Ownership
    const event = await Event.findById(eventId);
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    if (event.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to view attendees for this event",
      );
    }

    // Build query
    const query = { eventId };

    // Filter by check-in status
    if (checkedIn !== undefined) {
      query.isCheckedIn = checkedIn === "true";
    }

    // Search by name or email
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { ticketNumber: { $regex: search, $options: "i" } },
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
      { $match: { eventId: event._id } },
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
      "Attendees fetched successfully",
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
      "Your attendees fetched successfully",
      {
        attendees,
      },
    );
  } catch (error) {
    console.error("Error in getMyAttendees:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 4. Check-in Attendee (Organizer Only)
const checkInAttendee = async (req, res) => {
  try {
    const { ticketNumber } = req.body;
    const userId = req.user.userId;

    // Find Attendee
    const attendee = await Attendee.findOne({ ticketNumber }).populate(
      "eventId",
    );

    if (!attendee) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found");
    }

    // Verify Event Ownership
    if (attendee.eventId.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to check-in attendees for this event",
      );
    }

    // Check if already checked in
    if (attendee.isCheckedIn) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Attendee already checked in at ${attendee.checkedInAt}`,
      );
    }

    // Update check-in status
    attendee.isCheckedIn = true;
    attendee.checkedInAt = new Date();
    attendee.checkedInBy = userId;
    await attendee.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Check-in successful", {
      attendee,
    });
  } catch (error) {
    console.error("Error in checkInAttendee:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 5. Get Attendee by Ticket Number (for verification)
const getAttendeeByTicket = async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const userId = req.user.userId;

    const attendee = await Attendee.findOne({ ticketNumber })
      .populate("eventId")
      .populate("userId", "firstName lastName email profileImage")
      .populate("transactionId", "bookingId totalAmount");

    if (!attendee) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found");
    }

    // Verify Event Ownership
    if (attendee.eventId.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to view this ticket",
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Attendee details fetched successfully",
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
    const { qrCodeData, eventId } = req.body;
    const organizerId = req.user.userId;

    if (!qrCodeData) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "QR code data is required",
      );
    }

    let attendee = null;
    let transaction = null;
    let event = null;

    // Determine if it's a Transaction QR, Attendee QR, or User ID QR
    if (qrCodeData.startsWith("TICKET-")) {
      // Case 1: Transaction QR
      const parts = qrCodeData.split("-");
      const transactionId = parts[1];

      transaction = await Transaction.findById(transactionId)
        .populate("eventId")
        .populate("userId", "firstName lastName email profileImage");

      if (!transaction) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Transaction not found");
      }
      event = transaction.eventId;
    } else if (qrCodeData.startsWith("ATTENDEE-")) {
      // Case 2: Individual Attendee QR
      attendee = await Attendee.findOne({ qrCodeData })
        .populate("eventId")
        .populate("userId", "firstName lastName email profileImage")
        .populate("transactionId", "bookingId totalAmount status");

      if (!attendee) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "Individual ticket not found",
        );
      }
      event = attendee.eventId;
      transaction = attendee.transactionId;
    } else if (mongoose.Types.ObjectId.isValid(qrCodeData)) {
      // Case 3: User ID Scan (Profile QR)
      if (!eventId) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "eventId is required for User profile scans",
        );
      }

      event = await Event.findById(eventId);
      if (!event) {
        return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
      }

      // Find an active paid transaction for this user and event
      transaction = await Transaction.findOne({
        userId: qrCodeData,
        eventId: eventId,
        status: "PAID",
      }).populate("userId", "firstName lastName email profileImage");

      if (!transaction) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "No paid booking found for this user for this event",
        );
      }
    } else {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid QR code format",
      );
    }

    // --- Common Validations ---
    if (!event) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Event not found");
    }

    // Verify Event Ownership
    if (event.createdBy.toString() !== organizerId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to check-in attendees for this event",
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

    // Check if already checked in
    if (transaction && transaction.isCheckedIn && !attendee) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Booking already used - Checked in at ${transaction.checkedInAt}`,
        {
          validationStatus: "ALREADY_CHECKED_IN",
          checkedInAt: transaction.checkedInAt,
          buyer: transaction.userId,
        },
      );
    }

    if (attendee && attendee.isCheckedIn) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Ticket already used - Checked in at ${attendee.checkedInAt}`,
        {
          validationStatus: "ALREADY_CHECKED_IN",
          checkedInAt: attendee.checkedInAt,
        },
      );
    }

    const now = new Date();
    // Check if event has expired
    if (now > new Date(event.endDate)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Event has expired - Check-in not allowed",
        {
          event: {
            eventTitle: event.eventTitle,
            endDate: event.endDate,
            status: "Expired",
          },
          validationStatus: "EVENT_EXPIRED",
        },
      );
    }

    // --- Perform Check-in ---
    if (!attendee) {
      // Case: Transaction-level Check-in (via TICKET- QR or User ID QR)
      let currentAttendees = await Attendee.find({
        transactionId: transaction._id,
      });

      if (currentAttendees.length === 0) {
        // Auto-create attendees if none exist
        const attendeeDocs = [];
        for (let i = 0; i < transaction.qty; i++) {
          const ticketNumber = generateTicketNumber(
            transaction.eventId._id || transaction.eventId,
            i + 1,
          );
          attendeeDocs.push({
            transactionId: transaction._id,
            eventId: transaction.eventId._id || transaction.eventId,
            userId: transaction.userId._id || transaction.userId,
            firstName: transaction.userId.firstName,
            lastName: transaction.userId.lastName,
            email: transaction.userId.email,
            ticketNumber,
            qrCodeData: "",
            isCheckedIn: true,
            checkedInAt: now,
            checkedInBy: organizerId,
          });
        }
        const created = await Attendee.insertMany(attendeeDocs);
        for (let doc of created) {
          doc.qrCodeData = generateAttendeeQRData(doc.ticketNumber, doc._id);
          await doc.save();
        }
        currentAttendees = created;
      } else {
        // Mark all existing ones for this transaction as checked in
        await Attendee.updateMany(
          { transactionId: transaction._id, isCheckedIn: false },
          {
            $set: {
              isCheckedIn: true,
              checkedInAt: now,
              checkedInBy: organizerId,
            },
          },
        );
        currentAttendees = await Attendee.find({
          transactionId: transaction._id,
        });
      }

      // Mark transaction as checked in
      transaction.isCheckedIn = true;
      transaction.checkedInAt = now;
      transaction.checkedInBy = organizerId;
      await transaction.save();

      return apiSuccessRes(HTTP_STATUS.OK, res, "✅ Check-in successful", {
        type: "TRANSACTION",
        attendees: currentAttendees.map((a) => ({
          firstName: a.firstName,
          lastName: a.lastName,
          ticketNumber: a.ticketNumber,
        })),
        event: {
          eventTitle: event.eventTitle,
        },
        bookingId: transaction.bookingId,
        qty: transaction.qty,
        validationStatus: "SUCCESS",
      });
    } else {
      // Case: Individual Attendee Check-in (via ATTENDEE- QR)
      attendee.isCheckedIn = true;
      attendee.checkedInAt = now;
      attendee.checkedInBy = organizerId;
      await attendee.save();

      // Check if all attendees for this transaction are checked in
      const totalAttendees = await Attendee.countDocuments({
        transactionId: transaction._id,
      });
      const checkedInCount = await Attendee.countDocuments({
        transactionId: transaction._id,
        isCheckedIn: true,
      });

      if (totalAttendees === checkedInCount) {
        transaction.isCheckedIn = true;
        transaction.checkedInAt = now;
        transaction.checkedInBy = organizerId;
        await transaction.save();
      }

      return apiSuccessRes(HTTP_STATUS.OK, res, "✅ Check-in successful", {
        type: "ATTENDEE",
        attendee: {
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          ticketNumber: attendee.ticketNumber,
        },
        event: {
          eventTitle: event.eventTitle,
        },
        validationStatus: "SUCCESS",
      });
    }
  } catch (error) {
    console.error("Error in scanQRAndCheckIn:", error);
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
  perApiLimiter(),
  validateRequest(checkInSchema),
  checkInAttendee,
);

router.get("/ticket/:ticketNumber", perApiLimiter(), getAttendeeByTicket);

router.post(
  "/scan-qr",
  perApiLimiter(),
  validateRequest(scanQRSchema),
  scanQRAndCheckIn,
);
module.exports = router;
