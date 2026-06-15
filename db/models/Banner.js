const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
    },
    linkUrl: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Remove __v from response
bannerSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Banner", bannerSchema);
