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
 * Normalizes any time string (e.g. "10:00 AM", "19:59", "7:30 pm") to "HH:mm:ss" 24-hr format.
 */
function normalizeTimeTo24h(timeStr, defaultTime) {
  if (!timeStr || typeof timeStr !== "string" || !timeStr.trim()) {
    return defaultTime;
  }
  const clean = timeStr.trim();
  const parsedStrict = moment(clean, [
    "HH:mm:ss", "HH:mm", "H:mm",
    "h:mm:ss A", "h:mm A", "hh:mm:ss A", "hh:mm A",
    "h:mm:ssa", "h:mma", "hh:mma"
  ], true);
  if (parsedStrict.isValid()) {
    return parsedStrict.format("HH:mm:ss");
  }

  const parsedRelaxed = moment(clean, [
    "h:mm A", "hh:mm A", "h:mma", "hh:mma", "HH:mm", "H:mm"
  ]);
  if (parsedRelaxed.isValid()) {
    return parsedRelaxed.format("HH:mm:ss");
  }

  return defaultTime;
}

/**
 * Combines date + time in the target timezone safely and returns a UTC moment.
 */
function parseDateTimeUtc(dateVal, timeStr, targetTimeZone, isEnd = false) {
  if (!dateVal) return null;
  const defaultTime = isEnd ? "23:59:59" : "00:00:00";
  const normTime = normalizeTimeTo24h(timeStr, defaultTime);
  const tz = (targetTimeZone && moment.tz.zone(targetTimeZone)) ? targetTimeZone : "UTC";

  try {
    let datePart;
    if (typeof dateVal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
      datePart = dateVal.trim();
    } else {
      const mDate = moment(dateVal);
      if (!mDate.isValid()) {
        const fb = moment.utc(dateVal);
        return fb.isValid() ? fb : null;
      }
      datePart = mDate.tz(tz).format("YYYY-MM-DD");
    }

    const combined = moment.tz(`${datePart}T${normTime}`, tz);
    if (combined.isValid()) {
      return combined.utc();
    }
  } catch (err) {
    // fallback below
  }

  const fallback = moment.utc(dateVal);
  return fallback.isValid() ? fallback : null;
}

/**
 * Resolves the appropriate timezone for an event.
 */
function resolveEventTimeZone(event) {
  let rawTimeZone = null;
  if (event.timeZone && event.timeZone !== "UTC") {
    rawTimeZone = event.timeZone;
  } else if (event.venueAddress?.country === "Монгол") {
    rawTimeZone = "Asia/Ulaanbaatar";
  } else if (event.createdBy?.timeZone) {
    rawTimeZone = event.createdBy.timeZone;
  } else {
    rawTimeZone = "UTC";
  }

  const targetTimeZone = rawTimeZone && tzMapping[rawTimeZone] ? tzMapping[rawTimeZone] : rawTimeZone;
  return (targetTimeZone && moment.tz.zone(targetTimeZone)) ? targetTimeZone : "UTC";
}

/**
 * Synchronize event statuses (Upcoming -> Live -> Past)
 * @param {Object} filter Additional filter (e.g. { createdBy: organizerId })
 */
const syncEventStatuses = async (filter = {}) => {
  try {
    const nowUtc = moment.utc();
    const query = {
      status: { $ne: "Cancelled" },
      isDraft: false,
      ...filter,
    };

    const events = await Event.find(query).populate("createdBy", "timeZone");
    if (!events || events.length === 0) return 0;

    const bulkOps = [];

    for (const event of events) {
      const targetTimeZone = resolveEventTimeZone(event);

      const eventStartUtc = parseDateTimeUtc(event.startDate, event.startTime, targetTimeZone, false);
      let eventEndUtc = parseDateTimeUtc(event.endDate, event.endTime, targetTimeZone, true);

      // If no explicit endDate, default to end of start day
      if (!eventEndUtc && eventStartUtc) {
        eventEndUtc = eventStartUtc.clone().endOf("day");
      }

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

module.exports = { syncEventStatuses, tzMapping, normalizeTimeTo24h, parseDateTimeUtc, resolveEventTimeZone };
