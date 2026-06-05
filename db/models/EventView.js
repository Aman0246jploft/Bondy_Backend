const mongoose = require("mongoose");

const eventViewSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

eventViewSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("EventView", eventViewSchema);
