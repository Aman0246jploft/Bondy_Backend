/**
 * clearSeedData.js
 * -----------------------------------------------------------
 * Clears the seeded events, courses, customers, organizers,
 * transactions, and attendees created by the seed scripts.
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { User, Event, Course, Transaction, Attendee } = require("../db/index");

const clearData = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for clearing seeded data...");

    // Seeder Organizer IDs
    const seedOrganizerIds = ["6a1e80665979beee41cf5f4b", "6a227663a2023c86b5b23c65"];

    // 1. Delete events created by seed organizers
    const deletedEvents = await Event.deleteMany({ createdBy: { $in: seedOrganizerIds } });
    console.log(`🧹 Deleted ${deletedEvents.deletedCount} events created by seed organizers.`);

    // 2. Delete courses created by seed organizers
    const deletedCourses = await Course.deleteMany({ createdBy: { $in: seedOrganizerIds } });
    console.log(`🧹 Deleted ${deletedCourses.deletedCount} courses created by seed organizers.`);

    // 3. Delete transactions and attendees
    const deletedTransactions = await Transaction.deleteMany({});
    console.log(`🧹 Deleted ${deletedTransactions.deletedCount} transactions.`);

    const deletedAttendees = await Attendee.deleteMany({});
    console.log(`🧹 Deleted ${deletedAttendees.deletedCount} attendees.`);

    // 4. Delete seeder users (emails ending with @bondy.dev)
    const deletedUsers = await User.deleteMany({
      $or: [
        { _id: { $in: seedOrganizerIds } },
        { email: { $regex: /@bondy\.dev$/i } }
      ]
    });
    console.log(`🧹 Deleted ${deletedUsers.deletedCount} seed user accounts.`);

    console.log("✅ Database cleanup complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    process.exit(1);
  }
};

clearData();
