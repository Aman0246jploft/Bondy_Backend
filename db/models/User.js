const mongoose = require("mongoose");
const addressSchema = require("./AddressSchema");
const bcrypt = require("bcryptjs");
const { roleId, userRole } = require("../../utils/Role");

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
    backgroundImage: {
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
      type: addressSchema,
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
    verifications: {
      phone: {
        isVerified: { type: Boolean, default: false },
        verifiedAt: { type: Date, default: null },
        isVerifiedOnce: { type: Boolean, default: false },
      },
      email: {
        isVerified: { type: Boolean, default: false },
        verifiedAt: { type: Date, default: null },
      },
      idVerification: {
        nationalId: {
          frontImage: { type: String, default: null },
          backImage: { type: String, default: null },
          isVerified: { type: Boolean, default: false },
          rejectionReason: { type: String, default: null },
          rejectionReasonTitle: { type: String, default: null },
          verifiedAt: { type: Date, default: null },
          status: {
            type: String,
            enum: ["unverified", "pending", "approved", "rejected"],
            default: "unverified",
          },
        },
        drivingLicence: {
          frontImage: { type: String, default: null },
          backImage: { type: String, default: null },
          isVerified: { type: Boolean, default: false },
          rejectionReason: { type: String, default: null },
          rejectionReasonTitle: { type: String, default: null },
          verifiedAt: { type: Date, default: null },
          status: {
            type: String,
            enum: ["unverified", "pending", "approved", "rejected"],
            default: "unverified",
          },
        },
      },
      bankVerification: {
        bankName: { type: String, default: null },
        bankHolderName: { type: String, default: null },
        accountNumber: { type: String, default: null },
        otherDetails: { type: String, default: null },
        isVerified: { type: Boolean, default: false },
        rejectionReason: { type: String, default: null },
        rejectionReasonTitle: { type: String, default: null },
        verifiedAt: { type: Date, default: null },
        status: {
          type: String,
          enum: ["unverified", "pending", "approved", "rejected"],
          default: "unverified",
        },
      },
      history: {
        type: [
          {
            type: {
              type: String,
              enum: ["nationalId", "drivingLicence", "bankVerification", "businessVerification"],
              required: true,
            },
            frontImage: { type: String, default: null },
            backImage: { type: String, default: null },
            bankName: { type: String, default: null },
            bankHolderName: { type: String, default: null },
            accountNumber: { type: String, default: null },
            otherDetails: { type: String, default: null },
            // Business Verification fields in history
            businessName: { type: String, default: null },
            businessCategory: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
            shortDesc: { type: String, default: null },
            socialMediaLink: { type: String, default: null },
            status: { type: String, required: true },
            rejectionReason: { type: String, default: null },
            rejectionReasonTitle: { type: String, default: null },
            actionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            createdAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
    },

    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    isAllVerified: {
      type: Boolean,
      default: false,
      index: true,
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
    businessName: {
      type: String,
      trim: true,
      default: null,
    },
    businessCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    shortDesc: {
      type: String,
      trim: true,
      default: null,
    },
    socialMediaLink: {
      type: String,
      trim: true,
      default: null,
    },
    isBusinessVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    businessVerificationStatus: {
      type: String,
      enum: ["unverified", "pending", "approved", "rejected"],
      default: "unverified",
    },
    businessRejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    businessRejectionReasonTitle: {
      type: String,
      trim: true,
      default: null,
    },
    organizerRejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    organizerRejectionReasonTitle: {
      type: String,
      trim: true,
      default: null,
    },
    organizerVerificationStatus: {
      type: String,
      enum: ["unverified", "pending", "approved", "rejected"],
      default: "unverified",
    },
    hasBeenApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    timeZone: { type: String },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    // bankDetails: {
    //   accountName: { type: String, default: null },
    //   accountNumber: { type: String, default: null },
    //   bankName: { type: String, default: null },
    //   ifscCode: { type: String, default: null },
    //   swiftCode: { type: String, default: null },
    // },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    payoutBalance: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    successfulReferralCount: {
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
  this.wasNew = this.isNew;

  // If role is CUSTOMER, auto-approve organizerVerificationStatus and set isVerified to true
  if (this.roleId === roleId.CUSTOMER) {
    this.organizerVerificationStatus = "approved";
    this.isVerified = true;
    this.hasBeenApproved = true;
  }
  else if (this.roleId === roleId.ORGANIZER) {
    const verificationsModified = this.isModified("verifications");

    if (verificationsModified) {
      // isVerified is strictly dependent ONLY on ID verification approval (nationalId or drivingLicence)
      const isIdApproved = (this.verifications?.idVerification?.nationalId?.isVerified || false) ||
        (this.verifications?.idVerification?.drivingLicence?.isVerified || false);

      this.isVerified = isIdApproved;

      // isAllVerified is true ONLY if Phone, Email, at least one ID, and Bank are all verified
      const isPhoneVerified = this.verifications?.phone?.isVerified || false;
      const isEmailVerified = this.verifications?.email?.isVerified || false;
      const isBankApproved = this.verifications?.bankVerification?.isVerified || false;

      this.isAllVerified = isPhoneVerified && isEmailVerified && isIdApproved && isBankApproved;

      // Keep organizerVerificationStatus in sync
      const nationalIdStatus = this.verifications?.idVerification?.nationalId?.status || "unverified";
      const drivingLicenceStatus = this.verifications?.idVerification?.drivingLicence?.status || "unverified";
      const bankStatus = this.verifications?.bankVerification?.status || "unverified";

      if (
        (nationalIdStatus === "approved" || drivingLicenceStatus === "approved") &&
        bankStatus === "approved"
      ) {
        this.organizerVerificationStatus = "approved";
      } else if (
        nationalIdStatus === "pending" ||
        drivingLicenceStatus === "pending" ||
        bankStatus === "pending"
      ) {
        this.organizerVerificationStatus = "pending";
      } else if (
        nationalIdStatus === "rejected" ||
        drivingLicenceStatus === "rejected" ||
        bankStatus === "rejected"
      ) {
        this.organizerVerificationStatus = "rejected";
      } else {
        this.organizerVerificationStatus = "unverified";
      }
    }
  }

  // If organizerVerificationStatus is approved, make sure hasBeenApproved is true
  if (this.businessVerificationStatus === "approved") {
    this.hasBeenApproved = true;
  }

  // Handle phone verification one-time flag
  if (this.verifications?.phone) {
    if (this.verifications.phone.isVerified) {
      this.verifications.phone.isVerifiedOnce = true;
    }
    if (this.verifications.phone.isVerifiedOnce) {
      this.verifications.phone.isVerified = true;
    }
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
    ret.userRole = userRole[ret.roleId] || null;
    return ret;
  },
};

UserSchema.options.toObject = UserSchema.options.toJSON;

UserSchema.post("save", async function (doc, next) {
  try {
    if (doc.wasNew) {
      const UserSetting = mongoose.model("UserSetting");
      // Check if setting already exists (just to be safe)
      const existingSetting = await UserSetting.findOne({ userId: doc._id });
      if (!existingSetting) {
        await UserSetting.create({ userId: doc._id });
      }
    }
    next();
  } catch (err) {
    console.error("Error creating default user setting:", err);
    next(err);
  }
});

module.exports = mongoose.model("User", UserSchema, "User");
