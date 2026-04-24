const cron = require("node-cron");
const { Event, Course } = require("../db");
const { notifyPromotionExpiry } = require("../routes/services/serviceNotification");

/**
 * Check for expired event and course promotions every hour
 */
cron.schedule("0 * * * *", async () => {
  try {
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

    // -------------------------------------------------------------
    // process EVENT promotions expiring within the next 0-60 minutes
    // -------------------------------------------------------------
    const expiredEvents = await Event.find({
      isFeatured: true,
      featuredExpiry: { $lte: inOneHour },
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
    // process COURSE promotions expiring within the next 0-60 minutes
    // -------------------------------------------------------------
    const expiredCourses = await Course.find({
      isFeatured: true,
      featuredExpiry: { $lte: inOneHour },
    });

    if (expiredCourses.length > 0) {
      for (const course of expiredCourses) {
        course.isFeatured = false;
        course.featuredExpiry = null;
        course.activePromotionPackage = null;
        await course.save();

        await notifyPromotionExpiry(course.createdBy, "Course", course.courseTitle, course._id);

        console.log(`[${now.toISOString()}] Expired promotion for Course ID: ${course._id}`);
      }
    } else {
      console.log(`[${now.toISOString()}] No expired course promotions found.`);
    }

  } catch (error) {
    console.error("Error running promotion expiry cron job:", error);
  }
});

