const cron = require("node-cron");
const { Course, User } = require("../db");
const { eventStatus } = require("../utils/Role");
const moment = require("moment-timezone");

// Run every 10 minutes, similar to eventStatus.cron.js
cron.schedule("*/10 * * * *", async () => {
  try {
    const nowUtc = moment.utc();
    
    // Fetch all courses not cancelled
    const courses = await Course.find({ status: { $ne: eventStatus.CANCELLED } }).populate("createdBy", "timeZone");
    
    const bulkOps = [];
    
    for (const course of courses) {
      const creatorTimeZone = course.createdBy?.timeZone;
      
      let courseStartUtc;
      let courseEndUtc;
      
      if (creatorTimeZone && moment.tz.zone(creatorTimeZone)) {
        const startDateStr = new Date(course.startDate).toISOString().split("T")[0];
        courseStartUtc = moment.tz(`${startDateStr}T00:00:00`, creatorTimeZone).utc();
        
        if (course.endDate) {
          const endDateStr = new Date(course.endDate).toISOString().split("T")[0];
          courseEndUtc = moment.tz(`${endDateStr}T23:59:59`, creatorTimeZone).utc(); // Assuming end of day for course endDate if no specific time is provided at root
        }
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
