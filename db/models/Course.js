const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String, // e.g. "09:00"
    required: true,
  },
  endTime: {
    type: String, // e.g. "01:00"
    required: true,
  },
  presentCount: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const courseSchema = new mongoose.Schema(
  {
    courseTitle: { type: String },
    courseCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    posterImage: { type: [String] },
    galleryImages: { type: [String] },
    whatYouWillLearn: { type: String },
    isFeatured: { type: Boolean, default: false },
    featuredExpiry: { type: Date, default: null },
    activePromotionPackage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionPackage",
      default: null,
    },
    venueAddress: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number], // [lng, lat]
      city: String,
      country: String,
      address: String,
      state: String,
      zipcode: String,

    },
    shortdesc: { type: String },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },

    enrollmentType: {
      type: String,
      enum: ["Ongoing", "fixedStart"],
      default: "Ongoing",
    },

    status: {
      type: String,
      enum: ["Upcoming", "Live", "Past"],
      default: "Upcoming",
    },

    schedules: {
      type: [scheduleSchema],
      default: [],
      validate: {
        validator: function (value) {
          if (this.enrollmentType === "fixedStart") {
            return value.length === 1;
          }
          return value.length >= 1;
        },
        message: function () {
          return this.enrollmentType === "fixedStart"
            ? "Fixed start courses must have exactly one schedule"
            : "Ongoing courses must have at least one schedule";
        },
      },
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
courseSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// Add index for $geoNear queries
courseSchema.index({ venueAddress: "2dsphere" });

courseSchema.pre("save", function (next) {
  const now = new Date();

  if (this.schedules && this.schedules.length > 0) {
    // ❌ Block creating past courses
    // A course is in the past if ALL its schedules end before now
    const isAllPast = this.schedules.every(
      (s) => new Date(s.endDate) < now
    );

    if (this.isNew && isAllPast) {
      return next(new Error("You cannot create a course in the past"));
    }

    // ✅ Auto-manage status
    const isLive = this.schedules.some(
      (s) => new Date(s.startDate) <= now && new Date(s.endDate) >= now
    );
    const hasUpcoming = this.schedules.some(
      (s) => new Date(s.startDate) > now
    );

    if (isLive) {
      this.status = "Live";
    } else if (hasUpcoming) {
      this.status = "Upcoming";
    } else if (isAllPast) {
      this.status = "Past";
    } else {
      this.status = "Upcoming";
    }
  }

  next();
});

module.exports = mongoose.model("Course", courseSchema);
