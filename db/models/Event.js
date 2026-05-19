const mongoose = require("mongoose");
const { visibility, ageOptions } = require("../../utils/Role");
const { combineDateAndTime } = require("../../utils/globalFunction");

// Helper to determine if a field is required (i.e. only required when NOT a draft)
const requiredIfNotDraft = function () {
  return !this.isDraft;
};

// Helper for ticket list subdocuments to check if parent is not a draft
const requiredIfParentNotDraft = function () {
  const parent = this.parent();
  return parent ? !parent.isDraft : true;
};

const eventSchema = new mongoose.Schema(
  {
    // Page 1: Basic Information
    eventTitle: {
      type: String,
      trim: true,
      index: true,
      required: requiredIfNotDraft
    },
    eventCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: requiredIfNotDraft,
      index: true,
    },
    shortDescription: {
      type: String,
      trim: true,
      index: true,
      required: requiredIfNotDraft
    },
    description: {
      type: String,
      trim: true,
      required: requiredIfNotDraft
    },
    posterImage: { type: [String] },
    galleryImages: { type: [String] },
    videoLinks: { type: [String] },

    // Page 2: Date & Location
    startDate: {
      type: Date,
      required: requiredIfNotDraft,
      index: true,
    },
    startTime: {
      type: String,
      required: requiredIfNotDraft
    },
    endDate: {
      type: Date,
      required: requiredIfNotDraft,
      index: true,
    },
    endTime: {
      type: String,
      required: requiredIfNotDraft
    },

    venueName: {
      type: String,
      required: requiredIfNotDraft
    },
    venueAddress: {
      type: {
        type: String,
        enum: ["Point"], // Must be "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
      city: String,
      country: String,
      address: String,
      state: String,
      zipcode: String,
    },

    // Page 3: Tickets & Policies
    ticketList: [
      {
        name: {
          type: String,
          trim: true,
          required: requiredIfParentNotDraft
        },
        price: {
          type: Number,
          required: requiredIfParentNotDraft
        },
        salesStartDate: {
          type: Date,
          required: requiredIfParentNotDraft
        },
        salesEndDate: {
          type: Date,
          required: requiredIfParentNotDraft
        },
        totalQuantity: {
          type: Number,
          required: requiredIfParentNotDraft
        },
      }
    ],
    refundPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefundPolicy",
      default: null,
      index: true,
    },

    // Page 4: Settings & Visibility
    visibility: {
      type: String,
      enum: Object.values(visibility), // Fixed: enum must contain values instead of object
      default: visibility.PUBLIC,
      index: true,
    },

    status: {
      type: String,
      enum: ["Upcoming", "Live", "Past"],
      default: "Upcoming",
      index: true,
    },

    addToSlider: {
      type: Boolean,
      default: false,
      index: true,
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    addOns: { type: String },

    accessAndPrivacy: {
      type: Boolean,
      default: false,
    },

    ageRestriction: {
      type: String,
      enum: ageOptions.map((option) => option.value),
      default: ageOptions[0].value,
    },

    showAttendees: {
      type: Boolean,
      default: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    dressCode: {
      type: String,
      trim: true,
    },

    fetcherEvent: {
      type: Boolean,
      default: false,
    },

    isDraft: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ─── INDEXING STRATEGY ────────────────────────────────────────────────────────
// Create geospatial index for location-based/radius queries
eventSchema.index({ venueAddress: "2dsphere" }, { sparse: true });

// Create compound index for dashboard and my-events filtering
eventSchema.index({ createdBy: 1, isDraft: 1 });

// Create compound index for calendar and active/upcoming queries
eventSchema.index({ isDraft: 1, endDate: 1, startDate: 1 });

// ─── PRE-SAVE HOOK ───────────────────────────────────────────────────────────
eventSchema.pre("save", function (next) {
  const now = new Date();

  // 1. Date normalization: convert to strict UTC Date objects incorporating correct time
  if (this.startDate) {
    this.startDate = combineDateAndTime(this.startDate, this.startTime);
  }
  if (this.endDate) {
    this.endDate = combineDateAndTime(this.endDate, this.endTime);
  }

  if (this.ticketList && this.ticketList.length > 0) {
    this.ticketList.forEach((ticket) => {
      if (ticket.salesStartDate) {
        ticket.salesStartDate = new Date(ticket.salesStartDate);
      }
      if (ticket.salesEndDate) {
        ticket.salesEndDate = new Date(ticket.salesEndDate);
      }
    });
  }

  // 2. Date Range Validation (Only applicable if event is NOT a draft)
  if (!this.isDraft) {
    if (this.startDate && this.endDate && this.startDate > this.endDate) {
      return next(new Error("Event start date cannot be after the end date."));
    }

    if (this.ticketList && this.ticketList.length > 0) {
      for (const ticket of this.ticketList) {
        if (ticket.salesStartDate && ticket.salesEndDate && ticket.salesStartDate > ticket.salesEndDate) {
          return next(
            new Error(`Ticket sales start date cannot be after the end date for ticket: ${ticket.name}`)
          );
        }
      }
    }
  }

  // 3. Auto-manage status
  if (this.startDate && this.endDate) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    if (end < now) {
      this.status = "Past";
    } else if (start <= now && end >= now) {
      this.status = "Live";
    } else {
      this.status = "Upcoming";
    }
  }

  // 4. Validate and set GeoJSON Type safely if coordinates are provided
  if (
    this.venueAddress &&
    this.venueAddress.coordinates &&
    Array.isArray(this.venueAddress.coordinates) &&
    this.venueAddress.coordinates.length === 2
  ) {
    this.venueAddress.type = "Point";
  }

  next();
});

// ─── SERIALIZATION TRANSFORM ──────────────────────────────────────────────────
// Ensure dates are sent as standardized ISO 8601 UTC strings to clients worldwide
const formatTransform = function (doc, ret) {
  delete ret.__v;

  // Globally normalize Date objects to ISO 8601 UTC strings ('YYYY-MM-DDTHH:mm:ss.sssZ')
  if (ret.startDate instanceof Date) ret.startDate = ret.startDate.toISOString();
  if (ret.endDate instanceof Date) ret.endDate = ret.endDate.toISOString();
  if (ret.createdAt instanceof Date) ret.createdAt = ret.createdAt.toISOString();
  if (ret.updatedAt instanceof Date) ret.updatedAt = ret.updatedAt.toISOString();

  if (Array.isArray(ret.ticketList)) {
    ret.ticketList.forEach((ticket) => {
      if (ticket.salesStartDate instanceof Date) {
        ticket.salesStartDate = ticket.salesStartDate.toISOString();
      }
      if (ticket.salesEndDate instanceof Date) {
        ticket.salesEndDate = ticket.salesEndDate.toISOString();
      }
    });
  }

  return ret;
};

eventSchema.set("toJSON", { transform: formatTransform });
eventSchema.set("toObject", { transform: formatTransform });

module.exports = mongoose.model("Event", eventSchema);
