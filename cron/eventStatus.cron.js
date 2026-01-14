const cron = require("node-cron");
const { Event } = require("../db");

cron.schedule("*/10 * * * *", async () => {
  try {
    const now = new Date();

    await Event.updateMany({ startDate: { $gt: now } }, { status: "Upcoming" });

    await Event.updateMany(
      { startDate: { $lte: now }, endDate: { $gte: now } },
      { status: "Live" }
    );

    await Event.updateMany({ endDate: { $lt: now } }, { status: "Past" });

    console.log("✅ Event status cron ran successfully");
  } catch (error) {
    console.error("❌ Cron job error:", error);
  }
});
