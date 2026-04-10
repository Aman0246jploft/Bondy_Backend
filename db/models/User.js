const mongoose = require("mongoose");
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
      state: String,
      zipcode: String,
      // default: null,
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
          name: {
            type: String,
            enum: ["Business Proof", "Gov ID"],
            default: null,
          }, // Document name/title
          file: { type: String, default: null }, // the document URL or filename
          status: {
            // approval status
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
          },
          reason: { type: String, default: null }, // reason for rejection
        },
      ],
      default: [], // empty array if no documents
    },

    isVerified: {
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
    organizerVerificationStatus: {
      type: String,
      enum: ["unverified", "pending", "approved", "rejected"],
      default: "unverified",
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
    averageRating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
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

  this.wasNew = this.isNew;
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
function getLatestDocsByName(documents) {
  const map = new Map();

  for (const doc of documents) {
    // override older ones with newer ones
    map.set(doc.name, doc);
  }

  return Array.from(map.values());
}

// UserSchema.pre("save", function (next) {
//   const REQUIRED_DOCS = ["Business Proof", "Gov ID"];

//   const latestDocs = getLatestDocsByName(this.documents);

//   const approvedDocs = latestDocs.filter((doc) => doc.status === "approved");

//   const approvedNames = approvedDocs.map((d) => d.name);

//   const isVerified = REQUIRED_DOCS.every((docName) =>
//     approvedNames.includes(docName),
//   );

//   this.isVerified = isVerified;

//   // keep organizerVerificationStatus in sync
//   if (isVerified) {
//     this.organizerVerificationStatus = "approved";
//   } else if (latestDocs.some((d) => d.status === "rejected")) {
//     this.organizerVerificationStatus = "rejected";
//   } else if (latestDocs.length) {
//     this.organizerVerificationStatus = "pending";
//   } else {
//     this.organizerVerificationStatus = "unverified";
//   }

//   next();
// });

UserSchema.pre("save", function (next) {
  const latestDocs = getLatestDocsByName(this.documents);

  const businessProof = latestDocs.find((doc) => doc.name === "Business Proof");

  const govId = latestDocs.find((doc) => doc.name === "Gov ID");

  const isBusinessApproved = businessProof?.status === "approved";
  const isGovApproved = govId?.status === "approved";

  // ✅ isVerified = true if ANY one is approved (Once true, it stays true forever)
  if (this.isVerified || isBusinessApproved || isGovApproved) {
    this.isVerified = true;
  }

  // ✅ organizerVerificationStatus = approved ONLY if BOTH approved
  if (isBusinessApproved && isGovApproved) {
    this.organizerVerificationStatus = "approved";
  } else if (latestDocs.some((d) => d.status === "rejected")) {
    this.organizerVerificationStatus = "rejected";
  } else if (latestDocs.length) {
    this.organizerVerificationStatus = "pending";
  } else {
    this.organizerVerificationStatus = "unverified";
  }

  next();
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
