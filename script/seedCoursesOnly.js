/**
 * seedCoursesOnly.js
 * -----------------------------------------------------------
 * Standalone seeder that inserts 22 course documents covering
 * EVERY field and variation in the Course schema:
 *
 *   enrollmentType  : "Ongoing"    (≥ 1 schedule)
 *                     "fixedStart" (exactly 1 schedule)
 *   price           : 0 (free) and various paid amounts
 *   totalSeats      : small (5) → large (500)
 *   schedules       : single / multiple batches
 *   venueAddress    : multiple cities, countries, states, zipcodes
 *   isFeatured      : true / false
 *   galleryImages   : populated / empty
 *   whatYouWillLearn: always filled
 *   courseCategory  : course-type categories (Technology, Sports,
 *                     Business, Wellness, Art, Music…)
 *
 * Run:
 *   node script/seedCoursesOnly.js
 * -----------------------------------------------------------
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env") });

const { User, Category, Course } = require("../db/index");
const { roleId } = require("../utils/Role");

// ─── Unsplash images (same as event seeder) ──────────────────────────────────
const IMAGES = [
  "https://plus.unsplash.com/premium_photo-1661306437817-8ab34be91e0c?w=500&auto=format&fit=crop&q=60",
  "https://plus.unsplash.com/premium_photo-1664474653221-8412b8dfca3e?w=500&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1541445976433-f466f228a409?w=500&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=500&auto=format&fit=crop&q=60",
  "https://images.unsplash.com/photo-1670028514318-0ac718c0590d?w=500&auto=format&fit=crop&q=60",
];

const img = (i) => IMAGES[i % IMAGES.length];

// ─── Course-type category names to upsert ────────────────────────────────────
const COURSE_CATEGORY_NAMES = [
  "Technology",
  "Business",
  "Sports",
  "Wellness",
  "Art",
  "Music",
  "Photography",
  "Cooking",
];

// ─── Seed organiser accounts ──────────────────────────────────────────────────
const ORGANISER_EMAILS = [
  "seed.organiser1@bondy.dev",
  "seed.organiser2@bondy.dev",
];

// ─── Date helpers ─────────────────────────────────────────────────────────────
const now = new Date();

const daysFromNow = (n) => {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d;
};

// ─── Build course documents ───────────────────────────────────────────────────
const buildCourses = (cats, org1, org2) => {
  const c = (name) =>
    cats.find((cat) => cat.name === name.toLowerCase())?._id ?? cats[0]._id;

  return [
    // ── 1. fixedStart · Technology · paid · Mumbai · featured ─────────────
    {
      courseTitle: "Full-Stack JavaScript Bootcamp",
      courseCategory: c("Technology"),
      posterImage: [img(2)],
      galleryImages: [img(0), img(1), img(3)],
      shortdesc:
        "Master React, Node.js, and MongoDB in this 10-week intensive bootcamp.",
      whatYouWillLearn:
        "React.js fundamentals, Node/Express REST APIs, MongoDB CRUD, JWT auth, deployment on AWS.",
      price: 24999,
      totalSeats: 30,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(14),
          endDate: daysFromNow(84),
          startTime: "10:00",
          endTime: "14:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [72.8777, 19.076],
        city: "Mumbai",
        country: "India",
        state: "Maharashtra",
        address: "Andheri East, MIDC",
        zipcode: "400069",
      },
      isFeatured: true,
      createdBy: org1,
    },

    // ── 2. fixedStart · Technology · free · Delhi ─────────────────────────
    {
      courseTitle: "Python for Data Science – Free Crash Course",
      courseCategory: c("Technology"),
      posterImage: [img(0)],
      galleryImages: [img(2)],
      shortdesc: "A free 4-week crash course on Python for aspiring data scientists.",
      whatYouWillLearn:
        "Python basics, NumPy, Pandas, Matplotlib, introductory ML with scikit-learn.",
      price: 0,
      totalSeats: 100,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(7),
          endDate: daysFromNow(35),
          startTime: "18:00",
          endTime: "20:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.209, 28.6139],
        city: "New Delhi",
        country: "India",
        state: "Delhi",
        address: "Connaught Place, Block B",
        zipcode: "110001",
      },
      isFeatured: false,
      createdBy: org2,
    },

    // ── 3. Ongoing · Technology · paid · Bangalore · 3 batches ───────────
    {
      courseTitle: "AWS Cloud Practitioner Certification Prep",
      courseCategory: c("Technology"),
      posterImage: [img(1), img(2)],
      galleryImages: [img(3), img(4)],
      shortdesc:
        "Prepare for the AWS CCP exam with hands-on labs across 3 rolling batches.",
      whatYouWillLearn:
        "AWS core services (EC2, S3, RDS, Lambda), IAM, billing, cloud architecture, exam practice tests.",
      price: 8999,
      totalSeats: 25,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(3),
          endDate: daysFromNow(33),
          startTime: "09:00",
          endTime: "11:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(40),
          endDate: daysFromNow(70),
          startTime: "14:00",
          endTime: "16:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(75),
          endDate: daysFromNow(105),
          startTime: "18:00",
          endTime: "20:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.5946, 12.9716],
        city: "Bangalore",
        country: "India",
        state: "Karnataka",
        address: "Koramangala 5th Block",
        zipcode: "560095",
      },
      isFeatured: true,
      createdBy: org1,
    },

    // ── 4. fixedStart · Business · paid · Hyderabad ───────────────────────
    {
      courseTitle: "Digital Marketing & SEO Masterclass",
      courseCategory: c("Business"),
      posterImage: [img(4)],
      galleryImages: [img(0), img(2)],
      shortdesc:
        "A 6-week hands-on course on SEO, SEM, social media, and analytics.",
      whatYouWillLearn:
        "Keyword research, on-page & off-page SEO, Google Ads, Meta Ads, GA4 analytics, content marketing strategy.",
      price: 12999,
      totalSeats: 40,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(10),
          endDate: daysFromNow(52),
          startTime: "11:00",
          endTime: "13:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [78.4483, 17.4238],
        city: "Hyderabad",
        country: "India",
        state: "Telangana",
        address: "Banjara Hills, Road No. 12",
        zipcode: "500034",
      },
      isFeatured: false,
      createdBy: org2,
    },

    // ── 5. Ongoing · Business · free · Kolkata · 2 batches ───────────────
    {
      courseTitle: "Entrepreneurship 101 – Idea to Launch",
      courseCategory: c("Business"),
      posterImage: [img(3)],
      galleryImages: [],
      shortdesc:
        "A free beginner course teaching first-principles of building a startup.",
      whatYouWillLearn:
        "Idea validation, lean canvas, MVP development, fundraising basics, pitch deck design.",
      price: 0,
      totalSeats: 200,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(5),
          endDate: daysFromNow(35),
          startTime: "17:00",
          endTime: "19:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(50),
          endDate: daysFromNow(80),
          startTime: "09:00",
          endTime: "11:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [88.3639, 22.5726],
        city: "Kolkata",
        country: "India",
        state: "West Bengal",
        address: "Salt Lake Sector V",
        zipcode: "700091",
      },
      isFeatured: false,
      createdBy: org1,
    },

    // ── 6. fixedStart · Sports · paid · Delhi · featured ─────────────────
    {
      courseTitle: "Professional Tennis Coaching – Intermediate Level",
      courseCategory: c("Sports"),
      posterImage: [img(0), img(4)],
      galleryImages: [img(1)],
      shortdesc:
        "8-week structured tennis coaching with certified AITA coaches.",
      whatYouWillLearn:
        "Serve technique, forehand and backhand strokes, net play, match strategy, fitness conditioning.",
      price: 18000,
      totalSeats: 12,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(21),
          endDate: daysFromNow(77),
          startTime: "06:30",
          endTime: "08:30",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.1734, 28.6353],
        city: "New Delhi",
        country: "India",
        state: "Delhi",
        address: "DLTA Complex, R.K. Khanna Stadium",
        zipcode: "110003",
      },
      isFeatured: true,
      createdBy: org2,
    },

    // ── 7. Ongoing · Sports · free · Bangalore · 4 batches ───────────────
    {
      courseTitle: "Community Yoga for Beginners",
      courseCategory: c("Sports"),
      posterImage: [img(3)],
      galleryImages: [img(0), img(2)],
      shortdesc: "Free weekly yoga sessions for absolute beginners in the park.",
      whatYouWillLearn:
        "Sun salutations, basic asanas, breathing (pranayama), relaxation techniques, injury prevention.",
      price: 0,
      totalSeats: 50,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(1),
          endDate: daysFromNow(30),
          startTime: "06:00",
          endTime: "07:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(32),
          endDate: daysFromNow(62),
          startTime: "06:00",
          endTime: "07:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(65),
          endDate: daysFromNow(95),
          startTime: "07:00",
          endTime: "08:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(97),
          endDate: daysFromNow(127),
          startTime: "07:00",
          endTime: "08:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.5946, 12.9716],
        city: "Bangalore",
        country: "India",
        state: "Karnataka",
        address: "Cubbon Park, Kasturba Road",
        zipcode: "560001",
      },
      isFeatured: false,
      createdBy: org1,
    },

    // ── 8. fixedStart · Wellness · paid · Rishikesh ───────────────────────
    {
      courseTitle: "300hr Advanced Yoga & Ayurveda Immersion",
      courseCategory: c("Wellness"),
      posterImage: [img(3), img(0)],
      galleryImages: [img(1), img(4)],
      shortdesc:
        "Advanced 300hr internationally accredited yoga & Ayurveda program.",
      whatYouWillLearn:
        "Advanced asana sequencing, Yoga Nidra, Ayurvedic lifestyle, pranayama, teaching methodology, Sanskrit chanting.",
      price: 65000,
      totalSeats: 15,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(30),
          endDate: daysFromNow(60),
          startTime: "05:30",
          endTime: "20:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [78.3022, 30.1158],
        city: "Rishikesh",
        country: "India",
        state: "Uttarakhand",
        address: "Swargashram, Parmarth Niketan",
        zipcode: "249301",
      },
      isFeatured: true,
      createdBy: org2,
    },

    // ── 9. Ongoing · Wellness · paid · Mumbai · 2 batches ────────────────
    {
      courseTitle: "Mindfulness-Based Stress Reduction (MBSR)",
      courseCategory: c("Wellness"),
      posterImage: [img(3)],
      galleryImages: [img(2)],
      shortdesc:
        "8-week evidence-based MBSR program for stress, anxiety, and burnout.",
      whatYouWillLearn:
        "Body scan meditation, mindful movement, awareness practices, cognitive reframing, weekly group sharing.",
      price: 9500,
      totalSeats: 20,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(8),
          endDate: daysFromNow(64),
          startTime: "07:00",
          endTime: "09:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(70),
          endDate: daysFromNow(126),
          startTime: "18:30",
          endTime: "20:30",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [72.8268, 18.9518],
        city: "Mumbai",
        country: "India",
        state: "Maharashtra",
        address: "Juhu, Vile Parle West",
        zipcode: "400056",
      },
      isFeatured: false,
      createdBy: org1,
    },

    // ── 10. fixedStart · Art · paid · Chennai · featured ─────────────────
    {
      courseTitle: "Watercolour Landscape Painting – 6-Week Course",
      courseCategory: c("Art"),
      posterImage: [img(2), img(1)],
      galleryImages: [img(0), img(3), img(4)],
      shortdesc:
        "Learn to paint light-filled watercolour landscapes from scratch.",
      whatYouWillLearn:
        "Colour theory, wet-on-wet & wet-on-dry techniques, perspective, composition, finishing and framing.",
      price: 7500,
      totalSeats: 18,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(15),
          endDate: daysFromNow(57),
          startTime: "10:00",
          endTime: "13:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [80.2707, 13.0827],
        city: "Chennai",
        country: "India",
        state: "Tamil Nadu",
        address: "Mylapore, Luz Avenue",
        zipcode: "600004",
      },
      isFeatured: true,
      createdBy: org2,
    },

    // ── 11. Ongoing · Art · free · Kolkata · 2 batches ───────────────────
    {
      courseTitle: "Sketching Fundamentals – Community Class",
      courseCategory: c("Art"),
      posterImage: [img(2)],
      galleryImages: [],
      shortdesc: "Free community sketching class for all skill levels.",
      whatYouWillLearn:
        "Line quality, basic shapes and forms, shading, perspective drawing, gesture sketching.",
      price: 0,
      totalSeats: 60,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(4),
          endDate: daysFromNow(34),
          startTime: "16:00",
          endTime: "18:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(37),
          endDate: daysFromNow(67),
          startTime: "10:00",
          endTime: "12:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [88.3639, 22.5726],
        city: "Kolkata",
        country: "India",
        state: "West Bengal",
        address: "College Street, Presidency Area",
        zipcode: "700073",
      },
      isFeatured: false,
      createdBy: org1,
    },

    // ── 12. fixedStart · Music · paid · Mumbai ────────────────────────────
    {
      courseTitle: "Bollywood Vocals – Beginner to Intermediate",
      courseCategory: c("Music"),
      posterImage: [img(0)],
      galleryImages: [img(1), img(2)],
      shortdesc:
        "12-week structured Bollywood singing course with live accompaniment.",
      whatYouWillLearn:
        "Riyaaz, swar identification, sur-taal calibration, mic technique, stage performance, 3 recorded songs.",
      price: 14999,
      totalSeats: 15,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(18),
          endDate: daysFromNow(102),
          startTime: "17:00",
          endTime: "19:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [72.8658, 19.0144],
        city: "Mumbai",
        country: "India",
        state: "Maharashtra",
        address: "Bandra West, Pali Market",
        zipcode: "400050",
      },
      isFeatured: false,
      createdBy: org2,
    },

    // ── 13. Ongoing · Music · paid · Bangalore · 3 batches · featured ────
    {
      courseTitle: "Western Guitar – All Levels",
      courseCategory: c("Music"),
      posterImage: [img(0), img(4)],
      galleryImages: [img(3)],
      shortdesc:
        "Rolling guitar batches for beginners, intermediate, and advanced players.",
      whatYouWillLearn:
        "Chords, scales, fingerpicking, strumming patterns, music theory, playing full songs.",
      price: 4999,
      totalSeats: 10,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(2),
          endDate: daysFromNow(32),
          startTime: "10:00",
          endTime: "11:30",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(35),
          endDate: daysFromNow(65),
          startTime: "13:00",
          endTime: "14:30",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(68),
          endDate: daysFromNow(98),
          startTime: "17:00",
          endTime: "18:30",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.6279, 12.978],
        city: "Bangalore",
        country: "India",
        state: "Karnataka",
        address: "Indiranagar, 12th Main Road",
        zipcode: "560038",
      },
      isFeatured: true,
      createdBy: org1,
    },

    // ── 14. fixedStart · Photography · paid · Delhi ───────────────────────
    {
      courseTitle: "DSLR Photography – From Auto to Manual",
      courseCategory: c("Photography"),
      posterImage: [img(1), img(3)],
      galleryImages: [img(0), img(4)],
      shortdesc:
        "8-week course teaching manual photography and Adobe Lightroom editing.",
      whatYouWillLearn:
        "Aperture, shutter speed, ISO, composition rules, lighting, portrait & landscape photography, Lightroom workflow.",
      price: 11500,
      totalSeats: 20,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(12),
          endDate: daysFromNow(68),
          startTime: "11:00",
          endTime: "14:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.2195, 28.6229],
        city: "New Delhi",
        country: "India",
        state: "Delhi",
        address: "India Gate, Rajpath Area",
        zipcode: "110011",
      },
      isFeatured: false,
      createdBy: org2,
    },

    // ── 15. Ongoing · Photography · paid · Mumbai · 2 batches · featured ─
    {
      courseTitle: "Mobile Photography Masterclass",
      courseCategory: c("Photography"),
      posterImage: [img(1)],
      galleryImages: [img(2), img(3), img(4)],
      shortdesc:
        "Learn professional-quality photography using only your smartphone.",
      whatYouWillLearn:
        "Composition, natural light, portrait mode, editing with Snapseed & Lightroom Mobile, Instagram strategies.",
      price: 3999,
      totalSeats: 30,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(6),
          endDate: daysFromNow(26),
          startTime: "15:00",
          endTime: "17:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(30),
          endDate: daysFromNow(50),
          startTime: "10:00",
          endTime: "12:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [72.8258, 18.9929],
        city: "Mumbai",
        country: "India",
        state: "Maharashtra",
        address: "Lower Parel, Phoenix Mills",
        zipcode: "400013",
      },
      isFeatured: true,
      createdBy: org1,
    },

    // ── 16. fixedStart · Cooking · paid · Hyderabad ───────────────────────
    {
      courseTitle: "Authentic Hyderabadi Dum Biryani Masterclass",
      courseCategory: c("Cooking"),
      posterImage: [img(3)],
      galleryImages: [img(0), img(1)],
      shortdesc:
        "Learn the secret of authentic dum cooking from a Hyderabadi master chef.",
      whatYouWillLearn:
        "Marinating, layering, dum technique, spice blending, raita and salan preparation, plating.",
      price: 5500,
      totalSeats: 12,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(20),
          endDate: daysFromNow(22),
          startTime: "09:00",
          endTime: "15:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [78.4743, 17.3616],
        city: "Hyderabad",
        country: "India",
        state: "Telangana",
        address: "Tolichowki, Jubilee Hills Road",
        zipcode: "500033",
      },
      isFeatured: false,
      createdBy: org2,
    },

    // ── 17. Ongoing · Cooking · free · Chennai · 2 batches ───────────────
    {
      courseTitle: "South Indian Home Cooking – Free Community Class",
      courseCategory: c("Cooking"),
      posterImage: [img(3), img(2)],
      galleryImages: [],
      shortdesc:
        "Free weekend cooking classes covering traditional South Indian recipes.",
      whatYouWillLearn:
        "Idli, dosa, sambar, rasam, chutneys, rice varieties, filter coffee — all from scratch.",
      price: 0,
      totalSeats: 25,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(9),
          endDate: daysFromNow(39),
          startTime: "10:00",
          endTime: "13:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(42),
          endDate: daysFromNow(72),
          startTime: "10:00",
          endTime: "13:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [80.2271, 12.9365],
        city: "Chennai",
        country: "India",
        state: "Tamil Nadu",
        address: "Adyar, Gandhi Nagar",
        zipcode: "600020",
      },
      isFeatured: false,
      createdBy: org1,
    },

    // ── 18. fixedStart · Business · paid · London · featured ─────────────
    {
      courseTitle: "Finance for Non-Finance Managers",
      courseCategory: c("Business"),
      posterImage: [img(4), img(0)],
      galleryImages: [img(1), img(2)],
      shortdesc:
        "3-day intensive finance literacy program for senior managers.",
      whatYouWillLearn:
        "P&L reading, balance sheets, cash flow analysis, budgeting, KPIs, investment appraisal basics.",
      price: 45000,
      totalSeats: 20,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(45),
          endDate: daysFromNow(47),
          startTime: "09:00",
          endTime: "17:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [-0.0991, 51.5203],
        city: "London",
        country: "UK",
        state: "England",
        address: "Bishopsgate, City of London, EC2A 4BQ",
        zipcode: "EC2A 4BQ",
      },
      isFeatured: true,
      createdBy: org2,
    },

    // ── 19. fixedStart · Technology · paid · Dubai ────────────────────────
    {
      courseTitle: "Cybersecurity Fundamentals Bootcamp",
      courseCategory: c("Technology"),
      posterImage: [img(2)],
      galleryImages: [img(0), img(4)],
      shortdesc:
        "5-day hands-on cybersecurity crash course – CompTIA Security+ aligned.",
      whatYouWillLearn:
        "Network security, ethical hacking intro, vulnerability scanning, SIEM basics, incident response, CompTIA exam tips.",
      price: 32000,
      totalSeats: 20,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(60),
          endDate: daysFromNow(64),
          startTime: "09:00",
          endTime: "17:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [55.3047, 25.2285],
        city: "Dubai",
        country: "UAE",
        state: "Dubai",
        address: "DIFC, Sheikh Zayed Road",
        zipcode: "00000",
      },
      isFeatured: true,
      createdBy: org1,
    },

    // ── 20. Ongoing · Business · paid · Singapore · 2 batches ────────────
    {
      courseTitle: "Product Management Accelerator",
      courseCategory: c("Business"),
      posterImage: [img(4), img(1)],
      galleryImages: [img(2), img(3)],
      shortdesc:
        "8-week PM accelerator — from product thinking to roadmap execution.",
      whatYouWillLearn:
        "User research, PRD writing, roadmap prioritisation, Agile/Scrum, metrics and OKRs, stakeholder management.",
      price: 28000,
      totalSeats: 20,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(25),
          endDate: daysFromNow(81),
          startTime: "19:00",
          endTime: "21:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(90),
          endDate: daysFromNow(146),
          startTime: "10:00",
          endTime: "12:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [103.8198, 1.3521],
        city: "Singapore",
        country: "Singapore",
        state: "Central Region",
        address: "One Raffles Quay, Level 27",
        zipcode: "048583",
      },
      isFeatured: false,
      createdBy: org2,
    },

    // ── 21. fixedStart · Wellness · free · Bangalore · featured ──────────
    {
      courseTitle: "Mental Health First Aid Certification",
      courseCategory: c("Wellness"),
      posterImage: [img(3), img(1)],
      galleryImages: [img(0)],
      shortdesc:
        "Free 2-day internationally recognised Mental Health First Aid course.",
      whatYouWillLearn:
        "ALGEE action plan, recognising mental health crises, supporting someone at risk, suicide prevention, self-care.",
      price: 0,
      totalSeats: 30,
      enrollmentType: "fixedStart",
      schedules: [
        {
          startDate: daysFromNow(17),
          endDate: daysFromNow(18),
          startTime: "09:00",
          endTime: "17:30",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [77.5947, 12.9721],
        city: "Bangalore",
        country: "India",
        state: "Karnataka",
        address: "MG Road, Trinity Circle",
        zipcode: "560001",
      },
      isFeatured: true,
      createdBy: org1,
    },

    // ── 22. Ongoing · Photography · free · Hyderabad · 2 batches ─────────
    {
      courseTitle: "Smartphone Videography for Social Media",
      courseCategory: c("Photography"),
      posterImage: [img(1), img(4)],
      galleryImages: [img(2)],
      shortdesc:
        "Free course on shooting and editing short-form video for Instagram & YouTube.",
      whatYouWillLearn:
        "Storyboarding, shot types, natural lighting, CapCut & InShot editing, reels strategies, thumbnail design.",
      price: 0,
      totalSeats: 40,
      enrollmentType: "Ongoing",
      schedules: [
        {
          startDate: daysFromNow(11),
          endDate: daysFromNow(31),
          startTime: "15:00",
          endTime: "17:00",
          presentCount: 0,
        },
        {
          startDate: daysFromNow(35),
          endDate: daysFromNow(55),
          startTime: "18:00",
          endTime: "20:00",
          presentCount: 0,
        },
      ],
      venueAddress: {
        type: "Point",
        coordinates: [78.4867, 17.385],
        city: "Hyderabad",
        country: "India",
        state: "Telangana",
        address: "Jubilee Hills, Road No. 36",
        zipcode: "500033",
      },
      isFeatured: false,
      createdBy: org2,
    },
  ];
};

// ─── Seeder entry point ───────────────────────────────────────────────────────
const seed = async () => {
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(process.env.DB_STRING);
      console.log("✅ Connected to DB");
    } catch (err) {
      console.error("❌ DB connection failed:", err.message);
      process.exit(1);
    }
  }

  // Wait until connection is truly open
  await new Promise((resolve) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("open", resolve);
  });

  try {
    // 1. Upsert course categories
    console.log("\n📁 Upserting course categories…");
    const savedCats = [];
    for (const name of COURSE_CATEGORY_NAMES) {
      const cat = await Category.findOneAndUpdate(
        { name: name.toLowerCase(), type: "course" },
        { name: name.toLowerCase(), type: "course", image: IMAGES[0] },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      savedCats.push(cat);
      console.log(`   ✔ ${cat.name}`);
    }
    console.log(`   ${savedCats.length} course categories ready.`);

    // 2. Upsert seed organisers (reuse from event seeder if already present)
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

    // 3. Build & insert courses
    console.log("\n📚 Inserting courses…");
    const coursesData = buildCourses(savedCats, orgIds[0], orgIds[1]);

    let inserted = 0;
    let skipped = 0;

    for (const co of coursesData) {
      // Duplicate guard: same title + same organiser
      const exists = await Course.findOne({
        courseTitle: co.courseTitle,
        createdBy: co.createdBy,
      });

      if (exists) {
        console.log(`   ⏩ Skipped  (already exists): ${co.courseTitle}`);
        skipped++;
        continue;
      }

      // Validate schedule constraint before inserting
      if (
        co.enrollmentType === "fixedStart" &&
        co.schedules.length !== 1
      ) {
        console.error(
          `   ❌ Invalid: fixedStart course must have exactly 1 schedule — "${co.courseTitle}" has ${co.schedules.length}`
        );
        skipped++;
        continue;
      }

      if (
        co.enrollmentType === "Ongoing" &&
        co.schedules.length < 1
      ) {
        console.error(
          `   ❌ Invalid: Ongoing course must have at least 1 schedule — "${co.courseTitle}"`
        );
        skipped++;
        continue;
      }

      // Use collection.insertOne to bypass any pre-save hooks
      await Course.collection.insertOne({
        ...co,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(
        `   ✔ Inserted [${co.enrollmentType}] ${co.enrollmentType === "Ongoing" ? `(${co.schedules.length} batches)` : "(fixed)"}: ${co.courseTitle}`
      );
      inserted++;
    }

    console.log(
      `\n✅ Done — ${inserted} courses inserted, ${skipped} skipped.\n`
    );
  } catch (err) {
    console.error("❌ Seeder error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
