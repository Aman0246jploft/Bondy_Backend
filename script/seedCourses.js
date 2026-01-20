require("dotenv").config();
const mongoose = require("mongoose");
const { Course, User, Category } = require("../db");

// Helper to get start of current week (Monday)
const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Helper to get start of current weekend (Saturday)
const getStartOfWeekend = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -1 : 6); // next Saturday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

const seedCourses = async () => {
    try {
        // Wait for DB Connection from db/index.js
        if (mongoose.connection.readyState !== 1) {
            await new Promise((resolve) => mongoose.connection.once("open", resolve));
        }
        console.log(`✅ DB Connected successfully`);

        const now = new Date();

        // Find Organizer
        const organizer = await User.findOne({
            email: "admin@bondy.com",
        });

        if (!organizer) {
            console.log("❌ Organizer (admin@bondy.com) not found. Please run adminsetup.js first.");
            process.exit(1);
        }

        // Create Course Categories
        const categoryData = [
            { name: "Programming", image: "uploads/categories/programming.jpg" },
            { name: "Design", image: "uploads/categories/design.jpg" },
            { name: "Marketing", image: "uploads/categories/marketing.jpg" },
            { name: "Business", image: "uploads/categories/business.jpg" },
            { name: "Personal Development", image: "uploads/categories/personal.jpg" },
        ];

        const categories = [];
        console.log("📝 Creating course categories...");

        for (const cat of categoryData) {
            let category = await Category.findOne({ name: cat.name, type: "course", isDeleted: false });
            if (!category) {
                category = new Category({
                    name: cat.name,
                    image: cat.image,
                    type: "course",
                    isDeleted: false,
                });
                await category.save();
                console.log(`✅ Created category: ${cat.name}`);
            } else {
                console.log(`✅ Using existing category: ${cat.name}`);
            }
            categories.push(category);
        }

        // Locations
        const locations = [
            { name: "Delhi - CP", coords: [77.2167, 28.6304], city: "Delhi", country: "India" },
            { name: "Gurgaon - Cyber City", coords: [77.088, 28.4955], city: "Gurgaon", country: "India" },
            { name: "Noida - Sector 62", coords: [77.3639, 28.6208], city: "Noida", country: "India" },
            { name: "Bangalore - Whitefield", coords: [77.7499, 12.9698], city: "Bangalore", country: "India" }, // Far
        ];

        const courses = [];
        let courseCount = 0;

        // 1. PAST COURSES
        console.log("📝 Generating past courses...");
        for (let i = 0; i < 5; i++) {
            const pastStart = new Date(now);
            pastStart.setDate(pastStart.getDate() - 30);
            const pastEnd = new Date(pastStart);
            pastEnd.setDate(pastEnd.getDate() + 2); // 2 day course

            courses.push({
                courseTitle: `❌ Past Course ${i + 1}`,
                courseCategory: categories[i % categories.length]._id,
                posterImage: ["uploads/courses/past.jpg"],
                venueAddress: {
                    type: "Point",
                    coordinates: locations[0].coords,
                    city: locations[0].city,
                    country: locations[0].country,
                    address: locations[0].name,
                },
                shortdesc: "This course has ended",
                schedules: [
                    {
                        startDate: pastStart,
                        endDate: pastEnd,
                        startTime: "09:00",
                        endTime: "17:00",
                        totalSeats: 20,
                        price: 1000,
                    }
                ],
                createdBy: organizer._id,
            });
            courseCount++;
        }

        // 2. UPCOMING COURSES
        console.log("📝 Generating upcoming courses...");
        for (let i = 0; i < 20; i++) {
            const start = new Date(now);
            start.setDate(start.getDate() + 5 + i); // Starts in 5+ days
            const end = new Date(start);
            end.setDate(end.getDate() + 1);

            courses.push({
                courseTitle: `📚 Upcoming Course ${i + 1}`,
                courseCategory: categories[i % categories.length]._id,
                posterImage: ["uploads/courses/upcoming.jpg"],
                venueAddress: {
                    type: "Point",
                    coordinates: locations[i % 3].coords, // Delhi/Gurgaon/Noida
                    city: locations[i % 3].city,
                    country: locations[i % 3].country,
                    address: locations[i % 3].name,
                },
                shortdesc: "Learn new skills in this upcoming course",
                schedules: [
                    {
                        startDate: start,
                        endDate: end,
                        startTime: "10:00",
                        endTime: "16:00",
                        totalSeats: 30,
                        price: 2000 + (i * 100),
                    }
                ],
                createdBy: organizer._id,
            });
            courseCount++;
        }

        // 3. THIS WEEK COURSES
        console.log("📝 Generating this week courses...");
        const thisWeekStart = getStartOfWeek(now);
        for (let i = 0; i < 5; i++) {
            const start = new Date(now); // Start today or tomorrow
            start.setDate(start.getDate() + (i % 3)); // Today, tmrw, day after
            const end = new Date(start);
            end.setHours(end.getHours() + 5);

            if (start.getDay() !== 0 && start.getDay() !== 6) { // Avoid weekend for clarity
                courses.push({
                    courseTitle: `📅 This Week Course ${i + 1}`,
                    courseCategory: categories[i % categories.length]._id,
                    posterImage: ["uploads/courses/week.jpg"],
                    venueAddress: {
                        type: "Point",
                        coordinates: locations[0].coords,
                        city: locations[0].city,
                        country: locations[0].country,
                        address: locations[0].name,
                    },
                    shortdesc: "Happening this week",
                    schedules: [
                        {
                            startDate: start,
                            endDate: end,
                            startTime: "14:00",
                            endTime: "18:00",
                            totalSeats: 15,
                            price: 1500,
                        }
                    ],
                    createdBy: organizer._id,
                });
                courseCount++;
            }
        }

        // 4. THIS WEEKEND COURSES
        console.log("📝 Generating this weekend courses...");
        const thisWeekendStart = getStartOfWeekend(now);
        for (let i = 0; i < 5; i++) {
            const start = new Date(thisWeekendStart);
            start.setDate(start.getDate() + (i % 2)); // Sat or Sun
            const end = new Date(start);
            end.setHours(end.getHours() + 4);

            courses.push({
                courseTitle: `🎉 Weekend Workshop ${i + 1}`,
                courseCategory: categories[i % categories.length]._id,
                posterImage: ["uploads/courses/weekend.jpg"],
                venueAddress: {
                    type: "Point",
                    coordinates: locations[1].coords,
                    city: locations[1].city,
                    country: locations[1].country,
                    address: locations[1].name,
                },
                shortdesc: "Weekend intensive",
                schedules: [
                    {
                        startDate: start,
                        endDate: end,
                        startTime: "09:00",
                        endTime: "13:00", // 4 Hours
                        totalSeats: 50,
                        price: 2500,
                    }
                ],
                createdBy: organizer._id,
            });
            courseCount++;
        }

        // 5. FAR AWAY COURSE (Bangalore)
        console.log("📝 Generating far away course...");
        const farStart = new Date(now);
        farStart.setDate(farStart.getDate() + 10);
        courses.push({
            courseTitle: `✈️ Bangalore Tech Bootcamp`,
            courseCategory: categories[0]._id,
            posterImage: ["uploads/courses/bangalore.jpg"],
            venueAddress: {
                type: "Point",
                coordinates: locations[3].coords,
                city: locations[3].city,
                country: locations[3].country,
                address: locations[3].name,
            },
            shortdesc: "Intensive tech bootcamp in Bangalore",
            schedules: [
                {
                    startDate: farStart,
                    endDate: new Date(farStart.getTime() + 86400000), // 1 day
                    startTime: "09:00",
                    endTime: "18:00",
                    totalSeats: 100,
                    price: 5000,
                }
            ],
            createdBy: organizer._id,
        });
        courseCount++;

        await Course.insertMany(courses);
        console.log(`\n✅ Successfully created ${courseCount} courses!`);

        process.exit(0);

    } catch (error) {
        console.error("❌ Error seeding courses:", error);
        process.exit(1);
    }
};

seedCourses();
