require("dotenv").config();
const mongoose = require("mongoose");
const { Course, User, Category, Review, Comment, Transaction } = require("../db/index");

async function seedRichCourse() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB");

  const courseId = new mongoose.Types.ObjectId("6a34047f9a138b99b2a3d611");

  // Find or pick category
  let cat = await Category.findOne({ type: "course", name: /Software|Coding|Technology/i });
  if (!cat) {
    cat = await Category.findOne({ type: "course" });
  }

  // Find organizer
  let organizer = await User.findOne({ roleId: 2, isVerified: true });
  if (!organizer) {
    organizer = await User.findOne();
  }

  // Find customers for bookings, reviews, and comments
  const customers = await User.find({ _id: { $ne: organizer._id } }).limit(6);

  const batch1Id = new mongoose.Types.ObjectId();
  const batch2Id = new mongoose.Types.ObjectId();
  const batch3Id = new mongoose.Types.ObjectId();

  const now = new Date();
  const startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const courseData = {
    _id: courseId,
    courseTitle: "Full-Stack System Design & Advanced Cloud Architecture Masterclass",
    courseCategory: cat?._id,
    shortdesc: "Comprehensive hands-on engineering masterclass covering high-throughput microservices, distributed caching, event streaming with Kafka, and Kubernetes cluster orchestration.",
    longdesc: `Master modern distributed systems and advanced cloud architecture from senior principal architects. This intensive masterclass bridges the gap between software development and enterprise-scale system engineering.

Curriculum Highlights:
• Scalable Microservices & Event-Driven Patterns (Kafka, gRPC, RabbitMQ)
• High-Performance Data Stores: Redis clustering, PostgreSQL sharding, NoSQL partitioning
• Cloud Infrastructure as Code: Terraform, Docker, Kubernetes Helm deployments
• Observability, Tracing & Resilience: Prometheus, OpenTelemetry, Circuit Breakers

Includes live coding labs, architecture review workshops, and 1-on-1 capstone project feedback.`,
    whatYouWillLearn: `• Design fault-tolerant distributed systems handling 100K+ requests per second
• Implement event-driven architectures with Apache Kafka and transactional outbox
• Master database indexing, query optimization, connection pooling, and sharding
• Deploy production-ready Kubernetes clusters with automated CI/CD pipelines
• Set up distributed tracing, monitoring metrics, and automated alerting dashboards`,
    posterImage: [
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80",
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=80"
    ],
    mediaLinks: [
      "https://cloudarchitectmasterclass.io",
      "https://github.com/system-design-curriculum",
      "https://youtube.com/watch?v=course-preview"
    ],
    shortTeaserVideo: [
      "https://samplelib.com/lib/preview/mp4/sample-10s.mp4"
    ],
    venueName: "TechHub Innovation Campus & Developer Lab",
    venueAddress: {
      address: "Olympic Street 14, IT Park Building 3rd Floor",
      city: "Ulaanbaatar",
      state: "Ulaanbaatar",
      country: "Mongolia",
      zipcode: "14241",
      coordinates: [106.9200, 47.9150]
    },
    startDate: startDate,
    endDate: endDate,
    salesStart: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
    totalSessions: 24,
    timeZone: "Asia/Ulaanbaatar",
    batches: [
      {
        _id: batch1Id,
        batchName: "Weekend Intensive Track",
        days: ["Sat", "Sun"],
        startTime: "10:00",
        endTime: "14:00",
        seats: 35,
        ReservedExternally: 5,
        price: 450000,
        sessions: 12,
        startDate: startDate,
        endDate: endDate,
        status: "Active"
      },
      {
        _id: batch2Id,
        batchName: "Weekday Evening Fast-Track",
        days: ["Tue", "Thu"],
        startTime: "18:30",
        endTime: "21:30",
        seats: 40,
        ReservedExternally: 4,
        price: 380000,
        sessions: 16,
        startDate: startDate,
        endDate: endDate,
        status: "Active"
      },
      {
        _id: batch3Id,
        batchName: "Morning Cohort (Accelerated)",
        days: ["Mon", "Wed", "Fri"],
        startTime: "08:30",
        endTime: "11:00",
        seats: 30,
        ReservedExternally: 2,
        price: 420000,
        sessions: 18,
        startDate: startDate,
        endDate: endDate,
        status: "Active"
      }
    ],
    price: 380000,
    refundPolicy: "7 Days Before",
    oneMonthPassEnabled: true,
    oneMonthPassPrice: 180000,
    threeMonthPassEnabled: true,
    threeMonthPassPrice: 450000,
    enrollmentType: "fixedStart",
    status: "Upcoming",
    isDraft: false,
    bookingCutOff: "24 Hours prior to start",
    isFeatured: true,
    ageRestriction: "18+",
    createdBy: organizer._id,
  };

  // Upsert course
  await Course.findByIdAndUpdate(courseId, { $set: courseData }, { upsert: true, new: true });
  console.log("Course updated with full rich details!");

  // Clean old related records
  await Review.deleteMany({ entityId: courseId });
  await Comment.deleteMany({ $or: [{ course: courseId }, { entityId: courseId }] });
  await Transaction.deleteMany({ courseId: courseId });

  // Seed Transactions (Course Bookings / Students)
  if (customers.length >= 3) {
    const transactionsToInsert = [
      {
        bookingId: `BK-CR-${Date.now()}-1`,
        userId: customers[0]._id,
        courseId: courseId,
        bookingType: "COURSE",
        status: "PAID",
        paymentStatus: "PAID",
        batchId: batch1Id.toString(),
        basePrice: 450000,
        qty: 1,
        totalAmount: 450000,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        bookingId: `BK-CR-${Date.now()}-2`,
        userId: customers[1]._id,
        courseId: courseId,
        bookingType: "COURSE",
        status: "PAID",
        paymentStatus: "PAID",
        batchId: batch2Id.toString(),
        basePrice: 380000,
        qty: 1,
        totalAmount: 380000,
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        bookingId: `BK-CR-${Date.now()}-3`,
        userId: customers[2]._id,
        courseId: courseId,
        bookingType: "COURSE",
        status: "PAID",
        paymentStatus: "PAID",
        passType: "1_month",
        basePrice: 180000,
        qty: 1,
        totalAmount: 180000,
        createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
      },
      ...(customers[3] ? [{
        bookingId: `BK-CR-${Date.now()}-4`,
        userId: customers[3]._id,
        courseId: courseId,
        bookingType: "COURSE",
        status: "PAID",
        paymentStatus: "PAID",
        batchId: batch3Id.toString(),
        basePrice: 420000,
        qty: 1,
        totalAmount: 420000,
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
      }] : [])
    ];

    await Transaction.insertMany(transactionsToInsert);
    console.log(`Seeded ${transactionsToInsert.length} course transactions/students.`);
  }

  // Seed Reviews
  if (customers.length >= 3) {
    const reviewsToInsert = [
      {
        userId: customers[0]._id,
        entityId: courseId,
        entityModel: "Course",
        targetUserId: organizer._id,
        rating: 5,
        review: "The system design modules were exceptional! Finally understood Kafka partitioning and high-concurrency database indexing.",
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
      },
      {
        userId: customers[1]._id,
        entityId: courseId,
        entityModel: "Course",
        targetUserId: organizer._id,
        rating: 5,
        review: "Hands-down the most practical distributed architecture course available. The live Kubernetes labs saved us months of trial and error.",
        createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        userId: customers[2]._id,
        entityId: courseId,
        entityModel: "Course",
        targetUserId: organizer._id,
        rating: 4.8,
        review: "Top tier instructor. Very thorough code reviews during weekly office hours.",
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      }
    ];

    await Review.insertMany(reviewsToInsert);
    console.log(`Seeded ${reviewsToInsert.length} course reviews.`);
  }

  // Seed Comments
  if (customers.length >= 3) {
    const commentsToInsert = [
      {
        user: customers[0]._id,
        entityId: courseId,
        entityModel: "Course",
        content: "Are session recordings provided if we miss a weekend intensive lecture?",
        likes: [customers[1]._id, customers[2]._id],
        createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
      },
      {
        user: customers[1]._id,
        entityId: courseId,
        entityModel: "Course",
        content: "Enrolled in the Weekday evening batch! Is there a preparatory reading list before Day 1?",
        likes: [customers[0]._id],
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      },
      {
        user: customers[2]._id,
        entityId: courseId,
        entityModel: "Course",
        content: "The 1-month pass option is super convenient for team training. Recommended!",
        likes: [customers[0]._id, customers[1]._id],
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
      }
    ];

    await Comment.insertMany(commentsToInsert);
    console.log(`Seeded ${commentsToInsert.length} course comments.`);
  }

  console.log("✅ All rich course data seeded successfully!");
  process.exit(0);
}

seedRichCourse().catch(err => {
  console.error("Course seeding error:", err);
  process.exit(1);
});
