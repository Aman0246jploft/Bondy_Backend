const mongoose = require('mongoose');
require('dotenv').config();
const Course = require('../db/models/Course');
const User = require('../db/models/User');
const Category = require('../db/models/Category');

const COURSE_IMAGES = {
  coding: [
    "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1516116211227-bbc02cb11bcf?auto=format&fit=crop&w=1200&q=80"
  ],
  tech: [
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80"
  ],
  business: [
    "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80"
  ],
  wellness: [
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80"
  ],
  music: [
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80"
  ],
  language: [
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80"
  ],
  art: [
    "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80"
  ],
  dance: [
    "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=1200&q=80"
  ],
  fitness: [
    "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80"
  ],
  sports: [
    "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&w=1200&q=80"
  ],
  development: [
    "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=80"
  ]
};

const COURSE_VENUES = [
  {
    venueName: "Hub Innovation Academy",
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
    venueName: "Mongolian National University Tech Lab",
    venueAddress: {
      type: "Point",
      coordinates: [106.9195, 47.9232],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Ikh Surguuliin Gudamj 1, Sukhbaatar District",
      state: "Ulaanbaatar",
      zipcode: "14201"
    }
  },
  {
    venueName: "Lotus Yoga & Wellness Studio",
    venueAddress: {
      type: "Point",
      coordinates: [106.9248, 47.9135],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Olympic Street 19, Sukhbaatar District",
      state: "Ulaanbaatar",
      zipcode: "14241"
    }
  },
  {
    venueName: "Nomadic Sound & Art Workshop Center",
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
    venueName: "UG Sports Arena Martial Arts Dojo",
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
    venueName: "Novotel Executive Training Suite",
    venueAddress: {
      type: "Point",
      coordinates: [106.9189, 47.9205],
      city: "Ulaanbaatar",
      country: "Mongolia",
      address: "Baga Toiruu 21, Chingeltei District",
      state: "Ulaanbaatar",
      zipcode: "14250"
    }
  }
];

