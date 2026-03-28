const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const { Bug, User } = require("./db");
const { formatResponseUrl } = require("./utils/globalFunction");

const MONGO_URI = process.env.DATABASE_URL || process.env.DB_STRING || "mongodb://localhost:27017/bondy";

async function test() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // 1. Create Test User
    const user = await User.create({
      firstName: "Bug",
      lastName: "Reporter",
      email: `reporter_${Date.now()}@test.com`,
      roleId: 3,
    });

    // 2. Create Bug Report
    const bug = await Bug.create({
      userId: user._id,
      title: "UI Glitch",
      description: "Button is overlapping",
      image: "uploads/test-bug.png",
    });
    console.log("Bug created:", bug._id);

    // 3. Test Admin Listing Logic (Mocked)
    const bugs = await Bug.find({ _id: bug._id })
      .populate("userId", "firstName lastName email profileImage")
      .lean();

    const formattedBugs = bugs.map((b) => ({
      ...b,
      image: formatResponseUrl(b.image),
      userId: b.userId ? {
        ...b.userId,
        profileImage: formatResponseUrl(b.userId.profileImage)
      } : null
    }));

    console.log("Formatted Bug Image:", formattedBugs[0].image);
    if (!formattedBugs[0].image.includes(process.env.BACKEND_URL)) {
        console.log("Warning: BACKEND_URL not in formatted image. Check .env");
    }

    if (formattedBugs[0].userId.firstName !== "Bug") throw new Error("Population failed");

    console.log("All tests passed!");

    // Cleanup
    await Bug.deleteOne({ _id: bug._id });
    await User.deleteOne({ _id: user._id });
    console.log("Cleanup done");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

test();
