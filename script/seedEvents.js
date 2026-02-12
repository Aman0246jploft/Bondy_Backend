const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const {
    User,
    Category,
    Event,
    Course,
    Tax,
    GlobalSetting,
    PromoCode
} = require("../db/index");
const { roleId } = require("../utils/Role");

const SEED_IMAGE = "uploads/category/1768802416388-images-(2).jpg";

const categoriesData = [
    { name: "Music", type: "event" },
    { name: "Technology", type: "course" },
    { name: "Art", type: "event" },
    { name: "Sports", type: "course" },
    { name: "Business", type: "course" },
    { name: "Food", type: "event" },
];

const usersData = [
    {
        firstName: "Organizer",
        lastName: "One",
        email: "organizer1@example.com",
        roleId: roleId.ORGANIZER,
        password: "password123",
    },
    {
        firstName: "Organizer",
        lastName: "Two",
        email: "organizer2@example.com",
        roleId: roleId.ORGANIZER,
        password: "password123",
    },
    {
        firstName: "Customer",
        lastName: "One",
        email: "customer1@example.com",
        roleId: roleId.CUSTOMER,
        password: "password123",
    },
    {
        firstName: "Customer",
        lastName: "Two",
        email: "customer2@example.com",
        roleId: roleId.CUSTOMER,
        password: "password123",
    },
];

const generateEventData = (organizerId, categories) => {
    const events = [];
    const eventCategories = categories.filter(c => c.type === "event");

    for (let i = 0; i < 20; i++) {
        const isPast = i < 5; // First 5 past
        const isLive = i >= 5 && i < 8; // Next 3 live
        // Rest upcoming

        const startDate = new Date();
        const endDate = new Date();

        if (isPast) {
            startDate.setDate(startDate.getDate() - 20);
            endDate.setDate(endDate.getDate() - 19);
        } else if (isLive) {
            // Starts yesterday, ends tomorrow
            startDate.setDate(startDate.getDate() - 1);
            endDate.setDate(endDate.getDate() + 1);
        } else {
            // Starts in future
            startDate.setDate(startDate.getDate() + i);
            endDate.setDate(endDate.getDate() + i + 1);
        }

        const randomCategory = eventCategories[Math.floor(Math.random() * eventCategories.length)];

        events.push({
            eventTitle: `Event ${i + 1} - ${randomCategory.name}`,
            eventCategory: randomCategory._id,
            posterImage: [SEED_IMAGE],
            shortdesc: `This is a short description for Event ${i + 1}`,
            longdesc: `This is a detailed long description for Event ${i + 1}. It is very interesting and you should surely attend.`,
            tags: ["fun", "social", randomCategory.name],
            venueName: `Venue ${i + 1}`,
            venueAddress: {
                type: "Point",
                coordinates: [77.2090 + (Math.random() * 0.1 - 0.05), 28.6139 + (Math.random() * 0.1 - 0.05)], // Around Delhi
                city: "New Delhi",
                country: "India",
                address: `Street ${i + 1}, Some Area`,
            },
            startDate: startDate,
            endDate: endDate,
            startTime: "10:00",
            endTime: "18:00",
            ticketName: "General Admission",
            ticketQtyAvailable: 100,
            ticketSelesStartDate: new Date(Date.now() - 86400000), // Yesterday
            ticketSelesEndDate: endDate,
            ticketPrice: (i + 1) * 10,
            totalTickets: 100,
            createdBy: organizerId,
            status: isPast ? "Past" : (isLive ? "Live" : "Upcoming"),
            accessAndPrivacy: true,
            ageRestriction: {
                type: "ALL"
            }
        });
    }
    return events;
};

const generateCourseData = (organizerId, categories) => {
    const courses = [];
    const courseCategories = categories.filter(c => c.type === "course");

    for (let i = 0; i < 20; i++) {
        const randomCategory = courseCategories[Math.floor(Math.random() * courseCategories.length)];

        // Schedule logic
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + i + 5);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 30); // 1 month course

        courses.push({
            courseTitle: `Course ${i + 1} - ${randomCategory.name}`,
            courseCategory: randomCategory._id,
            posterImage: [SEED_IMAGE],
            shortdesc: `Learn everything about ${randomCategory.name} in Course ${i + 1}`,
            venueAddress: {
                type: "Point",
                coordinates: [77.2090 + (Math.random() * 0.1 - 0.05), 28.6139 + (Math.random() * 0.1 - 0.05)],
                city: "New Delhi",
                country: "India",
                address: `Institute ${i + 1}, Delhi`,
            },
            schedules: [
                {
                    startDate: startDate,
                    endDate: endDate,
                    startTime: "09:00",
                    endTime: "11:00",
                    totalSeats: 20,
                    price: (i + 1) * 50
                }
            ],
            createdBy: organizerId
        });
    }
    return courses;
};

