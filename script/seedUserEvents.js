require("dotenv").config();
const mongoose = require("mongoose");
const { Category } = require("../db/index");

const seedUserEvents = async () => {
  try {
    const { DB_STRING } = process.env;
    await mongoose.connect(DB_STRING);
    console.log("DB connected successfully");

    const createdBy = new mongoose.Types.ObjectId("6a1e80665979beee41cf5f4b");

    // Fetch an event category
    let category = await Category.findOne({ type: "event", isDeleted: false });
    if (!category) {
      category = await Category.findOne({ isDeleted: false });
    }
    if (!category) {
      category = new Category({
        name: "test event category",
        type: "event",
      });
      await category.save();
    }

    const categoryId = category._id;
    console.log(`Using Category: ${category.name} (${categoryId})`);

    const now = new Date();

    const eventsData = [];

    // Helper to generate dates relative to now
    const getRelativeDate = (daysOffset) => {
      const d = new Date();
      d.setDate(now.getDate() + daysOffset);
      return d;
    };

    // 1. Five Past Events
    for (let i = 1; i <= 5; i++) {
      eventsData.push({
        eventTitle: `Past Rock Concert Vol. ${i}`,
        eventCategory: categoryId,
        shortdesc: `A generic past concert series volume ${i}.`,
        longdesc: `Detailed description for past concert series volume ${i}.`,
        startDate: getRelativeDate(-10 - i),
        endDate: getRelativeDate(-9 - i),
        startTime: "18:00",
        endTime: "22:00",
        timeZone: "UTC",
        venueName: `Stadium ${i}`,
        tickets: [
          {
            _id: new mongoose.Types.ObjectId(),
            ticketName: "General Admission",
            ticketShortDesc: "Standard entry ticket",
            price: 5000 * i,
            qty: 100 * i,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            ticketName: "VIP Club Pass",
            ticketShortDesc: "Premium seating with lounge access",
            price: 20000 * i,
            qty: 10 * i,
          }
        ],
        refundPolicy: "No Refund",
        visibility: "PUBLIC",
        ageRestriction: "ALL",
        isDraft: false,
        status: "Past",
        createdBy,
        createdAt: getRelativeDate(-15),
        updatedAt: getRelativeDate(-15),
      });
    }

    // 2. Five Live Events
    for (let i = 1; i <= 5; i++) {
      eventsData.push({
        eventTitle: `Live Art Gallery Expo ${i}`,
        eventCategory: categoryId,
        shortdesc: `Live gallery exhibition ${i} featuring modern paintings.`,
        longdesc: `Detailed info for live gallery exhibition ${i}.`,
        startDate: getRelativeDate(-1),
        endDate: getRelativeDate(1 + i),
        startTime: "10:00",
        endTime: "19:00",
        timeZone: "UTC",
        venueName: `Art Gallery Hall ${i}`,
        tickets: [
          {
            _id: new mongoose.Types.ObjectId(),
            ticketName: "Entry Pass",
            ticketShortDesc: "Standard gallery entry",
            price: 2000 * i,
            qty: 50 * i,
          }
        ],
        refundPolicy: "1 Day Before",
        visibility: "PUBLIC",
        ageRestriction: "ALL",
        isDraft: false,
        status: "Live",
        createdBy,
        createdAt: getRelativeDate(-5),
        updatedAt: getRelativeDate(-1),
      });
    }

    // 3. Five Upcoming Events (including 2 drafts)
    for (let i = 1; i <= 5; i++) {
      const isDraft = i > 3; // 4 and 5 are drafts
      eventsData.push({
        eventTitle: isDraft ? `Draft: Future Tech Summit ${i}` : `Upcoming Tech Summit ${i}`,
        eventCategory: categoryId,
        shortdesc: `Upcoming conference regarding technology and artificial intelligence ${i}.`,
        longdesc: `Detailed agenda for tech summit ${i}.`,
        startDate: getRelativeDate(5 + i),
        endDate: getRelativeDate(6 + i),
        startTime: "09:00",
        endTime: "17:00",
        timeZone: "UTC",
        venueName: `Convention Center Room ${i}`,
        tickets: [
          {
            _id: new mongoose.Types.ObjectId(),
            ticketName: "Early Bird Admission",
            ticketShortDesc: "Discounted early pricing",
            price: 8000 * i,
            qty: 30 * i,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            ticketName: "Regular Pass",
            ticketShortDesc: "Standard full price",
            price: 15000 * i,
            qty: 150 * i,
          }
        ],
        refundPolicy: "7 Days Before",
        visibility: "PUBLIC",
        ageRestriction: "18+",
        isDraft,
        status: isDraft ? "Upcoming" : "Upcoming", // Drafts are technically upcoming or status determined when published
        createdBy,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Clear previously seeded test events for this creator to avoid duplication
    await mongoose.connection.db.collection("events").deleteMany({ createdBy });

    // Bypassing Mongoose validation hooks using native collection to insert past events successfully
    await mongoose.connection.db.collection("events").insertMany(eventsData);
    console.log("Successfully inserted 15 event documents using native MongoDB driver!");

    const eventCount = await mongoose.connection.db.collection("events").countDocuments({ createdBy });
    console.log(`Verification: Total events in DB for creator 6a1e80665979beee41cf5f4b is: ${eventCount}`);

    process.exit(0);
  } catch (error) {
    console.error("Error seeding events:", error);
    process.exit(1);
  }
};

seedUserEvents();
