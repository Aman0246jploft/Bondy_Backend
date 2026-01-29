const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        phone: {
            type: String,
            default: "",
        },
        topic: {
            type: String,
            default: "General"
        },
        message: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["New", "Read", "Replied"],
            default: "New",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
