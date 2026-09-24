const mongoose = require("mongoose");

const qpayLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    bookingId: {
      type: String,
      default: null,
      index: true,
    },
    transactionId: {
      type: String,
      default: null,
      index: true,
    },
    invoiceId: {
      type: String,
      default: null,
      index: true,
    },
    paymentId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING", "WARNING", "INFO"],
      default: "INFO",
      index: true,
    },
    ip: {
      type: String,
      default: null,
    },
    request: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-expire logs after 30 days to prevent DB bloat
qpayLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model("QPayLog", qpayLogSchema);
