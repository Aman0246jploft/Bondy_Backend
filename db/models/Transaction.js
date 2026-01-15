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
            required: true,
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
            enum: ["PENDING", "PAID", "FAILED", "CANCELLED"],
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
