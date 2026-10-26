const mongoose = require('mongoose');
require('dotenv').config();

const Event = require('../db/models/Event');
const Course = require('../db/models/Course');
const Transaction = require('../db/models/Transaction');
const Attendee = require('../db/models/Attendee');
const Wishlist = require('../db/models/Wishlist');
const Review = require('../db/models/Review');
const Comment = require('../db/models/Comment');
const Notification = require('../db/models/Notification');
const EventView = require('../db/models/EventView');
const CourseView = require('../db/models/CourseView');
const WalletHistory = require('../db/models/WalletHistory');

async function deleteUTCEventsAndCourses() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB successfully.\n");

  // 1. Find all UTC events and courses
  const utcEvents = await Event.find({ timeZone: { $regex: /^utc$/i } }, '_id eventTitle timeZone');
  const utcCourses = await Course.find({ timeZone: { $regex: /^utc$/i } }, '_id courseTitle timeZone');

  const utcEventIds = utcEvents.map(e => e._id);
  const utcCourseIds = utcCourses.map(c => c._id);
  const allEntityIds = [...utcEventIds, ...utcCourseIds];

  console.log(`Found ${utcEvents.length} Events in UTC time zone to delete.`);
  console.log(`Found ${utcCourses.length} Courses in UTC time zone to delete.`);

  if (utcEventIds.length === 0 && utcCourseIds.length === 0) {
    console.log("No UTC events or courses found. Exiting.");
    await mongoose.disconnect();
    return;
  }

  // Find linked transactions
  const linkedTransactions = await Transaction.find(
    {
      $or: [
        { eventId: { $in: utcEventIds } },
        { courseId: { $in: utcCourseIds } }
      ]
    },
    '_id'
  );
  const linkedTransactionIds = linkedTransactions.map(t => t._id);

  // 2. Cascade delete linked records
  const attendeeResult = await Attendee.deleteMany({
    $or: [
      { eventId: { $in: utcEventIds } },
      { courseId: { $in: utcCourseIds } }
    ]
  });
  console.log(`- Deleted Attendees: ${attendeeResult.deletedCount}`);

  const transactionResult = await Transaction.deleteMany({
    _id: { $in: linkedTransactionIds }
  });
  console.log(`- Deleted Transactions: ${transactionResult.deletedCount}`);

  const walletHistoryResult = await WalletHistory.deleteMany({
    transactionId: { $in: linkedTransactionIds }
  });
  console.log(`- Deleted WalletHistory records: ${walletHistoryResult.deletedCount}`);

  const wishlistResult = await Wishlist.deleteMany({
    entityId: { $in: allEntityIds }
  });
  console.log(`- Deleted Wishlist records: ${wishlistResult.deletedCount}`);

  const reviewResult = await Review.deleteMany({
    entityId: { $in: allEntityIds }
  });
  console.log(`- Deleted Reviews: ${reviewResult.deletedCount}`);

  const commentResult = await Comment.deleteMany({
    entityId: { $in: allEntityIds }
  });
  console.log(`- Deleted Comments: ${commentResult.deletedCount}`);

  const notificationResult = await Notification.deleteMany({
    relatedId: { $in: allEntityIds }
  });
  console.log(`- Deleted Notifications: ${notificationResult.deletedCount}`);

  const eventViewResult = await EventView.deleteMany({
    eventId: { $in: utcEventIds }
  });
  console.log(`- Deleted EventViews: ${eventViewResult.deletedCount}`);

  const courseViewResult = await CourseView.deleteMany({
    courseId: { $in: utcCourseIds }
  });
  console.log(`- Deleted CourseViews: ${courseViewResult.deletedCount}`);

  // 3. Delete the Events and Courses themselves
  const eventResult = await Event.deleteMany({
    _id: { $in: utcEventIds }
  });
  console.log(`\n Deleted Events: ${eventResult.deletedCount}`);

  const courseResult = await Course.deleteMany({
    _id: { $in: utcCourseIds }
  });
  console.log(` Deleted Courses: ${courseResult.deletedCount}`);

  // 4. Verify remaining counts
  const remainingEvents = await Event.countDocuments();
  const remainingCourses = await Course.countDocuments();
  const remainingUTCEvents = await Event.countDocuments({ timeZone: { $regex: /^utc$/i } });
  const remainingUTCCourses = await Course.countDocuments({ timeZone: { $regex: /^utc$/i } });

  console.log("\n================ VERIFICATION ================");
  console.log(`Total Remaining Events: ${remainingEvents} (Remaining UTC Events: ${remainingUTCEvents})`);
  console.log(`Total Remaining Courses: ${remainingCourses} (Remaining UTC Courses: ${remainingUTCCourses})`);
  console.log("==============================================");

  await mongoose.disconnect();
  console.log("\nDisconnected from MongoDB.");
}

deleteUTCEventsAndCourses().catch(console.error);
