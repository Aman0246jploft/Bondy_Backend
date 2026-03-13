/**
 * seedEventsOnly.js
 * -----------------------------------------------------------
 * Standalone seeder that:
 *  1. Fetches (or creates) event-type categories from the DB.
 *  2. Upserts 2 organiser seed-users.
 *  3. Inserts 25+ richly-varied event documents that exercise
 *     EVERY variation in the Event schema:
 *       • status  : Upcoming / Live / Past
 *       • ageRestriction.type : ALL / MIN_AGE / RANGE
 *       • ticket price : free (0) and paid variants
 *       • accessAndPrivacy : public (false) and private (true)
 *       • isFeatured / fetcherEvent flags
 *       • dressCode
 *       • multiple cities & countries (for nearYou / city filters)
 *       • addOns, refundPolicy, mediaLinks, shortTeaserVideo
 *       • filter coverage : today / thisWeek / thisWeekend /
 *                           thisYear / nextWeek / upcoming / past / live
 *
 * Run:
 *   node script/seedEventsOnly.js
 * -----------------------------------------------------------
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env") });

const { User, Category, Event } = require("../db/index");
const { roleId } = require("../utils/Role");

// ─── Unsplash poster images provided by the user ────────────────────────────
const IMAGES = [
  "https://plus.unsplash.com/premium_photo-1661306437817-8ab34be91e0c?w=500&auto=format&fit=crop&q=60",
  "https://plus.unsplash.com/premium_photo-1664474653221-8412b8dfca3e?w=500&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1541445976433-f466f228a409?w=500&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=500&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1670028514318-0ac718c0590d?w=500&auto=format&fit=crop&q=60",
];

// helper – pick rotating image
const img = (i) => IMAGES[i % IMAGES.length];

// ─── Seed organiser accounts ─────────────────────────────────────────────────
const ORGANISER_EMAILS = [
  "seed.organiser1@bondy.dev",
  "seed.organiser2@bondy.dev",
];

// ─── Event categories to ensure exist ────────────────────────────────────────
const CATEGORY_NAMES = [
  "Music",
  "Art",
  "Food",
  "Sports",
  "Technology",
  "Wellness",
  "Comedy",
  "Networking",
];

// ─── Convenient date helpers ──────────────────────────────────────────────────
const now = new Date();

const daysFromNow = (n) => {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d;
};

const hoursFromNow = (h) => {
  const d = new Date(now);
  d.setHours(d.getHours() + h);
  return d;
};

// Get next Saturday
const getNextSaturday = () => {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 6 ? 7 : 6 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(10, 0, 0, 0);
  return d;
};

// Get next Sunday
const getNextSunday = () => {
  const d = getNextSaturday();
  d.setDate(d.getDate() + 1);
  return d;
};

// Monday of next week
const getNextMonday = () => {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
};

// ─── Build event documents ────────────────────────────────────────────────────
/**
 * @param {Object[]} cats   - array of saved Category docs (type === "event")
 * @param {ObjectId} org1   - organiser 1 _id
 * @param {ObjectId} org2   - organiser 2 _id
 */
