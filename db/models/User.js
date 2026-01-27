const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { roleId } = require("../../utils/Role");

const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    firstName: {
      type: String,
      trim: true,
      default: null,
    },
    lastName: {
      type: String,
      trim: true,
      default: null,
    },
    socialLogin: {
      socialId: {
        type: String,
        trim: true,
        default: null,
      },
      socialType: {
        type: String,
        trim: true,
        default: null,
      },
      default: {}, // ensures frontend always gets an object
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      index: true,
      default: undefined, // safe for unique index
    },
    password: {
      type: String,
      default: null,
    },
    profileImage: {
      type: String,
      default: null,
    },
    gender: {
      type: String,
      default: null,
    },
    dob: {
      type: Date,
      default: null,
    },
    bio: {
      type: String,
      default: null,
    },
    roleId: {
      type: Number,
      enum: Object.values(roleId),
      default: roleId.CUSTOMER,
      index: true,
    },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        default: null,
      },
    ],
    fmcToken: {
      type: String,
      default: null,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number], // [lng, lat]
      city: String,
      country: String,
      address: String,
    },
    language: {
      type: String,
      default: null,
    },
    isDisable: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    acceptTerms: {
      type: Boolean,
      default: false,
    },
    documents: {
      type: [
        {
          file: { type: String, default: null }, // the document URL or filename
          status: {
            // approval status
            type: String,
            enum: ["pending", "approved", "rejected"], // or any status you want
            default: "pending",
          },
          reason: { type: String, default: null }, // reason for rejection
        },
      ],
      default: [], // empty array if no documents
    },
    countryCode: {
      type: String,
      trim: true,
      default: null, // not required
    },
    contactNumber: {
      type: String,
      trim: true,
      default: null, // not required
    },
    businessType: {
      type: String,
      trim: true,
      default: null,
    },
    organizerVerificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    timeZone: { type: String },
    lastLogin: {
      type: Date,
      default: null,
    },
    bankDetails: {
      accountName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      bankName: { type: String, default: null },
      ifscCode: { type: String, default: null },
      swiftCode: { type: String, default: null },
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    payoutBalance: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

UserSchema.index({ location: "2dsphere" }, { sparse: true });

UserSchema.pre("save", function (next) {
  // If role is CUSTOMER, auto-approve organizerVerificationStatus
  if (this.roleId === roleId.CUSTOMER) {
    this.organizerVerificationStatus = "approved";
  }

  next();
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const hashNumber = Number(process.env.SALT_WORK_FACTOR) || 10;
    const salt = await bcrypt.genSalt(hashNumber);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    delete ret.password; // Don't send password in JSON responses
    return ret;
  },
};

module.exports = mongoose.model("User", UserSchema, "User");
