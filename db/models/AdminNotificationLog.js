const mongoose = require("mongoose");

const adminNotificationLogSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    targetGroup: {
      type: String,
      enum: ["everyone", "users", "organizers"],
      required: true,
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    deepLink: {
      type: String,
      default: null,
    },
    webLink: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["SENT", "FAILED"],
      default: "SENT",
    },
  },
  {
    timestamps: true,
  }
);

adminNotificationLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminNotificationLog", adminNotificationLogSchema);
