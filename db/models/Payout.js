const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
    {
        organizerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "PAID", "CANCELLED"],
            default: "PENDING",
        },
        paymentReference: {
            type: String, // e.g. Bank Transfer ID, Transaction Hash
            default: null,
        },
        transactionIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Transaction",
            },
        ],
        paidAt: {
            type: Date,
            default: null,
        },
        adminNote: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

payoutSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Payout", payoutSchema);
