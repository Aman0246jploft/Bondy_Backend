const mongoose = require("mongoose");

const discountCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true, // no duplicate codes
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"], // percentage off or fixed amount
      required: true,
    },
    discountValue: {
      type: Number, // percentage (e.g., 10) or fixed amount (e.g., 50)
      required: true,
    },
    maxUsage: {
      type: Number, // total times this code can be used
      default: 0, // 0 = unlimited
    },
    usedCount: {
      type: Number,
      default: 0, // tracks how many times it has been used
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    // applicableProducts: [
    //   {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "Product", // optional: which products this code applies to
    //   },
    // ],
    // applicableCategories: [
    //   {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: "Category", // optional: which categories
    //   },
    // ],
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

discountCodeSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("DiscountCode", discountCodeSchema);
