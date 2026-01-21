const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
    {
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        ],
        lastMessage: {
            content: { type: String },
            sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            createdAt: { type: Date },
        },
        unreadCounts: {
            type: Map,
            of: Number,
            default: {},
        },
        // Users who have blocked this chat/participants in this context
        blockedBy: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Ensure a chat between specific participants is unique
// Note: This relies on sorting participants or ensuring query order. 
// A better appraoch for strict uniqueness might be a compound index if guaranteed sorted insert.
// For now, we handles find-or-create logic in controller.

module.exports = mongoose.model("Chat", chatSchema);