async function seedCourses() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB.");

  const organizer = await User.findOne({ email: "test3@yopmail.com" });
  if (!organizer) {
    throw new Error("Organizer test3@yopmail.com not found!");
  }
  console.log("Organizer test3 ID:", organizer._id.toString());

  const categories = await Category.find({ type: "course", isDeleted: false });
  const catMap = {};
  categories.forEach(c => { catMap[c.name.toLowerCase()] = c._id; });
  console.log("Available Course Categories:", Object.keys(catMap));

  const getCatId = (name) => {
    return catMap[name.toLowerCase()] || categories[0]._id;
  };

  const rawCourses = [
    // --- 18 UPCOMING FIXED-START COURSES ---
    {
      courseTitle: "Full-Stack JavaScript & React Pro Bootcamp",
      categoryName: "coding & software",
      shortdesc: "A rigorous 8-week structured cohort mastering modern JavaScript, React 19, Next.js, Node.js REST APIs, and full cloud deployment.",
      longdesc: "Transition from coding fundamentals to building production-ready web applications.\n• Modern ES6+, asynchronous programming, and functional architecture\n• React component lifecycle, custom hooks, and state management\n• RESTful backend development with Express and MongoDB database design\n• Real-world capstone project with live code review and git collaboration\n• Interview prep, technical portfolio building, and career guidance.",
      whatYouWillLearn: "• Build and deploy scalable Next.js full-stack web applications\n• Design clean MongoDB database schemas and secure REST APIs\n• Implement JWT authentication, payments integration, and role permissions\n• Master Git branching workflows and CI/CD automated deployments",
      startDate: new Date("2026-10-05T09:00:00.000Z"),
      endDate: new Date("2026-11-27T18:00:00.000Z"),
      totalSessions: 24,
      venueIndex: 0,
      price: 450000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.coding,
      batches: [
        { batchName: "Morning Cohort", startTime: "09:00", endTime: "12:00", days: ["Mon", "Wed", "Fri"], seats: 20 },
        { batchName: "Evening Cohort", startTime: "18:00", endTime: "21:00", days: ["Mon", "Wed", "Fri"], seats: 20 }
      ]
    },
    {
      courseTitle: "Python for Data Science, Analytics & Machine Learning",
      categoryName: "coding & software",
      shortdesc: "Hands-on data science cohort covering NumPy, Pandas, statistical modeling, data visualization, and predictive machine learning models.",
      longdesc: "Unlock the power of data-driven decision making with Python.\n• Data manipulation, cleaning, and transformation with Pandas and NumPy\n• Exploratory data analysis (EDA) and interactive visualizations with Seaborn and Plotly\n• Supervised and unsupervised machine learning algorithms using Scikit-Learn\n• Real-world datasets: financial market forecasting, customer churn prediction\n• End-to-end machine learning pipeline deployment on Streamlit Cloud.",
      whatYouWillLearn: "• Write idiomatic Python code for statistical analysis and data wrangling\n• Train, tune, and evaluate machine learning regression and classification models\n• Create executive-ready data visualization dashboards\n• Work with real-world SQL databases and CSV data pipelines",
      startDate: new Date("2026-10-10T14:00:00.000Z"),
      endDate: new Date("2026-12-05T18:00:00.000Z"),
      totalSessions: 16,
      venueIndex: 1,
      price: 380000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.coding,
      batches: [
        { batchName: "Weekend Intensive", startTime: "14:00", endTime: "18:00", days: ["Sat", "Sun"], seats: 25 }
      ]
    },
    {
      courseTitle: "Cross-Platform Mobile App Development with Flutter & Dart",
      categoryName: "technology",
      shortdesc: "Build beautiful, native-performance iOS and Android mobile apps from a single Dart codebase with real-time Firebase backend.",
      longdesc: "Master mobile engineering from initial wireframe to Google Play and Apple App Store deployment.\n• Dart programming language essentials and object-oriented patterns\n• Flutter widget tree, responsive layouts, animations, and custom UI components\n• State management using Riverpod and Bloc patterns\n• Local SQLite storage, offline syncing, and push notifications\n• App store submission guidelines and automated build pipelines.",
      whatYouWillLearn: "• Architect scalable Flutter applications for both Android and iOS\n• Implement secure authentication, device camera, GPS, and cloud storage\n• Connect apps to third-party REST APIs and WebSockets\n• Publish apps to Google Play Store and Apple TestFlight",
      startDate: new Date("2026-10-12T18:30:00.000Z"),
      endDate: new Date("2026-12-08T21:30:00.000Z"),
      totalSessions: 18,
      venueIndex: 0,
      price: 420000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.tech,
      batches: [
        { batchName: "Evening Track", startTime: "18:30", endTime: "21:30", days: ["Tue", "Thu"], seats: 18 }
      ]
    },
    {
      courseTitle: "Cloud DevOps Engineering, Docker & Kubernetes Masterclass",
      categoryName: "technology",
      shortdesc: "Master containerization, infrastructure as code, CI/CD automated deployment pipelines, and production Kubernetes cluster operations.",
      longdesc: "Accelerate your career as a high-earning DevOps and Cloud Infrastructure Specialist.\n• Deep dive into Linux server administration, networking, and bash scripting\n• Docker multi-stage builds, container optimization, and registry management\n• Kubernetes pod scheduling, services, ingress controllers, and Helm charts\n• Terraform infrastructure-as-code for multi-cloud deployments\n• Production monitoring, log aggregation, and Prometheus / Grafana dashboards.",
      whatYouWillLearn: "• Containerize complex microservices architectures using Docker\n• Deploy, auto-scale, and manage resilient Kubernetes clusters\n• Build zero-downtime GitHub Actions CI/CD deployment pipelines\n• Provision cloud infrastructure with declarative Terraform code",
      startDate: new Date("2026-10-17T10:00:00.000Z"),
      endDate: new Date("2026-12-12T14:00:00.000Z"),
      totalSessions: 16,
      venueIndex: 1,
      price: 490000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.tech,
      batches: [
        { batchName: "Weekend Masterclass", startTime: "10:00", endTime: "14:00", days: ["Sat"], seats: 22 }
      ]
    },
    {
      courseTitle: "Digital Marketing, Growth Hacking & Brand Strategy",
      categoryName: "business",
      shortdesc: "Data-driven marketing course covering paid advertising (Meta & Google), SEO content loops, viral organic growth, and conversion funnels.",
      longdesc: "Scale customer acquisition with proven digital marketing methodologies.\n• Crafting high-converting sales funnels and optimized landing pages\n• Meta Ads Manager and Google Search & Display campaign setup from scratch\n• Data analytics: Google Analytics 4 (GA4), event tracking, and attribution models\n• Organic content engine: TikTok, Instagram Reels, and LinkedIn storytelling\n• Email marketing automation, retention loops, and customer lifetime value.",
      whatYouWillLearn: "• Launch and optimize profitable paid ad campaigns on Meta and Google\n• Analyze CAC, LTV, ROAS, and cohort retention metrics\n• Conduct A/B split tests on copy, creatives, and pricing pages\n• Build automated email sequences that nurture and convert leads",
      startDate: new Date("2026-10-19T18:00:00.000Z"),
      endDate: new Date("2026-11-25T20:30:00.000Z"),
      totalSessions: 12,
      venueIndex: 5,
      price: 280000,
      refundPolicy: "1 Day Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.business,
      batches: [
        { batchName: "Weekday Evening", startTime: "18:00", endTime: "20:30", days: ["Mon", "Wed"], seats: 25 }
      ]
    },
    {
      courseTitle: "Startup Financial Modeling & Venture Capital Valuation",
      categoryName: "business",
      shortdesc: "Build institutional-grade 3-statement financial models, forecast revenue growth, understand cap tables, and prepare for investor due diligence.",
      longdesc: "Designed for startup founders, CFOs, financial analysts, and corporate strategists.\n• 3-statement dynamic financial modeling in Excel / Google Sheets\n• Unit economics: CAC, LTV, churn, gross margin, and burn rate runway\n• Valuation methodologies: DCF, Scorecard, and Comparable Multiples\n• Cap table modeling: SAFE notes, convertible debt, ESOP pools, and equity dilution\n• Building pitch-ready investor financial decks with defensible assumptions.",
      whatYouWillLearn: "• Construct dynamic, linked 3-statement financial forecast models\n• Calculate enterprise valuation and quantify fundraising requirements\n• Model cap table dilution across Seed, Series A, and Series B rounds\n• Defend financial assumptions with confidence before VC investment committees",
      startDate: new Date("2026-10-24T13:00:00.000Z"),
      endDate: new Date("2026-11-28T17:00:00.000Z"),
      totalSessions: 10,
      venueIndex: 5,
      price: 360000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.business,
      batches: [
        { batchName: "Saturday Intensive", startTime: "13:00", endTime: "17:00", days: ["Sat"], seats: 20 }
      ]
    },
    {
      courseTitle: "Executive Business English & IELTS 7.5+ Score Mastery",
      categoryName: "language",
      shortdesc: "Intensive 6-week program designed for professionals seeking high IELTS band scores, confident global meetings, and persuasive negotiations.",
      longdesc: "Elevate your international communication skills with certified native instructors.\n• Advanced grammatical accuracy and sophisticated academic vocabulary\n• IELTS Academic Writing Task 1 & Task 2 structure frameworks that guarantee 7.5+\n• Accent reduction, pronunciation clarity, and persuasive meeting techniques\n• Simulated board meeting presentations and cross-cultural debate clinics\n• Weekly 1-on-1 speaking interview mock exams with detailed examiner feedback.",
      whatYouWillLearn: "• Score Band 7.5 or higher in all four IELTS Academic test modules\n• Deliver confident executive presentations and negotiate business deals in English\n• Write concise professional reports, proposals, and executive emails\n• Speak fluently with natural idioms, tone variation, and professional poise",
      startDate: new Date("2026-10-26T18:30:00.000Z"),
      endDate: new Date("2026-12-04T20:30:00.000Z"),
      totalSessions: 18,
      venueIndex: 0,
      price: 320000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.language,
      batches: [
        { batchName: "Evening Group A", startTime: "18:30", endTime: "20:30", days: ["Mon", "Wed", "Fri"], seats: 15 }
      ]
    },
    {
      courseTitle: "Conversational Mongolian for Foreign Professionals & Expats",
      categoryName: "language",
      shortdesc: "Fast-track immersion course in Cyrillic reading, everyday vocabulary, essential grammar, and natural conversational dialogue for living in Mongolia.",
      longdesc: "Connect genuinely with local colleagues, friends, and the community.\n• Cyrillic alphabet mastery and authentic pronunciation coaching\n• Real-world dialogues: dining out, shopping, taxi directions, and hospitality\n• Cultural etiquette, festive customs (Tsagaan Sar & Naadam), and social norms\n• Interactive role-playing sessions in real Ulaanbaatar environments\n• Small class size ensuring personal feedback and speaking time for every student.",
      whatYouWillLearn: "• Read, write, and pronounce Cyrillic Mongolian accurately\n• Hold everyday practical conversations with confidence\n• Understand cultural context, body language, and nomadic traditions\n• Navigate official paperwork, services, and local relationships effortlessly",
      startDate: new Date("2026-11-02T18:00:00.000Z"),
      endDate: new Date("2026-12-18T20:00:00.000Z"),
      totalSessions: 14,
      venueIndex: 0,
      price: 260000,
      refundPolicy: "1 Day Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.language,
      batches: [
        { batchName: "Evening Cohort", startTime: "18:00", endTime: "20:00", days: ["Tue", "Thu"], seats: 12 }
      ]
    },
    {
      courseTitle: "Traditional Morin Khuur Instrument & Folk Melody Foundations",
      categoryName: "music",
      shortdesc: "Master the iconic two-stringed horse-head fiddle from holding posture and bow technique to playing traditional Mongolian melodies (Tatlaga).",
      longdesc: "Connect with the spirit of the steppe through its most sacred instrument.\n• Anatomical parts of the Morin Khuur, string tuning, and proper bow grip\n• Left-hand finger placement, sliding techniques, and horse-hair acoustics\n• Traditional rhythmic patterns imitating galloping steeds and open breezes\n• Step-by-step guidance on 5 classical folk songs and ancient melodies\n• Small group studio with instruments available for practice during class.",
      whatYouWillLearn: "• Tune, care for, and hold the Morin Khuur with proper traditional posture\n• Read musical notation and understand traditional oral melody structures\n• Perform 5 complete Mongolian folk songs with proper acoustic nuance\n• Experience the meditative, emotional depth of authentic nomadic music",
      startDate: new Date("2026-11-03T17:30:00.000Z"),
      endDate: new Date("2026-12-24T19:30:00.000Z"),
      totalSessions: 16,
      venueIndex: 3,
      price: 240000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.music,
      batches: [
        { batchName: "Twilight Session", startTime: "17:30", endTime: "19:30", days: ["Tue", "Thu"], seats: 12 }
      ]
    },
    {
      courseTitle: "Acoustic & Electric Guitar Mastery: Chords, Scales & Solos",
      categoryName: "music",
      shortdesc: "Comprehensive guitar training from open chords and fingerpicking to blues scales, improvisation, and dynamic rhythm playing.",
      longdesc: "From your very first strum to commanding the stage with soulful solos.\n• Essential open chords, barre chords, and smooth transitions\n• Fingerstyle acoustic techniques and percussive rhythm grooves\n• Pentatonic and diatonic scale positions across the entire fretboard\n• Ear training, transcribing songs, and improvising over backing tracks\n• End-of-cohort live acoustic showcase for family and friends.",
      whatYouWillLearn: "• Play rhythm and lead guitar cleanly across multiple music genres\n• Read chord charts, lead sheets, and guitar tablature with ease\n• Improvise expressive guitar solos using pentatonic and blues scales\n• Master proper hand posture to play pain-free for hours",
      startDate: new Date("2026-11-07T14:00:00.000Z"),
      endDate: new Date("2026-12-26T17:00:00.000Z"),
      totalSessions: 14,
      venueIndex: 3,
      price: 220000,
      refundPolicy: "1 Day Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.music,
      batches: [
        { batchName: "Saturday Jam Cohort", startTime: "14:00", endTime: "17:00", days: ["Sat"], seats: 15 }
      ]
    },
    {
      courseTitle: "Urban Hip-Hop & Commercial Street Dance Choreography",
      categoryName: "music & dance",
      shortdesc: "High-energy 8-week street dance training focusing on rhythm, isolations, popping, grooves, and full viral stage routines.",
      longdesc: "Express yourself through explosive movement, musicality, and street dance culture.\n• Foundations of bounce, groove, footwork, and torso isolations\n• Learning complex commercial choreography combinations step by step\n• Stage presence, camera awareness, and dynamic performance energy\n• Professional studio filming of your final choreographed routine\n• Welcoming, supportive environment for all fitness and experience levels.",
      whatYouWillLearn: "• Master precise body isolations, coordination, and musical timing\n• Learn and perform 3 complete high-energy commercial choreographies\n• Boost cardiovascular endurance, flexibility, and spatial awareness\n• Gain confidence dancing on camera and in front of an audience",
      startDate: new Date("2026-11-09T19:00:00.000Z"),
      endDate: new Date("2026-12-30T21:00:00.000Z"),
      totalSessions: 16,
      venueIndex: 4,
      price: 180000,
      refundPolicy: "1 Day Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.dance,
      batches: [
        { batchName: "Evening Dancers", startTime: "19:00", endTime: "21:00", days: ["Mon", "Wed"], seats: 20 }
      ]
    },
    {
      courseTitle: "Classical Ballet Technique, Alignment & Posture Intensive",
      categoryName: "music & dance",
      shortdesc: "Develop long, sculpted ballet lines, elegant posture, core stability, and graceful poise through classical Vaganova barre technique.",
      longdesc: "Grace, discipline, and profound physical conditioning.\n• Classical Vaganova barre exercises: pliés, battements, and ronds de jambe\n• Center work focusing on balance, adagio, and pirouette preparation\n• Strengthening arches, ankles, and stabilizing deep core muscles\n• Correcting anterior pelvic tilt and daily slouching habits\n• Open to adult beginners and continuing ballet enthusiasts.",
      whatYouWillLearn: "• Execute fundamental classical ballet positions and movements correctly\n• Dramatically improve balance, flexibility, and upright posture\n• Strengthen inner thighs, glutes, and deep spinal stabilizers\n• Cultivate poise, grace, and body awareness that carries into daily life",
      startDate: new Date("2026-11-10T10:00:00.000Z"),
      endDate: new Date("2026-12-29T12:00:00.000Z"),
      totalSessions: 15,
      venueIndex: 2,
      price: 210000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.dance,
      batches: [
        { batchName: "Morning Barre", startTime: "10:00", endTime: "12:00", days: ["Tue", "Thu"], seats: 16 }
      ]
    },
    {
      courseTitle: "Pottery Wheel Throwing, Trimming & Glaze Chemistry",
      categoryName: "arts & crafts",
      shortdesc: "Comprehensive 6-week studio apprenticeship in ceramic wheel throwing, centered wedging, wall pulling, trimming, and vibrant glazing.",
      longdesc: "Transform humble earth into timeless functional pottery.\n• Clay centering, opening, and pulling consistent cylinder walls\n• Creating mugs, bowls, vases, and teacups with comfortable handles\n• Foot trimming techniques and decorative carving\n• Non-toxic food-safe glaze dipping and atmospheric kiln firing\n• Take home 8 to 10 fully finished, glazed ceramic pieces of your own creation.",
      whatYouWillLearn: "• Center and throw up to 2kg of clay smoothly on the electric wheel\n• Trim balanced feet and attach sturdy, ergonomic pulled handles\n• Understand glaze chemistry, firing cones, and color aesthetics\n• Produce durable, microwave- and dishwasher-safe kitchen ceramics",
      startDate: new Date("2026-11-14T11:00:00.000Z"),
      endDate: new Date("2026-12-19T15:00:00.000Z"),
      totalSessions: 12,
      venueIndex: 3,
      price: 340000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.art,
      batches: [
        { batchName: "Weekend Studio", startTime: "11:00", endTime: "15:00", days: ["Sat"], seats: 10 }
      ]
    },
    {
      courseTitle: "Oil Painting on Canvas: Master Studies, Light & Texture",
      categoryName: "arts & crafts",
      shortdesc: "Learn classical oil painting methods: grisaille underpainting, color theory, chiaroscuro lighting, and rich impasto brushwork.",
      longdesc: "Experience the timeless beauty of oil painting on primed linen canvas.\n• Palette preparation, color temperature, and color harmony mixing\n• Value studies (light vs shadow) and observational perspective\n• Glazing and layering techniques pioneered by Old Masters\n• Complete 2 comprehensive paintings: an atmospheric still life and a landscape\n• High-grade artist paints, mediums, brushes, and stretched canvases provided.",
      whatYouWillLearn: "• Mix accurate colors and values without creating muddy mixtures\n• Build paintings systematically from underdrawing to final highlights\n• Create realistic depth, soft edges, and three-dimensional form\n• Properly clean, care for, and preserve brushes and archival canvases",
      startDate: new Date("2026-11-15T13:30:00.000Z"),
      endDate: new Date("2026-12-27T17:30:00.000Z"),
      totalSessions: 12,
      venueIndex: 3,
      price: 310000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.art,
      batches: [
        { batchName: "Sunday Atelier", startTime: "13:30", endTime: "17:30", days: ["Sun"], seats: 12 }
      ]
    },
    {
      courseTitle: "Mindfulness-Based Stress Reduction (MBSR) 8-Week Cohort",
      categoryName: "wellness",
      shortdesc: "The gold-standard evidence-based mindfulness curriculum proven to reduce chronic stress, regulate anxiety, and cultivate mental calm.",
      longdesc: "A scientifically validated pathway to emotional equilibrium and resilience.\n• Body scan meditations to systematically release physical tension\n• Breath-focused mindfulness to quiet rumination and anxious thought spirals\n• Gentle mindful yoga and somatic awareness exercises\n• Cognitive strategies for responding mindfully rather than reacting impulsively\n• Includes dedicated daily meditation audio tracks and workbook.",
      whatYouWillLearn: "• Develop a sustainable, daily 20-minute personal meditation practice\n• Recognize early physiological signs of stress and de-escalate immediately\n• Improve sleep quality, emotional regulation, and cognitive focus\n• Navigate high-pressure workplace and personal situations with equanimity",
      startDate: new Date("2026-11-16T19:00:00.000Z"),
      endDate: new Date("2027-01-11T21:00:00.000Z"),
      totalSessions: 8,
      venueIndex: 2,
      price: 250000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.wellness,
      batches: [
        { batchName: "Monday Mindfulness", startTime: "19:00", endTime: "21:00", days: ["Mon"], seats: 18 }
      ]
    },
    {
      courseTitle: "Holistic Nutrition, Gut Health & Plant-Based Meal Prep",
      categoryName: "wellness",
      shortdesc: "Transform your relationship with food through gut microbiome science, anti-inflammatory nutrition, and practical weekly batch cooking.",
      longdesc: "Fuel your body with vitality, clear mental energy, and deep healing.\n• The gut-brain axis: how your microbiome dictates mood, focus, and immunity\n• Decoding food labels, micro-nutrients, and inflammatory additives\n• Fermentation workshops: homemade kimchi, sauerkraut, and kombucha\n• Hands-on culinary prep sessions creating balanced, ready-to-eat weekly jars\n• Customized meal planning templates and pantry restocking guides.",
      whatYouWillLearn: "• Build nutrient-dense meals that stabilize blood sugar and all-day energy\n• Make fermented, probiotic-rich foods safely in your home kitchen\n• Prep 5 days of wholesome, balanced meals in under 2 hours on weekends\n• Reduce chronic digestive bloating, brain fog, and systemic inflammation",
      startDate: new Date("2026-11-21T10:00:00.000Z"),
      endDate: new Date("2026-12-19T13:00:00.000Z"),
      totalSessions: 10,
      venueIndex: 2,
      price: 220000,
      refundPolicy: "1 Day Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.wellness,
      batches: [
        { batchName: "Saturday Culinary Lab", startTime: "10:00", endTime: "13:00", days: ["Sat"], seats: 15 }
      ]
    },
    {
      courseTitle: "Brazilian Jiu-Jitsu (BJJ) Fundamentals & Practical Self-Defense",
      categoryName: "sports",
      shortdesc: "Learn leverage-based martial arts, positional control, joint submissions, and realistic escape techniques in a safe, ego-free environment.",
      longdesc: "Master the 'gentle art' that allows a smaller person to successfully defend against a larger opponent.\n• Essential ground movements: shrimping, bridging, technical stand-ups\n• Escaping dominant positions: mount, side control, and back control\n• High-percentage submissions: armbars, triangles, and rear naked chokes\n• Positional sparring (rolling) with progressive, safe resistance\n• Clean mats, certified black belt instruction, and complimentary loaner Gi.",
      whatYouWillLearn: "• Defend yourself effectively on the ground using leverage and physics\n• Escape dangerous hold-downs and neutralize aggressive attacks safely\n• Develop functional full-body strength, grip endurance, and spatial reflexes\n• Build unshakeable mental calmness and problem-solving under physical pressure",
      startDate: new Date("2026-11-23T18:00:00.000Z"),
      endDate: new Date("2027-01-18T19:30:00.000Z"),
      totalSessions: 16,
      venueIndex: 4,
      price: 260000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.sports,
      batches: [
        { batchName: "Evening Fundamentals", startTime: "18:00", endTime: "19:30", days: ["Mon", "Wed"], seats: 20 }
      ]
    },
    {
      courseTitle: "Public Speaking, Executive Charisma & Persuasive Storytelling",
      categoryName: "personal development",
      shortdesc: "Overcome stage fright, command room attention, structure irresistible keynote talks, and speak with authenticity and emotional impact.",
      longdesc: "Your voice is your greatest leadership asset.\n• Dismantling speech anxiety through cognitive reframing and vocal grounding\n• The Hero's Journey framework adapted for high-stakes business presentations\n• Vocal dynamics: pacing, intentional pauses, pitch inflections, and resonance\n• Non-verbal mastery: eye contact, purposeful stage movement, and open posture\n• Weekly recorded speeches with personalized video playback critique.",
      whatYouWillLearn: "• Deliver speeches without relying on notes or memorized scripts\n• Craft compelling narratives that move audiences to take immediate action\n• Handle hostile questions and off-the-cuff remarks with composure\n• Radiate natural executive presence on stage, in boardrooms, and on video",
      startDate: new Date("2026-11-28T14:00:00.000Z"),
      endDate: new Date("2027-01-16T17:00:00.000Z"),
      totalSessions: 8,
      venueIndex: 5,
      price: 290000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: false,
      images: COURSE_IMAGES.development,
      batches: [
        { batchName: "Saturday Leadership", startTime: "14:00", endTime: "17:00", days: ["Sat"], seats: 16 }
      ]
    },

    // --- 5 PAST FIXED-START COURSES (Completed in July, Aug, early Sep 2026) ---
    {
      courseTitle: "Modern UI/UX Design Systems with Figma & Design Tokens",
      categoryName: "coding & software",
      shortdesc: "Completed summer cohort on building scalable component libraries, auto-layout variants, interactive micro-prototypes, and design handoffs.",
      longdesc: "A hands-on professional cohort that graduated 24 junior-to-mid designers.\n• Atomic design methodology and token architecture in Figma\n• Interactive high-fidelity prototyping and micro-animation specs\n• Conducting user research, usability tests, and wireframing\n• Developer design handoff workflows with zero friction.",
      whatYouWillLearn: "• Build scalable design systems with reusable Figma components and variants\n• Conduct rigorous user usability interviews and synthesize research data\n• Create polished interactive prototypes ready for user testing",
      startDate: new Date("2026-07-06T18:00:00.000Z"),
      endDate: new Date("2026-08-26T20:30:00.000Z"),
      totalSessions: 16,
      venueIndex: 0,
      price: 350000,
      refundPolicy: "No Refund",
      status: "Past",
      isDraft: false,
      images: COURSE_IMAGES.coding,
      batches: [
        { batchName: "Summer Cohort", startTime: "18:00", endTime: "20:30", days: ["Mon", "Wed"], seats: 25 }
      ]
    },
    {
      courseTitle: "Agile Project Management & Professional Scrum Master Prep",
      categoryName: "business",
      shortdesc: "Completed professional intensive on Scrum ceremonies, sprint backlog grooming, Kanban flow metrics, and PSM certification exam readiness.",
      longdesc: "Successfully trained 18 project managers across leading tech and banking enterprises.\n• In-depth Scrum framework: Sprint Planning, Daily Scrum, Review & Retrospective\n• Writing clear user stories, acceptance criteria, and story point estimation\n• Eliminating blockers and facilitating cross-functional team synergy\n• Over 150 practice certification questions with comprehensive explanations.",
      whatYouWillLearn: "• Lead high-velocity Scrum teams through complex product delivery\n• Facilitate engaging, effective agile team ceremonies\n• Track and communicate sprint progress using burndown and velocity charts",
      startDate: new Date("2026-07-11T10:00:00.000Z"),
      endDate: new Date("2026-08-15T14:00:00.000Z"),
      totalSessions: 10,
      venueIndex: 5,
      price: 290000,
      refundPolicy: "No Refund",
      status: "Past",
      isDraft: false,
      images: COURSE_IMAGES.business,
      batches: [
        { batchName: "Saturday PM Group", startTime: "10:00", endTime: "14:00", days: ["Sat"], seats: 20 }
      ]
    },
    {
      courseTitle: "50-Hour Vinyasa Yoga Teacher Intensive & Alignment Immersion",
      categoryName: "fitness & health",
      shortdesc: "Rigorous 50-hour immersion for teachers and passionate practitioners focusing on safe adjustments, anatomy, and creative sequencing.",
      longdesc: "Deepened the practice and teaching credentials of 14 yoga instructors.\n• Functional musculoskeletal anatomy of backbends, inversions, and hip openers\n• Verbal cueing precision and compassionate hands-on physical adjustments\n• Intelligent vinyasa flow sequencing building towards peak postures\n• Pranayama breath control, philosophy of Patanjali's Yoga Sutras.",
      whatYouWillLearn: "• Sequence creative, safe 60-minute and 75-minute vinyasa classes\n• Offer tailored modifications and hands-on assists for all body types\n• Deepen your personal inversion and arm balance practice",
      startDate: new Date("2026-07-18T08:30:00.000Z"),
      endDate: new Date("2026-08-22T13:30:00.000Z"),
      totalSessions: 12,
      venueIndex: 2,
      price: 480000,
      refundPolicy: "No Refund",
      status: "Past",
      isDraft: false,
      images: COURSE_IMAGES.fitness,
      batches: [
        { batchName: "Weekend Intensive", startTime: "08:30", endTime: "13:30", days: ["Sat", "Sun"], seats: 15 }
      ]
    },
    {
      courseTitle: "Traditional Mongolian Archery (Sur Kharvaa) Foundations",
      categoryName: "sports",
      shortdesc: "Mastered traditional composite horn bow mechanics, thumb ring draw, stance balance, and accurate target shooting at 40 meters.",
      longdesc: "A celebrated cultural sports clinic held throughout the summer festival season.\n• Historic mechanics of the composite horn bow and arrow dynamics\n• Mastering the Mongolian thumb release and steady breathing focus\n• Target shooting clinics at 30m, 40m, and 75m regulation distances\n• Safety, bow maintenance, string waxing, and feathered arrow care.",
      whatYouWillLearn: "• Safely handle, string, and shoot traditional Mongolian composite bows\n• Master the thumb ring draw technique for rapid, consistent releases\n• Cultivate exceptional focus, mental stillness, and upper body stability",
      startDate: new Date("2026-07-25T14:00:00.000Z"),
      endDate: new Date("2026-08-29T17:00:00.000Z"),
      totalSessions: 10,
      venueIndex: 4,
      price: 230000,
      refundPolicy: "No Refund",
      status: "Past",
      isDraft: false,
      images: COURSE_IMAGES.sports,
      batches: [
        { batchName: "Summer Archers", startTime: "14:00", endTime: "17:00", days: ["Sat"], seats: 16 }
      ]
    },
    {
      courseTitle: "Summer Digital Photography & Lightroom Color Grading",
      categoryName: "arts & crafts",
      shortdesc: "Completed visual arts course mastering manual DSLR/mirrorless camera exposure, golden-hour portraiture, and Adobe Lightroom presets.",
      longdesc: "Taught 20 photographers how to shoot confidently in manual mode.\n• Exposure triangle: shutter speed, aperture depth of field, and ISO grain\n• Golden hour street photography walks through vibrant Ulaanbaatar districts\n• Studio portrait lighting with softboxes and reflectors\n• Complete Adobe Lightroom raw workflow, tonal curves, and color grading.",
      whatYouWillLearn: "• Shoot comfortably in full Manual mode in any lighting condition\n• Frame dynamic, storytelling compositions with leading lines and negative space\n• Color grade raw images to professional publication standards in Lightroom",
      startDate: new Date("2026-08-01T10:00:00.000Z"),
      endDate: new Date("2026-09-05T13:00:00.000Z"),
      totalSessions: 10,
      venueIndex: 3,
      price: 250000,
      refundPolicy: "No Refund",
      status: "Past",
      isDraft: false,
      images: COURSE_IMAGES.art,
      batches: [
        { batchName: "Saturday Photographers", startTime: "10:00", endTime: "13:00", days: ["Sat"], seats: 20 }
      ]
    },

    // --- 2 DRAFT FIXED-START COURSES ---
    {
      courseTitle: "Executive Negotiation & High-Stakes Conflict Resolution [Draft]",
      categoryName: "personal development",
      shortdesc: "Draft curriculum for corporate executives on principled negotiation, emotional de-escalation, and collaborative deal structuring.",
      longdesc: "Draft course module for executive retreat. Instructor schedules and guest arbitrator confirmations in progress.",
      whatYouWillLearn: "• Apply the Harvard Principled Negotiation method to high-stakes contracts\n• Separate personalities from problems and invent options for mutual gain\n• De-escalate heated workplace conflicts with diplomatic tact",
      startDate: new Date("2027-01-18T18:00:00.000Z"),
      endDate: new Date("2027-03-01T20:30:00.000Z"),
      totalSessions: 12,
      venueIndex: 5,
      price: 390000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: true,
      images: COURSE_IMAGES.development,
      batches: [
        { batchName: "Executive Evening", startTime: "18:00", endTime: "20:30", days: ["Mon", "Wed"], seats: 15 }
      ]
    },
    {
      courseTitle: "AI-Powered Productivity for Managers & Enterprise Teams [Draft]",
      categoryName: "technology",
      shortdesc: "Draft curriculum on deploying AI agents, automated workflow pipelines, and prompt engineering to multiply team output 5x.",
      longdesc: "Draft program for corporate enterprise teams. Syllabus outline under review.",
      whatYouWillLearn: "• Automate repetitive corporate tasks using AI workflow builders\n• Engineer high-precision prompts for complex analytical briefs\n• Implement ethical enterprise AI governance policies",
      startDate: new Date("2027-02-01T14:00:00.000Z"),
      endDate: new Date("2027-03-15T17:00:00.000Z"),
      totalSessions: 12,
      venueIndex: 0,
      price: 450000,
      refundPolicy: "7 Days Before",
      status: "Upcoming",
      isDraft: true,
      images: COURSE_IMAGES.tech,
      batches: [
        { batchName: "Afternoon Cohort", startTime: "14:00", endTime: "17:00", days: ["Tue", "Thu"], seats: 20 }
      ]
    }
  ];

  console.log(`Prepared ${rawCourses.length} fixedStart courses for insertion.`);

  const coursesToInsert = rawCourses.map((c, idx) => {
    const venue = COURSE_VENUES[c.venueIndex % COURSE_VENUES.length];
    const catId = getCatId(c.categoryName);

    const formattedBatches = c.batches.map(b => ({
      _id: new mongoose.Types.ObjectId(),
      batchName: b.batchName,
      startTime: b.startTime,
      endTime: b.endTime,
      days: b.days,
      seats: b.seats,
      ReservedExternally: 0,
      status: "Active",
      cancelledDates: [],
      reservedDates: []
    }));

    return {
      _id: new mongoose.Types.ObjectId(),
      courseTitle: c.courseTitle,
      shortdesc: c.shortdesc,
      longdesc: c.longdesc,
      whatYouWillLearn: c.whatYouWillLearn,
      courseCategory: catId,
      posterImage: [c.images[0]],
      mediaLinks: c.images.slice(1),
      shortTeaserVideo: [],
      venueName: venue.venueName,
      venueAddress: venue.venueAddress,
      startDate: c.startDate,
      endDate: c.endDate,
      totalSessions: c.totalSessions,
      timeZone: "Asia/Ulaanbaatar",
      batches: formattedBatches,
      price: c.price,
      refundPolicy: c.refundPolicy,
      oneMonthPassEnabled: false,
      oneMonthPassPrice: 0,
      threeMonthPassEnabled: false,
      threeMonthPassPrice: 0,
      enrollmentType: "fixedStart",
      status: c.status,
      isDraft: c.isDraft,
      bookingCutOff: "2h",
      isFeatured: idx % 5 === 0,
      featuredExpiry: idx % 5 === 0 ? new Date("2026-11-15T00:00:00.000Z") : null,
      activePromotionPackage: null,
      assignedStaff: [],
      createdBy: organizer._id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  const result = await Course.collection.insertMany(coursesToInsert);
  console.log(`Successfully seeded ${result.insertedCount} fixedStart courses!`);

  const breakdown = await Course.aggregate([
    { $match: { createdBy: organizer._id } },
    { $group: { _id: { status: "$status", isDraft: "$isDraft", enrollmentType: "$enrollmentType" }, count: { $sum: 1 } } }
  ]);
  console.log("Courses Breakdown for test3@yopmail.com:", JSON.stringify(breakdown, null, 2));

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

seedCourses().catch(console.error);
