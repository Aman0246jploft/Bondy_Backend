const cron = require("node-cron");
const { Event } = require("../db");

cron.schedule("* * * * *", async () => {
  console.log("runnning>>>>");
  try {
    const now = new Date();

    await Event.updateMany({ startDate: { $gt: now }, isDraft: false }, { status: "Upcoming" });

    await Event.updateMany(
      { startDate: { $lte: now }, endDate: { $gte: now }, isDraft: false },
      { status: "Live" }
    );

    await Event.updateMany({ endDate: { $lt: now }, isDraft: false }, { status: "Past" });

    console.log("✅ Event status cron ran successfully");
  } catch (error) {
    console.error("❌ Cron job error:", error);
  }
});
