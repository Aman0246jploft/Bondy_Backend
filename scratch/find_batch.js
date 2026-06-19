const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function run() {
  await mongoose.connect(process.env.DB_STRING);
  const { Course } = require("../db");
  const course = await Course.findOne({ "batches._id": "6a2904769f3feca6e22f5918" }).lean();
  if (course) {
    console.log(`Found in Course ID: ${course._id}, Title: ${course.courseTitle}`);
    const batch = course.batches.find(b => b._id.toString() === "6a2904769f3feca6e22f5918");
    console.log("Batch:", batch);
  } else {
    console.log("Batch 6a2904769f3feca6e22f5918 not found in any course.");
  }
  await mongoose.disconnect();
}
run();
