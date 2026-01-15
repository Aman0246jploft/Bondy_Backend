const mongoose = require("mongoose");

const taxSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // e.g., "VAT", "GST", "Service Tax"
    },
    type: {
      type: String,
      enum: ["percentage", "fixed"], // type of tax
      required: true,
    },
    value: {
      type: Number, // percentage (10%) or fixed amount (e.g., 5)
      required: true,
    },
    // region: {
    //   type: String, // e.g., country or state
    //   required: true,
    // },
    active: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String, // optional note
    },
  },
  {
    timestamps: true,
  }
);

taxSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Tax", taxSchema);
