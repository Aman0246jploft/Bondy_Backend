/**
 * updateUserProfileImages.js
 * -----------------------------------------------------------
 * Standalone script that updates all users in the database
 * to make sure they all have a valid, high-quality profile image.
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../db/index");

const PROFILE_IMAGES = [
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop",
  "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&h=150&fit=crop",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop"
];

const updateProfileImages = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for profile image update...");

    const users = await User.find({});
    console.log(`📋 Found ${users.length} users to inspect.`);

    let updatedCount = 0;
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const selectedImage = PROFILE_IMAGES[i % PROFILE_IMAGES.length];
      
      // Update the user's profile image
      user.profileImage = selectedImage;
      await user.save();
      updatedCount++;
    }

    console.log(`✅ Successfully updated profile image for ${updatedCount} users.`);
  } catch (error) {
    console.error("❌ Error updating profile images:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
};

updateProfileImages();
