const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const DB_STRING = process.env.DB_STRING;

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(DB_STRING);
    console.log("Connected.");

    const { Event, Course, SearchHistory } = require("../db");

    // Clear search history for testing user
    const testUserId = new mongoose.Types.ObjectId("6a227663a2023c86b5b23c65");
    await SearchHistory.deleteMany({ userId: testUserId });
    console.log("Cleared search history for test user.");

    // Perform a few searches
    const keywords = ["football", "swimming", "football", "guitar", "cooking", "dance", "piano", "chess"];
    console.log("Adding search queries...");
    for (const kw of keywords) {
      await SearchHistory.findOneAndUpdate(
        { userId: testUserId, query: kw },
        { userId: testUserId, query: kw },
        { upsert: true, new: true }
      );
    }

    // Retrieve recent searches
    const recent = await SearchHistory.find({ userId: testUserId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean();

    console.log("Recent 6 searches (should be: chess, piano, dance, cooking, guitar, football):");
    console.log(recent.map(r => r.query));

    // Test delete a specific search
    await SearchHistory.deleteOne({ userId: testUserId, query: "guitar" });
    const postDelete = await SearchHistory.find({ userId: testUserId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean();
    console.log("After deleting 'guitar':", postDelete.map(r => r.query));

  } catch (err) {
    console.error("Error running test:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

run();
