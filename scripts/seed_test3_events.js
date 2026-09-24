const mongoose = require('mongoose');
require('dotenv').config();
const Event = require('../db/models/Event');
const User = require('../db/models/User');
const Category = require('../db/models/Category');

const IMAGES = {
  music: [
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    "https://dev.tasksplan.com/bondyBackend/uploads/6a3291f46a9000421ec76222/1781701929388-images.jpg"
  ],
  concert: [
    "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1200&q=80",
    "https://dev.tasksplan.com/bondyBackend/uploads/6a3291f46a9000421ec76222/1781701954761-close-up-sound-music-mixer-control-panel-blurred-background_169016-16888.jpg"
  ],
  wellness: [
    "https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80"
  ],
  workshops: [
    "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80"
  ],
  finance: [
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80"
  ],
  social: [
    "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=1200&q=80"
  ],
  community: [
    "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1200&q=80"
  ]
};

const VENUES = [
  {
    venueName: "Central Cultural Palace",
    venueAddress: {
      type: "Point",
      coordinates: [106.9176, 47.9188],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Sukhbaatar Square 3, Chingeltei District",
      state: "Ulaanbaatar",
      zipcode: "14200"
    }
  },
  {
    venueName: "Shangri-La Grand Ballroom",
    venueAddress: {
      type: "Point",
      coordinates: [106.9248, 47.9135],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "19 Olympic Street, Sukhbaatar District",
      state: "Ulaanbaatar",
      zipcode: "14241"
    }
  },
  {
    venueName: "Hub Innovation Center",
    venueAddress: {
      type: "Point",
      coordinates: [106.9123, 47.9221],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Baga Toiruu 44, Sukhbaatar District",
      state: "Ulaanbaatar",
      zipcode: "14210"
    }
  },
  {
    venueName: "UG Arena Event Hall",
    venueAddress: {
      type: "Point",
      coordinates: [106.9015, 47.8872],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Peace Avenue 110, Khan-Uul District",
      state: "Ulaanbaatar",
      zipcode: "17042"
    }
  },
  {
    venueName: "Zaisan Hill Complex Rooftop",
    venueAddress: {
      type: "Point",
      coordinates: [106.9114, 47.8863],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Zaisan Street, 11th Khoroo, Khan-Uul District",
      state: "Ulaanbaatar",
      zipcode: "17010"
    }
  },
  {
    venueName: "State Opera & Ballet Academic Theatre",
    venueAddress: {
      type: "Point",
      coordinates: [106.9205, 47.9192],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Sukhbaatar Square 2, Ulaanbaatar",
      state: "Ulaanbaatar",
      zipcode: "14200"
    }
  },
  {
    venueName: "Novotel Ballroom & Conference Center",
    venueAddress: {
      type: "Point",
      coordinates: [106.9189, 47.9205],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Baga Toiruu 21, Chingeltei District",
      state: "Ulaanbaatar",
      zipcode: "14250"
    }
  },
  {
    venueName: "Sky Resort Club House Lounge",
    venueAddress: {
      type: "Point",
      coordinates: [107.0125, 47.8512],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Bogd Khan Uul, Bayanzurkh District",
      state: "Ulaanbaatar",
      zipcode: "13381"
    }
  }
];

function createTickets(pricingType = "paid") {
  const t1Id = new mongoose.Types.ObjectId();
  const t2Id = new mongoose.Types.ObjectId();
  const t3Id = new mongoose.Types.ObjectId();

  if (pricingType === "free") {
    return [
      {
        _id: t1Id,
        ticketName: "Free Community Pass",
        ticketShortDesc: "Free entry, seat reservation, community certificate",
        price: 0,
        qty: 250,
        isFreeTicket: true,
        salesStart: new Date("2026-09-01T00:00:00.000Z"),
        salesEnd: new Date("2026-10-31T23:59:00.000Z")
      }
    ];
  }

  if (pricingType === "premium") {
    return [
      {
        _id: t1Id,
        ticketName: "General Admission",
        ticketShortDesc: "Access to main exhibition, workshops and keynote sessions",
        price: 45000,
        qty: 300,
        isFreeTicket: false,
        salesStart: new Date("2026-09-01T00:00:00.000Z"),
        salesEnd: new Date("2026-11-30T23:59:00.000Z")
      },
      {
        _id: t2Id,
        ticketName: "VIP Pass",
        ticketShortDesc: "Priority front-row seating, networking lounge access, gourmet buffet & gift bag",
        price: 95000,
        qty: 100,
        isFreeTicket: false,
        salesStart: new Date("2026-09-01T00:00:00.000Z"),
        salesEnd: new Date("2026-11-30T23:59:00.000Z")
      },
      {
        _id: t3Id,
        ticketName: "Executive Backstage & Speaker Access",
        ticketShortDesc: "Private dinner with speakers, private lounge, backstage photo pass",
        price: 180000,
        qty: 35,
        isFreeTicket: false,
        salesStart: new Date("2026-09-01T00:00:00.000Z"),
        salesEnd: new Date("2026-11-30T23:59:00.000Z")
      }
    ];
  }

  return [
    {
      _id: t1Id,
      ticketName: "Early Bird",
      ticketShortDesc: "Discounted early admission ticket with full event access",
      price: 20000,
      qty: 150,
      isFreeTicket: false,
      salesStart: new Date("2026-09-01T00:00:00.000Z"),
      salesEnd: new Date("2026-11-30T23:59:00.000Z")
    },
    {
      _id: t2Id,
      ticketName: "Standard Admission",
      ticketShortDesc: "Full event access, welcome refreshment & program booklet",
      price: 35000,
      qty: 350,
      isFreeTicket: false,
      salesStart: new Date("2026-09-01T00:00:00.000Z"),
      salesEnd: new Date("2026-11-30T23:59:00.000Z")
    }
  ];
}

