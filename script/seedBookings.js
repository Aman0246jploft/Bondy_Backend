/**
 * seedBookings.js
 * -----------------------------------------------------------
 * Standalone seeder that:
 *  1. Ensures 15 realistic customer users exist in the database (roleId: 3).
 *  2. Analyzes existing Events and Courses.
 *  3. Generates realistic, analytics-friendly bookings (Transactions & Attendees):
 *       - Distributes bookings across past, ongoing, upcoming, and cancelled events/courses.
 *       - Simulates highly active, moderately active, inactive, and category-specific users.
 *       - Generates revenue, commission, and organizer earnings.
 *       - Simulates checked-in status for past/completed bookings.
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

const { User, Event, Course, Transaction, Attendee } = require("../db/index");
const { roleId } = require("../utils/Role");

const CUSTOMER_DATA = [
  { firstName: "John", lastName: "Doe", email: "john.doe@bondy.dev", phone: "+15550101", city: "New York", country: "United States", gender: "Male", dob: "1990-05-15" },
  { firstName: "Jane", lastName: "Smith", email: "jane.smith@bondy.dev", phone: "+15550102", city: "London", country: "United Kingdom", gender: "Female", dob: "1992-08-20" },
  { firstName: "Alice", lastName: "Johnson", email: "alice.j@bondy.dev", phone: "+15550103", city: "Sydney", country: "Australia", gender: "Female", dob: "1988-12-10" },
  { firstName: "Bob", lastName: "Brown", email: "bob.b@bondy.dev", phone: "+15550104", city: "Toronto", country: "Canada", gender: "Male", dob: "1985-03-22" },
  { firstName: "Charlie", lastName: "Davis", email: "charlie.d@bondy.dev", phone: "+15550105", city: "Paris", country: "France", gender: "Male", dob: "1995-07-07" },
  { firstName: "Emily", lastName: "Evans", email: "emily.e@bondy.dev", phone: "+15550106", city: "Berlin", country: "Germany", gender: "Female", dob: "1993-11-30" },
  { firstName: "Frank", lastName: "Garcia", email: "frank.g@bondy.dev", phone: "+15550107", city: "Madrid", country: "Spain", gender: "Male", dob: "1991-04-12" },
  { firstName: "Grace", lastName: "Harris", email: "grace.h@bondy.dev", phone: "+15550108", city: "Singapore", country: "Singapore", gender: "Female", dob: "1989-09-18" },
  { firstName: "Ian", lastName: "Ivanov", email: "ian.i@bondy.dev", phone: "+15550109", city: "Tokyo", country: "Japan", gender: "Male", dob: "1994-01-25" },
  { firstName: "Jessica", lastName: "Jones", email: "jessica.j@bondy.dev", phone: "+15550110", city: "Mumbai", country: "India", gender: "Female", dob: "1990-06-05" },
  { firstName: "Kevin", lastName: "King", email: "kevin.k@bondy.dev", phone: "+15550111", city: "Cape Town", country: "South Africa", gender: "Male", dob: "1987-10-14" },
  { firstName: "Laura", lastName: "Lopez", email: "laura.l@bondy.dev", phone: "+15550112", city: "Mexico City", country: "Mexico", gender: "Female", dob: "1996-02-28" },
  { firstName: "Michael", lastName: "Miller", email: "michael.m@bondy.dev", phone: "+15550113", city: "Chicago", country: "United States", gender: "Male", dob: "1984-08-09" },
  { firstName: "Nelson", lastName: "Nelson", email: "nelson.n@bondy.dev", phone: "+15550114", city: "São Paulo", country: "Brazil", gender: "Male", dob: "1992-12-03" },
  { firstName: "Olivia", lastName: "Owen", email: "olivia.o@bondy.dev", phone: "+15550115", city: "Auckland", country: "New Zealand", gender: "Female", dob: "1991-07-19" }
];

const generateBookingId = () => `BNDY-${Math.floor(100000 + Math.random() * 900000)}`;
const generateTicketNumber = () => `TKT-${Math.floor(10000000 + Math.random() * 90000000)}`;

const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const seedBookings = async () => {
  const now = new Date();
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for booking seeding...");

    // 1. Seed Customer Users
    const customers = [];
    for (const c of CUSTOMER_DATA) {
      let user = await User.findOne({ email: c.email });
      if (!user) {
        user = new User({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          contactNumber: c.phone,
          roleId: roleId.CUSTOMER,
          gender: c.gender,
          dob: new Date(c.dob),
          profileImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde",
          isDisable: false,
          isDeleted: false,
          isVerified: true,
          organizerVerificationStatus: "approved",
          password: "customerpassword123",
          location: {
            type: "Point",
            coordinates: [0.0, 0.0],
            city: c.city,
            country: c.country,
            address: "1 Seed Street"
          }
        });
        await user.save();
        console.log(`👤 Customer created: ${c.firstName} ${c.lastName}`);
      } else {
        console.log(`👤 Customer already exists: ${c.firstName} ${c.lastName}`);
      }
      customers.push(user);
    }

    // 2. Fetch seeded Events and Courses
    const events = await Event.find({});
    const courses = await Course.find({});

    console.log(`📋 Found ${events.length} Events and ${courses.length} Courses in the database.`);

    if (events.length === 0 || courses.length === 0) {
      console.warn("⚠️ Cannot seed bookings without existing events/courses. Run event seeder first.");
      process.exit(1);
    }

    // Clear existing bookings/attendees to prevent double seeding
    await Transaction.deleteMany({ bookingType: { $in: ["EVENT", "COURSE"] } });
    await Attendee.deleteMany({});
    console.log("🧹 Cleaned old bookings/attendees.");

    const transactionsToInsert = [];
    const attendeesToInsert = [];

    // Helper to calculate transaction prices
    const calculatePricing = (basePrice) => {
      const discountAmount = Math.random() > 0.85 ? roundToTwo(basePrice * 0.1) : 0; // 15% chance of 10% discount
      const remaining = basePrice - discountAmount;
      const taxAmount = roundToTwo(remaining * 0.05); // 5% tax
      const totalAmount = roundToTwo(remaining + taxAmount);
      const commissionAmount = roundToTwo(remaining * 0.1); // 10% platform commission
      const organizerEarning = roundToTwo(remaining - commissionAmount);
      return { discountAmount, taxAmount, totalAmount, commissionAmount, organizerEarning };
    };

    // User activity categories:
    // Customers 0-2: Highly active (15-20 bookings)
    // Customers 3-8: Moderately active (5-10 bookings)
    // Customers 9-11: Attending only events
    // Customers 12-13: Attending only courses
    // Customer 14: Inactive (0-1 bookings)

    // ==========================================
    // EVENT BOOKINGS GENERATION
    // ==========================================
    console.log("⏳ Generating Event Bookings...");
    let eventIndex = 0;

    for (let uIdx = 0; uIdx < customers.length; uIdx++) {
      const user = customers[uIdx];

      // Determine booking limit for this user
      let eventBookingCount = 0;
      if (uIdx <= 2) eventBookingCount = 12; // Highly active
      else if (uIdx <= 8) eventBookingCount = 5; // Moderately active
      else if (uIdx <= 11) eventBookingCount = 8; // Event-only users
      else if (uIdx <= 13) eventBookingCount = 0; // Course-only users
      else eventBookingCount = 1; // Inactive

      for (let bNum = 0; bNum < eventBookingCount; bNum++) {
        const event = events[eventIndex % events.length];
        eventIndex++;

        // Select ticket from Event
        const ticket = event.tickets[0];
        if (!ticket) continue;

        // Skip cancelled/draft events or handle appropriately
        let status = "PAID";
        if (event.status === "Cancelled") {
          status = Math.random() > 0.5 ? "CANCELLED" : "REFUNDED";
        } else if (event.status === "Past") {
          status = "PAID";
        } else {
          // Upcoming events
          const rand = Math.random();
          if (rand > 0.95) status = "PENDING";
          else if (rand > 0.90) status = "CANCELLED";
          else status = "PAID";
        }

        const qty = 1 + Math.floor(Math.random() * 2); // 1 to 2 tickets
        const basePrice = ticket.price * qty;
        const pricing = calculatePricing(basePrice);

        const transactionId = new mongoose.Types.ObjectId();
        const bookingId = generateBookingId();
        const qrCodeData = `TICKET-${transactionId}-${user._id}`;

        const isCheckedIn = event.status === "Past" && status === "PAID" && Math.random() > 0.1;

        transactionsToInsert.push({
          _id: transactionId,
          userId: user._id,
          eventId: event._id,
          ticketId: ticket._id.toString(),
          ticketName: ticket.ticketName,
          tickets: [{
            ticketId: ticket._id.toString(),
            ticketName: ticket.ticketName,
            qty,
            basePrice
          }],
          bookingType: "EVENT",
          bookingId,
          qty,
          basePrice,
          ...pricing,
          status,
          qrCodeData,
          isCheckedIn,
          checkedInQty: isCheckedIn ? qty : 0,
          checkedInAt: isCheckedIn ? event.startDate : null,
          createdAt: event.startDate ? new Date(event.startDate.getTime() - 86400000 * 5) : new Date()
        });

        // Add Attendee records if PAID
        if (status === "PAID") {
          for (let q = 1; q <= qty; q++) {
            attendeesToInsert.push({
              transactionId,
              eventId: event._id,
              userId: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              contactNumber: user.contactNumber,
              ticketNumber: generateTicketNumber(),
              ticketId: ticket._id.toString(),
              ticketName: ticket.ticketName,
              qrCodeData: `${qrCodeData}-${q}`,
              isCheckedIn,
              checkedInAt: isCheckedIn ? event.startDate : null
            });
          }
        }
      }
    }

    // ==========================================
    // COURSE BOOKINGS GENERATION
    // ==========================================
    console.log("⏳ Generating Course Bookings...");
    let courseIndex = 0;

    for (let uIdx = 0; uIdx < customers.length; uIdx++) {
      const user = customers[uIdx];

      let courseBookingCount = 0;
      if (uIdx <= 2) courseBookingCount = 8; // Highly active
      else if (uIdx <= 8) courseBookingCount = 4; // Moderately active
      else if (uIdx <= 11) courseBookingCount = 0; // Event-only users
      else if (uIdx <= 13) courseBookingCount = 7; // Course-only users
      else courseBookingCount = 0; // Inactive

      for (let bNum = 0; bNum < courseBookingCount; bNum++) {
        const course = courses[courseIndex % courses.length];
        courseIndex++;

        const batch = course.batches[0];
        if (!batch) continue;

        let status = "PAID";
        if (course.status === "Cancelled") {
          status = Math.random() > 0.5 ? "CANCELLED" : "REFUNDED";
        } else {
          const rand = Math.random();
          if (rand > 0.95) status = "PENDING";
          else if (rand > 0.90) status = "CANCELLED";
          else status = "PAID";
        }

        const qty = 1; // 1 enrollment per requirements
        const isOngoing = course.enrollmentType === "Ongoing";
        const selectedDay = isOngoing && batch.days ? batch.days[0] : null;

        let passType = null;
        let basePrice = course.price;
        if (isOngoing && Math.random() > 0.5) {
          passType = Math.random() > 0.5 ? "1_month" : "3_month";
          basePrice = passType === "1_month" ? (course.oneMonthPassPrice || course.price * 4) : (course.threeMonthPassPrice || course.price * 10);
        }

        const pricing = calculatePricing(basePrice);
        const transactionId = new mongoose.Types.ObjectId();
        const bookingId = generateBookingId();
        const qrCodeData = `COURSE-${transactionId}-${user._id}`;

        const isCheckedIn = course.status === "Past" && status === "PAID" && Math.random() > 0.2;

        transactionsToInsert.push({
          _id: transactionId,
          userId: user._id,
          courseId: course._id,
          batchId: batch._id.toString(),
          selectedDay,
          ongoingSlots: isOngoing ? [{ batchId: batch._id.toString(), selectedDay }] : [],
          passType,
          passExpiryDate: passType ? new Date(now.getTime() + (passType === "1_month" ? 30 : 90) * 86400000) : null,
          bookingType: "COURSE",
          bookingId,
          qty,
          basePrice,
          ...pricing,
          status,
          qrCodeData,
          isCheckedIn,
          checkedInQty: isCheckedIn ? qty : 0,
          checkedInAt: isCheckedIn ? course.startDate : null,
          createdAt: course.startDate ? new Date(course.startDate.getTime() - 86400000 * 5) : new Date()
        });

        // Add Attendee record if PAID
        if (status === "PAID") {
          attendeesToInsert.push({
            transactionId,
            courseId: course._id,
            batchId: batch._id.toString(),
            userId: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            contactNumber: user.contactNumber,
            ticketNumber: generateTicketNumber(),
            ticketId: batch._id.toString(),
            ticketName: batch.batchName,
            qrCodeData,
            isCheckedIn,
            checkedInAt: isCheckedIn ? course.startDate : null
          });
        }
      }
    }

    // 4. Save Bookings & Attendees to Database
    console.log(`⏳ Inserting ${transactionsToInsert.length} Transactions...`);
    const savedTxns = await Transaction.insertMany(transactionsToInsert);
    console.log(`✅ Successfully seeded ${savedTxns.length} Transactions.`);

    console.log(`⏳ Inserting ${attendeesToInsert.length} Attendees...`);
    const savedAttendees = await Attendee.insertMany(attendeesToInsert);
    console.log(`✅ Successfully seeded ${savedAttendees.length} Attendees.`);

  } catch (error) {
    console.error("❌ Seeding Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
};

seedBookings();
