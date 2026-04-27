const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    name_thi: {
      type: String,
      trim: true,
      lowercase: true,
    },


    type: {
      type: String,
      enum: ["event", "course", "support_ticket"],
      required: true,
      lowercase: true,
    },

    image: {
      type: String,
      default: null,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isDisable: {
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
categorySchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Category", categorySchema);
