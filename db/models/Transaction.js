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
        // For Course bookings: references the batch _id in Course.batches[]
        batchId: {
            type: String,
            required: function () {
                return this.bookingType === "COURSE";
            },
        },
        // For Ongoing courses: the specific day of the week selected (e.g. "Mon", "Tue")
        selectedDay: {
            type: String,
            default: null,
        },
        // For Ongoing courses: array of selected batches and days
        ongoingSlots: [
            {
                batchId: { type: String, required: true },
                selectedDay: { type: String, required: true },
            }
        ],
        // For Event bookings: references the ticket _id in Event.tickets[]
        ticketId: {
            type: String,
            required: function () {
                return this.bookingType === "EVENT";
            },
        },
        // Snapshot of the ticket type name at booking time
        ticketName: {
            type: String,
            default: null,
        },
        tickets: [
            {
                ticketId: { type: String, required: true },
                ticketName: { type: String, required: true },
                qty: { type: Number, required: true, min: 1 },
                basePrice: { type: Number, required: true },
            }
        ],
        bookingType: {
            type: String,
            enum: ["EVENT", "COURSE", "PROMOTION"],
            required: true,
            default: "EVENT",
        },
        promotionPackageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PromotionPackage",
            required: function () {
                return this.bookingType === "PROMOTION";
            },
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
        commissionAmount: {
            type: Number,
            default: 0,
        },
        organizerEarning: {
            type: Number,
            default: 0,
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
            enum: ["PENDING", "PAID", "FAILED", "CANCELLED", "REFUND_INITIATED", "REFUNDED"],
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
        },
        // ── Refund / Cancellation fields ──
        refundAmount: {
            type: Number,
            default: 0,
        },
        refundReason: {
            type: String,
            default: null,
        },
        refundedAt: {
            type: Date,
            default: null,
        },
        cancelledAt: {
            type: Date,
            default: null,
        },
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
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