async function seed() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB.");

  const organizer = await User.findOne({ email: "test3@yopmail.com" });
  if (!organizer) {
    throw new Error("Organizer test3@yopmail.com not found!");
  }
  console.log("Found organizer:", organizer._id.toString(), organizer.email);

  const categories = await Category.find({ type: "event", isDeleted: false });
  const catMap = {};
  categories.forEach(c => { catMap[c.name.toLowerCase()] = c._id; });
  console.log("Available Categories:", Object.keys(catMap));

  const getCatId = (name) => {
    if (catMap[name.toLowerCase()]) return catMap[name.toLowerCase()];
    return categories[0]._id;
  };

  const rawEvents = [
    // --- 4 ONGOING / LIVE EVENTS (Currently active on Sep 24, 2026) ---
    {
      eventTitle: "Ulaanbaatar Autumn Jazz & Wine Festival 2026",
      categoryName: "music",
      shortdesc: "Experience three days of world-class jazz quartets, live saxophone sessions, and exquisite local & international wine pairings under the autumn skies.",
      longdesc: "Join jazz aficionados and celebrated musicians for an enchanting multi-day festival in the heart of Ulaanbaatar.\n• Live evening performances by domestic and visiting international quartets\n• Sommelier-guided wine tasting sessions featuring over 30 hand-picked labels\n• Gourmet artisan cheese and tapas stations\n• Intimate acoustic jam sessions and vinyl listening room\n• Networking lounge for artists, producers, and music lovers.",
      startDate: new Date("2026-09-23T18:00:00.000Z"),
      endDate: new Date("2026-09-25T23:00:00.000Z"),
      startTime: "18:00",
      endTime: "23:00",
      status: "Live",
      isDraft: false,
      venueIndex: 4, // Zaisan Hill
      images: IMAGES.music,
      pricingType: "premium",
      dressCode: "Smart Casual / Cocktail Attire",
      notes: "Age 21+ mandatory for wine tastings. Government ID required at registration.",
      ageRestriction: "21+",
      refundPolicy: "1 Day Before"
    },
    {
      eventTitle: "TechX Mongolia 2026: Cloud, AI & Next.js Hackathon",
      categoryName: "workshops",
      shortdesc: "48-hour continuous innovation marathon bringing together 300+ developers, designers, and AI engineers to solve high-impact community challenges.",
      longdesc: "TechX Mongolia is the premier hackathon and tech symposium of 2026.\n• 48 hours of hands-on hacking with dedicated mentor support\n• Deep-dive breakout workshops on AI agents, Next.js full-stack development, and scalable cloud deployments\n• Total prize pool of ₮50,000,000 across 4 challenge tracks\n• Direct recruitment opportunities with top tech companies and VC funds\n• Complimentary high-speed fiber internet, meals, energy drinks, and rest pods.",
      startDate: new Date("2026-09-24T09:00:00.000Z"),
      endDate: new Date("2026-09-26T18:00:00.000Z"),
      startTime: "09:00",
      endTime: "18:00",
      status: "Live",
      isDraft: false,
      venueIndex: 2, // Hub Innovation Center
      images: IMAGES.workshops,
      pricingType: "standard",
      dressCode: "Comfortable Casual / Tech Apparel",
      notes: "Bring your own laptop and charger. Pre-registered teams and solo hackers both welcome.",
      ageRestriction: "ALL",
      refundPolicy: "No Refund"
    },
    {
      eventTitle: "Steppe Wellbeing & Mindful Living Retreat",
      categoryName: "wellness",
      shortdesc: "Immerse yourself in gentle restorative yoga, breathwork resets, herbal sound baths, and nature meditations amidst fresh mountain air.",
      longdesc: "A transformative wellness escape designed to release stress and recalibrate your nervous system.\n• Guided sunrise meditation and mindful movement led by certified masters\n• Acoustic Tibetan singing bowl and Gong sound bath sessions\n• Interactive workshops on herbal nutrition and circadian rhythm optimization\n• Wholesome organic vegetarian farm-to-table lunch included\n• Forest bathing and walking meditation in Bogd Khan National Park.",
      startDate: new Date("2026-09-23T10:00:00.000Z"),
      endDate: new Date("2026-09-25T16:00:00.000Z"),
      startTime: "10:00",
      endTime: "16:00",
      status: "Live",
      isDraft: false,
      venueIndex: 7, // Sky Resort
      images: IMAGES.wellness,
      pricingType: "premium",
      dressCode: "Comfortable athletic / yoga wear",
      notes: "Yoga mats, blocks, and blankets provided on site. Please arrive 15 minutes before sessions.",
      ageRestriction: "ALL",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Mongolian Fintech & Digital Asset Summit 2026",
      categoryName: "finance",
      shortdesc: "The largest national gathering of financial regulators, commercial bank leaders, fintech innovators, and digital asset investors.",
      longdesc: "Explore the transformation of regional banking and cross-border digital payments.\n• Keynotes from central bank policymakers and international fintech leaders\n• Executive panel discussions on instant payment rails, QR standards, and CBDCs\n• Exhibition hall featuring 40+ fintech startups showcasing real-time demos\n• High-stakes pitch arena for seed and Series A fundraising\n• Exclusive networking luncheon and evening VIP cocktail reception.",
      startDate: new Date("2026-09-24T08:30:00.000Z"),
      endDate: new Date("2026-09-24T20:00:00.000Z"),
      startTime: "08:30",
      endTime: "20:00",
      status: "Live",
      isDraft: false,
      venueIndex: 1, // Shangri-La
      images: IMAGES.finance,
      pricingType: "premium",
      dressCode: "Business Formal / Business Casual",
      notes: "Badge pick-up open from 08:00 AM. Simultaneous translation headphones available.",
      ageRestriction: "18+",
      refundPolicy: "1 Day Before"
    },

    // --- 14 UPCOMING EVENTS (Sep 26 to Nov 2026) ---
    {
      eventTitle: "Nomadic Strings: Morin Khuur & Throat Singing Grand Gala",
      categoryName: "music concerts",
      shortdesc: "A breathtaking acoustic celebration of UNESCO-recognized Mongolian heritage with world-renowned Morin Khuur virtuosos and epic overtone singing.",
      longdesc: "Witness traditional instruments meet modern orchestral arrangements in a magnificent concert hall.\n• 40-piece Morin Khuur ensemble conducted by national masters\n• Soul-stirring Khöömei (throat singing) and epic Tuuli story recitations\n• Fusion collaborations blending traditional folk melodies with symphonic strings\n• Commemorative vinyl and artisan souvenir market in the lobby.",
      startDate: new Date("2026-09-26T19:00:00.000Z"),
      endDate: new Date("2026-09-26T22:30:00.000Z"),
      startTime: "19:00",
      endTime: "22:30",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 5, // State Opera & Ballet
      images: IMAGES.concert,
      pricingType: "premium",
      dressCode: "Traditional Deel / Formal Evening",
      notes: "Doors close promptly at 19:00. Late seating during intermission only.",
      ageRestriction: "ALL",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Sunrise Hatha Yoga & Crystal Sound Bath by the Tuul River",
      categoryName: "wellness",
      shortdesc: "Greet the crisp weekend morning with energizing yoga flow, guided breathwork, and healing acoustic crystal vibrations.",
      longdesc: "Recharge body and soul in nature.\n• 75-minute gentle Hatha flow suitable for beginners and seasoned yogis\n• 45-minute harmonic crystal singing bowl immersion\n• Hot herbal tea bar with organic sea buckthorn and wild thyme blends\n• Mindful morning community circle.",
      startDate: new Date("2026-09-27T07:30:00.000Z"),
      endDate: new Date("2026-09-27T10:30:00.000Z"),
      startTime: "07:30",
      endTime: "10:30",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 7, // Sky Resort
      images: IMAGES.wellness,
      pricingType: "standard",
      dressCode: "Warm layered yoga clothes",
      notes: "Bring your own water bottle. Blankets and mats provided.",
      ageRestriction: "ALL",
      refundPolicy: "1 Day Before"
    },
    {
      eventTitle: "Full-Stack System Architecture & Next.js 15 Masterclass",
      categoryName: "workshops",
      shortdesc: "A full-day intensive engineering workshop on micro-frontends, server actions, caching strategies, and production AWS infrastructure.",
      longdesc: "Designed for intermediate to senior software engineers looking to master modern web architecture.\n• Next.js App Router performance tuning and streaming architecture\n• High-throughput MongoDB schema design and query indexing optimization\n• Real-time systems using WebSockets and background event workers\n• Hands-on coding labs with live peer reviews and instructor Q&A\n• Certificate of completion and code repository template access.",
      startDate: new Date("2026-10-02T13:00:00.000Z"),
      endDate: new Date("2026-10-02T18:00:00.000Z"),
      startTime: "13:00",
      endTime: "18:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 2, // Hub Innovation Center
      images: IMAGES.workshops,
      pricingType: "standard",
      dressCode: "Casual",
      notes: "Node.js v20+ and VS Code pre-installation required.",
      ageRestriction: "ALL",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Ulaanbaatar Artisan Coffee Cup & Latte Art Clash 2026",
      categoryName: "social activities",
      shortdesc: "Top baristas and specialty coffee roasters compete head-to-head in espresso sensory tasting, manual brewing, and latte art face-offs.",
      longdesc: "The ultimate celebration for coffee enthusiasts, café owners, and home baristas!\n• National Latte Art throwdown with instant bracket eliminations\n• Single-origin cupping tables featuring specialty beans from Ethiopia, Colombia, and Kenya\n• Home espresso and pour-over brewing workshops led by championship judges\n• Unlimited coffee tastings with admission ticket\n• Pastry pop-ups by premier local bakeries.",
      startDate: new Date("2026-10-03T11:00:00.000Z"),
      endDate: new Date("2026-10-03T18:00:00.000Z"),
      startTime: "11:00",
      endTime: "18:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 6, // Novotel
      images: IMAGES.social,
      pricingType: "standard",
      dressCode: "Casual / Streetwear",
      notes: "Commemorative glass tasting cup provided to all ticket holders.",
      ageRestriction: "ALL",
      refundPolicy: "1 Day Before"
    },
    {
      eventTitle: "Personal Finance, Real Estate & Global ETF Investing",
      categoryName: "finance",
      shortdesc: "Learn actionable wealth building, domestic property investment insights, and tax-efficient international ETF portfolio construction.",
      longdesc: "Take control of your financial future with unbiased expert insights.\n• Building an emergency fund and automated monthly savings system\n• Commercial vs residential real estate opportunities in Ulaanbaatar\n• How to open international brokerage accounts and buy broad-market ETFs\n• Risk mitigation strategies against local currency fluctuations\n• Interactive personal balance sheet workbook and calculator toolkits.",
      startDate: new Date("2026-10-08T18:30:00.000Z"),
      endDate: new Date("2026-10-08T21:30:00.000Z"),
      startTime: "18:30",
      endTime: "21:30",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 1, // Shangri-La
      images: IMAGES.finance,
      pricingType: "standard",
      dressCode: "Business Casual",
      notes: "Notebook and digital spreadsheet access included.",
      ageRestriction: "18+",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Autumn City Tree Planting & Urban Green Walk",
      categoryName: "community events",
      shortdesc: "Join hands with local environmental volunteers to plant 1,000 birch and larch saplings to promote urban clean air and green parks.",
      longdesc: "A family-friendly community day dedicated to making Ulaanbaatar greener.\n• Planting 1,000+ hardy saplings along public park corridors\n• Educational nature walk led by urban botanists and foresters\n• Kid-friendly seed planting and ecology mini-workshops\n• Warm soup, hot tea, and freshly baked bread provided for all volunteers\n• Free participation with voluntary community registration.",
      startDate: new Date("2026-10-10T09:00:00.000Z"),
      endDate: new Date("2026-10-10T14:00:00.000Z"),
      startTime: "09:00",
      endTime: "14:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 0, // Central Cultural Palace
      images: IMAGES.community,
      pricingType: "free",
      dressCode: "Outdoor warm clothing & gardening boots",
      notes: "Shovels, watering cans, and protective gloves will be provided.",
      ageRestriction: "ALL",
      refundPolicy: "No Refund"
    },
    {
      eventTitle: "Electronic Skyline: Sunset Rooftop Showcase",
      categoryName: "music",
      shortdesc: "Top electronic music producers and deep melodic house DJs soundtrack the panoramic city sunset high above Ulaanbaatar.",
      longdesc: "Elevate your weekend with state-of-the-art sound and breathtaking skyline views.\n• 6 hours of curated melodic techno, organic house, and downtempo grooves\n• Bespoke 3D projection mapping and immersive ambient lighting\n• Craft cocktail bars and heated glass panoramic terrace\n• Exclusive back-to-back DJ sets by celebrated underground artists.",
      startDate: new Date("2026-10-12T17:00:00.000Z"),
      endDate: new Date("2026-10-12T23:45:00.000Z"),
      startTime: "17:00",
      endTime: "23:45",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 4, // Zaisan Hill
      images: IMAGES.music,
      pricingType: "standard",
      dressCode: "Trendy / Nightclub Chic",
      notes: "Strict 18+ policy. Coat check available.",
      ageRestriction: "18+",
      refundPolicy: "1 Day Before"
    },
    {
      eventTitle: "Ceramics & Wheel Throwing Artisan Studio Workshop",
      categoryName: "workshops",
      shortdesc: "Hands-on pottery workshop mastering clay preparation, pottery wheel shaping, trimming, and custom glazing techniques.",
      longdesc: "Unleash your creativity and shape tangible art with your own hands.\n• Comprehensive pottery wheel fundamentals with individual wheels for every student\n• Create up to 2 unique ceramic mugs or bowls to take home\n• Expert firing and non-toxic glazing handled by our professional studio\n• Calming, meditative atmosphere with acoustic ambient music.",
      startDate: new Date("2026-10-15T14:00:00.000Z"),
      endDate: new Date("2026-10-15T18:00:00.000Z"),
      startTime: "14:00",
      endTime: "18:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 2, // Hub Innovation Center
      images: IMAGES.workshops,
      pricingType: "standard",
      dressCode: "Casual clothes you don't mind getting clay on",
      notes: "Clay, tools, aprons, and dual kiln firing included in ticket price.",
      ageRestriction: "ALL",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Vocal Mastery & Stage Confidence Intensive Bootcamp",
      categoryName: "workshops",
      shortdesc: "Unlock your authentic vocal range, breath control, pitch accuracy, and charismatic stage presence with leading vocal coaches.",
      longdesc: "Designed for aspiring singers, public speakers, actors, and content creators.\n• Diaphragmatic breathing techniques to build stamina and eliminate vocal fatigue\n• Expanding vocal range safely without strain or cracking\n• Overcoming performance anxiety through body grounding and stage psychology\n• Live micro-performance sessions with immediate constructive feedback.",
      startDate: new Date("2026-10-18T10:00:00.000Z"),
      endDate: new Date("2026-10-18T16:00:00.000Z"),
      startTime: "10:00",
      endTime: "16:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 0, // Central Cultural Palace
      images: IMAGES.workshops,
      pricingType: "standard",
      dressCode: "Comfortable flexible clothing",
      notes: "Bring your favorite song lyrics printed or on tablet.",
      ageRestriction: "ALL",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Contemporary Mongolian Fine Art & Wine Gallery Gala",
      categoryName: "social activities",
      shortdesc: "An exclusive vernissage showcasing contemporary paintings, bronze sculptures, and mixed-media photography alongside wine pairings.",
      longdesc: "Immerse yourself in modern Mongolian visual expression.\n• Exhibition of 50+ original works by 15 leading and emerging Mongolian artists\n• Live artist talks and guided curator tours explaining modern nomadic motifs\n• Classical string quartet accompaniment throughout the evening\n• Silent auction with proceeds supporting youth art scholarships.",
      startDate: new Date("2026-10-22T19:00:00.000Z"),
      endDate: new Date("2026-10-22T22:30:00.000Z"),
      startTime: "19:00",
      endTime: "22:30",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 1, // Shangri-La
      images: IMAGES.social,
      pricingType: "premium",
      dressCode: "Black Tie Optional / Elegant Formal",
      notes: "Catalog and complimentary champagne glass included upon arrival.",
      ageRestriction: "18+",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Altai Sound Revival: Folk Metal & Hard Rock Fest",
      categoryName: "music concerts",
      shortdesc: "High-octane fusion of thunderous drums, distorted electric guitar riffs, deep throat singing, and galloping Morin Khuur horsepower.",
      longdesc: "The loudest and proudest live rock celebration in Mongolia!\n• 5 explosive folk rock and heavy metal bands taking the arena stage\n• Monumental pyrotechnic displays and custom synchronized lighting\n• Dedicated mosh pit and elevated seated viewing zones\n• Band merchandise village featuring t-shirts, patches, and autographed albums.",
      startDate: new Date("2026-10-25T20:00:00.000Z"),
      endDate: new Date("2026-10-26T01:30:00.000Z"),
      startTime: "20:00",
      endTime: "01:30",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 3, // UG Arena
      images: IMAGES.concert,
      pricingType: "standard",
      dressCode: "Rock / Metal / Leather / Band Tees",
      notes: "Hearing protection earplugs available at information booth. Age 16+.",
      ageRestriction: "ALL",
      refundPolicy: "1 Day Before"
    },
    {
      eventTitle: "Wim Hof Breathwork, Ice Immersion & Vitality Summit",
      categoryName: "wellness",
      shortdesc: "Discover the therapeutic power of controlled deep breathing, deliberate cold exposure, and focused mental resilience.",
      longdesc: "Master your physiology with certified cold-therapy instructors.\n• In-depth neurobiology lecture on cold-shock proteins and immune enhancement\n• Guided 4-round deep oxygenation breathwork session\n• Supervised 2-to-3 minute ice bath immersion with breath coaching\n• Post-immersion dynamic warm-up and herbal tea celebration.",
      startDate: new Date("2026-10-31T09:00:00.000Z"),
      endDate: new Date("2026-10-31T13:00:00.000Z"),
      startTime: "09:00",
      endTime: "13:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 7, // Sky Resort
      images: IMAGES.wellness,
      pricingType: "standard",
      dressCode: "Swimwear, warm bathrobe, flip flops, and thick winter coat for after",
      notes: "Health waiver required. Not recommended during pregnancy or for severe cardiovascular conditions.",
      ageRestriction: "18+",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Angel Investors & Early-Stage Startup Pitch Arena",
      categoryName: "finance",
      shortdesc: "12 vetted seed-stage tech startups pitch live to 25+ accredited angel investors, VC funds, and regional family offices.",
      longdesc: "Connecting high-potential tech founders with strategic smart capital.\n• 12 live 5-minute pitches followed by 5-minute tough investor Q&A\n• Keynote on early-stage valuation multiples and term sheet structuring\n• Dedicated private 1-on-1 breakout meeting booths for interested investors\n• Networking reception with premium wine and canapés.",
      startDate: new Date("2026-11-05T14:00:00.000Z"),
      endDate: new Date("2026-11-05T19:00:00.000Z"),
      startTime: "14:00",
      endTime: "19:00",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 1, // Shangri-La
      images: IMAGES.finance,
      pricingType: "premium",
      dressCode: "Business Professional",
      notes: "Accredited investor and founder verification required upon registration.",
      ageRestriction: "18+",
      refundPolicy: "1 Day Before"
    },
    {
      eventTitle: "International Board Games & Social Networking Mixer",
      categoryName: "community events",
      shortdesc: "Unplug from digital screens and connect through strategy board games, party games, delicious appetizers, and friendly competition.",
      longdesc: "A warm and lively social evening bringing locals and expats together.\n• Library of 80+ modern board games: Catan, Ticket to Ride, Wingspan, Avalon, and more\n• Dedicated game masters on hand to explain rules in minutes\n• Casual tournament with fun prizes and commemorative trophies\n• Craft beer, cider, non-alcoholic mocktails, and slider platters available.",
      startDate: new Date("2026-11-12T18:30:00.000Z"),
      endDate: new Date("2026-11-12T22:30:00.000Z"),
      startTime: "18:30",
      endTime: "22:30",
      status: "Upcoming",
      isDraft: false,
      venueIndex: 6, // Novotel
      images: IMAGES.community,
      pricingType: "standard",
      dressCode: "Casual & Friendly",
      notes: "Solo attendees will be matched with welcoming game tables immediately.",
      ageRestriction: "ALL",
      refundPolicy: "1 Day Before"
    },

    // --- 5 PAST EVENTS (Aug to mid-Sep 2026) ---
    {
      eventTitle: "Ulaanbaatar Summer Acoustic Sunset Live 2026",
      categoryName: "music",
      shortdesc: "Intimate outdoor acoustic guitar sessions, indie folk voices, and cozy campfire seating celebrating warm summer memories.",
      longdesc: "A deeply nostalgic summer evening under open skies.\n• 6 acclaimed local indie songwriters performing stripped-down acoustic sets\n• Campfire storytelling and acoustic sing-along moments\n• Fresh fruit lemonades and hand-crafted gourmet burgers\n• A stunning end-of-summer gathering that brought 500+ attendees together.",
      startDate: new Date("2026-08-15T18:00:00.000Z"),
      endDate: new Date("2026-08-15T22:00:00.000Z"),
      startTime: "18:00",
      endTime: "22:00",
      status: "Past",
      isDraft: false,
      venueIndex: 4, // Zaisan Hill
      images: IMAGES.music,
      pricingType: "standard",
      dressCode: "Summer Casual",
      notes: "Completed event.",
      ageRestriction: "ALL",
      refundPolicy: "No Refund"
    },
    {
      eventTitle: "Pilates, Posture & Functional Mobility Intensive",
      categoryName: "wellness",
      shortdesc: "A high-precision functional movement clinic correcting posture alignment, strengthening core musculature, and eliminating neck stiffness.",
      longdesc: "Comprehensive physical therapy and Pilates workshop.\n• Postural diagnostic screenings for every attendee\n• Resistance band conditioning and pelvic stability routines\n• Spine decompression and spinal mobility protocols\n• Take-home 15-minute daily exercise program booklet.",
      startDate: new Date("2026-08-28T09:00:00.000Z"),
      endDate: new Date("2026-08-28T13:00:00.000Z"),
      startTime: "09:00",
      endTime: "13:00",
      status: "Past",
      isDraft: false,
      venueIndex: 6, // Novotel
      images: IMAGES.wellness,
      pricingType: "standard",
      dressCode: "Athletic activewear",
      notes: "Completed event.",
      ageRestriction: "ALL",
      refundPolicy: "No Refund"
    },
    {
      eventTitle: "Venture Capital & Seed Funding Forum 2026",
      categoryName: "finance",
      shortdesc: "Leading Central Asian venture capital partners shared valuation metrics, syndication models, and exit strategies for regional startups.",
      longdesc: "High-level venture conference with over 200 accredited investors and institutional leaders.\n• Keynotes on regional macroeconomic trends and VC deal flow in 2026\n• LP and GP panel discussions on cross-border fund setup\n• Case studies of successful local scale-ups expanding into Southeast Asia.",
      startDate: new Date("2026-09-04T13:00:00.000Z"),
      endDate: new Date("2026-09-04T18:30:00.000Z"),
      startTime: "13:00",
      endTime: "18:30",
      status: "Past",
      isDraft: false,
      venueIndex: 1, // Shangri-La
      images: IMAGES.finance,
      pricingType: "premium",
      dressCode: "Business Formal",
      notes: "Completed event.",
      ageRestriction: "18+",
      refundPolicy: "No Refund"
    },
    {
      eventTitle: "Summer Night Cinema & Film Discussion Under the Stars",
      categoryName: "social activities",
      shortdesc: "Outdoor screening of award-winning Mongolian and international cinema classics followed by a director Q&A under the open night sky.",
      longdesc: "A magical open-air cinematic evening.\n• Giant LED screen showcase of remastered historical Mongolian cinema\n• Live post-film panel featuring film directors and screenwriters\n• Free gourmet popcorn and hot apple cider for all guests.",
      startDate: new Date("2026-09-12T19:30:00.000Z"),
      endDate: new Date("2026-09-12T23:00:00.000Z"),
      startTime: "19:30",
      endTime: "23:00",
      status: "Past",
      isDraft: false,
      venueIndex: 0, // Central Cultural Palace
      images: IMAGES.social,
      pricingType: "standard",
      dressCode: "Warm casual layers",
      notes: "Completed event.",
      ageRestriction: "ALL",
      refundPolicy: "No Refund"
    },
    {
      eventTitle: "Youth Tech Innovation & Hackathon Demo Finals",
      categoryName: "community events",
      shortdesc: "High school and university teams presented functional robotics, AI apps, and clean-tech prototypes after 4 weeks of incubator mentorship.",
      longdesc: "Inspiring youth innovation showcase.\n• 15 youth finalist teams pitching interactive prototypes to industry judges\n• Robotics battle showcase and drone programming demonstrations\n• Award ceremony and educational hardware kit distributions.",
      startDate: new Date("2026-09-18T10:00:00.000Z"),
      endDate: new Date("2026-09-19T17:00:00.000Z"),
      startTime: "10:00",
      endTime: "17:00",
      status: "Past",
      isDraft: false,
      venueIndex: 2, // Hub Innovation Center
      images: IMAGES.community,
      pricingType: "free",
      dressCode: "Casual",
      notes: "Completed event.",
      ageRestriction: "ALL",
      refundPolicy: "No Refund"
    },

    // --- 2 DRAFT EVENTS (Realistic upcoming drafts for test editing) ---
    {
      eventTitle: "Winter Solstice Classical Symphony Gala [Draft]",
      categoryName: "music concerts",
      shortdesc: "A spectacular winter celebration featuring Tchaikovsky's Nutcracker and classical Mongolian orchestral compositions.",
      longdesc: "Draft concept for late December gala. Program lineup and soloist invitations currently pending confirmation.",
      startDate: new Date("2026-12-21T19:00:00.000Z"),
      endDate: new Date("2026-12-21T22:00:00.000Z"),
      startTime: "19:00",
      endTime: "22:00",
      status: "Upcoming",
      isDraft: true,
      venueIndex: 5, // State Opera & Ballet
      images: IMAGES.concert,
      pricingType: "premium",
      dressCode: "Formal Evening",
      notes: "Internal draft - not yet published.",
      ageRestriction: "ALL",
      refundPolicy: "7 Days Before"
    },
    {
      eventTitle: "Corporate Tax Planning & Crypto Compliance 2027 [Draft]",
      categoryName: "finance",
      shortdesc: "Annual regulatory briefing on upcoming corporate tax updates, digital asset reporting, and auditing standards.",
      longdesc: "Draft schedule for annual financial advisory seminar.",
      startDate: new Date("2027-01-15T14:00:00.000Z"),
      endDate: new Date("2027-01-15T18:00:00.000Z"),
      startTime: "14:00",
      endTime: "18:00",
      status: "Upcoming",
      isDraft: true,
      venueIndex: 6, // Novotel
      images: IMAGES.finance,
      pricingType: "standard",
      dressCode: "Business Formal",
      notes: "Internal draft - speaker confirmation in progress.",
      ageRestriction: "18+",
      refundPolicy: "1 Day Before"
    }
  ];

  console.log(`Prepared ${rawEvents.length} events for insertion.`);

  const eventsToInsert = rawEvents.map((e, idx) => {
    const venue = VENUES[e.venueIndex % VENUES.length];
    const catId = getCatId(e.categoryName);
    const tickets = createTickets(e.pricingType);
    const isFree = e.pricingType === "free";

    // Format addOns string format matching backend convention:
    // Name|Desc|Price|Qty|SalesStart|SalesEnd||...
    const addOns = tickets.map(t => 
      `${t.ticketName}|${t.ticketShortDesc.replace(/[\r\n]+/g, ' ')}|${t.price}|${t.qty}|${t.salesStart.toISOString().split('T')[0]}|${t.salesEnd.toISOString().split('T')[0]}`
    ).join('||');

    const poster = e.images[0];
    const mediaLinks = e.images.slice(1);

    return {
      _id: new mongoose.Types.ObjectId(),
      eventTitle: e.eventTitle,
      eventCategory: catId,
      shortdesc: e.shortdesc,
      longdesc: e.longdesc,
      posterImage: [poster],
      mediaLinks: mediaLinks,
      shortTeaserVideo: [],
      venueName: venue.venueName,
      venueAddress: venue.venueAddress,
      startDate: e.startDate,
      endDate: e.endDate,
      startTime: e.startTime,
      endTime: e.endTime,
      timeZone: "Asia/Ulaanbaatar",
      tickets: tickets,
      refundPolicy: e.refundPolicy,
      addOns: addOns,
      visibility: "PUBLIC",
      ageRestriction: e.ageRestriction,
      showAttendees: true,
      notes: e.notes,
      dressCode: e.dressCode,
      isFreeEvent: isFree,
      fetcherEvent: idx % 6 === 0, // Some featured
      isFeatured: idx % 6 === 0,
      featuredExpiry: idx % 6 === 0 ? new Date("2026-11-01T00:00:00.000Z") : null,
      featureEventFee: 0,
      isDraft: e.isDraft,
      activePromotionPackage: null,
      status: e.status,
      addToSlider: idx % 5 === 0,
      ReservedExternally: Math.floor(Math.random() * 5),
      assignedStaff: [],
      createdBy: organizer._id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  const result = await Event.collection.insertMany(eventsToInsert);
  console.log(`Successfully seeded ${result.insertedCount} events!`);

  const breakdown = await Event.aggregate([
    { $match: { createdBy: organizer._id } },
    { $group: { _id: { status: "$status", isDraft: "$isDraft" }, count: { $sum: 1 } } }
  ]);
  console.log("Events Breakdown for test3@yopmail.com:", breakdown);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

seed().catch(console.error);
