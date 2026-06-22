const cron = require("node-cron");
const { Event, Course, Transaction, Notification } = require("../db");
const { sendAppNotification } = require("../utils/notificationHelper");

const reminderCron = () => {
  // Run every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    console.log(`[CRON] Running ReminderCron at ${now.toISOString()}...`);

    try {
      // 1. Process Event Reminders
      const upcomingEvents = await Event.find({
        status: { $ne: "Cancelled" },
        isDraft: false,
        startDate: { $gte: now, $lte: in24Hours },
      }).lean();

      for (const event of upcomingEvents) {
        const transactions = await Transaction.find({
          eventId: event._id,
          status: "PAID",
          bookingType: "EVENT",
        }).lean();

        for (const txn of transactions) {
          const alreadyReminded = await Notification.exists({
            recipient: txn.userId,
            type: "EVENT",
            title: "Upcoming Event Reminder ⏰",
            relatedId: event._id,
          });

          if (!alreadyReminded) {
            console.log(`[CRON] Sending event reminder to user ${txn.userId} for event ${event.eventTitle}`);
            await sendAppNotification({
              recipient: txn.userId,
              type: "EVENT",
              title: "Upcoming Event Reminder ⏰",
              message: `Friendly reminder: "${event.eventTitle}" is starting soon on ${new Date(event.startDate).toLocaleString()}. See you there!`,
              relatedId: event._id,
              onModel: "Event",
              deepLink: `/tickets/${txn._id}`,
              metadata: {
                isReminder: "true",
                transactionId: txn._id.toString(),
              },
            });
          }
        }
      }

      // 2. Process Fixed-Start Course Reminders
      const upcomingCourses = await Course.find({
        status: { $ne: "Cancelled" },
        isDraft: false,
        enrollmentType: "fixedStart",
        startDate: { $gte: now, $lte: in24Hours },
      }).lean();

      for (const course of upcomingCourses) {
        const transactions = await Transaction.find({
          courseId: course._id,
          status: "PAID",
          bookingType: "COURSE",
        }).lean();

        for (const txn of transactions) {
          const alreadyReminded = await Notification.exists({
            recipient: txn.userId,
            type: "COURSE",
            title: "Upcoming Course Reminder ⏰",
            relatedId: course._id,
          });

          if (!alreadyReminded) {
            console.log(`[CRON] Sending course reminder to user ${txn.userId} for course ${course.courseTitle}`);
            await sendAppNotification({
              recipient: txn.userId,
              type: "COURSE",
              title: "Upcoming Course Reminder ⏰",
              message: `Friendly reminder: "${course.courseTitle}" is starting soon on ${new Date(course.startDate).toLocaleString()}!`,
              relatedId: course._id,
              onModel: "Course",
              deepLink: `/tickets/${txn._id}`,
              metadata: {
                isReminder: "true",
                transactionId: txn._id.toString(),
              },
            });
          }
        }
      }

      // 3. Process Ongoing Course Session Reminders
      const activeTransactions = await Transaction.find({
        status: "PAID",
        bookingType: "COURSE",
        ongoingSlots: { $exists: true, $not: { $size: 0 } },
      }).populate("courseId").lean();

      for (const txn of activeTransactions) {
        const course = txn.courseId;
        if (!course || course.status === "Cancelled" || course.isDraft) continue;

        for (const slot of txn.ongoingSlots) {
          if (!slot.selectedDate) continue;

          // Find the batch in course to get start time
          const batch = (course.batches || []).find((b) => b._id.toString() === slot.batchId.toString());
          if (!batch || batch.status === "Cancelled") continue;

          const startTimeStr = batch.startTime || "00:00";
          const slotDateTime = new Date(`${slot.selectedDate}T${startTimeStr}:00`);

          if (isNaN(slotDateTime.getTime())) continue;

          if (slotDateTime >= now && slotDateTime <= in24Hours) {
            const alreadyReminded = await Notification.exists({
              recipient: txn.userId,
              type: "COURSE",
              title: "Upcoming Course Reminder ⏰",
              "metadata.transactionId": txn._id.toString(),
              "metadata.slotDate": slot.selectedDate,
              "metadata.batchId": slot.batchId.toString(),
            });

            if (!alreadyReminded) {
              console.log(`[CRON] Sending ongoing course reminder to user ${txn.userId} for course ${course.courseTitle} slot ${slot.selectedDate}`);
              await sendAppNotification({
                recipient: txn.userId,
                type: "COURSE",
                title: "Upcoming Course Reminder ⏰",
                message: `Friendly reminder: your session for "${course.courseTitle}" is starting on ${slot.selectedDate} at ${startTimeStr}!`,
                relatedId: course._id,
                onModel: "Course",
                deepLink: `/tickets/${txn._id}`,
                metadata: {
                  isReminder: "true",
                  transactionId: txn._id.toString(),
                  slotDate: slot.selectedDate,
                  batchId: slot.batchId.toString(),
                },
              });
            }
          }
        }
      }

    } catch (error) {
      console.error("[CRON] Error in ReminderCron:", error);
    }
  });
};

module.exports = reminderCron;
