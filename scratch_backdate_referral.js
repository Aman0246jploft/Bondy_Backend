require("dotenv").config();
const mongoose = require("mongoose");
const { Referral } = require("./db");

const DB_STRING = process.env.DB_STRING || process.env.MONGODB_URL || "mongodb://127.0.0.1:27017/bondy";

async function backdateReferrals() {
  try {
    console.log("Connecting to database...");
    await mongoose.connect(DB_STRING);
    console.log("Connected successfully.");

    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    console.log(`Searching for PENDING_VALIDATION referrals to backdate to ${pastDate.toISOString()}...`);
    
    const result = await Referral.updateMany(
      { status: "PENDING_VALIDATION" },
      { $set: { refundWindowEndDate: pastDate } }
    );

    console.log(`Successfully updated ${result.modifiedCount} referral(s).`);
  } catch (error) {
    console.error("Error backdating referrals:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
  }
}

backdateReferrals();
