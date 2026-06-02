const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: function () {
        // If nested, 'this' refers to the subdocument.
        // We fetch the parent document to check isDraft.
        const parent = this.parent ? this.parent() : this;
        if (parent && typeof parent.isDraft === "boolean") {
          return !parent.isDraft;
        }
        return false;
      },
    },
    city: { type: String },
    country: { type: String },
    address: { type: String },
    state: { type: String },
    zipcode: { type: String },
  },
  { _id: false }
);

module.exports = addressSchema;
