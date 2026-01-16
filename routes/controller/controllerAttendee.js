const express = require("express");
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
      })
    )
    .min(1)
    .required(),
});

const checkInSchema = Joi.object({
  ticketNumber: Joi.string().required(),
});

const scanQRSchema = Joi.object({
  qrCodeData: Joi.string().required(),
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
        "Transaction not found or not paid"
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
        }
      );
    }

    // Check if attendees count matches ticket quantity
    if (attendees.length !== transaction.qty) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `You must provide exactly ${transaction.qty} attendee(s)`
      );
    }

    // Check if attendees already created for this transaction
    const existingAttendees = await Attendee.find({ transactionId });
    if (existingAttendees.length > 0) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Attendees already created for this transaction"
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
        createdAttendees[i]._id
      );
      await createdAttendees[i].save();
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Attendees created successfully",
      {
        attendees: createdAttendees,
      }
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
        "You are not authorized to view attendees for this event"
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
      }
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
      }
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
      "eventId"
    );

    if (!attendee) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found");
    }

    // Verify Event Ownership
    if (attendee.eventId.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to check-in attendees for this event"
      );
    }

    // Check if already checked in
    if (attendee.isCheckedIn) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Attendee already checked in at ${attendee.checkedInAt}`
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
        "You are not authorized to view this ticket"
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Attendee details fetched successfully",
      {
        attendee,
      }
    );
  } catch (error) {
    console.error("Error in getAttendeeByTicket:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 6. Scan QR Code and Check-in (Organizer Only)
const scanQRAndCheckIn = async (req, res) => {
  try {
    const { qrCodeData } = req.body;
    const userId = req.user.userId;

    // Find Attendee by QR Code
    const attendee = await Attendee.findOne({ qrCodeData })
      .populate("eventId")
      .populate("userId", "firstName lastName email profileImage")
      .populate("transactionId", "bookingId totalAmount");

    if (!attendee) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Invalid QR code - Ticket not found"
      );
    }

    // Verify Event Ownership
    if (attendee.eventId.createdBy.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "You are not authorized to check-in attendees for this event"
      );
    }

    const event = attendee.eventId;
    const now = new Date();

    // ✅ Check if event has expired
    if (now > new Date(event.endDate)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Event has expired - Check-in not allowed",
        {
          attendee: {
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            email: attendee.email,
            ticketNumber: attendee.ticketNumber,
          },
          event: {
            eventTitle: event.eventTitle,
            endDate: event.endDate,
            status: "Expired",
          },
          validationStatus: "EVENT_EXPIRED",
        }
      );
    }

    // ✅ Check if event hasn't started yet (optional - you can allow early check-in)
    if (now < new Date(event.startDate)) {
      // You can choose to allow or disallow early check-in
      // For now, we'll allow it but return a warning
      const hoursUntilStart = Math.ceil(
        (new Date(event.startDate) - now) / (1000 * 60 * 60)
      );

      // If you want to block early check-in, uncomment this:
      // return apiErrorRes(
      //     HTTP_STATUS.BAD_REQUEST,
      //     res,
      //     `Event hasn't started yet - Starts in ${hoursUntilStart} hours`,
      //     {
      //         validationStatus: "EVENT_NOT_STARTED",
      //     }
      // );
    }

    // ✅ Check if already checked in
    if (attendee.isCheckedIn) {
      const checkedInTime = new Date(attendee.checkedInAt);
      const timeAgo = Math.floor((now - checkedInTime) / (1000 * 60)); // minutes ago

      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Ticket already used - Checked in ${timeAgo} minutes ago`,
        {
          attendee: {
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            email: attendee.email,
            ticketNumber: attendee.ticketNumber,
            isCheckedIn: true,
            checkedInAt: attendee.checkedInAt,
          },
          event: {
            eventTitle: event.eventTitle,
          },
          validationStatus: "ALREADY_CHECKED_IN",
        }
      );
    }

    // ✅ All validations passed - Perform check-in
    attendee.isCheckedIn = true;
    attendee.checkedInAt = new Date();
    attendee.checkedInBy = userId;
    await attendee.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "✅ Check-in successful", {
      attendee: {
        _id: attendee._id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        contactNumber: attendee.contactNumber,
        ticketNumber: attendee.ticketNumber,
        isCheckedIn: attendee.isCheckedIn,
        checkedInAt: attendee.checkedInAt,
      },
      event: {
        eventTitle: event.eventTitle,
        venueName: event.venueName,
        startDate: event.startDate,
        endDate: event.endDate,
      },
      transaction: {
        bookingId: attendee.transactionId.bookingId,
        totalAmount: attendee.transactionId.totalAmount,
      },
      buyer: {
        firstName: attendee.userId.firstName,
        lastName: attendee.userId.lastName,
        email: attendee.userId.email,
      },
      validationStatus: "SUCCESS",
    });
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
  createAttendees
);
router.get("/event/:eventId", perApiLimiter(), getEventAttendees);
router.get("/my-attendees", perApiLimiter(), getMyAttendees);
router.post(
  "/check-in",
  perApiLimiter(),
  validateRequest(checkInSchema),
  checkInAttendee
);
router.get("/ticket/:ticketNumber", perApiLimiter(), getAttendeeByTicket);
router.post(
  "/scan-qr",
  perApiLimiter(),
  validateRequest(scanQRSchema),
  scanQRAndCheckIn
);

module.exports = router;
