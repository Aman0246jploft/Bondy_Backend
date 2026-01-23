const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        type: {
            type: String,
            enum: [
                "EVENT",
                "COURSE",
                "CHAT",
                "FOLLOW",
                "USER",
                "SYSTEM"
            ],
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        // Related document ID (e.g., Event ID, Course ID, etc.)
        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        // The model name for populated deep links if necessary
        onModel: {
            type: String,
            enum: ["Event", "Course", "User", "Chat"],
            default: null,
        },
        // Metadata for specialized deep linking or extra context
        metadata: {
            type: Map,
            of: String,
            default: {},
        },
        // Deep linking path for frontend/mobile (e.g., "/event/123", "bondy://event/123")
        deepLink: {
            type: String,
            default: null,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

// Index for performance when fetching notifications for a user
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
