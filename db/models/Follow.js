const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

// Remove __v from response
followSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// Optional: prevent duplicate follows
followSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });

module.exports = mongoose.model("Follow", followSchema);
