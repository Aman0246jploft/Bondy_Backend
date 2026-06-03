require("dotenv").config();
const mongoose = require("mongoose");
const { Course, Category } = require("../db/index");
const { eventStatus } = require("../utils/Role");

const seedUserCourses = async () => {
  try {
    const { DB_STRING } = process.env;
    await mongoose.connect(DB_STRING);
    console.log("DB connected successfully");

    const createdBy = new mongoose.Types.ObjectId("6a1e80665979beee41cf5f4b");

    // Get a category of type 'course' or fallback to any category
    let category = await Category.findOne({ type: "course", isDeleted: false });
    if (!category) {
      category = await Category.findOne({ isDeleted: false });
    }
    if (!category) {
      // Create a test category if none exists
      category = new Category({
        name: "test course category",
        type: "course",
      });
      await category.save();
    }

    const categoryId = category._id;
    console.log(`Using Category: ${category.name} (${categoryId})`);

    // Define different variations of courses
    const now = new Date();

    // 1. Past Course (Finished 2 days ago, ran for 5 days)
    const pastStart = new Date();
    pastStart.setDate(now.getDate() - 7);
    const pastEnd = new Date();
    pastEnd.setDate(now.getDate() - 2);

    // 2. Live Course (Started 2 days ago, ends in 5 days)
    const liveStart = new Date();
    liveStart.setDate(now.getDate() - 2);
    const liveEnd = new Date();
    liveEnd.setDate(now.getDate() + 5);

    // 3. Upcoming Course (Starts in 5 days, ends in 10 days)
    const upcomingStart = new Date();
    upcomingStart.setDate(now.getDate() + 5);
    const upcomingEnd = new Date();
    upcomingEnd.setDate(now.getDate() + 10);

    const coursesData = [
      {
        courseTitle: "Past Course - Ongoing Type",
        shortdesc: "A course in the past with Ongoing enrollment type",
        longdesc: "This is a past course with Ongoing enrollment type.",
        courseCategory: categoryId,
        startDate: pastStart,
        endDate: pastEnd,
        totalSessions: 10,
        price: 15000,
        enrollmentType: "Ongoing",
        status: eventStatus.PAST,
        isDraft: false,
        createdBy,
        batches: [
          {
            batchName: "Morning Batch",
            startTime: "09:00",
            endTime: "11:00",
            days: ["Mon", "Wed", "Fri"],
            seats: 20,
            ReservedExternally: 5,
            status: "Active",
          }
        ]
      },
      {
        courseTitle: "Live Course - Fixed Start Type",
        shortdesc: "A currently live course with Fixed Start enrollment type",
        longdesc: "This is a live course with Fixed Start enrollment type.",
        courseCategory: categoryId,
        startDate: liveStart,
        endDate: liveEnd,
        totalSessions: 12,
        price: 25000,
        enrollmentType: "fixedStart",
        status: eventStatus.LIVE,
        isDraft: false,
        createdBy,
        batches: [
          {
            batchName: "Weekend Intensive",
            startTime: "14:00",
            endTime: "18:00",
            days: ["Sat", "Sun"],
            seats: 15,
            ReservedExternally: 0,
            status: "Active",
          }
        ]
      },
      {
        courseTitle: "Upcoming Course - High Seats",
        shortdesc: "An upcoming course with many seats",
        longdesc: "This is an upcoming course with many seats and ongoing enrollment.",
        courseCategory: categoryId,
        startDate: upcomingStart,
        endDate: upcomingEnd,
        totalSessions: 8,
        price: 35000,
        enrollmentType: "Ongoing",
        status: eventStatus.UPCOMING,
        isDraft: false,
        createdBy,
        batches: [
          {
            batchName: "Evening Batch A",
            startTime: "18:00",
            endTime: "20:00",
            days: ["Tue", "Thu"],
            seats: 50,
            ReservedExternally: 10,
            status: "Active",
          },
          {
            batchName: "Evening Batch B",
            startTime: "20:00",
            endTime: "22:00",
            days: ["Tue", "Thu"],
            seats: 50,
            ReservedExternally: 20,
            status: "Active",
          }
        ]
      },
      {
        courseTitle: "Draft Course - Incomplete Info",
        shortdesc: "A course saved as draft",
        longdesc: "This course is still a draft and has not been published yet.",
        courseCategory: categoryId,
        startDate: upcomingStart,
        endDate: upcomingEnd,
        totalSessions: 6,
        price: 10000,
        enrollmentType: "Ongoing",
        isDraft: true,
        createdBy,
        batches: [
          {
            batchName: "Draft Batch",
            startTime: "10:00",
            endTime: "12:00",
            days: ["Mon"],
            seats: 10,
            status: "Active",
          }
        ]
      },
      {
        courseTitle: "Upcoming Course - Low Seats (Fully Booked)",
        shortdesc: "An upcoming course with very few seats",
        longdesc: "This is an upcoming course with only 2 seats which are fully reserved.",
        courseCategory: categoryId,
        startDate: upcomingStart,
        endDate: upcomingEnd,
        totalSessions: 4,
        price: 50000,
        enrollmentType: "fixedStart",
        status: eventStatus.UPCOMING,
        isDraft: false,
        createdBy,
        batches: [
          {
            batchName: "Exclusive Masterclass",
            startTime: "16:00",
            endTime: "18:00",
            days: ["Fri"],
            seats: 2,
            ReservedExternally: 2,
            status: "Active",
          }
        ]
      }
    ];

    await Course.insertMany(coursesData);
    console.log("Successfully seeded 5 courses for organizer 6a1e80665979beee41cf5f4b");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding courses:", error);
    process.exit(1);
  }
};

seedUserCourses();
