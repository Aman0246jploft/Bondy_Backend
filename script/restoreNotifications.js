/**
 * restoreNotifications.js
 * -----------------------------------------------------------
 * Standalone script that updates all notifications in the database
 * to set isDeleted: false.
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Notification } = require("../db/index");

const restoreNotifications = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for notification restoration...");

    const result = await Notification.updateMany(
      { isDeleted: true },
      { $set: { isDeleted: false } }
    );

    console.log(`✅ Successfully restored notifications. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  } catch (error) {
    console.error("❌ Error restoring notifications:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
};

restoreNotifications();
