const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema(
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
        }
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate wishlists for same user and entity
wishlistSchema.index({ userId: 1, entityId: 1, entityModel: 1 }, { unique: true });

wishlistSchema.set("toJSON", {
    transform: function (doc, ret) {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model("Wishlist", wishlistSchema);
