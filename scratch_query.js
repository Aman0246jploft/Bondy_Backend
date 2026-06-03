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
    const { eventStatus } = require("./utils/Role");

    const now = new Date();
    console.log("Current time (now):", now);

    const query = {
      isDraft: false,
      endDate: { $gte: now },
      status: { $ne: eventStatus.PAST },
    };

    console.log("Running query:", JSON.stringify(query, null, 2));

    const courses = await Course.find(query).lean();
    console.log(`Matched courses count: ${courses.length}`);
    for (const c of courses) {
      console.log({
        id: c._id,
        title: c.courseTitle,
        isDraft: c.isDraft,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
      });
    }

    // Let's print ALL courses in DB to see what dates/status they actually have
    console.log("\n--- Listing ALL courses in DB ---");
    const allCourses = await Course.find({}).lean();
    for (const c of allCourses) {
      console.log({
        id: c._id,
        title: c.courseTitle,
        isDraft: c.isDraft,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
      });
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
