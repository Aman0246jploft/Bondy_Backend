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
    
    for (const event of events) {
      const creatorTimeZone = event.createdBy?.timeZone;
      
      let eventStartUtc;
      let eventEndUtc;
      
      if (creatorTimeZone && moment.tz.zone(creatorTimeZone)) {
        // Parse the event's local start/end combining date and time fields in the creator's timezone
        const startDateStr = new Date(event.startDate).toISOString().split("T")[0];
        const startTimeStr = event.startTime || "00:00";
        eventStartUtc = moment.tz(`${startDateStr}T${startTimeStr}`, creatorTimeZone).utc();
        
        const endDateStr = new Date(event.endDate).toISOString().split("T")[0];
        const endTimeStr = event.endTime || "00:00";
        eventEndUtc = moment.tz(`${endDateStr}T${endTimeStr}`, creatorTimeZone).utc();
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
