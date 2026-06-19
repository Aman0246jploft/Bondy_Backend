const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function run() {
  await mongoose.connect(process.env.DB_STRING);
  const { Course } = require("../db");
  const course = await Course.findById("6a2904769f3feca6e22f5916").lean();
  console.log("Course Batches:", JSON.stringify(course?.batches, null, 2));
  await mongoose.disconnect();
}
run();
