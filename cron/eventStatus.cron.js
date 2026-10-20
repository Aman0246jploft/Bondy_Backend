const cron = require("node-cron");
const { Event, User } = require("../db");
const moment = require("moment-timezone");

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

/**
 * Synchronize event statuses (Upcoming -> Live -> Past)
 * @param {Object} filter Additional filter (e.g. { createdBy: organizerId })
 */
const syncEventStatuses = async (filter = {}) => {
  try {
    const nowUtc = moment.utc();
    const query = {
      status: { $nin: ["Past", "Cancelled"] },
      isDraft: false,
      ...filter,
    };

    const events = await Event.find(query).populate("createdBy", "timeZone");
    if (!events || events.length === 0) return 0;

    const bulkOps = [];

    for (const event of events) {
      const rawTimeZone = (event.timeZone && event.timeZone !== "UTC")
        ? event.timeZone
        : (event.createdBy?.timeZone || (event.venueAddress?.country === "Монгол" ? "Asia/Ulaanbaatar" : "UTC"));

      const targetTimeZone = rawTimeZone && tzMapping[rawTimeZone] ? tzMapping[rawTimeZone] : rawTimeZone;

      let eventStartUtc = null;
      let eventEndUtc = null;

      if (targetTimeZone && moment.tz.zone(targetTimeZone)) {
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
            const endTimeStr = event.endTime || "23:59:59";
            eventEndUtc = moment.tz(`${endDateStr}T${endTimeStr}`, targetTimeZone).utc();
          }
        }
      }

      if (!eventStartUtc && event.startDate) eventStartUtc = moment.utc(event.startDate);
      if (!eventEndUtc && event.endDate) eventEndUtc = moment.utc(event.endDate);

      let newStatus = event.status;

      if (eventEndUtc && nowUtc.isAfter(eventEndUtc)) {
        newStatus = "Past";
      } else if (eventStartUtc && nowUtc.isSameOrAfter(eventStartUtc) && (!eventEndUtc || nowUtc.isSameOrBefore(eventEndUtc))) {
        newStatus = "Live";
      } else if (eventStartUtc && nowUtc.isBefore(eventStartUtc)) {
        newStatus = "Upcoming";
      }

      if (newStatus !== event.status) {
        event.status = newStatus;
        bulkOps.push({
          updateOne: {
            filter: { _id: event._id },
            update: { $set: { status: newStatus } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await Event.bulkWrite(bulkOps);
    }

    return bulkOps.length;
  } catch (error) {
    console.error("❌ Event status sync error:", error);
    return 0;
  }
};

// Run cron every minute
cron.schedule("* * * * *", async () => {
  try {
    const updatedCount = await syncEventStatuses();
    if (updatedCount > 0) {
      console.log(`✅ Event status cron updated ${updatedCount} events`);
    }
  } catch (error) {
    console.error("❌ Cron job error in eventStatus.cron:", error);
  }
});

module.exports = { syncEventStatuses, tzMapping };

