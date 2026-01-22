const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'entityModel'
        },
        entityModel: {
            type: String,
            required: true,
            enum: ['Event', 'Course']
        },
        review: {
            type: String,
            required: true,
            trim: true
        }
    },
    {
        timestamps: true,
    }
);

reviewSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Review", reviewSchema);
