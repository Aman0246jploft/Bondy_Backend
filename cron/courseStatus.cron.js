const cron = require("node-cron");
const { Course, User } = require("../db");
const { eventStatus } = require("../utils/Role");
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
      const mDate = moment.utc(dateVal);
      if (!mDate.isValid()) {
        return null;
      }
      datePart = mDate.format("YYYY-MM-DD");
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
 * Resolves the appropriate timezone for a course.
 */
function resolveCourseTimeZone(course) {
  let rawTimeZone = null;
  if (course.timeZone && typeof course.timeZone === "string" && course.timeZone.trim()) {
    rawTimeZone = course.timeZone.trim();
  } else if (course.venueAddress?.country === "Монгол") {
    rawTimeZone = "Asia/Ulaanbaatar";
  } else if (course.createdBy?.timeZone) {
    rawTimeZone = course.createdBy.timeZone;
  } else {
    rawTimeZone = "UTC";
  }

  const targetTimeZone = rawTimeZone && tzMapping[rawTimeZone] ? tzMapping[rawTimeZone] : rawTimeZone;
  return (targetTimeZone && moment.tz.zone(targetTimeZone)) ? targetTimeZone : "UTC";
}

/**
 * Synchronize course statuses (Upcoming -> Live -> Past)
 * @param {Object} filter Additional filter (e.g. { createdBy: organizerId })
 */
const syncCourseStatuses = async (filter = {}) => {
  try {
    const nowUtc = moment.utc();
    const query = {
      status: { $ne: eventStatus.CANCELLED },
      isDraft: false,
      ...filter,
    };

    const courses = await Course.find(query).populate("createdBy", "timeZone");
    if (!courses || courses.length === 0) return 0;

    const bulkOps = [];

    for (const course of courses) {
      const targetTimeZone = resolveCourseTimeZone(course);

      let courseStartUtc = parseDateTimeUtc(course.startDate, "00:00:00", targetTimeZone, false);
      let courseEndUtc = parseDateTimeUtc(course.endDate, "23:59:59", targetTimeZone, true);

      // Check batches for Ongoing courses with no explicit course.endDate
      if (!courseEndUtc && Array.isArray(course.batches) && course.batches.length > 0) {
        const activeBatchesWithEnd = course.batches.filter((b) => b.status !== "Cancelled" && b.endDate);
        if (activeBatchesWithEnd.length > 0) {
          const latestBatchEnd = Math.max(...activeBatchesWithEnd.map((b) => new Date(b.endDate).getTime()));
          if (latestBatchEnd > 0) {
            courseEndUtc = moment.utc(latestBatchEnd);
          }
        }
      }

      let newStatus = course.status;

      if (courseEndUtc && nowUtc.isAfter(courseEndUtc)) {
        newStatus = eventStatus.PAST;
      } else if (courseStartUtc && nowUtc.isSameOrAfter(courseStartUtc) && (!courseEndUtc || nowUtc.isSameOrBefore(courseEndUtc))) {
        newStatus = eventStatus.LIVE;
      } else if (courseStartUtc && nowUtc.isBefore(courseStartUtc)) {
        newStatus = eventStatus.UPCOMING;
      }

      if (newStatus !== course.status) {
        course.status = newStatus;
        bulkOps.push({
          updateOne: {
            filter: { _id: course._id },
            update: { $set: { status: newStatus } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await Course.bulkWrite(bulkOps);
    }

    return bulkOps.length;
  } catch (error) {
    console.error("❌ Course status sync error:", error);
    return 0;
  }
};

// Run cron every minute
cron.schedule("* * * * *", async () => {
  try {
    const updatedCount = await syncCourseStatuses();
    if (updatedCount > 0) {
      console.log(`✅ Course status cron updated ${updatedCount} courses`);
    }
  } catch (error) {
    console.error("❌ Course status cron job error:", error);
  }
});

module.exports = { syncCourseStatuses, tzMapping, normalizeTimeTo24h, parseDateTimeUtc, resolveCourseTimeZone };
