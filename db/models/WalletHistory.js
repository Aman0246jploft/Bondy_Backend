const mongoose = require("mongoose");

const walletHistorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        type: {
            type: String,
            enum: [
                "TICKET_SALE",
                "PAYOUT_REQUEST",
                "PAYOUT_REJECTED",
                "REFUND",
                "ADJUSTMENT",
                "REFERRAL",
            ],
            required: true,
        },
        transactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction", // Linked to ticket sale (Event or Course)
        },
        payoutId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payout", // Linked to payout request if applicable
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        description: {
            type: String, // e.g. "Ticket Sale: Concert" or "Course Enrollment: Python 101"
        },
    },
    {
        timestamps: true,
    }
);

walletHistorySchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("WalletHistory", walletHistorySchema);
