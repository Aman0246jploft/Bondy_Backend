/**
 * seedRealisticEvents.js
 * -----------------------------------------------------------
 * Standalone seeder that:
 *  1. Ensures the global seed organizer users "6a1e80665979beee41cf5f4b" and "6a227663a2023c86b5b23c65" exist.
 *  2. Finds or creates 15 event categories and 15 course categories.
 *  3. Generates Events:
 *       - 20 events per category for User 1 (300 total)
 *       - 10 events per category for User 2 (150 total)
 *  4. Generates Courses:
 *       - 20 courses per category for User 1 (300 total, alternating Ongoing/fixedStart)
 *       - 10 courses per category for User 2 (150 total, alternating Ongoing/fixedStart)
 *  5. Bypasses the save hooks (using insertMany) so we can seed past items correctly.
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

const { User, Category, Event, Course } = require("../db/index");
const { roleId, refundPolicy, visibility, ageRestriction, eventStatus, daysOfWeek } = require("../utils/Role");

const IMAGES = [
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30",
  "https://images.unsplash.com/photo-1511578314322-379afb476865",
  "https://images.unsplash.com/photo-1505373877841-8d25f7d46678",
  "https://images.unsplash.com/photo-1475721027785-f74eccf877e2",
  "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4",
  "https://images.unsplash.com/photo-1517457373958-b7bdd4587205",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea",
  "https://images.unsplash.com/photo-1506157786151-b8491531f063",
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819",
  "https://images.unsplash.com/photo-1496024840928-4c417adf211d",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec",
  "https://images.unsplash.com/photo-1505236858219-8359eb29e329",
  "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3",
  "https://images.unsplash.com/photo-1431540015161-0bf868a2d407"
];

const VIDEOS = [
  "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
  "https://samplelib.com/lib/preview/mp4/sample-10s.mp4",
  "https://samplelib.com/lib/preview/mp4/sample-15s.mp4",
  "https://samplelib.com/lib/preview/mp4/sample-20s.mp4",
  "https://samplelib.com/lib/preview/mp4/sample-30s.mp4"
];

const EVENT_CATEGORIES = [
  "Conferences",
  "Tech Meetups",
  "Workshops",
  "Webinars",
  "Hackathons",
  "Startup Events",
  "Networking Events",
  "Product Launches",
  "Music Concerts",
  "Festivals",
  "Sports Events",
  "Corporate Events",
  "Training Programs",
  "College Events",
  "Community Events"
];

const COURSE_CATEGORIES = [
  "Technology",
  "Sports",
  "Business",
  "Language",
  "Cooking",
  "Arts & Crafts",
  "Music & Dance",
  "Fitness & Health",
  "Photography",
  "Marketing",
  "Academics",
  "Personal Development",
  "Coding & Software",
  "Design & UX",
  "Finance & Investing"
];

// Cities & Venues details for real-world diversity
const LOCATIONS = [
  { city: "New York", country: "United States", state: "NY", zipcode: "10001", address: "123 Broadway", coordinates: [-74.0060, 40.7128] },
  { city: "London", country: "United Kingdom", state: "Greater London", zipcode: "EC1A 1BB", address: "45 Old Street", coordinates: [-0.1278, 51.5074] },
  { city: "Tokyo", country: "Japan", state: "Tokyo-to", zipcode: "100-0001", address: "1-1 Chiyoda", coordinates: [139.6917, 35.6895] },
  { city: "Sydney", country: "Australia", state: "NSW", zipcode: "2000", address: "George St", coordinates: [151.2093, -33.8688] },
  { city: "Paris", country: "France", state: "Île-de-France", zipcode: "75001", address: "Rue de Rivoli", coordinates: [2.3522, 48.8566] },
  { city: "Berlin", country: "Germany", state: "Berlin", zipcode: "10115", address: "Friedrichstraße", coordinates: [13.4050, 52.5200] },
  { city: "Mumbai", country: "India", state: "Maharashtra", zipcode: "400001", address: "Marine Drive", coordinates: [72.8777, 19.0760] },
  { city: "Singapore", country: "Singapore", state: "Singapore", zipcode: "189768", address: "Marina Gardens Dr", coordinates: [103.8198, 1.3521] },
  { city: "Toronto", country: "Canada", state: "ON", zipcode: "M5V 2T6", address: "Front St W", coordinates: [-79.3832, 43.6532] },
  { city: "Cape Town", country: "South Africa", state: "Western Cape", zipcode: "8001", address: "Long Street", coordinates: [18.4241, -33.9249] }
];

const ORGANIZERS = [
  { name: "Global Academy Ltd.", email: "contact@globalacademy.com", phone: "+1-555-0199" },
  { name: "Tech Education Hub", email: "info@techedu.io", phone: "+44-20-7946-0958" },
  { name: "Creative Learning Lab", email: "hello@creativelab.org", phone: "+91-22-2284-0000" },
  { name: "Pro Fitness Center", email: "support@profitness.com", phone: "+61-2-9000-1234" }
];

const seedRealisticData = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for seeding...");

    const USERS_TO_SEED = [
      { id: "6a1e80665979beee41cf5f4b", count: 20, email: "seeder.one@bondy.dev", name: "System Seeder One" },
      { id: "6a227663a2023c86b5b23c65", count: 10, email: "seeder.two@bondy.dev", name: "System Seeder Two" }
    ];

    // 1. Ensure the Seed Users exist
    for (const u of USERS_TO_SEED) {
      let seedUser = await User.findById(u.id);
      if (!seedUser) {
        seedUser = new User({
          _id: u.id,
          firstName: u.name.split(" ")[0],
          lastName: u.name.split(" ").slice(1).join(" "),
          email: u.email,
          roleId: roleId.ORGANIZER,
          isVerified: true,
          organizerVerificationStatus: "approved",
          password: "seedpassword123"
        });
        await seedUser.save();
        console.log(`✅ Seed User ${u.id} created.`);
      } else {
        console.log(`✅ Seed User ${u.id} already exists.`);
      }
    }

    // 2. Fetch or create Event Categories
    const eventCategoryMap = {};
    for (const catName of EVENT_CATEGORIES) {
      let category = await Category.findOne({ name: catName.toLowerCase(), type: "event" });
      if (!category) {
        category = new Category({
          name: catName,
          type: "event",
          image: IMAGES[0],
          featured: true
        });
        await category.save();
      }
      eventCategoryMap[catName] = category._id;
    }
    console.log("✅ Event Categories prepared.");

    // Fetch or create Course Categories
    const courseCategoryMap = {};
    for (const catName of COURSE_CATEGORIES) {
      let category = await Category.findOne({ name: catName.toLowerCase(), type: "course" });
      if (!category) {
        category = new Category({
          name: catName,
          type: "course",
          image: IMAGES[1 % IMAGES.length],
          featured: true
        });
        await category.save();
      }
      courseCategoryMap[catName] = category._id;
    }
    console.log("✅ Course Categories prepared.");

    const seedUserIds = USERS_TO_SEED.map(u => u.id);

    // Delete existing events & courses created by either seed user to enable clean re-runs
    await Event.deleteMany({ createdBy: { $in: seedUserIds } });
    await Course.deleteMany({ createdBy: { $in: seedUserIds } });
    console.log("✅ Cleaned existing events and courses created by seed users.");

    const eventsToInsert = [];
    const coursesToInsert = [];
    let imageIndex = 0;
    let videoIndex = 0;

    const now = new Date();

    // 3. Build events and courses for each user
    for (const u of USERS_TO_SEED) {
      const createdById = u.id;
      const count = u.count;
      console.log(`⏳ Building ${count} events & courses per category for user ${createdById}...`);

      // ==========================================
      // EVENTS GENERATION
      // ==========================================
      for (const catName of EVENT_CATEGORIES) {
        const categoryId = eventCategoryMap[catName];

        for (let i = 1; i <= count; i++) {
          const eventNum = i;
          let startDate, endDate, status = "Upcoming", isDraft = false;

          if (eventNum <= 4) {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - (10 * eventNum));
            endDate = new Date(startDate);
            endDate.setHours(startDate.getHours() + 4);
            status = "Past";
          } else if (eventNum <= 6) {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 1);
            endDate = new Date(now);
            endDate.setDate(now.getDate() + 1);
            status = "Live";
          } else if (eventNum <= 12) {
            startDate = new Date(now);
            startDate.setDate(now.getDate() + (15 * (eventNum - 6)));
            endDate = new Date(startDate);
            endDate.setHours(startDate.getHours() + 3);
            status = "Upcoming";
          } else if (eventNum <= 16) {
            startDate = new Date(now);
            startDate.setDate(now.getDate() + (180 + (25 * (eventNum - 12))));
            endDate = new Date(startDate);
            endDate.setHours(startDate.getHours() + 5);
            status = "Upcoming";
          } else {
            startDate = new Date(now);
            startDate.setDate(now.getDate() + 30);
            endDate = new Date(startDate);
            endDate.setHours(startDate.getHours() + 3);
            status = "Upcoming";
            if (eventNum === 17) status = "Cancelled";
            else if (eventNum === 18) isDraft = true;
          }

          const isFree = eventNum % 5 === 0;
          const isSoldOut = eventNum === 19;
          const isWaitlistOrHighCapacity = eventNum === 20;
          const capacity = isWaitlistOrHighCapacity ? 15000 : (eventNum === 18 ? 15 : 250);

          const tickets = [];
          if (!isFree) {
            const earlyBirdPrice = eventNum * 10;
            const generalPrice = eventNum * 15;
            const vipPrice = eventNum * 40;

            const ebSalesStart = new Date(startDate);
            ebSalesStart.setDate(startDate.getDate() - 30);
            const ebSalesEnd = new Date(startDate);
            ebSalesEnd.setDate(startDate.getDate() - 10);

            const genSalesStart = new Date(startDate);
            genSalesStart.setDate(startDate.getDate() - 30);
            const genSalesEnd = new Date(startDate);
            genSalesEnd.setDate(startDate.getDate() - 1);

            tickets.push({
              ticketName: "Early Bird Discount",
              ticketShortDesc: "Limited tickets available for early buyers.",
              price: earlyBirdPrice,
              qty: Math.floor(capacity * 0.2),
              salesStart: ebSalesStart,
              salesEnd: ebSalesEnd
            });

            tickets.push({
              ticketName: "General Admission",
              ticketShortDesc: "Standard access ticket.",
              price: generalPrice,
              qty: Math.floor(capacity * 0.7),
              salesStart: genSalesStart,
              salesEnd: genSalesEnd
            });

            tickets.push({
              ticketName: "VIP Pass",
              ticketShortDesc: "Premium seating, lounge access, and exclusive swag.",
              price: vipPrice,
              qty: Math.floor(capacity * 0.1),
              salesStart: genSalesStart,
              salesEnd: genSalesEnd
            });
          } else {
            const genSalesStart = new Date(startDate);
            genSalesStart.setDate(startDate.getDate() - 30);
            const genSalesEnd = new Date(startDate);
            genSalesEnd.setDate(startDate.getDate() - 1);

            tickets.push({
              ticketName: "Free RSVP Registration",
              ticketShortDesc: "Guaranteed free entry ticket.",
              price: 0,
              qty: capacity,
              salesStart: genSalesStart,
              salesEnd: genSalesEnd
            });
          }

          const registrationDeadline = new Date(startDate);
          registrationDeadline.setDate(startDate.getDate() - 1);
          for (const t of tickets) {
            if (t.salesEnd > registrationDeadline) {
              t.salesEnd = registrationDeadline;
            }
          }

          const posterImages = [IMAGES[imageIndex], IMAGES[(imageIndex + 1) % IMAGES.length]];
          imageIndex = (imageIndex + 1) % IMAGES.length;

          const teaserVideos = [VIDEOS[videoIndex]];
          videoIndex = (videoIndex + 1) % VIDEOS.length;

          const location = LOCATIONS[eventNum % LOCATIONS.length];
          const org = ORGANIZERS[eventNum % ORGANIZERS.length];

          const isVirtual = eventNum % 7 === 0;
          const isHybrid = eventNum % 8 === 0;

          let venueName = isVirtual ? "Virtual Event Space" : `${catName} Arena ${eventNum}`;
          let venueAddress = undefined;

          if (!isVirtual) {
            venueAddress = {
              type: "Point",
              coordinates: location.coordinates,
              city: location.city,
              country: location.country,
              state: location.state,
              zipcode: location.zipcode,
              address: `${location.address}, Suite ${eventNum * 10}`
            };
          }

          let notes = `Organizer: ${org.name}. Support Contact: ${org.phone} / ${org.email}.`;
          if (status === "Cancelled") {
            notes += " CANCELLED: Due to unforeseen venue maintenance.";
          }
          if (isHybrid) {
            notes += " Hybrid Format: Join physically or via Google Meet: https://meet.google.com/abc-defg-hij";
          }
          if (isVirtual) {
            notes += " Virtual Link: https://zoom.us/j/9876543210";
          }

          eventsToInsert.push({
            eventTitle: `${catName} - ${u.id.substring(0, 4)} - Event #${eventNum}: ${location.city} Summit`,
            eventCategory: categoryId,
            shortdesc: `An engaging and realistic ${catName.toLowerCase()} event hosted in ${location.city}, ${location.country}.`,
            longdesc: `Welcome to the premier ${catName.toLowerCase()} event of the season. Featuring guest speakers, detailed sessions, and networking opportunities. Hosted by ${org.name}, this event promises an unmatched experience in the beautiful city of ${location.city}. Register early to reserve your spot!`,
            posterImage: posterImages,
            mediaLinks: posterImages,
            shortTeaserVideo: teaserVideos,
            venueName,
            venueAddress,
            startDate,
            endDate,
            startTime: "09:00",
            endTime: "17:00",
            timeZone: "UTC",
            tickets,
            refundPolicy: isFree ? refundPolicy.NO_REFUND : (eventNum % 3 === 0 ? refundPolicy.ONE_DAY_BEFORE : refundPolicy.SEVEN_DAYS_BEFORE),
            addOns: isFree ? "None" : "Premium Lunch Pass & Video Recording Access",
            visibility: eventNum % 6 === 0 ? visibility.PRIVATE : visibility.PUBLIC,
            ageRestriction: eventNum % 4 === 0 ? ageRestriction.EIGHTEEN_PLUS : ageRestriction.ALL,
            showAttendees: true,
            notes,
            dressCode: eventNum % 3 === 0 ? "Formal" : (eventNum % 3 === 1 ? "Business Casual" : "Casual"),
            fetcherEvent: eventNum % 10 === 0,
            featureEventFee: eventNum % 10 === 0 ? 99 : 0,
            isDraft,
            status,
            ReservedExternally: isSoldOut ? capacity : (eventNum % 4 === 0 ? Math.floor(capacity * 0.1) : 0),
            createdBy: createdById
          });
        }
      }

      // ==========================================
      // COURSES GENERATION (Ongoing & fixedStart)
      // ==========================================
      for (const catName of COURSE_CATEGORIES) {
        const categoryId = courseCategoryMap[catName];

        for (let i = 1; i <= count; i++) {
          const courseNum = i;

          // Enrollment scenarios: Alternating between "Ongoing" and "fixedStart"
          const enrollmentType = courseNum % 2 === 0 ? "fixedStart" : "Ongoing";

          let startDate, endDate, status = "Upcoming", isDraft = false;

          if (courseNum <= 4) {
            // Past Course
            startDate = new Date(now);
            startDate.setDate(now.getDate() - (20 * courseNum));
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 14); // 2-week course
            status = "Past";
          } else if (courseNum <= 6) {
            // Live/Ongoing Course
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 5);
            endDate = new Date(now);
            endDate.setDate(now.getDate() + 25);
            status = "Live";
          } else if (courseNum <= 12) {
            // Upcoming Course
            startDate = new Date(now);
            startDate.setDate(now.getDate() + (20 * (courseNum - 6)));
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 30);
            status = "Upcoming";
          } else if (courseNum <= 16) {
            // Far future Course (6-12 months out)
            startDate = new Date(now);
            startDate.setDate(now.getDate() + (180 + (25 * (courseNum - 12))));
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 45);
            status = "Upcoming";
          } else {
            // Edge Cases
            startDate = new Date(now);
            startDate.setDate(now.getDate() + 30);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 30);
            status = "Upcoming";
            if (courseNum === 17) status = "Cancelled";
            else if (courseNum === 18) isDraft = true;
          }

          const isFree = courseNum % 5 === 0;
          const isSoldOut = courseNum === 19;
          const capacity = courseNum === 18 ? 5 : 40;

          // Prepare batches
          const batches = [
            {
              batchName: `${enrollmentType} Batch A`,
              startTime: "09:00",
              endTime: "11:00",
              days: ["Mon", "Wed", "Fri"],
              seats: capacity,
              ReservedExternally: isSoldOut ? capacity : (courseNum % 4 === 0 ? Math.floor(capacity * 0.1) : 0),
              status: courseNum === 17 ? "Cancelled" : "Active"
            },
            {
              batchName: `${enrollmentType} Batch B`,
              startTime: "14:00",
              endTime: "16:00",
              days: ["Tue", "Thu"],
              seats: capacity,
              ReservedExternally: 0,
              status: "Active"
            }
          ];

          const posterImages = [IMAGES[(imageIndex + 2) % IMAGES.length]];
          imageIndex = (imageIndex + 1) % IMAGES.length;

          const teaserVideos = [VIDEOS[(videoIndex + 2) % VIDEOS.length]];
          videoIndex = (videoIndex + 1) % VIDEOS.length;

          const location = LOCATIONS[courseNum % LOCATIONS.length];
          const org = ORGANIZERS[courseNum % ORGANIZERS.length];

          const isVirtual = courseNum % 7 === 0;
          const isHybrid = courseNum % 8 === 0;

          let venueName = isVirtual ? "Virtual Classroom" : `${catName} Institute ${courseNum}`;
          let venueAddress = undefined;

          if (!isVirtual) {
            venueAddress = {
              type: "Point",
              coordinates: location.coordinates,
              city: location.city,
              country: location.country,
              state: location.state,
              zipcode: location.zipcode,
              address: `${location.address}, Suite ${courseNum * 10}`
            };
          }

          const price = isFree ? 0 : courseNum * 25;

          coursesToInsert.push({
            courseTitle: `${catName} - ${u.id.substring(0, 4)} - Course #${courseNum}: ${enrollmentType}`,
            shortdesc: `A comprehensive ${catName.toLowerCase()} course covering basic to advanced topics.`,
            longdesc: `Welcome to the complete ${catName.toLowerCase()} program. Over the duration of this class, we will study core methodologies, practical workflows, and real-world projects. Led by experienced mentors from ${org.name}.`,
            whatYouWillLearn: `- Master key ${catName.toLowerCase()} principles.\n- Work on real hands-on projects.\n- Gain professional industry guidance.`,
            courseCategory: categoryId,
            posterImage: posterImages,
            mediaLinks: posterImages,
            shortTeaserVideo: teaserVideos,
            startDate,
            endDate: enrollmentType === "fixedStart" ? endDate : undefined,
            totalSessions: courseNum * 3 + 4,
            timeZone: "UTC",
            venueName,
            venueAddress,
            batches,
            price,
            refundPolicy: isFree ? refundPolicy.NO_REFUND : refundPolicy.SEVEN_DAYS_BEFORE,
            oneMonthPassPrice: enrollmentType === "Ongoing" ? price * 4 : 0,
            oneMonthPassEnabled: enrollmentType === "Ongoing" && !isFree,
            threeMonthPassPrice: enrollmentType === "Ongoing" ? price * 10 : 0,
            threeMonthPassEnabled: enrollmentType === "Ongoing" && !isFree,
            enrollmentType,
            status,
            isDraft,
            bookingCutOff: courseNum % 3 === 0 ? "24h" : "2h",
            isFeatured: courseNum % 10 === 0,
            createdBy: createdById
          });
        }
      }
    }

    console.log(`⏳ Inserting ${eventsToInsert.length} events...`);
    const seededEvents = await Event.insertMany(eventsToInsert);
    console.log(`✅ Successfully seeded ${seededEvents.length} events!`);

    console.log(`⏳ Inserting ${coursesToInsert.length} courses...`);
    const seededCourses = await Course.insertMany(coursesToInsert);
    console.log(`✅ Successfully seeded ${seededCourses.length} courses!`);

  } catch (error) {
    console.error("❌ Seeding Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
};

seedRealisticData();
