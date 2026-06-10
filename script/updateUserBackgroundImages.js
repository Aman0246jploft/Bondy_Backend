/**
 * updateUserBackgroundImages.js
 * -----------------------------------------------------------
 * Standalone script that updates all users in the database
 * to make sure they all have a valid, high-quality cover/background image.
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../db/index");

const BACKGROUND_IMAGES = [
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&fit=crop",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&fit=crop",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&fit=crop",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&fit=crop",
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&fit=crop"
];

const updateBackgroundImages = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for background image update...");

    const users = await User.find({});
    console.log(`📋 Found ${users.length} users to inspect.`);

    let updatedCount = 0;
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const selectedImage = BACKGROUND_IMAGES[i % BACKGROUND_IMAGES.length];

      user.backgroundImage = selectedImage;
      await user.save();
      updatedCount++;
    }

    console.log(`✅ Successfully updated background image for ${updatedCount} users.`);
  } catch (error) {
    console.error("❌ Error updating background images:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
};

updateBackgroundImages();
