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
            required: false, // Optional if it's a course
        },
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: false, // Optional if it's an event
        },
        scheduleId: {
            type: String, // ID of the schedule in the Course
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
        qrCodeData: {
            type: String,
            default: "",
        },
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

attendeeSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Attendee", attendeeSchema);
