const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const User = require("../db/models/User");
const Event = require("../db/models/Event");
const Course = require("../db/models/Course");
const Transaction = require("../db/models/Transaction");
const Review = require("../db/models/Review");
const Follow = require("../db/models/Follow");
const Category = require("../db/models/Category");

const CUSTOMER_ID = "6ad88b64bad3d9f6670695e4";
const ORGANIZER_ID = "6a6061df286d4f7f3323f733";

async function populateData() {
    try {
        console.log("Connecting to MongoDB Atlas...");
        await mongoose.connect(process.env.DB_STRING);
        console.log("Connected successfully!");

        // 1. Fetch available categories
        const categories = await Category.find({ isDeleted: false }).limit(5);
        const catIds = categories.map((c) => c._id);
        const firstCatId = catIds[0] || null;

        // 2. Fetch or verify Customer
        let customer = await User.findById(CUSTOMER_ID);
        if (!customer) {
            customer = await User.findOne({ roleId: 3, isDeleted: false });
        }
        if (!customer) {
            console.error("No customer found!");
            return;
        }
        console.log(`Targeting Customer: ${customer._id} (${customer.email})`);

        // 3. Fetch or verify Organizer
        let organizer = await User.findById(ORGANIZER_ID);
        if (!organizer) {
            organizer = await User.findOne({ roleId: 2, isDeleted: false });
        }
        if (!organizer) {
            console.error("No organizer found!");
            return;
        }
        console.log(`Targeting Organizer: ${organizer._id} (${organizer.email})`);

        // ── 4. POPULATE ORGANIZER WITH RICH REALISTIC DATA ──
        organizer.firstName = organizer.firstName || "James";
        organizer.lastName = organizer.lastName || "Kowalski";
        organizer.businessName = "Aura Live Experiences & Creative Arts";
        organizer.businessRegisterNumber = "MNG-REG-8829104";
        organizer.website = "https://auralive.io";
        organizer.profileImage = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80";
        organizer.backgroundImage = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80";
        organizer.bio = "Pioneering immersive live events, outdoor music festivals, and creative masterclasses across Ulaanbaatar and international circuits since 2018.";
        organizer.location = {
            type: "Point",
            coordinates: [106.9177, 47.9188],
            address: "Sukhbaatar Square 8, Central Tower Floor 12",
            city: "Ulaanbaatar",
            state: "Ulaanbaatar",
            country: "Mongolia",
            zipcode: "14200"
        };
        organizer.countryCode = "+976";
        organizer.contactNumber = "99887766";
        organizer.isVerified = true;
        organizer.isAllVerified = true;
        organizer.isPromoted = true;
        organizer.isDisable = false;
        organizer.language = "en";
        organizer.gender = "Male";
        organizer.dob = new Date("1989-05-24");
        organizer.businessVerificationStatus = "approved";
        organizer.organizerVerificationStatus = "approved";
        organizer.categories = catIds.slice(0, 3);
        organizer.businessCategory = firstCatId;
        organizer.shortDesc = "Leading organizer of premier international cultural and music showcases.";
        organizer.socialMediaLink = "https://instagram.com/auralive_events";
        organizer.socialLogin = {
            isSocialLogin: false,
            socialType: null
        };
        organizer.verifications = {
            email: {
                isVerified: true,
                verifiedAt: new Date("2025-06-15T10:00:00Z")
            },
            phone: {
                isVerified: true,
                verifiedAt: new Date("2025-06-15T10:05:00Z"),
                isVerifiedOnce: true
            },
            idVerification: {
                nationalId: {
                    frontImage: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=80",
                    backImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&auto=format&fit=crop&q=80",
                    isVerified: true,
                    status: "approved",
                    verifiedAt: new Date("2025-07-01T14:30:00Z")
                },
                drivingLicence: {
                    frontImage: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=80",
                    backImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&auto=format&fit=crop&q=80",
                    isVerified: true,
                    status: "approved",
                    verifiedAt: new Date("2025-07-01T14:30:00Z")
                }
            },
            bankVerification: {
                bankName: "Khan Bank of Mongolia",
                bankHolderName: "Aura Live Experiences LLC",
                accountNumber: "503920194819",
                otherDetails: "Commercial business account verified for swift wire and QPay",
                isVerified: true,
                status: "approved",
                verifiedAt: new Date("2025-07-05T09:15:00Z")
            }
        };
        organizer.bankAccounts = [
            {
                bankName: "Khan Bank",
                bankHolderName: "Aura Live Experiences LLC",
                accountNumber: "503920194819",
                isPrimary: true,
                isVerified: true,
                status: "approved"
            },
            {
                bankName: "Golomt Bank",
                bankHolderName: "Aura Live Experiences LLC",
                accountNumber: "14059284711",
                isPrimary: false,
                isVerified: true,
                status: "approved"
            }
        ];
        organizer.totalEarnings = 4850000;
        organizer.payoutBalance = 1250000;
        await organizer.save();
        console.log("Updated Organizer profile.");

        // Assign existing events to organizer
        const allEvs = await Event.find().limit(4);
        console.log(`Found ${allEvs.length} total events in DB.`);
        for (let i = 0; i < allEvs.length; i++) {
            await Event.updateOne(
                { _id: allEvs[i]._id },
                {
                    $set: {
                        createdBy: organizer._id,
                        status: i < 2 ? "Upcoming" : "Past",
                        ticketSold: (allEvs[i].ticketSold || 0) + 120 * (i + 1),
                        isDeleted: false,
                        isDraft: false,
                        startDate: allEvs[i].startDate || new Date("2026-11-15T10:00:00Z"),
                        endDate: allEvs[i].endDate || new Date("2026-11-15T18:00:00Z")
                    }
                }
            );
        }
        let organizerEvents = await Event.find({ _id: { $in: allEvs.map((e) => e._id) } });

        // Assign existing courses to organizer
        const allCrs = await Course.find().limit(3);
        console.log(`Found ${allCrs.length} total courses in DB.`);
        for (let i = 0; i < allCrs.length; i++) {
            await Course.updateOne(
                { _id: allCrs[i]._id },
                {
                    $set: {
                        createdBy: organizer._id,
                        status: i === 0 ? "Upcoming" : "Past",
                        ticketSold: 15 + i * 5,
                        isDeleted: false,
                        isDraft: false
                    }
                }
            );
        }
        let organizerCourses = await Course.find({ _id: { $in: allCrs.map((c) => c._id) } });

        // ── 5. POPULATE CUSTOMER WITH RICH REALISTIC DATA ──
        customer.firstName = "Rahul";
        customer.lastName = "Sharma";
        customer.email = customer.email || "rahul.sharma@example.com";
        customer.contactNumber = "8299292929";
        customer.countryCode = "+91";
        customer.profileImage = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80";
        customer.bio = "Tech enthusiast, avid music festival attendee, and full-stack developer passionate about digital arts and interactive creative courses.";
        customer.gender = "Male";
        customer.dob = new Date("1996-08-15");
        customer.location = {
            type: "Point",
            coordinates: [75.7873, 26.9124],
            address: "Plot 42, Malviya Nagar Industrial Area",
            city: "Jaipur",
            state: "Rajasthan",
            country: "India",
            zipcode: "302017"
        };
        customer.isVerified = true;
        customer.isAllVerified = true;
        customer.isDisable = false;
        customer.language = "en";
        customer.timeZone = "Asia/Kolkata";
        customer.socialLogin = {
            isSocialLogin: true,
            socialType: "google",
            socialId: "google_oauth_9812481092"
        };
        customer.verifications = {
            email: {
                isVerified: true,
                verifiedAt: new Date("2026-01-10T12:00:00Z")
            },
            phone: {
                isVerified: true,
                verifiedAt: new Date("2026-01-10T12:05:00Z"),
                isVerifiedOnce: true
            }
        };
        customer.categories = catIds.slice(0, 3);
        await customer.save();
        console.log("Updated Customer profile.");

        // ── 6. POPULATE BOOKINGS / TRANSACTIONS FOR CUSTOMER ──
        // Clear old dummy transactions for customer
        await Transaction.deleteMany({ userId: customer._id });

        const targetEvent1 = organizerEvents[0];
        const targetEvent2 = organizerEvents[1] || organizerEvents[0];
        const targetCourse = organizerCourses[0];

        const ticket1 = targetEvent1.tickets?.[0] || { _id: new mongoose.Types.ObjectId().toString(), ticketName: "VIP Pass", price: 180000 };
        const ticket2 = targetEvent2.tickets?.[0] || { _id: new mongoose.Types.ObjectId().toString(), ticketName: "Standard Access", price: 45000 };

        const transactionsToCreate = [
            {
                userId: customer._id,
                eventId: targetEvent1._id,
                ticketId: String(ticket1._id || "tk1"),
                ticketName: ticket1.ticketName || "VIP Pass",
                tickets: [
                    {
                        ticketId: String(ticket1._id || "tk1"),
                        ticketName: ticket1.ticketName || "VIP Pass",
                        qty: 2,
                        basePrice: 180000,
                        subBookingId: "BK-EV-9012-1",
                        isCheckedIn: true,
                        checkedInAt: new Date()
                    }
                ],
                bookingType: "EVENT",
                bookingId: "BONDY-EV-901283",
                qty: 2,
                basePrice: 180000,
                taxAmount: 18000,
                discountAmount: 0,
                totalAmount: 378000,
                status: "PAID",
                paymentMethod: "QPAY",
                createdAt: new Date("2026-09-12T14:20:00Z")
            },
            {
                userId: customer._id,
                eventId: targetEvent2._id,
                ticketId: String(ticket2._id || "tk2"),
                ticketName: ticket2.ticketName || "Standard Access",
                tickets: [
                    {
                        ticketId: String(ticket2._id || "tk2"),
                        ticketName: ticket2.ticketName || "Standard Access",
                        qty: 1,
                        basePrice: 45000,
                        subBookingId: "BK-EV-8419-1",
                        isCheckedIn: true,
                        checkedInAt: new Date("2026-08-20T19:30:00Z")
                    }
                ],
                bookingType: "EVENT",
                bookingId: "BONDY-EV-841902",
                qty: 1,
                basePrice: 45000,
                taxAmount: 4500,
                discountAmount: 5000,
                totalAmount: 44500,
                status: "PAID",
                paymentMethod: "STRIPE",
                createdAt: new Date("2026-08-10T11:00:00Z")
            },
            {
                userId: customer._id,
                courseId: targetCourse._id,
                passType: "1_month",
                passExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                bookingType: "COURSE",
                bookingId: "BONDY-CR-440219",
                qty: 1,
                basePrice: 280000,
                taxAmount: 28000,
                discountAmount: 0,
                totalAmount: 308000,
                status: "PAID",
                paymentMethod: "QPAY",
                createdAt: new Date("2026-10-02T09:45:00Z")
            },
            {
                userId: customer._id,
                eventId: targetEvent1._id,
                ticketId: String(ticket1._id || "tk1"),
                ticketName: ticket1.ticketName || "General Access",
                tickets: [
                    {
                        ticketId: String(ticket1._id || "tk1"),
                        ticketName: ticket1.ticketName || "General Access",
                        qty: 1,
                        basePrice: 65000,
                        subBookingId: "BK-EV-7102-1",
                        isCheckedIn: false
                    }
                ],
                bookingType: "EVENT",
                bookingId: "BONDY-EV-710244",
                qty: 1,
                basePrice: 65000,
                taxAmount: 6500,
                discountAmount: 0,
                totalAmount: 71500,
                status: "CANCELLED",
                paymentMethod: "QPAY",
                createdAt: new Date("2026-10-15T18:10:00Z")
            }
        ];

        await Transaction.insertMany(transactionsToCreate);
        console.log(`Inserted ${transactionsToCreate.length} transactions for Customer.`);

        // ── 7. POPULATE REVIEWS FOR CUSTOMER & ORGANIZER ──
        await Review.deleteMany({ userId: customer._id });

        await Review.create([
            {
                userId: customer._id,
                entityId: targetEvent1._id,
                entityModel: "Event",
                review: "Outstanding production! The stage lighting and acoustics at the arena were on par with top European festivals. Will definitely attend again.",
                rating: 5,
                targetUserId: organizer._id,
                createdAt: new Date("2026-09-15T10:00:00Z")
            },
            {
                userId: customer._id,
                entityId: targetCourse._id,
                entityModel: "Course",
                review: "Very practical hands-on masterclass. The console routing workflows and acoustic alignment exercises gave me real confidence.",
                rating: 5,
                targetUserId: organizer._id,
                createdAt: new Date("2026-10-10T16:20:00Z")
            }
        ]);
        console.log("Created 2 reviews written by customer.");

        // ── 8. POPULATE FOLLOWS ──
        // Ensure Customer follows Organizer
        const existingFollow = await Follow.findOne({ fromUser: customer._id, toUser: organizer._id });
        if (!existingFollow) {
            await Follow.create({ fromUser: customer._id, toUser: organizer._id });
        }

        // Create 15 followers for Organizer so follower counter is rich
        const dummyFollowersCount = await Follow.countDocuments({ toUser: organizer._id });
        if (dummyFollowersCount < 12) {
            const allUsers = await User.find({ _id: { $ne: organizer._id } }).limit(20);
            for (const u of allUsers) {
                const f = await Follow.findOne({ fromUser: u._id, toUser: organizer._id });
                if (!f) {
                    await Follow.create({ fromUser: u._id, toUser: organizer._id });
                }
            }
        }
        console.log("Updated followers for organizer.");

        console.log("\n=======================================================");
        console.log("SUCCESSFULLY POPULATED MAXIMUM REALISTIC DATA!");
        console.log(`Customer URL:  http://localhost:5173/users/${customer._id}`);
        console.log(`Organizer URL: http://localhost:5173/users/${organizer._id}`);
        console.log("=======================================================\n");

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error populating data:", err);
    }
}

populateData();
