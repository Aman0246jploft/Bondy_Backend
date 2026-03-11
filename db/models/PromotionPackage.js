const mongoose = require("mongoose");

const promotionPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    durationInDays: {
      type: Number,
      required: true,
      min: 1,
    },
    packageType: {
      type: String,
      enum: ["EVENT", "COURSE"],
      default: "EVENT",
      required: true,
    },
    placements: {
      type: [String], // Array of placements, e.g., ["Discover Feed", "Homepage", "Map Highlight"]
    },
    price: {
      type: Number,
      required: true,
      min: 0, // Admin sets this price (e.g., MNT currency expected)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Remove __v from response
promotionPackageSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("PromotionPackage", promotionPackageSchema, "PromotionPackage");
