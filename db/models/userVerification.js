const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true, // e.g., "ID", "Passport", "Business License"
    },
    url: {
      type: String,
      required: true, // link to the uploaded document
    },
    region: {
      type: String, // region/country for the document
    },
    verified: {
      type: Boolean,
      default: false, // whether the document is verified
    },
    verifiedAt: {
      type: Date, // when the document was verified
    },
  },
  { _id: false } // prevent creating a separate _id for each document
);

const verificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one verification record per user
    },
    isVerified: {
      type: Boolean,
      default: false, // overall verified flag
    },
    idVerification: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      date: Date,
      region: String,
      documents: [documentSchema],
    },
    contactVerification: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      date: Date,
      region: String,
    },
    payoutVerification: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      date: Date,
      region: String,
      documents: [documentSchema],
    },
    businessVerification: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      date: Date,
      region: String,
      documents: [documentSchema],
    },
  },
  {
    timestamps: true, // createdAt and updatedAt
  }
);

// Remove __v from JSON responses
verificationSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Verification", verificationSchema);
