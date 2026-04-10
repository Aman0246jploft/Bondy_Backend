const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // the user who is reporting
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // the user being reported
    },
    reason: {
      type: String,
      required: true, // short reason for the report
    },
    description: {
      type: String, // optional: more details about the report
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminComment: {
      type: String,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

// Remove __v from response
reportSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// Optional: prevent duplicate reports from the same user for the same user
reportSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });

module.exports = mongoose.model("Report", reportSchema);
