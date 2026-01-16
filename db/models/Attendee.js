const mongoose = require("mongoose");

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
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // Individual attendee details
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
            trim: true,
        },
        // Ticket information
        ticketNumber: {
            type: String,
            required: true,
            unique: true,
        },
        qrCodeData: {
            type: String,
            required: true,
        },
        // Check-in status
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
    },
    {
        timestamps: true,
    }
);

// Index for faster queries
attendeeSchema.index({ eventId: 1, userId: 1 });
attendeeSchema.index({ ticketNumber: 1 });
attendeeSchema.index({ qrCodeData: 1 });

attendeeSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Attendee", attendeeSchema);
