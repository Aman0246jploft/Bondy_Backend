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
 * Synchronize course statuses (Upcoming -> Live -> Past)
 * @param {Object} filter Additional filter (e.g. { createdBy: organizerId })
 */
const syncCourseStatuses = async (filter = {}) => {
  try {
    const nowUtc = moment.utc();
    const query = {
      status: { $nin: [eventStatus.CANCELLED, eventStatus.PAST] },
      isDraft: false,
      ...filter,
    };

    const courses = await Course.find(query).populate("createdBy", "timeZone");
    if (!courses || courses.length === 0) return 0;

    const bulkOps = [];

    for (const course of courses) {
      const rawTimeZone = (course.timeZone && course.timeZone !== "UTC")
        ? course.timeZone
        : (course.createdBy?.timeZone || (course.venueAddress?.country === "Монгол" ? "Asia/Ulaanbaatar" : "UTC"));

      const targetTimeZone = rawTimeZone && tzMapping[rawTimeZone] ? tzMapping[rawTimeZone] : rawTimeZone;

      let courseStartUtc = null;
      let courseEndUtc = null;

      if (targetTimeZone && moment.tz.zone(targetTimeZone)) {
        if (course.startDate) {
          const start = new Date(course.startDate);
          if (!isNaN(start.valueOf())) {
            const startDateStr = start.toISOString().split("T")[0];
            courseStartUtc = moment.tz(`${startDateStr}T00:00:00`, targetTimeZone).utc();
          }
        }

        if (course.endDate) {
          const end = new Date(course.endDate);
          if (!isNaN(end.valueOf())) {
            const endDateStr = end.toISOString().split("T")[0];
            courseEndUtc = moment.tz(`${endDateStr}T23:59:59`, targetTimeZone).utc();
          }
        }
      }

      if (!courseStartUtc && course.startDate) courseStartUtc = moment.utc(course.startDate);
      if (!courseEndUtc && course.endDate) courseEndUtc = moment.utc(course.endDate);

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

module.exports = { syncCourseStatuses, tzMapping };

