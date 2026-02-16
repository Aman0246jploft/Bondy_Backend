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

module.exports = mongoose.model("Course", courseSchema);
