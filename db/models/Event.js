const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    eventTitle: { type: String },
    eventCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    posterImage: { type: [String] },
    shortdesc: { type: String },
    longdesc: { type: String },
    tags: { type: [String] },
    venueName: { type: String },
    venueAddress: {
      type: {
        type: String,
        enum: ["Point"], // Must be "Point"
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    startTime: { type: String },
    endTime: { type: String },
    ticketName: { type: String },
    ticketQtyAvailable: { type: Number },
    ticketSelesStartDate: { type: Date },
    ticketSelesEndDate: { type: Date },
    ticketPrice: { type: Number },
    totalTickets: { type: Number },
    refundPolicy: { type: String },
    addOns: { type: String },
    mediaLinks: { type: [String] },
    shortTeaserVideo: { type: [String] },
    accessAndPrivacy: {
      type: Boolean,
      default: false,
    },

    ageRestriction: {
      type: {
        type: String,
        enum: ["ALL", "MIN_AGE", "RANGE"],
        default: "ALL",
      },
      minAge: {
        type: Number,
        min: 0,
      },
      maxAge: {
        type: Number,
      },
    },

    dressCode: {
      type: String, // e.g. "Casual", "Formal", "Traditional"
    },
    fetcherEvent: {
      type: Boolean,
      default: false,
    },
    isDraft: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Remove __v from response
eventSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Event", eventSchema);
