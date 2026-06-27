const cron = require("node-cron");
const { Course, User } = require("../db");
const { eventStatus } = require("../utils/Role");
const moment = require("moment-timezone");

// Run every 10 minutes, similar to eventStatus.cron.js
cron.schedule("* * * * *", async () => {
  try {
    const nowUtc = moment.utc();

    // Fetch all courses not cancelled
    const courses = await Course.find({ status: { $ne: eventStatus.CANCELLED } }).populate("createdBy", "timeZone");

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

    for (const course of courses) {
      const rawTimeZone = course.timeZone || course.createdBy?.timeZone;
      const targetTimeZone = rawTimeZone && tzMapping[rawTimeZone] ? tzMapping[rawTimeZone] : rawTimeZone;

      let courseStartUtc;
      let courseEndUtc;

      if (targetTimeZone && moment.tz.zone(targetTimeZone)) {
        courseStartUtc = null;
        courseEndUtc = null;

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

        // Fallbacks if dates are invalid
        if (!courseStartUtc) courseStartUtc = moment.utc(course.startDate);
        if (!courseEndUtc) courseEndUtc = course.endDate ? moment.utc(course.endDate) : null;

      } else {
        courseStartUtc = moment.utc(course.startDate);
        courseEndUtc = course.endDate ? moment.utc(course.endDate) : null;
      }

      let newStatus = course.status;

      if (courseEndUtc && nowUtc.isAfter(courseEndUtc)) {
        newStatus = eventStatus.PAST;
      } else if (nowUtc.isSameOrAfter(courseStartUtc) && (!courseEndUtc || nowUtc.isSameOrBefore(courseEndUtc))) {
        newStatus = eventStatus.LIVE;
      } else if (nowUtc.isBefore(courseStartUtc)) {
        newStatus = eventStatus.UPCOMING;
      }

      if (newStatus !== course.status) {
        bulkOps.push({
          updateOne: {
            filter: { _id: course._id },
            update: { $set: { status: newStatus } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await Course.bulkWrite(bulkOps);
    }

    console.log("✅ Course status cron ran successfully");
  } catch (error) {
    console.error("❌ Course status cron job error:", error);
  }
});
