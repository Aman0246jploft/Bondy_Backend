const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
    {
        ticketId: {
            type: String,
            unique: true,
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        category: {
            type: String, // e.g., 'Technical', 'Billing', 'Account', 'Other'
            required: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["Pending", "Open", "Resolved", "Cancelled", "Reopen", "closed"],
            default: "Pending",
            index: true,
        },
        adminComments: [
            {
                comment: String,
                adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        images: {
            type: [String],
            default: []
        }
    },
    {
        timestamps: true,
    }
);

supportTicketSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
