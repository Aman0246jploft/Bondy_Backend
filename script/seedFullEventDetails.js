require("dotenv").config();
const mongoose = require("mongoose");
const { Event, User, Category, Review, Comment, Transaction } = require("../db/index");

async function seedRichEvent() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB");

  const eventId = new mongoose.Types.ObjectId("6a3294d76a9000421ec762a3");

  // Find or pick category
  let cat = await Category.findOne({ type: "event", name: "Music" });
  if (!cat) {
    cat = await Category.findOne({ type: "event" });
  }

  // Find organizer
  let organizer = await User.findOne({ roleId: 2, isVerified: true });
  if (!organizer) {
    organizer = await User.findOne();
  }

  // Find customers for bookings, reviews, and comments
  const customers = await User.find({ _id: { $ne: organizer._id } }).limit(6);

  const ticket1Id = new mongoose.Types.ObjectId();
  const ticket2Id = new mongoose.Types.ObjectId();
  const ticket3Id = new mongoose.Types.ObjectId();
  const ticket4Id = new mongoose.Types.ObjectId();

  const now = new Date();
  const startDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  const eventData = {
    _id: eventId,
    eventTitle: "SoundTech Showcase 2026: Global Immersive Audio & Music Summit",
    eventCategory: cat?._id,
    shortdesc: "The premier international summit celebrating next-generation spatial acoustics, synthesizers, electronic music production, live interactive masterclasses, and acoustic engineering.",
    longdesc: `Experience three transformative days of live sound innovation, cutting-edge spatial audio tech, synthesizer showcases, and masterclasses led by world-renowned sound engineers and Grammy-winning music producers.

Featuring:
• 4 Interactive Demo Stages with ultra-high fidelity acoustic systems
• Keynotes on AI in sound synthesis and next-gen Dolby Atmos workflows
• Hardware Synth Playground featuring modular gear and bespoke acoustic instruments
• Networking Lounges and Exclusive VIP sound design roundtables

Whether you are an aspiring producer, seasoned studio engineer, live performance designer, or acoustic enthusiast, SoundTech Showcase delivers unparalleled access to industry leaders and bleeding-edge audio technology.`,
    posterImage: [
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1600&q=80"
    ],
    mediaLinks: [
      "https://soundtechshowcase.io",
      "https://youtube.com/watch?v=live-demo",
      "https://spotify.com/playlist/soundtech2026"
    ],
    shortTeaserVideo: [
      "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
    ],
    venueName: "Central Palace Convention Center & Grand Arena",
    venueAddress: {
      address: "Sukhbaatar Square 8, Central Tower Floor 12",
      city: "Ulaanbaatar",
      state: "Ulaanbaatar",
      country: "Mongolia",
      zipcode: "14200",
      coordinates: [106.9177, 47.9188]
    },
    startDate: startDate,
    endDate: endDate,
    startTime: "10:00 AM",
    endTime: "08:00 PM",
    timeZone: "Asia/Ulaanbaatar",
    duration: "3 Days (10 Hours / Day)",
    tickets: [
      {
        _id: ticket1Id,
        ticketName: "VIP All-Access Platinum Pass",
        ticketShortDesc: "Front-row stage seating, private VIP networking lounge access, artist meet & greet, exclusive sound pack bundle, and complimentary catering.",
        price: 350000,
        qty: 80,
        isFreeTicket: false,
        salesStart: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        salesEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
      },
      {
        _id: ticket2Id,
        ticketName: "Standard 3-Day Summit Pass",
        ticketShortDesc: "Full admission to all 4 stages, exhibition hall, hardware playground, and community workshops.",
        price: 120000,
        qty: 250,
        isFreeTicket: false,
        salesStart: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        salesEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
      },
      {
        _id: ticket3Id,
        ticketName: "Student & Emerging Artist Pass",
        ticketShortDesc: "Discounted student access to general sessions and mentor speed-dating circles. Valid student ID required at entry.",
        price: 45000,
        qty: 120,
        isFreeTicket: false,
        salesStart: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000),
        salesEnd: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)
      },
      {
        _id: ticket4Id,
        ticketName: "Day 1 Community Demo Pass",
        ticketShortDesc: "Free access to open-floor synthesizer showcases and community lightning talks on Day 1.",
        price: 0,
        qty: 150,
        isFreeTicket: true,
        salesStart: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        salesEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
      }
    ],
    refundPolicy: "Flexible",
    addOns: "Backstage Pass, Commemorative Hoodie, Sample Pack USB",
    visibility: "PUBLIC",
    accessAndPrivacy: true,
    ageRestriction: "16+",
    showAttendees: true,
    notes: "Please bring a photo ID matching your registered name for badge printing. Ear protection is provided complimentary at all stage entrances. Lockers and high-speed Wi-Fi available throughout the venue.",
    dressCode: "Smart Casual / Creative Chic",
    isFreeEvent: false,
    fetcherEvent: true,
    isFeatured: true,
    featureEventFee: 50000,
    isDraft: false,
    status: "Upcoming",
    addToSlider: true,
    ReservedExternally: 25,
    createdBy: organizer._id,
  };

  // Update or insert event
  await Event.findByIdAndUpdate(eventId, { $set: eventData }, { upsert: true, new: true });
  console.log("Event updated successfully with full rich details!");

  // Clean old related records for this event
  await Review.deleteMany({ entityId: eventId });
  await Comment.deleteMany({ $or: [{ event: eventId }, { entityId: eventId }] });
  await Transaction.deleteMany({ eventId: eventId });

  // Seed Transactions (Bookings / Attendees)
  if (customers.length >= 3) {
    const transactionsToInsert = [
      {
        bookingId: `BK-EV-${Date.now()}-1`,
        userId: customers[0]._id,
        eventId: eventId,
        bookingType: "EVENT",
        status: "PAID",
        paymentStatus: "PAID",
        ticketId: ticket1Id.toString(),
        ticketName: "VIP All-Access Platinum Pass",
        basePrice: 350000,
        qty: 2,
        totalAmount: 700000,
        tickets: [
          { ticketId: ticket1Id.toString(), ticketName: "VIP All-Access Platinum Pass", qty: 2, basePrice: 350000 }
        ],
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        bookingId: `BK-EV-${Date.now()}-2`,
        userId: customers[1]._id,
        eventId: eventId,
        bookingType: "EVENT",
        status: "PAID",
        paymentStatus: "PAID",
        ticketId: ticket2Id.toString(),
        ticketName: "Standard 3-Day Summit Pass",
        basePrice: 120000,
        qty: 3,
        totalAmount: 360000,
        tickets: [
          { ticketId: ticket2Id.toString(), ticketName: "Standard 3-Day Summit Pass", qty: 3, basePrice: 120000 }
        ],
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        bookingId: `BK-EV-${Date.now()}-3`,
        userId: customers[2]._id,
        eventId: eventId,
        bookingType: "EVENT",
        status: "PAID",
        paymentStatus: "PAID",
        ticketId: ticket3Id.toString(),
        ticketName: "Student & Emerging Artist Pass",
        basePrice: 45000,
        qty: 4,
        totalAmount: 180000,
        tickets: [
          { ticketId: ticket3Id.toString(), ticketName: "Student & Emerging Artist Pass", qty: 4, basePrice: 45000 }
        ],
        createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
      },
      ...(customers[3] ? [{
        bookingId: `BK-EV-${Date.now()}-4`,
        userId: customers[3]._id,
        eventId: eventId,
        bookingType: "EVENT",
        status: "PAID",
        paymentStatus: "PAID",
        ticketId: ticket4Id.toString(),
        ticketName: "Day 1 Community Demo Pass",
        basePrice: 0,
        qty: 2,
        totalAmount: 0,
        tickets: [
          { ticketId: ticket4Id.toString(), ticketName: "Day 1 Community Demo Pass", qty: 2, basePrice: 0 }
        ],
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
      }] : [])
    ];

    await Transaction.insertMany(transactionsToInsert);
    console.log(`Seeded ${transactionsToInsert.length} transactions/bookings.`);
  }

  // Seed Reviews
  if (customers.length >= 3) {
    const reviewsToInsert = [
      {
        userId: customers[0]._id,
        entityId: eventId,
        entityModel: "Event",
        targetUserId: organizer._id,
        rating: 5,
        review: "Attended last year and it blew my mind! The acoustic testing room alone was worth 10x the ticket price. Cannot wait for this edition!",
        createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
      },
      {
        userId: customers[1]._id,
        entityId: eventId,
        entityModel: "Event",
        targetUserId: organizer._id,
        rating: 5,
        review: "Exceptional lineup of sound engineers and keynote speakers. The organization and venue acoustics are top tier.",
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        userId: customers[2]._id,
        entityId: eventId,
        entityModel: "Event",
        targetUserId: organizer._id,
        rating: 4.5,
        review: "Great networking opportunities with hardware vendors. Make sure to arrive early on Day 1 for badge registration.",
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      }
    ];

    await Review.insertMany(reviewsToInsert);
    console.log(`Seeded ${reviewsToInsert.length} reviews.`);
  }

  // Seed Comments
  if (customers.length >= 3) {
    const commentsToInsert = [
      {
        user: customers[0]._id,
        entityId: eventId,
        entityModel: "Event",
        event: eventId,
        content: "Will there be secure lockers for audio recording equipment and modular synths?",
        likes: [customers[1]._id, customers[2]._id],
        createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        user: customers[1]._id,
        entityId: eventId,
        entityModel: "Event",
        event: eventId,
        content: "Super excited for the Dolby Atmos spatial masterclass! Any prerequisites we need to install before hand?",
        likes: [customers[0]._id],
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        user: customers[2]._id,
        entityId: eventId,
        entityModel: "Event",
        event: eventId,
        content: "Booked 4 tickets for my studio team. Central Tower is a fantastic venue choice!",
        likes: [customers[0]._id, customers[1]._id],
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      }
    ];

    await Comment.insertMany(commentsToInsert);
    console.log(`Seeded ${commentsToInsert.length} comments.`);
  }

  console.log("✅ All rich event data seeded successfully!");
  process.exit(0);
}

seedRichEvent().catch(err => {
  console.error("Seeding error:", err);
  process.exit(1);
});
