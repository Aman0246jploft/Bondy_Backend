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
  totalSeats: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  totalAttendees: {
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
      city: { type: String },
      country: { type: String },
      address: { type: String },
    },
    shortdesc: { type: String },
    schedules: {
      type: [scheduleSchema], // ⬅ multiple date/time entries
      default: [],
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
