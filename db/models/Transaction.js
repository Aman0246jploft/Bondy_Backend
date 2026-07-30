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
        batchId: {
            type: String,
            required: function () {
                return this.bookingType === "COURSE" && !this.passType;
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
                selectedDate: { type: String, default: null },
                isCheckedIn: { type: Boolean, default: false },
                checkedInAt: { type: Date, default: null },
                checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
            }
        ],
        passType: {
            type: String,
            enum: ["1_month", "3_month"],
            default: null,
        },
        passExpiryDate: {
            type: Date,
            default: null,
        },
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
                // Array of individual QRs for this ticket type
                qrs: [
                    {
                        subBookingId: { type: String },
                        qrCodeData:   { type: String },
                        isCheckedIn:  { type: Boolean, default: false },
                        checkedInAt:  { type: Date,    default: null },
                        checkedInBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
                    }
                ]
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
            type: String, // Unique string/payload for QR (legacy — individual tickets now use Attendee.qrCodeData)
        },
        // References to the individual Attendee (ticket) records created for this booking.
        // Populated eagerly at confirmPayment / free-booking time.
        // Length == qty for events/course sessions; == 1 for pass bookings.
        ticketIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Attendee",
            }
        ],
        // HMAC-SHA256 secret used to sign and verify individual ticket QR payloads.
        // Never exposed to clients — server-side only.
        ticketSecretKey: {
            type: String,
            default: null,
            select: false, // excluded from all queries by default for security
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
        // ── Cancellation Fee fields ──
        cancellationFeePercent: {
            type: Number,
            default: 0,
        },
        cancellationFeeAmount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

transactionSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        // Never expose the HMAC secret key in API responses
        delete ret.ticketSecretKey;
        return ret;
    },
});

// ── Indexes ───────────────────────────────────────────────────────────────────
transactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
transactionSchema.index({ eventId: 1, status: 1 });
transactionSchema.index({ courseId: 1, status: 1 });
// Note: bookingId unique index is declared in the field definition (unique: true), no need to repeat here

module.exports = mongoose.model("Transaction", transactionSchema);
