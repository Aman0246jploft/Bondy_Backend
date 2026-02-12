const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            default: "", // Can be empty if it's just a file
        },
        fileUrl: {
            type: String,
            default: null,
        },
        fileType: {
            type: String, // 'image', 'video', 'document', 'audio'
            default: null,
        },
        // Array of UserIds who deleted this message for themselves
        deletedFor: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        isDeletedForEveryone: {
            type: Boolean,
            default: false,
        },
        readBy: [
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

module.exports = mongoose.model("Message", messageSchema);
