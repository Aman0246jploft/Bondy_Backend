const mongoose = require("mongoose");
const addressSchema = require("./AddressSchema");
const { getUTCDateTime } = require("../../utils/globalFunction");
const {
  refundPolicy,
  eventStatus,
  daysOfWeek,
} = require("../../utils/Role");

const batchSchema = new mongoose.Schema(
  {
    batchName: {
      type: String,
      required: function () {
        const parent = this.parent ? this.parent() : this;
        return parent && !parent.isDraft;
      },
    },
    startTime: {
      type: String, // e.g. "09:00"
      required: function () {
        const parent = this.parent ? this.parent() : this;
        return parent && !parent.isDraft;
      },
    },
    endTime: {
      type: String, // e.g. "13:00"
      required: function () {
        const parent = this.parent ? this.parent() : this;
        return parent && !parent.isDraft;
      },
    },
    days: {
      type: [String],
      enum: Object.values(daysOfWeek),
      required: function () {
        const parent = this.parent ? this.parent() : this;
        return parent && !parent.isDraft;
      },
    },
    seats: {
      type: Number,
      min: 1,
      required: function () {
        const parent = this.parent ? this.parent() : this;
        return parent && !parent.isDraft;
      },
    },
    ReservedExternally: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Cancelled"],
      default: "Active",
    },
    cancelledDates: [
      {
        date: { type: String, required: true }, // Format: YYYY-MM-DD
        reason: { type: String, default: "" },
        cancelledAt: { type: Date, default: Date.now },
      }
    ],
  }
);

const courseSchema = new mongoose.Schema(
  {
    courseTitle: {
      type: String,
      required: function () {
        return !this.isDraft;
      },
    },
    shortdesc: { type: String },
    longdesc: { type: String },
    whatYouWillLearn: { type: String },
    courseCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    posterImage: { type: [String] },
    mediaLinks: { type: [String] },
    shortTeaserVideo: { type: [String] },

    startDate: {
      type: Date,
      required: function () {
        return !this.isDraft;
      },
    },
    endDate: {
      type: Date,
      required: function () {
        return !this.isDraft && this.enrollmentType === "fixedStart";
      },
    },
    totalSessions: {
      type: Number,
      min: 1,
      required: function () {
        return !this.isDraft;
      },
    },
    timeZone: {
      type: String,
      default: "UTC",
    },
    venueName: { type: String },
    venueAddress: {
      type: addressSchema,
    },

    batches: {
      type: [batchSchema],
      default: [],
    },

    price: {
      type: Number,
      min: 0,
      required: function () {
        return !this.isDraft;
      },
    },
    refundPolicy: {
      type: String,
      enum: Object.values(refundPolicy),
    },
    oneMonthPassPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    oneMonthPassEnabled: {
      type: Boolean,
      default: false,
    },
    threeMonthPassPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    threeMonthPassEnabled: {
      type: Boolean,
      default: false,
    },
    enrollmentType: {
      type: String,
      enum: ["Ongoing", "fixedStart"],
      default: "Ongoing",
    },

    status: {
      type: String,
      enum: Object.values(eventStatus),
      default: eventStatus.UPCOMING,
    },

    isDraft: {
      type: Boolean,
      default: false,
    },
    bookingCutOff: {
      type: String,
      default: "",
    },
    isFeatured: { type: Boolean, default: false },
    featuredExpiry: { type: Date, default: null },
    activePromotionPackage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionPackage",
      default: null,
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
courseSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// Add index for $geoNear queries
courseSchema.index({ venueAddress: "2dsphere" });

courseSchema.pre("save", function (next) {
  // Determine earliest startTime and latest endTime among batches
  let earliestStartTime = "00:00";
  let latestEndTime = "23:59";

  if (this.batches && this.batches.length > 0) {
    const startTimes = this.batches.map((b) => b.startTime).filter(Boolean);
    const endTimes = this.batches.map((b) => b.endTime).filter(Boolean);

    if (startTimes.length > 0) {
      startTimes.sort();
      earliestStartTime = startTimes[0];
    }
    if (endTimes.length > 0) {
      endTimes.sort();
      latestEndTime = endTimes[endTimes.length - 1];
    }
  }

  // Combine dates and times into UTC using our global function
  if (this.isModified("startDate") || this.isModified("batches") || this.isModified("timeZone")) {
    if (this.startDate) {
      this.startDate = getUTCDateTime(this.startDate, earliestStartTime, this.timeZone || "UTC");
    }
  }

  if (this.isModified("endDate") || this.isModified("batches") || this.isModified("timeZone")) {
    if (this.endDate) {
      this.endDate = getUTCDateTime(this.endDate, latestEndTime, this.timeZone || "UTC");
    }
  }

  const now = new Date();

  // ❌ Block creating past courses (only if not a draft)
  if (this.isNew && !this.isDraft && this.endDate && this.endDate < now) {
    return next(new Error("You cannot create a course in the past"));
  }

  // ✅ Auto-manage status (only if startDate is provided and status is not Cancelled)
  if (this.status !== eventStatus.CANCELLED && this.startDate) {
    if (now < this.startDate) {
      this.status = eventStatus.UPCOMING;
    } else if (this.endDate && this.endDate < now) {
      this.status = eventStatus.PAST;
    } else {
      this.status = eventStatus.LIVE;
    }
  }

  next();
});

module.exports = mongoose.model("Course", courseSchema);
