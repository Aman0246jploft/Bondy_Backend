require("dotenv").config();
const mongoose = require("mongoose");
const { DB_STRING } = process.env;
const { Category } = require("../db/index");

// Map category names to lightweight Lucide static SVG icons
const iconMapping = {
  "startup events": "rocket.svg",
  "networking events": "users.svg",
  "product launches": "sparkles.svg",
  "music concerts": "music.svg",
  "festivals": "party-popper.svg",
  "sports events": "trophy.svg",
  "corporate events": "briefcase.svg",
  "training programs": "presentation.svg",
  "college events": "graduation-cap.svg",
  "community events": "globe.svg",
  "language": "languages.svg",
  "arts & crafts": "palette.svg",
  "music & dance": "disc.svg",
  "fitness & health": "activity.svg",
  "marketing": "megaphone.svg",
  "academics": "book-open.svg",
  "personal development": "smile.svg",
  "coding & software": "code-2.svg",
  "design & ux": "pen-tool.svg",
  "finance & investing": "coins.svg",
  // Map some additional general categories found in the DB log
  "music": "music.svg",
  "technology": "laptop.svg",
  "art": "palette.svg",
  "sports": "trophy.svg",
  "business": "briefcase.svg",
  "karaoke": "mic.svg",
  "payment": "credit-card.svg",
  "food": "utensils.svg",
  "wellness": "heart-pulse.svg",
  "comedy": "laugh.svg",
  "networking": "users.svg",
  "photography": "camera.svg",
  "cooking": "chef-hat.svg",
  "aviation": "plane.svg",
  "fitness": "dumbbell.svg"
};

const defaultIcon = "tag.svg";
const cdnBaseUrl = "https://unpkg.com/lucide-static@0.321.0/icons/";

async function updateCategoryIcons() {
  try {
    // Wait a little bit for the mongoose.connect in db/index.js to resolve
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log("Fetching categories...");

    const categories = await Category.find({});
    console.log(`Found ${categories.length} categories.`);

    let updatedCount = 0;
    for (const cat of categories) {
      const nameLower = cat.name ? cat.name.toLowerCase().trim() : "";
      const iconName = iconMapping[nameLower] || defaultIcon;
      const newIconUrl = `${cdnBaseUrl}${iconName}`;

      console.log(`Updating category "${cat.name}" image to: "${newIconUrl}"`);
      
      await Category.updateOne({ _id: cat._id }, { $set: { image: newIconUrl } });
      updatedCount++;
    }

    console.log(`Successfully updated ${updatedCount} categories with lightweight icon URLs!`);
    process.exit(0);
  } catch (err) {
    console.error("Migration script failed:", err.message);
    process.exit(1);
  }
}

updateCategoryIcons();
