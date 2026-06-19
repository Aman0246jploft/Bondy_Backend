const mongoose = require("mongoose");
const addressSchema = require("./AddressSchema");
const { getUTCDateTime } = require("../../utils/globalFunction");
const {
  refundPolicy,
  visibility,
  ageRestriction,
  eventStatus,
} = require("../../utils/Role");

const eventSchema = new mongoose.Schema(
  {
    eventTitle: { type: String },
    eventCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    shortdesc: { type: String },
    longdesc: { type: String },
    posterImage: { type: [String] },
    mediaLinks: { type: [String] },
    shortTeaserVideo: { type: [String] },

    venueName: { type: String },
    venueAddress: {
      type: addressSchema,
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

    timeZone: { type: String, default: "UTC" },

    tickets: [
      {
        ticketName: {
          type: String,
        },
        ticketShortDesc: { type: String },
        price: {
          type: Number,
          min: 0,
        },
        qty: {
          type: Number,
          min: 1,
        },
        salesStart: { type: Date },
        salesEnd: { type: Date },
      },
    ],
    refundPolicy: {
      type: String,
      enum: Object.values(refundPolicy),
    },
    addOns: { type: String },

    visibility: {
      type: String,
      enum: Object.values(visibility),
      default: visibility.PUBLIC,
    },

    ageRestriction: {
      type: String,
      enum: Object.values(ageRestriction),
      default: ageRestriction.ALL,
    },

    showAttendees: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
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
      enum: Object.values(eventStatus),
      default: eventStatus.UPCOMING,
    },
    addToSlider: {
      type: Boolean,
      default: false,
    },
    ReservedExternally: {
      type: Number,
      min: 0,
      default: 0,
    },
    assignedStaff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
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
  // Combine startDate + startTime and endDate + endTime into UTC Date objects if modified
  if (this.isModified("startDate") || this.isModified("startTime") || this.isModified("timeZone")) {
    if (this.startDate) {
      this.startDate = getUTCDateTime(this.startDate, this.startTime, this.timeZone);
    }
  }

  if (this.isModified("endDate") || this.isModified("endTime") || this.isModified("timeZone")) {
    if (this.endDate) {
      this.endDate = getUTCDateTime(this.endDate, this.endTime, this.timeZone);
    }
  }

  const now = new Date();

  // ❌ Block creating past events (only on creation or if endDate is changed to past, and only if not a draft)
  if (!this.isDraft && (this.isNew || this.isModified("endDate")) && this.endDate < now) {
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
