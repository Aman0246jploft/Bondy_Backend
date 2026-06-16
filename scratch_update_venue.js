const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');

// Initialize DB connection
require('./db');

const Course = require('./db/models/Course');

const defaultAddress = {
  type: "Point",
  coordinates: [75.773672, 26.83342], // [longitude, latitude]
  city: "Jaipur",
  country: "India",
  address: "Default Venue Address",
  state: "Rajasthan",
  zipcode: "302020"
};

async function run() {
  try {
    console.log("Fetching all courses...");
    const courses = await Course.find();
    console.log(`Found ${courses.length} courses in database.`);

    let updatedCount = 0;

    for (const course of courses) {
      const addr = course.venueAddress;
      const hasCoords = addr && Array.isArray(addr.coordinates) && addr.coordinates.length >= 2 &&
        addr.coordinates[0] !== null && addr.coordinates[1] !== null;

      if (!hasCoords) {
        course.venueAddress = defaultAddress;
        // Also ensure it has a default venue name if empty
        if (!course.venueName) {
          course.venueName = "Default Venue";
        }
        await course.save();
        console.log(`Updated course "${course.courseTitle}" (ID: ${course._id}) with default venue address.`);
        updatedCount++;
      }
    }

    console.log(`Successfully updated ${updatedCount} courses.`);
    process.exit(0);
  } catch (err) {
    console.error("Error updating courses:", err);
    process.exit(1);
  }
}

// Wait a brief moment for database connection to be established
setTimeout(run, 2000);
