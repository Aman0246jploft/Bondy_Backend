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
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: function () {
          return !this.isDraft;
        },
      },
      city: String,
      country: String,
      address: String,
    },
    startDate: {
      type: Date,
      required: function () {
        return !this.isDraft;
      },
    },
    endDate: {
      type: Date,
      required: function () {
        return !this.isDraft;
      },
    },
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
    featureEventFee: {
      type: Number,
      default: 0,
    },
    isDraft: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    featuredExpiry: {
      type: Date,
      default: null,
    },
    activePromotionPackage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionPackage",
      default: null,
    },

    status: {
      type: String,
      enum: ["Upcoming", "Live", "Past"],
      default: "Upcoming"
    },
    totalAttendees: {
      type: Number,
      default: 0,
      min: 0,
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

// Create geospatial index for location-based queries
eventSchema.index({ venueAddress: "2dsphere" });



eventSchema.pre("save", function (next) {
  const now = new Date();

  // ❌ Block creating past events (only on creation or if endDate is changed to past)
  if ((this.isNew || this.isModified("endDate")) && this.endDate < now) {
    return next(new Error("You cannot create an event in the past"));
  }

  // ✅ Auto-manage status
  if (now < this.startDate) {
    this.status = "Upcoming";
  } else if (now >= this.startDate && now <= this.endDate) {
    this.status = "Live";
  } else if (this.endDate < now) {
    this.status = "Past";
  }

  next();
});





module.exports = mongoose.model("Event", eventSchema);
