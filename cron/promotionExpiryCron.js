const cron = require("node-cron");
const { Event, Course } = require("../db");
const { notifyPromotionExpiry } = require("../routes/services/serviceNotification");

/**
 * Check for expired event and course promotions every hour
 */
cron.schedule("0 * * * *", async () => {
  try {
    const now = new Date();
    
    // -------------------------------------------------------------
    // process expired EVENT promotions
    // -------------------------------------------------------------
    const expiredEvents = await Event.find({
      isFeatured: true,
      featuredExpiry: { $lt: now },
    });

    if (expiredEvents.length > 0) {
      for (const event of expiredEvents) {
        event.isFeatured = false;
        event.featuredExpiry = null;
        event.activePromotionPackage = null;
        await event.save();

        await notifyPromotionExpiry(event.createdBy, "Event", event.title, event._id);

        console.log(`[${now.toISOString()}] Expired promotion for Event ID: ${event._id}`);
      }
    } else {
      console.log(`[${now.toISOString()}] No expired event promotions found.`);
    }

    // -------------------------------------------------------------
    // process expired COURSE promotions
    // -------------------------------------------------------------
    const expiredCourses = await Course.find({
      isFeatured: true,
      featuredExpiry: { $lt: now },
    });

    if (expiredCourses.length > 0) {
      for (const course of expiredCourses) {
        course.isFeatured = false;
        course.featuredExpiry = null;
        course.activePromotionPackage = null;
        await course.save();

        await notifyPromotionExpiry(course.createdBy, "Course", course.title, course._id);

        console.log(`[${now.toISOString()}] Expired promotion for Course ID: ${course._id}`);
      }
    } else {
      console.log(`[${now.toISOString()}] No expired course promotions found.`);
    }

  } catch (error) {
    console.error("Error running promotion expiry cron job:", error);
  }
});

