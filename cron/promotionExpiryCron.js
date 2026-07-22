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
      $or: [
        { featuredExpiry: { $lt: now } },
        {
          status: "Past",
          $or: [
            { isFeatured: true },
            { fetcherEvent: true },
            { addToSlider: true },
            { activePromotionPackage: { $ne: null } }
          ]
        },
        {
          featuredExpiry: null,
          activePromotionPackage: null,
          $or: [
            { isFeatured: true },
            { fetcherEvent: true }
          ]
        }
      ]
    });

    if (expiredEvents.length > 0) {
      for (const event of expiredEvents) {
        event.isFeatured = false;
        event.fetcherEvent = false;
        event.featuredExpiry = null;
        event.activePromotionPackage = null;
        event.addToSlider = false;
        await event.save();

        await notifyPromotionExpiry(event.createdBy, "Event", event.eventTitle, event._id);

        console.log(`[${now.toISOString()}] Expired promotion/slider for Event ID: ${event._id}`);
      }
    } else {
      console.log(`[${now.toISOString()}] No expired event promotions found.`);
    }

    // -------------------------------------------------------------
    // process expired COURSE promotions
    // -------------------------------------------------------------
    const expiredCourses = await Course.find({
      $or: [
        { featuredExpiry: { $lt: now } },
        {
          status: "Past",
          $or: [
            { isFeatured: true },
            { activePromotionPackage: { $ne: null } }
          ]
        },
        {
          featuredExpiry: null,
          activePromotionPackage: null,
          isFeatured: true
        }
      ]
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

