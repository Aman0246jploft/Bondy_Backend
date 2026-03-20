const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
    {
        // The organizer who sent the invite
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
        // Unique code embedded in the referral link
        referralCode: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "SIGNED_UP", "COMPLETED", "EXPIRED"],
            default: "PENDING",
            index: true,
        },
        // Reward amount given to referrer on COMPLETED
        rewardAmount: {
            type: Number,
            default: 0, // MNT
        },
        // When the reward was credited
        rewardedAt: {
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
