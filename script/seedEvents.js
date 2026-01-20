require("dotenv").config();
const mongoose = require("mongoose");
const { User, Category, Event } = require("../db/index");
const { roleId } = require("../utils/Role");

const seedEvents = async () => {
    try {
        console.log("🌱 Starting event seed script...\n");

        // Get the current date and time
        const now = new Date();
        console.log(`Current time: ${now.toISOString()}\n`);

        // Find or create an organizer user
        let organizer = await User.findOne({ roleId: roleId.ORGANISER });

        if (!organizer) {
            console.log("📝 Creating organizer user...");
            organizer = new User({
                firstName: "Test",
                lastName: "Organizer",
                email: "organizer@test.com",
                password: "123456",
                contactNumber: "9999999999",
                roleId: roleId.ORGANISER,
                organizerVerificationStatus: "APPROVED",
                location: {
                    type: "Point",
                    coordinates: [77.209, 28.6139], // Delhi
                    city: "Delhi",
                    country: "India",
                },
                language: "en",
                isDisable: false,
                isDeleted: false,
            });
            await organizer.save();
            console.log("✅ Organizer created\n");
        } else {
            console.log("✅ Using existing organizer\n");
        }

        // Create multiple categories
        const categoryData = [
            { name: "Music & Entertainment", image: "uploads/categories/music.jpg" },
            { name: "Health & Wellness", image: "uploads/categories/health.jpg" },
            { name: "Business & Tech", image: "uploads/categories/tech.jpg" },
            { name: "Food & Drink", image: "uploads/categories/food.jpg" },
            { name: "Arts & Culture", image: "uploads/categories/art.jpg" },
        ];

        const categories = [];
        console.log("📝 Creating categories...");

        for (const cat of categoryData) {
            let category = await Category.findOne({ name: cat.name, isDeleted: false });
            if (!category) {
                category = new Category({
                    name: cat.name,
                    image: cat.image,
                    type: "event",
                    isDeleted: false,
                });
                await category.save();
                console.log(`✅ Created category: ${cat.name}`);
            } else {
                console.log(`✅ Using existing category: ${cat.name}`);
            }
            categories.push(category);
        }
        console.log("\n");

        // Clear existing test events (optional)
        // await Event.deleteMany({ createdBy: organizer._id });
        // console.log("🗑️  Cleared existing test events\n");

        console.log("📅 Creating test events...\n");

        // Helper function to calculate dates
        const getStartOfWeek = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day; // Monday
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const getStartOfWeekend = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = day === 0 ? -1 : 6 - day; // Saturday
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            return d;
        };

        // Different locations for "Near You" testing
        const locations = [
            {
                name: "Delhi - India Gate",
                coords: [77.2295, 28.6129], // ~2km from center
                city: "Delhi",
                country: "India",
            },
            {
                name: "Delhi - Connaught Place",
                coords: [77.2167, 28.6304], // ~5km from center
                city: "Delhi",
                country: "India",
            },
            {
                name: "Gurgaon - Cyber Hub",
                coords: [77.088, 28.4955], // ~25km from Delhi center
                city: "Gurgaon",
                country: "India",
            },
            {
                name: "Noida - Sector 18",
                coords: [77.3249, 28.5706], // ~20km from Delhi center
                city: "Noida",
                country: "India",
            },
            {
                name: "Delhi - Hauz Khas",
                coords: [77.2069, 28.5494],
                city: "Delhi",
                country: "India",
            },
            {
                name: "Delhi - Nehru Place",
                coords: [77.2502, 28.5494],
                city: "Delhi",
                country: "India",
            },
            {
                name: "Faridabad - Crown Plaza",
                coords: [77.3178, 28.4089],
                city: "Faridabad",
                country: "India",
            },
            {
                name: "Mumbai - Gateway of India",
                coords: [72.8347, 18.922], // Far away
                city: "Mumbai",
                country: "India",
            },
            {
                name: "Bangalore - MG Road",
                coords: [77.6033, 12.9762], // Far away
                city: "Bangalore",
                country: "India",
            },
        ];

        const eventTypes = [
            { type: "Music Concert", icon: "🎵", tags: ["music", "concert", "live"] },
            { type: "Comedy Show", icon: "🎤", tags: ["comedy", "standup", "entertainment"] },
            { type: "Theater Play", icon: "🎭", tags: ["theater", "drama", "performance"] },
            { type: "Dance Performance", icon: "💃", tags: ["dance", "performance", "art"] },
            { type: "Art Exhibition", icon: "🎨", tags: ["art", "exhibition", "gallery"] },
            { type: "Food Festival", icon: "🍔", tags: ["food", "festival", "cuisine"] },
            { type: "Tech Meetup", icon: "💻", tags: ["tech", "meetup", "networking"] },
            { type: "Yoga Session", icon: "🧘", tags: ["yoga", "wellness", "fitness"] },
            { type: "Sports Event", icon: "⚽", tags: ["sports", "game", "competition"] },
            { type: "Movie Screening", icon: "🎬", tags: ["movie", "film", "screening"] },
            { type: "DJ Night", icon: "🎧", tags: ["dj", "electronic", "party"] },
            { type: "Poetry Night", icon: "📚", tags: ["poetry", "literature", "reading"] },
            { type: "Workshop", icon: "🛠️", tags: ["workshop", "learning", "skills"] },
            { type: "Carnival", icon: "🎪", tags: ["carnival", "family", "fun"] },
            { type: "Jazz Night", icon: "🎷", tags: ["jazz", "music", "live"] },
        ];

        const venues = [
            "Arena Hall", "Central Stadium", "City Theater", "Grand Auditorium",
            "Music Palace", "Open Air Amphitheater", "Convention Center",
            "Community Hall", "Art Gallery", "Rooftop Lounge", "Garden Venue",
            "Conference Hall", "Club House", "Beach Resort", "Mountain Lodge"
        ];

        const events = [];
        let eventCount = 0;

        // Generate 10 PAST EVENTS (should be filtered out)
        console.log("📝 Generating past events (should be filtered)...");
        for (let i = 0; i < 10; i++) {
            const pastDate = new Date(now);
            pastDate.setDate(pastDate.getDate() - (30 - i * 2));
            pastDate.setHours(18 + (i % 6), 0, 0, 0);

            const eventType = eventTypes[i % eventTypes.length];
            const location = locations[i % locations.length];

            events.push({
                eventTitle: `❌ ${eventType.type} - ${pastDate.toDateString()} (PAST)`,
                eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                posterImage: [`uploads/events/past-${i}.jpg`],
                shortdesc: `This event ended on ${pastDate.toDateString()}`,
                longdesc: "Past event for testing exclusion logic",
                tags: [...eventType.tags, "past"],
                venueName: venues[i % venues.length],
                venueAddress: {
                    type: "Point",
                    coordinates: location.coords,
                    city: location.city,
                    country: location.country,
                    address: location.name,
                },
                startDate: pastDate,
                endDate: new Date(pastDate.getTime() + 3 * 60 * 60 * 1000),
                startTime: `${18 + (i % 6)}:00`,
                endTime: `${21 + (i % 6)}:00`,
                ticketPrice: 500 + (i * 100),
                totalTickets: 100 + (i * 10),
                ticketQtyAvailable: 50 + (i * 5),
                isDraft: false,
                createdBy: organizer._id,
            });
            eventCount++;
        }

        // Generate 5 DRAFT EVENTS (should be filtered out)
        console.log("📝 Generating draft events (should be filtered)...");
        for (let i = 0; i < 5; i++) {
            const draftDate = new Date(now);
            draftDate.setDate(draftDate.getDate() + (i + 2));
            draftDate.setHours(19, 0, 0, 0);

            const eventType = eventTypes[(i + 3) % eventTypes.length];
            const location = locations[i % locations.length];

            events.push({
                eventTitle: `❌ DRAFT: ${eventType.type} (Should NOT appear)`,
                eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                posterImage: [`uploads/events/draft-${i}.jpg`],
                shortdesc: "This is a draft event",
                longdesc: "Testing draft exclusion logic",
                tags: [...eventType.tags, "draft"],
                venueName: venues[(i + 5) % venues.length],
                venueAddress: {
                    type: "Point",
                    coordinates: location.coords,
                    city: location.city,
                    country: location.country,
                    address: location.name,
                },
                startDate: draftDate,
                endDate: new Date(draftDate.getTime() + 2 * 60 * 60 * 1000),
                startTime: "19:00",
                endTime: "21:00",
                ticketPrice: 600 + (i * 150),
                totalTickets: 100,
                ticketQtyAvailable: 100,
                isDraft: true, // Draft events should be excluded
                createdBy: organizer._id,
            });
            eventCount++;
        }

        // Generate 30 UPCOMING EVENTS (various future dates)
        console.log("📝 Generating upcoming events...");
        for (let i = 0; i < 30; i++) {
            const upcomingDate = new Date(now);
            upcomingDate.setDate(upcomingDate.getDate() + (i + 1));
            upcomingDate.setHours(17 + (i % 7), 0, 0, 0);

            const eventType = eventTypes[i % eventTypes.length];
            const location = locations[i % locations.length];

            events.push({
                eventTitle: `${eventType.icon} ${eventType.type} - Day ${i + 1}`,
                eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                posterImage: [`uploads/events/upcoming-${i}.jpg`],
                shortdesc: `Amazing ${eventType.type.toLowerCase()} happening soon!`,
                longdesc: `Join us for an unforgettable ${eventType.type.toLowerCase()} experience`,
                tags: eventType.tags,
                venueName: venues[i % venues.length],
                venueAddress: {
                    type: "Point",
                    coordinates: location.coords,
                    city: location.city,
                    country: location.country,
                    address: location.name,
                },
                startDate: upcomingDate,
                endDate: new Date(upcomingDate.getTime() + (2 + (i % 3)) * 60 * 60 * 1000),
                startTime: `${17 + (i % 7)}:00`,
                endTime: `${19 + (i % 7)}:00`,
                ticketPrice: 500 + (i * 50),
                totalTickets: 100 + (i * 10),
                ticketQtyAvailable: 80 + (i * 8),
                isDraft: false,
                createdBy: organizer._id,
            });
            eventCount++;
        }

        // Generate 15 THIS WEEK EVENTS
        console.log("📝 Generating this week events...");
        const startOfWeek = getStartOfWeek(now);
        for (let i = 0; i < 15; i++) {
            const weekDate = new Date(startOfWeek);
            weekDate.setDate(weekDate.getDate() + (i % 7)); // Spread across the week
            weekDate.setHours(15 + (i % 8), 0, 0, 0);

            // Skip if it's in the past
            if (weekDate >= now) {
                const eventType = eventTypes[i % eventTypes.length];
                const location = locations[i % locations.length];

                events.push({
                    eventTitle: `${eventType.icon} ${eventType.type} - This Week`,
                    eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                    posterImage: [`uploads/events/week-${i}.jpg`],
                    shortdesc: `This week's ${eventType.type.toLowerCase()}`,
                    longdesc: `Don't miss this week's exciting ${eventType.type.toLowerCase()}`,
                    tags: [...eventType.tags, "thisweek"],
                    venueName: venues[i % venues.length],
                    venueAddress: {
                        type: "Point",
                        coordinates: location.coords,
                        city: location.city,
                        country: location.country,
                        address: location.name,
                    },
                    startDate: weekDate,
                    endDate: new Date(weekDate.getTime() + 3 * 60 * 60 * 1000),
                    startTime: `${15 + (i % 8)}:00`,
                    endTime: `${18 + (i % 8)}:00`,
                    ticketPrice: 700 + (i * 80),
                    totalTickets: 150 + (i * 15),
                    ticketQtyAvailable: 120 + (i * 10),
                    isDraft: false,
                    createdBy: organizer._id,
                });
                eventCount++;
            }
        }

        // Generate 10 THIS WEEKEND EVENTS (Saturday & Sunday)
        console.log("📝 Generating this weekend events...");
        const startOfWeekend = getStartOfWeekend(now);
        for (let i = 0; i < 10; i++) {
            const weekendDate = new Date(startOfWeekend);
            weekendDate.setDate(weekendDate.getDate() + (i % 2)); // Saturday or Sunday
            weekendDate.setHours(18 + (i % 5), 0, 0, 0);

            // Skip if it's in the past
            if (weekendDate >= now) {
                const eventType = eventTypes[i % eventTypes.length];
                const location = locations[i % locations.length];

                events.push({
                    eventTitle: `${eventType.icon} ${eventType.type} - Weekend Special`,
                    eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                    posterImage: [`uploads/events/weekend-${i}.jpg`],
                    shortdesc: `Weekend ${eventType.type.toLowerCase()} extravaganza!`,
                    longdesc: `Perfect weekend entertainment with ${eventType.type.toLowerCase()}`,
                    tags: [...eventType.tags, "weekend"],
                    venueName: venues[i % venues.length],
                    venueAddress: {
                        type: "Point",
                        coordinates: location.coords,
                        city: location.city,
                        country: location.country,
                        address: location.name,
                    },
                    startDate: weekendDate,
                    endDate: new Date(weekendDate.getTime() + 4 * 60 * 60 * 1000),
                    startTime: `${18 + (i % 5)}:00`,
                    endTime: `${22 + (i % 5)}:00`,
                    ticketPrice: 1000 + (i * 100),
                    totalTickets: 200 + (i * 20),
                    ticketQtyAvailable: 150 + (i * 15),
                    isDraft: false,
                    createdBy: organizer._id,
                });
                eventCount++;
            }
        }

        // Generate 25 THIS YEAR EVENTS (spread across months)
        console.log("📝 Generating this year events...");
        for (let i = 0; i < 25; i++) {
            const yearDate = new Date(now);
            yearDate.setMonth(now.getMonth() + (i % 11)); // Spread across remaining months
            yearDate.setDate(1 + (i % 28));
            yearDate.setHours(19, 0, 0, 0);

            // Make sure it's still this year and not in the past
            if (yearDate.getFullYear() === now.getFullYear() && yearDate >= now) {
                const eventType = eventTypes[i % eventTypes.length];
                const location = locations[i % locations.length];

                events.push({
                    eventTitle: `${eventType.icon} ${eventType.type} - ${yearDate.toLocaleString('default', { month: 'long' })}`,
                    eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                    posterImage: [`uploads/events/year-${i}.jpg`],
                    shortdesc: `${yearDate.toLocaleString('default', { month: 'long' })} ${eventType.type.toLowerCase()}`,
                    longdesc: `Looking forward to this ${eventType.type.toLowerCase()} event`,
                    tags: [...eventType.tags, "thisyear"],
                    venueName: venues[i % venues.length],
                    venueAddress: {
                        type: "Point",
                        coordinates: location.coords,
                        city: location.city,
                        country: location.country,
                        address: location.name,
                    },
                    startDate: yearDate,
                    endDate: new Date(yearDate.getTime() + 3 * 60 * 60 * 1000),
                    startTime: "19:00",
                    endTime: "22:00",
                    ticketPrice: 800 + (i * 60),
                    totalTickets: 180 + (i * 12),
                    ticketQtyAvailable: 140 + (i * 10),
                    isDraft: false,
                    createdBy: organizer._id,
                });
                eventCount++;
            }
        }

        // Generate 20 NEAR YOU EVENTS (Delhi/NCR locations)
        console.log("📝 Generating near you events (Delhi/NCR)...");
        for (let i = 0; i < 20; i++) {
            const nearDate = new Date(now);
            nearDate.setDate(nearDate.getDate() + (i % 15) + 1);
            nearDate.setHours(18 + (i % 6), 0, 0, 0);

            const eventType = eventTypes[i % eventTypes.length];
            // Use only Delhi/NCR locations (first 7 locations)
            const location = locations[i % 7];

            events.push({
                eventTitle: `${eventType.icon} ${eventType.type} - ${location.city}`,
                eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                posterImage: [`uploads/events/near-${i}.jpg`],
                shortdesc: `${eventType.type} in ${location.city}`,
                longdesc: `Experience ${eventType.type.toLowerCase()} near you in ${location.city}`,
                tags: [...eventType.tags, "nearyou", location.city.toLowerCase()],
                venueName: venues[i % venues.length],
                venueAddress: {
                    type: "Point",
                    coordinates: location.coords,
                    city: location.city,
                    country: location.country,
                    address: location.name,
                },
                startDate: nearDate,
                endDate: new Date(nearDate.getTime() + 3 * 60 * 60 * 1000),
                startTime: `${18 + (i % 6)}:00`,
                endTime: `${21 + (i % 6)}:00`,
                ticketPrice: 600 + (i * 70),
                totalTickets: 120 + (i * 15),
                ticketQtyAvailable: 100 + (i * 12),
                isDraft: false,
                createdBy: organizer._id,
            });
            eventCount++;
        }

        // Generate 5 FAR LOCATION EVENTS (Mumbai & Bangalore)
        console.log("📝 Generating far location events (Mumbai/Bangalore)...");
        for (let i = 0; i < 5; i++) {
            const farDate = new Date(now);
            farDate.setDate(farDate.getDate() + (i * 3) + 2);
            farDate.setHours(19, 0, 0, 0);

            const eventType = eventTypes[i % eventTypes.length];
            // Use only far locations (Mumbai & Bangalore)
            const location = locations[7 + (i % 2)];

            events.push({
                eventTitle: `${eventType.icon} ${eventType.type} - ${location.city}`,
                eventCategory: categories[Math.floor(Math.random() * categories.length)]._id,
                posterImage: [`uploads/events/far-${i}.jpg`],
                shortdesc: `${eventType.type} in ${location.city}`,
                longdesc: `Travel to ${location.city} for this amazing ${eventType.type.toLowerCase()}`,
                tags: [...eventType.tags, location.city.toLowerCase()],
                venueName: venues[i % venues.length],
                venueAddress: {
                    type: "Point",
                    coordinates: location.coords,
                    city: location.city,
                    country: location.country,
                    address: location.name,
                },
                startDate: farDate,
                endDate: new Date(farDate.getTime() + 3 * 60 * 60 * 1000),
                startTime: "19:00",
                endTime: "22:00",
                ticketPrice: 1500 + (i * 200),
                totalTickets: 300 + (i * 50),
                ticketQtyAvailable: 250 + (i * 40),
                isDraft: false,
                createdBy: organizer._id,
            });
            eventCount++;
        }

        console.log(`\n📊 Total events to be created: ${eventCount}\n`);


        // Insert all events
        const insertedEvents = await Event.insertMany(events);

        console.log(`✅ Successfully created ${insertedEvents.length} events\n`);

        // Display summary
        console.log("📊 Event Summary:");
        console.log("=".repeat(60));
        insertedEvents.forEach((event, index) => {
            console.log(`${index + 1}. ${event.eventTitle}`);
            console.log(`   📅 Date: ${event.startDate.toLocaleString()}`);
            console.log(`   📍 Location: ${event.venueAddress.address}`);
            console.log(`   💰 Price: ₹${event.ticketPrice}`);
            console.log(`   🎫 Available: ${event.ticketQtyAvailable}/${event.totalTickets}`);
            console.log(`   📝 Draft: ${event.isDraft ? 'Yes ❌' : 'No ✅'}`);
            console.log("");
        });

        console.log("=".repeat(60));
        console.log("\n🎯 Testing Guide:");
        console.log("1. Test 'all' filter - should return all non-past, non-draft events");
        console.log("2. Test 'upcoming' filter - should return events that haven't started");
        console.log("3. Test 'thisWeek' filter - should return events Mon-Sun of current week");
        console.log("4. Test 'thisWeekend' filter - should return Saturday-Sunday events");
        console.log("5. Test 'thisYear' filter - should return events in current year");
        console.log("6. Test 'nearYou' filter with:");
        console.log("   - Lat: 28.6139, Long: 77.209 (Delhi center)");
        console.log("   - Radius: 50km - should show Delhi/Gurgaon/Noida events");
        console.log("   - Radius: 10km - should show only central Delhi events");
        console.log("   - Mumbai event should NOT appear for Delhi coordinates\n");

        console.log("✅ Seed script completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error in seed script:", error);
        process.exit(1);
    }
};

(async () => {
    await seedEvents();
})();
