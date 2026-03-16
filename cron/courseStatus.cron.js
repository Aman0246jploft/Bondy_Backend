const cron = require("node-cron");
const { Course } = require("../db");

// Run every 10 minutes, similar to eventStatus.cron.js
cron.schedule("*/10 * * * *", async () => {
  try {
    const now = new Date();

    // 1. Update PAST courses
    // A course is past if ALL its schedules' endDates are strictly less than now.
    // Equivalent: does NOT have any schedule with endDate >= now
    await Course.updateMany(
      {
        schedules: {
          $not: { $elemMatch: { endDate: { $gte: now } } },
        },
      },
      { status: "Past" }
    );

    // 2. Update UPCOMING courses
    // A course is upcoming if it has at least one schedule starting in the future,
    // AND none of its schedules are currently live.
    await Course.updateMany(
      {
        $and: [
          {
            schedules: {
              $elemMatch: { startDate: { $gt: now } },
            },
          },
          {
            schedules: {
              $not: {
                $elemMatch: { startDate: { $lte: now }, endDate: { $gte: now } },
              },
            },
          },
        ],
      },
      { status: "Upcoming" }
    );

    // 3. Update LIVE courses
    // A course is live if ANY of its schedules are currently overlapping with now.
    await Course.updateMany(
      {
        schedules: {
          $elemMatch: { startDate: { $lte: now }, endDate: { $gte: now } },
        },
      },
      { status: "Live" }
    );

    console.log("✅ Course status cron ran successfully");
  } catch (error) {
    console.error("❌ Course status cron job error:", error);
  }
});
