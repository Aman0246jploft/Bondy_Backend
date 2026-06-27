const cron = require("node-cron");
const { Event, User } = require("../db");
const moment = require("moment-timezone");

cron.schedule("* * * * *", async () => {
  console.log("running event status cron >>>>");
  try {
    const nowUtc = moment.utc();

    // We cannot use simple updateMany anymore because we need the creator's timezone
    // Fetch all active/published events that are not past
    const events = await Event.find({ status: { $ne: "Past" }, isDraft: false }).populate("createdBy", "timeZone");

    const bulkOps = [];

    const tzMapping = {
      EST: "America/New_York",
      EDT: "America/New_York",
      CST: "America/Chicago",
      CDT: "America/Chicago",
      MST: "America/Denver",
      MDT: "America/Denver",
      PST: "America/Los_Angeles",
      PDT: "America/Los_Angeles",
      AST: "America/Halifax",
      ADT: "America/Halifax",
      HST: "Pacific/Honolulu",
      AKST: "America/Anchorage",
      AKDT: "America/Anchorage",
      GMT: "Europe/London",
      BST: "Europe/London",
      CET: "Europe/Paris",
      CEST: "Europe/Paris",
      EET: "Europe/Athens",
      EEST: "Europe/Athens",
      JST: "Asia/Tokyo",
      KST: "Asia/Seoul",
      AEST: "Australia/Sydney",
      AEDT: "Australia/Sydney",
      AWST: "Australia/Perth",
      ACST: "Australia/Adelaide",
      ACDT: "Australia/Adelaide",
    };

    for (const event of events) {
      const rawTimeZone = event.timeZone || event.createdBy?.timeZone;
      const targetTimeZone = rawTimeZone && tzMapping[rawTimeZone] ? tzMapping[rawTimeZone] : rawTimeZone;

      let eventStartUtc;
      let eventEndUtc;

      if (targetTimeZone && moment.tz.zone(targetTimeZone)) {
        eventStartUtc = null;
        eventEndUtc = null;

        if (event.startDate) {
          const start = new Date(event.startDate);
          if (!isNaN(start.valueOf())) {
            const startDateStr = start.toISOString().split("T")[0];
            const startTimeStr = event.startTime || "00:00";
            eventStartUtc = moment.tz(`${startDateStr}T${startTimeStr}`, targetTimeZone).utc();
          }
        }

        if (event.endDate) {
          const end = new Date(event.endDate);
          if (!isNaN(end.valueOf())) {
            const endDateStr = end.toISOString().split("T")[0];
            const endTimeStr = event.endTime || "00:00";
            eventEndUtc = moment.tz(`${endDateStr}T${endTimeStr}`, targetTimeZone).utc();
          }
        }

        if (!eventStartUtc) eventStartUtc = moment.utc(event.startDate);
        if (!eventEndUtc) eventEndUtc = moment.utc(event.endDate);
      } else {
        // Fallback to UTC comparison
        eventStartUtc = moment.utc(event.startDate);
        eventEndUtc = moment.utc(event.endDate);
      }

      let newStatus = event.status;

      if (nowUtc.isAfter(eventEndUtc)) {
        newStatus = "Past";
      } else if (nowUtc.isSameOrAfter(eventStartUtc) && nowUtc.isSameOrBefore(eventEndUtc)) {
        newStatus = "Live";
      } else if (nowUtc.isBefore(eventStartUtc)) {
        newStatus = "Upcoming";
      }

      if (newStatus !== event.status) {
        bulkOps.push({
          updateOne: {
            filter: { _id: event._id },
            update: { $set: { status: newStatus } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await Event.bulkWrite(bulkOps);
    }

    console.log("✅ Event status cron ran successfully");
  } catch (error) {
    console.error("❌ Cron job error:", error);
  }
});