const buildEvents = (cats, org1, org2) => {
  const c = (name) => cats.find((c) => c.name === name.toLowerCase())?._id ?? cats[0]._id;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const nextSat = getNextSaturday();
  const nextSun = getNextSunday();
  const nextMon = getNextMonday();

  return [
    // ── 1. PAST – Music – ALL ages – paid ──────────────────────────────────
    {
      eventTitle: "Retro Music Night",
      eventCategory: c("Music"),
      posterImage: [img(0), img(1)],
      shortdesc: "A night full of classic 80s & 90s hits performed live.",
      longdesc:
        "Join us for an unforgettable evening of retro music featuring live bands covering the biggest hits from the 80s and 90s. Expect dazzling light shows, themed cocktails, and pure nostalgia.",
      tags: ["music", "retro", "live-band", "80s", "90s"],
      venueName: "The Grand Amphitheatre",
      venueAddress: {
        type: "Point",
        coordinates: [72.8777, 19.076], // Mumbai
        city: "Mumbai",
        country: "India",
        address: "Marine Drive, Nariman Point",
      },
      startDate: daysFromNow(-15),
      endDate: daysFromNow(-14),
      startTime: "19:00",
      endTime: "23:00",
      ticketName: "Standard Pass",
      ticketQtyAvailable: 0,
      ticketSelesStartDate: daysFromNow(-30),
      ticketSelesEndDate: daysFromNow(-15),
      ticketPrice: 599,
      totalTickets: 500,
      refundPolicy: "No refund after purchase.",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: false,
      fetcherEvent: false,
      status: "Past",
      createdBy: org1,
      totalAttendees: 487,
    },

    // ── 2. PAST – Art – MIN_AGE 18 – paid ──────────────────────────────────
    {
      eventTitle: "Abstract Art Gala",
      eventCategory: c("Art"),
      posterImage: [img(2)],
      shortdesc: "An exclusive adults-only contemporary art exhibition.",
      longdesc:
        "Curated by leading artists from across the globe, this gala showcases thought-provoking abstract art. Wine and cheese reception included.",
      tags: ["art", "gala", "contemporary", "adults"],
      venueName: "City Art Museum",
      venueAddress: {
        type: "Point",
        coordinates: [77.209, 28.6139], // Delhi
        city: "New Delhi",
        country: "India",
        address: "Janpath, Connaught Place",
      },
      startDate: daysFromNow(-10),
      endDate: daysFromNow(-9),
      startTime: "18:00",
      endTime: "22:00",
      ticketName: "VIP Entry",
      ticketQtyAvailable: 0,
      ticketSelesStartDate: daysFromNow(-25),
      ticketSelesEndDate: daysFromNow(-10),
      ticketPrice: 1200,
      totalTickets: 200,
      refundPolicy: "50% refund if cancelled 7 days before.",
      dressCode: "Formal",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 18 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Past",
      createdBy: org2,
      totalAttendees: 178,
    },

    // ── 3. PAST – Food – RANGE 12-60 – free ────────────────────────────────
    {
      eventTitle: "Farm-to-Table Family Feast",
      eventCategory: c("Food"),
      posterImage: [img(3)],
      shortdesc: "A family-friendly food festival for all ages 12–60.",
      longdesc:
        "Discover local farm produce transformed into exquisite dishes by top chefs. Activities for children and adults alike.",
      tags: ["food", "family", "festival", "organic"],
      venueName: "Eco Park",
      venueAddress: {
        type: "Point",
        coordinates: [88.3639, 22.5726], // Kolkata
        city: "Kolkata",
        country: "India",
        address: "Eco Park, New Town",
      },
      startDate: daysFromNow(-7),
      endDate: daysFromNow(-6),
      startTime: "11:00",
      endTime: "20:00",
      ticketName: "Free Entry",
      ticketQtyAvailable: 0,
      ticketSelesStartDate: daysFromNow(-20),
      ticketSelesEndDate: daysFromNow(-7),
      ticketPrice: 0,
      totalTickets: 1000,
      addOns: "Paid food stalls, craft beer garden",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "RANGE", minAge: 12, maxAge: 60 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Past",
      createdBy: org1,
      totalAttendees: 923,
    },

    // ── 4. PAST – Sports – ALL – paid – featured ────────────────────────────
    {
      eventTitle: "City Marathon Championship",
      eventCategory: c("Sports"),
      posterImage: [img(4), img(0)],
      shortdesc: "Annual 42km city marathon open to all runners.",
      longdesc:
        "One of the most prestigious marathons in the country. Run through iconic city landmarks with live music at every km mark.",
      tags: ["marathon", "running", "sports", "fitness"],
      venueName: "Rajpath Boulevard",
      venueAddress: {
        type: "Point",
        coordinates: [77.2195, 28.6229], // Delhi
        city: "New Delhi",
        country: "India",
        address: "Rajpath, India Gate",
      },
      startDate: daysFromNow(-5),
      endDate: daysFromNow(-5),
      startTime: "06:00",
      endTime: "12:00",
      ticketName: "Runner's Bib",
      ticketQtyAvailable: 0,
      ticketSelesStartDate: daysFromNow(-60),
      ticketSelesEndDate: daysFromNow(-6),
      ticketPrice: 800,
      totalTickets: 5000,
      refundPolicy: "No refund after registration.",
      dressCode: "Sports Wear",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 16 },
      isFeatured: true,
      fetcherEvent: false,
      status: "Past",
      createdBy: org2,
      totalAttendees: 4890,
    },

    // ── 5. PAST – Comedy – ALL – paid ──────────────────────────────────────
    {
      eventTitle: "Stand-Up Spectacular",
      eventCategory: c("Comedy"),
      posterImage: [img(1)],
      shortdesc: "Four top comedians, one epic night of laughter.",
      longdesc:
        "The biggest names in Indian stand-up comedy take the stage for a 3-hour laugh riot. Suitable for adults.",
      tags: ["comedy", "stand-up", "laughter", "entertainment"],
      venueName: "Laugh Factory Arena",
      venueAddress: {
        type: "Point",
        coordinates: [80.2707, 13.0827], // Chennai
        city: "Chennai",
        country: "India",
        address: "Anna Salai, Teynampet",
      },
      startDate: daysFromNow(-3),
      endDate: daysFromNow(-3),
      startTime: "20:00",
      endTime: "23:00",
      ticketName: "Comedy Pass",
      ticketQtyAvailable: 5,
      ticketSelesStartDate: daysFromNow(-15),
      ticketSelesEndDate: daysFromNow(-3),
      ticketPrice: 999,
      totalTickets: 400,
      refundPolicy: "Non-refundable.",
      dressCode: "Smart Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 18 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Past",
      createdBy: org1,
      totalAttendees: 395,
    },

    // ── 6. LIVE – Music – ALL – paid – featured ─────────────────────────────
    {
      eventTitle: "Neon Beats Music Festival",
      eventCategory: c("Music"),
      posterImage: [img(0), img(2), img(4)],
      shortdesc: "3-day electronic music festival happening RIGHT NOW.",
      longdesc:
        "A three-day immersive EDM festival featuring 30+ DJs across 5 stages. Camping, food courts, and art installations included.",
      tags: ["EDM", "festival", "music", "dance", "camping"],
      venueName: "Jio World Convention Centre",
      venueAddress: {
        type: "Point",
        coordinates: [72.8269, 19.0548], // Mumbai BKC
        city: "Mumbai",
        country: "India",
        address: "BKC, Bandra East",
      },
      startDate: daysFromNow(-1),
      endDate: daysFromNow(2),
      startTime: "15:00",
      endTime: "03:00",
      ticketName: "Full Festival Pass",
      ticketQtyAvailable: 120,
      ticketSelesStartDate: daysFromNow(-45),
      ticketSelesEndDate: daysFromNow(2),
      ticketPrice: 3999,
      totalTickets: 10000,
      addOns: "VIP Lounge +₹2000, Camping Pass +₹500",
      refundPolicy: "No refund. Transfer allowed.",
      dressCode: "Neon / Rave Wear",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 18 },
      isFeatured: true,
      fetcherEvent: true,
      status: "Live",
      mediaLinks: [img(1), img(3)],
      shortTeaserVideo: [],
      createdBy: org2,
      totalAttendees: 9880,
    },

    // ── 7. LIVE – Wellness – ALL – free ────────────────────────────────────
    {
      eventTitle: "Morning Yoga & Meditation in the Park",
      eventCategory: c("Wellness"),
      posterImage: [img(3)],
      shortdesc: "Free open-air yoga session – happening this morning!",
      longdesc:
        "Start your day right with certified yoga instructors guiding you through sunrise yoga and mindfulness meditation in a serene park setting.",
      tags: ["yoga", "wellness", "meditation", "free", "outdoor"],
      venueName: "Cubbon Park",
      venueAddress: {
        type: "Point",
        coordinates: [77.5945, 12.9716], // Bangalore
        city: "Bangalore",
        country: "India",
        address: "Cubbon Park, Kasturba Road",
      },
      startDate: hoursFromNow(-2),
      endDate: hoursFromNow(2),
      startTime: "06:00",
      endTime: "08:00",
      ticketName: "Free Registration",
      ticketQtyAvailable: 200,
      ticketSelesStartDate: daysFromNow(-3),
      ticketSelesEndDate: hoursFromNow(1),
      ticketPrice: 0,
      totalTickets: 300,
      addOns: "Yoga mat rental ₹50",
      dressCode: "Comfortable Sports Wear",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: false,
      fetcherEvent: false,
      status: "Live",
      createdBy: org1,
      totalAttendees: 245,
    },

    // ── 8. TODAY – Technology – ALL – paid ─────────────────────────────────
    {
      eventTitle: "AI & Startups Summit 2026",
      eventCategory: c("Technology"),
      posterImage: [img(2)],
      shortdesc: "The premier AI summit – today only!",
      longdesc:
        "Hear from top AI researchers and startup founders on the future of artificial intelligence, machine learning, and product development.",
      tags: ["AI", "startups", "technology", "summit", "innovation"],
      venueName: "Hyderabad International Convention Centre",
      venueAddress: {
        type: "Point",
        coordinates: [78.3792, 17.4065], // Hyderabad
        city: "Hyderabad",
        country: "India",
        address: "HICC, Novotel Complex, Madhapur",
      },
      startDate: startOfToday,
      endDate: endOfToday,
      startTime: "09:00",
      endTime: "18:00",
      ticketName: "Delegate Pass",
      ticketQtyAvailable: 50,
      ticketSelesStartDate: daysFromNow(-30),
      ticketSelesEndDate: endOfToday,
      ticketPrice: 2500,
      totalTickets: 800,
      addOns: "Workshop add-on ₹1500",
      refundPolicy: "Full refund if cancelled 48hrs before.",
      dressCode: "Business Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 18 },
      isFeatured: true,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 9. TODAY – Networking – ALL – free ─────────────────────────────────
    {
      eventTitle: "Evening Professionals Mixer",
      eventCategory: c("Networking"),
      posterImage: [img(4)],
      shortdesc: "Free networking happy hour – tonight!",
      longdesc:
        "Connect with professionals from diverse industries over complimentary drinks and appetisers. Grow your network in a relaxed setting.",
      tags: ["networking", "professionals", "mixer", "careers"],
      venueName: "WeWork Prestige Central",
      venueAddress: {
        type: "Point",
        coordinates: [77.5995, 12.9716], // Bangalore
        city: "Bangalore",
        country: "India",
        address: "Prestige Central, Residency Road",
      },
      startDate: (() => { const d = new Date(now); d.setHours(18, 0, 0, 0); return d; })(),
      endDate: (() => { const d = new Date(now); d.setHours(21, 0, 0, 0); return d; })(),
      startTime: "18:00",
      endTime: "21:00",
      ticketName: "Free",
      ticketQtyAvailable: 80,
      ticketSelesStartDate: daysFromNow(-5),
      ticketSelesEndDate: (() => { const d = new Date(now); d.setHours(17, 0, 0, 0); return d; })(),
      ticketPrice: 0,
      totalTickets: 100,
      dressCode: "Smart Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 10. THIS WEEK – Food – RANGE 5-70 – paid ───────────────────────────
    {
      eventTitle: "International Street Food Week",
      eventCategory: c("Food"),
      posterImage: [img(1), img(3)],
      shortdesc: "7-day street food extravaganza from 50 cuisines.",
      longdesc:
        "Explore over 200 food stalls representing 50 countries. Live cooking demonstrations, food challenges, and cultural performances.",
      tags: ["food", "street-food", "international", "cuisine", "festival"],
      venueName: "MMRDA Grounds",
      venueAddress: {
        type: "Point",
        coordinates: [72.8656, 19.0596], // Mumbai BKC
        city: "Mumbai",
        country: "India",
        address: "MMRDA Grounds, BKC",
      },
      startDate: daysFromNow(1),
      endDate: daysFromNow(5),
      startTime: "12:00",
      endTime: "22:00",
      ticketName: "Weekend Pass",
      ticketQtyAvailable: 2000,
      ticketSelesStartDate: daysFromNow(-10),
      ticketSelesEndDate: daysFromNow(4),
      ticketPrice: 299,
      totalTickets: 5000,
      addOns: "Food tokens ₹500 pack",
      refundPolicy: "50% refund up to 2 days before.",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "RANGE", minAge: 5, maxAge: 70 },
      isFeatured: true,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 11. THIS WEEK – Art – ALL – free ───────────────────────────────────
    {
      eventTitle: "Open Studio Art Walk",
      eventCategory: c("Art"),
      posterImage: [img(2)],
      shortdesc: "Free walking tour of 12 open artist studios this week.",
      longdesc:
        "Step inside the creative spaces of 12 established and emerging artists. Watch them work, ask questions, and purchase original pieces.",
      tags: ["art", "studio", "walk", "creative", "gallery"],
      venueName: "Dharavi Art District",
      venueAddress: {
        type: "Point",
        coordinates: [72.855, 19.044], // Dharavi, Mumbai
        city: "Mumbai",
        country: "India",
        address: "Dharavi, Sion",
      },
      startDate: daysFromNow(2),
      endDate: daysFromNow(3),
      startTime: "10:00",
      endTime: "17:00",
      ticketName: "Free",
      ticketQtyAvailable: 500,
      ticketSelesStartDate: daysFromNow(-1),
      ticketSelesEndDate: daysFromNow(2),
      ticketPrice: 0,
      totalTickets: 500,
      dressCode: "Any",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 12. THIS WEEKEND – Music – ALL – paid ──────────────────────────────
    {
      eventTitle: "Jazz Under the Stars",
      eventCategory: c("Music"),
      posterImage: [img(0)],
      shortdesc: "An open-air jazz concert this Saturday night.",
      longdesc:
        "Sip on fine wines under a canopy of stars while world-class jazz musicians perform live. Bring your blanket – seating is on the grass.",
      tags: ["jazz", "music", "outdoor", "night", "romantic"],
      venueName: "Lodi Garden Amphitheatre",
      venueAddress: {
        type: "Point",
        coordinates: [77.219, 28.593], // Delhi Lodi
        city: "New Delhi",
        country: "India",
        address: "Lodi Road, Lodi Garden",
      },
      startDate: nextSat,
      endDate: (() => { const d = new Date(nextSat); d.setHours(23, 0, 0, 0); return d; })(),
      startTime: "19:30",
      endTime: "23:00",
      ticketName: "General Seating",
      ticketQtyAvailable: 600,
      ticketSelesStartDate: daysFromNow(-7),
      ticketSelesEndDate: nextSat,
      ticketPrice: 750,
      totalTickets: 800,
      addOns: "Wine pairing ₹1200",
      refundPolicy: "No refund.",
      dressCode: "Smart Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: true,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 13. THIS WEEKEND – Sports – MIN_AGE 10 – free ──────────────────────
    {
      eventTitle: "Kids & Adults Fun Run",
      eventCategory: c("Sports"),
      posterImage: [img(4)],
      shortdesc: "A family 5K fun run this Sunday morning.",
      longdesc:
        "Sign up individually or as a family team for this 5K fun run. Medals for every finisher. Stalls, games, and refreshments post-run.",
      tags: ["fun-run", "family", "5K", "sports", "weekend"],
      venueName: "Nehru Stadium Grounds",
      venueAddress: {
        type: "Point",
        coordinates: [77.2373, 28.5669], // Delhi
        city: "New Delhi",
        country: "India",
        address: "Nehru Stadium, Pragati Vihar",
      },
      startDate: nextSun,
      endDate: (() => { const d = new Date(nextSun); d.setHours(12, 0, 0, 0); return d; })(),
      startTime: "07:00",
      endTime: "12:00",
      ticketName: "Free Registration",
      ticketQtyAvailable: 1500,
      ticketSelesStartDate: daysFromNow(-5),
      ticketSelesEndDate: nextSun,
      ticketPrice: 0,
      totalTickets: 2000,
      dressCode: "Sports Wear",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 10 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 14. NEXT WEEK – Technology – ALL – paid ─────────────────────────────
    {
      eventTitle: "Blockchain & Web3 Conclave",
      eventCategory: c("Technology"),
      posterImage: [img(2), img(0)],
      shortdesc: "Deep dive into Web3 technologies next week.",
      longdesc:
        "Industry leaders, developers, and investors converge to discuss DeFi, NFTs, smart contracts, and the decentralised web.",
      tags: ["blockchain", "web3", "DeFi", "NFT", "technology"],
      venueName: "HITEX Exhibition Centre",
      venueAddress: {
        type: "Point",
        coordinates: [78.3131, 17.4947], // Hyderabad
        city: "Hyderabad",
        country: "India",
        address: "HITEX, Madhapur",
      },
      startDate: nextMon,
      endDate: (() => { const d = new Date(nextMon); d.setDate(d.getDate() + 2); return d; })(),
      startTime: "09:00",
      endTime: "18:00",
      ticketName: "Developer Pass",
      ticketQtyAvailable: 300,
      ticketSelesStartDate: daysFromNow(-14),
      ticketSelesEndDate: nextMon,
      ticketPrice: 1999,
      totalTickets: 500,
      addOns: "Workshop: Smart Contract Dev ₹999",
      refundPolicy: "Full refund if cancelled 5 days before.",
      dressCode: "Business Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 18 },
      isFeatured: true,
      fetcherEvent: true,
      status: "Upcoming",
      mediaLinks: [img(1)],
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 15. NEXT WEEK – Wellness – RANGE 18-50 – paid ──────────────────────
    {
      eventTitle: "Corporate Wellness Retreat",
      eventCategory: c("Wellness"),
      posterImage: [img(3)],
      shortdesc: "2-day professional wellness retreat in the hills.",
      longdesc:
        "A curated programme of meditation, breathwork, nutrition workshops, and team-building activities designed for working professionals.",
      tags: ["wellness", "retreat", "corporate", "mindfulness"],
      venueName: "Ananda in the Himalayas",
      venueAddress: {
        type: "Point",
        coordinates: [78.1642, 30.0869], // Rishikesh
        city: "Rishikesh",
        country: "India",
        address: "Narendra Nagar, Tehri Garhwal",
      },
      startDate: (() => { const d = new Date(nextMon); d.setDate(d.getDate() + 3); return d; })(),
      endDate: (() => { const d = new Date(nextMon); d.setDate(d.getDate() + 4); return d; })(),
      startTime: "08:00",
      endTime: "20:00",
      ticketName: "Retreat Package",
      ticketQtyAvailable: 40,
      ticketSelesStartDate: daysFromNow(-20),
      ticketSelesEndDate: (() => { const d = new Date(nextMon); d.setDate(d.getDate() + 2); return d; })(),
      ticketPrice: 12000,
      totalTickets: 50,
      addOns: "Private coaching session ₹5000",
      refundPolicy: "50% refund up to 7 days before.",
      dressCode: "Comfortable Yoga Wear",
      accessAndPrivacy: true,
      ageRestriction: { type: "RANGE", minAge: 18, maxAge: 50 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 16. UPCOMING (2 weeks) – Comedy – ALL – paid ────────────────────────
    {
      eventTitle: "The Great Laughter Championship",
      eventCategory: c("Comedy"),
      posterImage: [img(1)],
      shortdesc: "8 comedians compete live – you vote the winner!",
      longdesc:
        "Watch 8 stand-up comedians perform 10-minute sets. The audience votes for the champion who wins the ₹1 lakh prize!",
      tags: ["comedy", "competition", "audience-vote", "live"],
      venueName: "Phoenix Palladium Hall",
      venueAddress: {
        type: "Point",
        coordinates: [72.8258, 18.9929], // Mumbai Lower Parel
        city: "Mumbai",
        country: "India",
        address: "Lower Parel, Phoenix Mills",
      },
      startDate: daysFromNow(14),
      endDate: daysFromNow(14),
      startTime: "20:00",
      endTime: "23:30",
      ticketName: "Comedy Club Seat",
      ticketQtyAvailable: 350,
      ticketSelesStartDate: daysFromNow(-5),
      ticketSelesEndDate: daysFromNow(13),
      ticketPrice: 799,
      totalTickets: 400,
      refundPolicy: "Refund within 48hrs of booking only.",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 16 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 17. UPCOMING – Networking – ALL – paid – private ───────────────────
    {
      eventTitle: "Founders-Only Investment Circle",
      eventCategory: c("Networking"),
      posterImage: [img(4)],
      shortdesc: "Exclusive invite-only event for founders and investors.",
      longdesc:
        "A curated evening of structured networking between verified startup founders and angel investors. Attendance is vetted.",
      tags: ["startups", "founders", "investors", "private", "networking"],
      venueName: "The Leela Palace",
      venueAddress: {
        type: "Point",
        coordinates: [77.2246, 28.5987], // Delhi
        city: "New Delhi",
        country: "India",
        address: "Diplomatic Enclave, Chanakyapuri",
      },
      startDate: daysFromNow(18),
      endDate: daysFromNow(18),
      startTime: "18:30",
      endTime: "22:00",
      ticketName: "Founder's Table",
      ticketQtyAvailable: 20,
      ticketSelesStartDate: daysFromNow(-7),
      ticketSelesEndDate: daysFromNow(16),
      ticketPrice: 5000,
      totalTickets: 30,
      addOns: "1:1 Investor intro ₹3000 extra",
      refundPolicy: "No refund.",
      dressCode: "Formal",
      accessAndPrivacy: true,
      ageRestriction: { type: "MIN_AGE", minAge: 21 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 18. UPCOMING – Music – ALL – free – Kolkata ─────────────────────────
    {
      eventTitle: "Classical Ragas Evening",
      eventCategory: c("Music"),
      posterImage: [img(0), img(2)],
      shortdesc: "Free Hindustani classical music concert at Rabindra Sadan.",
      longdesc:
        "Celebrate the rich tradition of Hindustani classical music with performances by Padma Bhushan recipients and their students.",
      tags: ["classical", "ragas", "hindustani", "free", "music"],
      venueName: "Rabindra Sadan",
      venueAddress: {
        type: "Point",
        coordinates: [88.3479, 22.5576], // Kolkata
        city: "Kolkata",
        country: "India",
        address: "Cathedral Road, B.B.D. Bagh",
      },
      startDate: daysFromNow(21),
      endDate: daysFromNow(21),
      startTime: "17:00",
      endTime: "21:00",
      ticketName: "Free Pass",
      ticketQtyAvailable: 800,
      ticketSelesStartDate: daysFromNow(-2),
      ticketSelesEndDate: daysFromNow(20),
      ticketPrice: 0,
      totalTickets: 1000,
      dressCode: "Traditional / Formal",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 19. UPCOMING – Sports – RANGE 18-40 – paid – Bangalore ─────────────
    {
      eventTitle: "BGMI Esports Open Tournament",
      eventCategory: c("Sports"),
      posterImage: [img(4), img(1)],
      shortdesc: "BGMI squad tournament – ₹5 lakh prize pool!",
      longdesc:
        "Open qualifiers for the national BGMI championship. Register your squad of 4, compete across 6 rounds, and claim the ₹5L prize pool.",
      tags: ["esports", "BGMI", "gaming", "tournament", "prize"],
      venueName: "KTPO Convention Centre",
      venueAddress: {
        type: "Point",
        coordinates: [77.7028, 13.0002], // Bangalore Whitefield
        city: "Bangalore",
        country: "India",
        address: "Whitefield, KTPO",
      },
      startDate: daysFromNow(25),
      endDate: daysFromNow(26),
      startTime: "10:00",
      endTime: "22:00",
      ticketName: "Squad Entry (4 players)",
      ticketQtyAvailable: 128,
      ticketSelesStartDate: daysFromNow(-3),
      ticketSelesEndDate: daysFromNow(23),
      ticketPrice: 2000,
      totalTickets: 256,
      refundPolicy: "No refund after slot confirmation.",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "RANGE", minAge: 18, maxAge: 40 },
      isFeatured: true,
      fetcherEvent: true,
      status: "Upcoming",
      mediaLinks: [img(2)],
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 20. UPCOMING – Art – ALL – paid – Chennai ───────────────────────────
    {
      eventTitle: "Tanjore Painting Masterclass",
      eventCategory: c("Art"),
      posterImage: [img(2)],
      shortdesc: "Learn traditional Tanjore painting from master artists.",
      longdesc:
        "A 2-day intensive masterclass teaching the ancient art of Tanjore painting. All materials provided. Take home your completed artwork.",
      tags: ["art", "tanjore", "masterclass", "traditional", "workshop"],
      venueName: "Cholamandal Artists' Village",
      venueAddress: {
        type: "Point",
        coordinates: [80.2271, 12.9365], // Chennai
        city: "Chennai",
        country: "India",
        address: "Injambakkam, ECR Road",
      },
      startDate: daysFromNow(28),
      endDate: daysFromNow(29),
      startTime: "09:30",
      endTime: "17:30",
      ticketName: "Workshop Seat",
      ticketQtyAvailable: 18,
      ticketSelesStartDate: daysFromNow(-7),
      ticketSelesEndDate: daysFromNow(26),
      ticketPrice: 3500,
      totalTickets: 20,
      addOns: "Premium pigment kit ₹1500",
      refundPolicy: "Full refund 5 days before.",
      dressCode: "Comfortable / Apron provided",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 21. THIS YEAR – Networking – ALL – free – Dubai ────────────────────
    {
      eventTitle: "GITEX Future Stars – Startup Expo",
      eventCategory: c("Networking"),
      posterImage: [img(1), img(4)],
      shortdesc: "International startup networking event in Dubai.",
      longdesc:
        "The world's largest startup exhibition. Meet 3000+ startups, 500+ VCs, and attend 100+ workshops across the 5-day expo.",
      tags: ["GITEX", "startups", "Dubai", "expo", "networking"],
      venueName: "Dubai World Trade Centre",
      venueAddress: {
        type: "Point",
        coordinates: [55.3047, 25.2285], // Dubai
        city: "Dubai",
        country: "UAE",
        address: "Sheikh Zayed Rd, Trade Centre",
      },
      startDate: daysFromNow(35),
      endDate: daysFromNow(39),
      startTime: "10:00",
      endTime: "19:00",
      ticketName: "Visitor Badge",
      ticketQtyAvailable: 50000,
      ticketSelesStartDate: daysFromNow(-30),
      ticketSelesEndDate: daysFromNow(34),
      ticketPrice: 0,
      totalTickets: 100000,
      addOns: "Startup pitch slot ₹15000",
      refundPolicy: "N/A – Free event.",
      dressCode: "Business Formal",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 18 },
      isFeatured: true,
      fetcherEvent: true,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 22. THIS YEAR – Wellness – ALL – paid – London ──────────────────────
    {
      eventTitle: "Mind & Body International Symposium",
      eventCategory: c("Wellness"),
      posterImage: [img(3), img(0)],
      shortdesc: "Global wellness symposium featuring 60 speakers.",
      longdesc:
        "Explore the latest research on mental health, nutrition, sleep science, and holistic healing practices from 60 world-leading experts.",
      tags: ["wellness", "symposium", "mental-health", "global", "london"],
      venueName: "ExCeL London",
      venueAddress: {
        type: "Point",
        coordinates: [-0.0338, 51.5074], // London
        city: "London",
        country: "UK",
        address: "Royal Docks, 1 Western Gateway, E16 1XL",
      },
      startDate: daysFromNow(60),
      endDate: daysFromNow(62),
      startTime: "09:00",
      endTime: "18:00",
      ticketName: "Symposium Delegate",
      ticketQtyAvailable: 1000,
      ticketSelesStartDate: daysFromNow(-15),
      ticketSelesEndDate: daysFromNow(58),
      ticketPrice: 8500,
      totalTickets: 2000,
      addOns: "VIP Gala Dinner ₹3000",
      refundPolicy: "50% refund up to 14 days before.",
      dressCode: "Smart Formal",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: true,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 23. FAR FUTURE – Food – ALL – paid – Singapore ──────────────────────
    {
      eventTitle: "Singapore International Food Festival",
      eventCategory: c("Food"),
      posterImage: [img(3), img(1)],
      shortdesc: "Annual SIFF bringing 40 cuisines under one roof.",
      longdesc:
        "Singapore's most beloved food festival returns with 40 cuisines, celebrity chef cook-offs, and a 5-course Michelin tasting dinner.",
      tags: ["food", "singapore", "festival", "michelin", "cuisine"],
      venueName: "Gardens by the Bay",
      venueAddress: {
        type: "Point",
        coordinates: [103.8638, 1.2816], // Singapore
        city: "Singapore",
        country: "Singapore",
        address: "18 Marina Gardens Dr",
      },
      startDate: daysFromNow(90),
      endDate: daysFromNow(96),
      startTime: "11:00",
      endTime: "22:00",
      ticketName: "Day Entry",
      ticketQtyAvailable: 8000,
      ticketSelesStartDate: daysFromNow(-10),
      ticketSelesEndDate: daysFromNow(89),
      ticketPrice: 1200,
      totalTickets: 10000,
      addOns: "Michelin tasting dinner ₹12000",
      refundPolicy: "Full refund up to 7 days before.",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "RANGE", minAge: 5, maxAge: 80 },
      isFeatured: true,
      fetcherEvent: true,
      status: "Upcoming",
      mediaLinks: [img(2), img(4)],
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 24. UPCOMING – Comedy – ALL – paid – Hyderabad ─────────────────────
    {
      eventTitle: "Chai, Samosas & Stories",
      eventCategory: c("Comedy"),
      posterImage: [img(1)],
      shortdesc: "Intimate storytelling and comedy show – 75 seats only.",
      longdesc:
        "A cozy show where comedians blend stories from everyday Indian life with sharp wit. Chai and samosa snack box included in the ticket.",
      tags: ["comedy", "storytelling", "intimate", "chai", "cozy"],
      venueName: "Lamakaan Cultural Space",
      venueAddress: {
        type: "Point",
        coordinates: [78.4483, 17.4238], // Hyderabad
        city: "Hyderabad",
        country: "India",
        address: "Road No. 6, Banjara Hills",
      },
      startDate: daysFromNow(10),
      endDate: daysFromNow(10),
      startTime: "19:00",
      endTime: "21:30",
      ticketName: "Snack+Show Pass",
      ticketQtyAvailable: 55,
      ticketSelesStartDate: daysFromNow(-2),
      ticketSelesEndDate: daysFromNow(9),
      ticketPrice: 450,
      totalTickets: 75,
      addOns: "Extra samosa box ₹100",
      refundPolicy: "Full refund up to 24hrs before.",
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "MIN_AGE", minAge: 16 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 25. UPCOMING – Technology – RANGE 21-45 – paid – private ───────────
    {
      eventTitle: "CTO Roundtable: Scaling Engineering Teams",
      eventCategory: c("Technology"),
      posterImage: [img(2), img(4)],
      shortdesc: "Closed-door CTO roundtable for senior engineering leaders.",
      longdesc:
        "An exclusive peer-to-peer roundtable for CTOs and VPs of Engineering. Discuss real challenges around team scaling, culture, and tech strategy under Chatham House rules.",
      tags: ["CTO", "leadership", "engineering", "private", "roundtable"],
      venueName: "ITC Grand Chola",
      venueAddress: {
        type: "Point",
        coordinates: [80.2139, 13.0048], // Chennai
        city: "Chennai",
        country: "India",
        address: "63 Mount Road, Guindy",
      },
      startDate: daysFromNow(20),
      endDate: daysFromNow(20),
      startTime: "14:00",
      endTime: "18:00",
      ticketName: "Roundtable Seat",
      ticketQtyAvailable: 8,
      ticketSelesStartDate: daysFromNow(-10),
      ticketSelesEndDate: daysFromNow(18),
      ticketPrice: 10000,
      totalTickets: 15,
      refundPolicy: "Full refund up to 72hrs before.",
      dressCode: "Business Formal",
      accessAndPrivacy: true,
      ageRestriction: { type: "RANGE", minAge: 21, maxAge: 45 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },

    // ── 26. UPCOMING – Music – ALL – free – Bangalore – featured ───────────
    {
      eventTitle: "Indie Bangalore Open Mic",
      eventCategory: c("Music"),
      posterImage: [img(0), img(3)],
      shortdesc: "Free open mic night for indie musicians – all genres welcome.",
      longdesc:
        "Sign up for a 5-minute slot or come to watch. Every genre welcome — acoustic, beatbox, spoken word, or experimental. Hosted every month.",
      tags: ["open-mic", "indie", "music", "free", "bangalore"],
      venueName: "The Humming Tree",
      venueAddress: {
        type: "Point",
        coordinates: [77.6279, 12.978], // Bangalore Indiranagar
        city: "Bangalore",
        country: "India",
        address: "Indiranagar, 100 Feet Road",
      },
      startDate: daysFromNow(7),
      endDate: daysFromNow(7),
      startTime: "19:00",
      endTime: "23:00",
      ticketName: "Free Entry",
      ticketQtyAvailable: 200,
      ticketSelesStartDate: daysFromNow(-1),
      ticketSelesEndDate: daysFromNow(6),
      ticketPrice: 0,
      totalTickets: 250,
      dressCode: "Casual",
      accessAndPrivacy: false,
      ageRestriction: { type: "ALL" },
      isFeatured: true,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org2,
      totalAttendees: 0,
    },

    // ── 27. UPCOMING – Wellness – ALL – paid – Rishikesh ───────────────────
    {
      eventTitle: "200hr Yoga Teacher Training",
      eventCategory: c("Wellness"),
      posterImage: [img(3)],
      shortdesc: "Internationally certified 200-hr YTT intensive program.",
      longdesc:
        "Complete your Yoga Alliance certified 200-hour Teacher Training in the yoga capital of the world. Daily asana, pranayama, philosophy, and anatomy sessions.",
      tags: ["yoga", "teacher-training", "200hr", "rishikesh", "certification"],
      venueName: "Parmarth Niketan Ashram",
      venueAddress: {
        type: "Point",
        coordinates: [78.3022, 30.1158], // Rishikesh
        city: "Rishikesh",
        country: "India",
        address: "Swargashram, Rishikesh",
      },
      startDate: daysFromNow(45),
      endDate: daysFromNow(65),
      startTime: "05:30",
      endTime: "20:30",
      ticketName: "YTT Enrolment",
      ticketQtyAvailable: 12,
      ticketSelesStartDate: daysFromNow(-30),
      ticketSelesEndDate: daysFromNow(42),
      ticketPrice: 35000,
      totalTickets: 20,
      addOns: "Accommodation package ₹25000",
      refundPolicy: "50% refund up to 10 days before start.",
      dressCode: "Yoga / Comfortable Wear",
      accessAndPrivacy: false,
      ageRestriction: { type: "RANGE", minAge: 18, maxAge: 65 },
      isFeatured: false,
      fetcherEvent: false,
      status: "Upcoming",
      createdBy: org1,
      totalAttendees: 0,
    },
  ];
};

// ─── Seeder entry point ───────────────────────────────────────────────────────
const seed = async () => {
  // Ensure DB connection
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(process.env.DB_STRING);
      console.log("✅ Connected to DB");
    } catch (err) {
      console.error("❌ DB connection failed:", err.message);
      process.exit(1);
    }
  }

  // Wait for the connection to be in 'connected' state
  await new Promise((resolve) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("open", resolve);
  });

  try {
    // 1. Upsert event categories
    console.log("\n📁 Upserting event categories…");
    const savedCats = [];
    for (const name of CATEGORY_NAMES) {
      const cat = await Category.findOneAndUpdate(
        { name: name.toLowerCase(), type: "event" },
        { name: name.toLowerCase(), type: "event", image: IMAGES[0] },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      savedCats.push(cat);
      console.log(`   ✔ ${cat.name}`);
    }
    console.log(`   ${savedCats.length} categories ready.`);

    // 2. Upsert seed organisers
    console.log("\n👤 Upserting seed organisers…");
    const orgIds = [];
    const orgDefs = [
      {
        email: ORGANISER_EMAILS[0],
        firstName: "Seed",
        lastName: "OrganizerA",
        password: "Password@123",
        roleId: roleId.ORGANIZER,
      },
      {
        email: ORGANISER_EMAILS[1],
        firstName: "Seed",
        lastName: "OrganizerB",
        password: "Password@123",
        roleId: roleId.ORGANIZER,
      },
    ];

    for (const def of orgDefs) {
      let user = await User.findOne({ email: def.email });
      if (!user) {
        user = new User({
          ...def,
          organizerVerificationStatus: "approved",
          isDisable: false,
          isDeleted: false,
          categories: savedCats.map((c) => c._id),
        });
        await user.save();
        console.log(`   ✔ Created ${def.email}`);
      } else {
        console.log(`   ✔ Found   ${def.email}`);
      }
      orgIds.push(user._id);
    }

    // 3. Build & insert events
    console.log("\n🎫 Inserting events…");
    const eventsData = buildEvents(savedCats, orgIds[0], orgIds[1]);

    let inserted = 0;
    let skipped = 0;

    for (const ev of eventsData) {
      const exists = await Event.findOne({
        eventTitle: ev.eventTitle,
        createdBy: ev.createdBy,
      });
      if (exists) {
        console.log(`   ⏩ Skipped  (already exists): ${ev.eventTitle}`);
        skipped++;
        continue;
      }

      // Use insertMany bypass (skips pre-save hook that blocks past events)
      await Event.collection.insertOne({
        ...ev,
        isDraft: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`   ✔ Inserted: ${ev.eventTitle}`);
      inserted++;
    }

    console.log(
      `\n✅ Done — ${inserted} events inserted, ${skipped} skipped.\n`
    );
  } catch (err) {
    console.error("❌ Seeder error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
