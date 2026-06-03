const cron = require("node-cron");
const { Course } = require("../db");
const { eventStatus } = require("../utils/Role");

// Run every 10 minutes, similar to eventStatus.cron.js
cron.schedule("*/10 * * * *", async () => {
  try {
    const now = new Date();

    // 1. Update PAST courses
    await Course.updateMany(
      {
        status: { $ne: eventStatus.CANCELLED },
        endDate: { $lt: now },
      },
      { status: eventStatus.PAST }
    );

    // 2. Update UPCOMING courses
    await Course.updateMany(
      {
        status: { $ne: eventStatus.CANCELLED },
        startDate: { $gt: now },
      },
      { status: eventStatus.UPCOMING }
    );

    // 3. Update LIVE courses
    await Course.updateMany(
      {
        status: { $ne: eventStatus.CANCELLED },
        startDate: { $lte: now },
        endDate: { $gte: now },
      },
      { status: eventStatus.LIVE }
    );

    console.log("✅ Course status cron ran successfully");
  } catch (error) {
    console.error("❌ Course status cron job error:", error);
  }
});