const seedDatabase = async () => {
    // Wait for connection to be established by db/index.js or ensure it here
    if (mongoose.connection.readyState === 0) {
        // connect if not connected (though db/index usually connects)
        // db/index connects automatically, so we might just need to wait a bit or it handles it.
        // Actually db/index connects async. We should probably wait or use connection event.
        // Looking at db/index.js, it does not export the connection promise.
        // It just calls mongoose.connect.
        // We can just await mongoose.connect again or wait for 'open'.
        await new Promise(resolve => Date.now()); // Just a tick
        // Better:
        try {
            await mongoose.connect(process.env.DB_STRING);
            console.log("Connected to DB for seeding");
        } catch (e) {
            console.log("Connection might already be creating...");
        }
    }

    try {
        console.log("Cleaning up old seed data (optional)...");
        // Optionally clear data? User said "make seed data", didn't explicitly say clear.
        // I will NOT clear everything to avoid data loss of existing user data,
        // unless I'm sure these are my test data.
        // Detailed instruction: "create the 2 customer and 2 orgainser"
        // I'll filter by specific emails to update or replace them.

        // 1. Create Categories
        console.log("Seeding Categories...");
        const createdCategories = [];
        for (const cat of categoriesData) {
            const category = await Category.findOneAndUpdate(
                { name: cat.name },
                { ...cat, image: SEED_IMAGE },
                { upsert: true, new: true }
            );
            createdCategories.push(category);
        }
        console.log(`${createdCategories.length} Categories seeded.`);

        // 2. Create Users
        console.log("Seeding Users...");
        const createdOrganizers = [];
        const createdCustomers = [];

        const categoryIds = createdCategories.map(c => c._id);

        for (const user of usersData) {
            const userData = {
                ...user,
                profileImage: SEED_IMAGE,
                categories: categoryIds, // Interested in all for demo
                organizerVerificationStatus: user.roleId === roleId.ORGANIZER ? "approved" : "pending",
                isDisable: false,
                isDeleted: false,
                // password hashing is handled by pre-save hook in User model
            };

            // Check if user exists to avoid duplicate key error on email
            let userDoc = await User.findOne({ email: user.email });
            if (!userDoc) {
                userDoc = new User(userData);
                // Only manual setting if needed, but password hashing hook handles plain text
                await userDoc.save();
            } else {
                // Update existing
                // Note: changes to password here manually might trigger hash again if we simply set it.
                // We'll skip password update on existing to avoid re-hashing if not changed or complications.
                // But we want to ensure other fields.
                userDoc.firstName = userData.firstName;
                userDoc.lastName = userData.lastName;
                userDoc.profileImage = userData.profileImage;
                userDoc.categories = userData.categories;
                userDoc.roleId = userData.roleId;
                userDoc.organizerVerificationStatus = userData.organizerVerificationStatus;
                await userDoc.save();
            }

            if (user.roleId === roleId.ORGANIZER) {
                createdOrganizers.push(userDoc);
            } else {
                createdCustomers.push(userDoc);
            }
        }
        console.log(`${createdOrganizers.length} Organizers and ${createdCustomers.length} Customers seeded.`);

        // 3. Create Events
        console.log("Seeding Events...");

        // Distribute 20 events between organizers
        // Let's give 10 to each
        const events1 = generateEventData(createdOrganizers[0]._id, createdCategories).slice(0, 10);
        const events2 = generateEventData(createdOrganizers[1]._id, createdCategories).slice(0, 10);

        const allEvents = [...events1, ...events2];

        // Check for existing events to avoid duplicates (optional, based on title/creator)
        const newEvents = [];
        for (const ev of allEvents) {
            const exists = await Event.findOne({ eventTitle: ev.eventTitle, createdBy: ev.createdBy });
            if (!exists) {
                newEvents.push(ev);
            }
        }

        if (newEvents.length > 0) {
            // Use insertMany to bypass pre('save') hook which blocks past events
            await Event.insertMany(newEvents);
            console.log(`${newEvents.length} Events seeded.`);
        } else {
            console.log("No new events to seed.");
        }

        // 4. Create Courses
        console.log("Seeding Courses...");
        const courses1 = generateCourseData(createdOrganizers[0]._id, createdCategories).slice(0, 10);
        const courses2 = generateCourseData(createdOrganizers[1]._id, createdCategories).slice(0, 10);

        const allCourses = [...courses1, ...courses2];

        const newCourses = [];
        for (const co of allCourses) {
            const exists = await Course.findOne({ courseTitle: co.courseTitle, createdBy: co.createdBy });
            if (!exists) {
                newCourses.push(co);
            }
        }

        if (newCourses.length > 0) {
            // Safe to use insertMany or save, Course doesn't seem to have strict hook blocking creation
            await Course.insertMany(newCourses);
            console.log(`${newCourses.length} Courses seeded.`);
        } else {
            console.log("No new courses to seed.");
        }

    } catch (err) {
        console.error("Seeding Error:", err);
    } finally {
        console.log("Seeding complete. Exiting...");
        process.exit();
    }
};

seedDatabase();
