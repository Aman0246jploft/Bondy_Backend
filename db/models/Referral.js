const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
    {
        // The referrer who sent the invite
        referrer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // The referee's email (invited via email or link)
        refereeEmail: {
            type: String,
            trim: true,
            lowercase: true,
            required: true,
        },
        // Set when the referee signs up
        referee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        // Customer or Organizer
        registrationType: {
            type: String,
            enum: ["CUSTOMER", "ORGANIZER"],
            default: "ORGANIZER",
        },
        // Unique code embedded in the referral link
        referralCode: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["PENDING_REFERRAL", "PENDING_VALIDATION", "SUCCESSFUL_REFERRAL", "EXPIRED"],
            default: "PENDING_REFERRAL",
            index: true,
        },
        qualifyingOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction",
            default: null,
        },
        orderDate: {
            type: Date,
            default: null,
        },
        refundWindowEndDate: {
            type: Date,
            default: null,
        },
        successfulAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

referralSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Referral", referralSchema);
