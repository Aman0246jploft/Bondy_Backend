const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SearchHistorySchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    query: {
      type: String,
      trim: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a user only has one unique entry per query term
SearchHistorySchema.index({ userId: 1, query: 1 }, { unique: true });

module.exports = mongoose.model("SearchHistory", SearchHistorySchema, "SearchHistory");
