const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const DB_STRING = process.env.DB_STRING;

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(DB_STRING);
    console.log("Connected.");

    const Course = require("./db/models/Course");

    console.log("Listing courses status in DB RIGHT NOW:");
    const coursesNow = await Course.find({}).lean();
    for (const c of coursesNow) {
      console.log(` - ${c.courseTitle}: status = ${c.status}, startDate = ${c.startDate}, endDate = ${c.endDate}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
