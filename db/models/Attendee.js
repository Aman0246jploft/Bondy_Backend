const mongoose = require("mongoose");

/**
 * Attendee (Individual Ticket) Schema
 *
 * Every paid booking generates one Attendee record per ticket unit.
 * For Monthly/3-Month passes, a single Attendee record is created (isPass: true).
 *
 * This is the canonical "individual ticket" document in the system.
 * Bookings (Transaction) reference all their individual ticket IDs via ticketIds[].
 */
const attendeeSchema = new mongoose.Schema(
    {
        transactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction",
            required: true,
        },
        eventId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: false, // Optional if it's a course
        },
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: false, // Optional if it's an event
        },
        batchId: {
            type: String, // ID of the batch in the Course
            required: false,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        contactNumber: {
            type: String,
            default: null,
        },
        ticketNumber: {
            type: String,
            required: true,
            unique: true,
        },
        // References the ticket type _id in Event.tickets[] (for EVENT bookings)
        ticketId: {
            type: String,
            default: null,
        },
        // Snapshot of the ticket type name at booking time
        ticketName: {
            type: String,
            default: null,
        },

        // ── Secure QR payload (HMAC-signed) ──────────────────────────────────
        // For new bookings: HMAC-signed JSON payload
        // For legacy bookings: legacy "ATTENDEE-{ticketNumber}-{_id}-{ts}" format
        qrCodeData: {
            type: String,
            default: "",
        },

        // ── Ticket lifecycle status ───────────────────────────────────────────
        // ACTIVE: valid, can be used for entry
        // CANCELLED: booking was cancelled by user
        // REFUNDED: booking was refunded
        status: {
            type: String,
            enum: ["ACTIVE", "CANCELLED", "REFUNDED"],
            default: "ACTIVE",
        },

        // Position of this ticket within the booking (1-based index)
        // e.g., for a qty:3 booking: tickets 1, 2, 3
        ticketIndex: {
            type: Number,
            default: 1,
        },

        // True for Monthly/3-Month pass records (exactly 1 per pass booking)
        isPass: {
            type: Boolean,
            default: false,
        },

        // ── Check-in state ────────────────────────────────────────────────────
        isCheckedIn: {
            type: Boolean,
            default: false,
        },
        checkedInAt: {
            type: Date,
            default: null,
        },
        checkedInBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // Full per-session check-in history (courses support multi-session check-in)
        checkInHistory: [
            {
                checkedInAt: { type: Date, required: true },
                checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                sessionIndex: { type: Number },
                sessionDate: { type: String }, // Format YYYY-MM-DD
                batchId: { type: String }
            }
        ],

        // ── QR Scan Audit Trail ───────────────────────────────────────────────
        // Records every scan attempt (success and failure) for audit and fraud detection
        scanHistory: [
            {
                scannedAt: { type: Date, default: Date.now },
                scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                // SUCCESS | ALREADY_CHECKED_IN | TAMPERED | EXPIRED | CANCELLED | INVALID
                scanResult: { type: String, default: "SUCCESS" },
                // Optional notes or error details
                notes: { type: String, default: null },
            }
        ],
    },
    {
        timestamps: true,
    }
);

attendeeSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.__v;
        return ret;
    },
});

// ── Indexes ───────────────────────────────────────────────────────────────────
// Fast lookup by transactionId (list all tickets in a booking)
attendeeSchema.index({ transactionId: 1 });
// Fast lookup by transactionId + index (specific ticket in a booking)
attendeeSchema.index({ transactionId: 1, ticketIndex: 1 });
// Fast QR scan lookup
attendeeSchema.index({ qrCodeData: 1 });
// Fast ticket number lookup
attendeeSchema.index({ ticketNumber: 1 });
// User's ticket history
attendeeSchema.index({ userId: 1, createdAt: -1 });
// Event attendees list
attendeeSchema.index({ eventId: 1, isCheckedIn: 1 });
// Course attendees list
attendeeSchema.index({ courseId: 1, isCheckedIn: 1 });
// Active-only lookup (most common query for gate-keeping)
attendeeSchema.index({ transactionId: 1, status: 1, isCheckedIn: 1 });

module.exports = mongoose.model("Attendee", attendeeSchema);
