const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        eventId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: function () {
                return this.bookingType === "EVENT";
            },
        },
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: function () {
                return this.bookingType === "COURSE";
            },
        },
        scheduleId: {
            type: String, // ID of the schedule in the Course
            required: function () {
                return this.bookingType === "COURSE";
            },
        },
        bookingType: {
            type: String,
            enum: ["EVENT", "COURSE"],
            required: true,
            default: "EVENT",
        },
        bookingId: {
            type: String,
            required: true,
            unique: true,
        },
        qty: {
            type: Number,
            required: true,
            min: 1,
        },
        basePrice: {
            type: Number,
            required: true,
        },
        taxAmount: {
            type: Number,
            default: 0,
        },
        discountAmount: {
            type: Number,
            default: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        discountCode: {
            type: String,
            default: null,
        },
        appliedTaxIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Tax",
            },
        ],
        status: {
            type: String,
            enum: ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUND_INITIATED"],
            default: "PENDING",
        },
        paymentId: {
            type: String, // from payment gateway
        },
        qrCodeData: {
            type: String, // Unique string/payload for QR
        },
        isCheckedIn: {
            type: Boolean,
            default: false
        },
        checkedInQty: {
            type: Number,
            default: 0,
            min: 0,
        },
        checkedInAt: {
            type: Date,
            default: null,
        },
        checkedInBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        }
    },
    {
        timestamps: true,
    }
);

transactionSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Transaction", transactionSchema);
