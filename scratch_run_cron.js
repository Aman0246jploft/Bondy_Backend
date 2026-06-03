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

    // Let's first reset all course statuses to check which query changes them
    console.log("\nResetting all statuses to 'Live'...");
    await Course.updateMany({}, { status: "Live" });

    // 1. Run PAST courses query
    const pastRes = await Course.updateMany(
      {
        status: { $ne: eventStatus.CANCELLED },
        endDate: { $lt: now },
      },
      { status: eventStatus.PAST }
    );
    console.log("Query 1 (PAST) modified:", pastRes.modifiedCount);

    // 2. Run UPCOMING courses query
    const upcomingRes = await Course.updateMany(
      {
        status: { $ne: eventStatus.CANCELLED },
        startDate: { $gt: now },
      },
      { status: eventStatus.UPCOMING }
    );
    console.log("Query 2 (UPCOMING) modified:", upcomingRes.modifiedCount);

    // 3. Run LIVE courses query
    const liveRes = await Course.updateMany(
      {
        status: { $ne: eventStatus.CANCELLED },
        startDate: { $lte: now },
        endDate: { $gte: now },
      },
      { status: eventStatus.LIVE }
    );
    console.log("Query 3 (LIVE) modified:", liveRes.modifiedCount);

    console.log("\nAfter running queries, course statuses are:");
    const courses = await Course.find({}).lean();
    for (const c of courses) {
      console.log(` - ${c.courseTitle}: status = ${c.status}, endDate = ${c.endDate}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
