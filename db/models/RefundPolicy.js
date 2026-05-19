const mongoose = require("mongoose");
const { refundPolicyType } = require("../../utils/Role");

const refundPolicySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [refundPolicyType.EVENT, refundPolicyType.COURSE, refundPolicyType.BOTH],
      default: refundPolicyType.BOTH,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    refundPercentage: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    daysBefore: {
      type: Number,
      default: 0, // 0 days means same day / anytime before start
      min: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    isDisable: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Remove __v from JSON responses
refundPolicySchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("RefundPolicy", refundPolicySchema);
