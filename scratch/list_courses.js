const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function run() {
  await mongoose.connect(process.env.DB_STRING);
  const { Course } = require("../db");
  const courses = await Course.find({}).lean();
  for (const c of courses) {
    console.log(`Course ID: ${c._id}, Title: ${c.courseTitle}, Draft: ${c.isDraft}`);
    console.log(`  Batches:`, c.batches.map(b => ({ _id: b._id, name: b.batchName, seats: b.seats, ReservedExternally: b.ReservedExternally })));
  }
  await mongoose.disconnect();
}
run();
