const mongoose = require("mongoose");

const stayUpdatedSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        }
    },
    {
        timestamps: true,
    }
);

// Remove __v from response
stayUpdatedSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("StayUpdated", stayUpdatedSchema);
