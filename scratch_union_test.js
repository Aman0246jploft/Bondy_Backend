const mongoose = require("mongoose");
const { Event, Course } = require("./db");
require("dotenv").config();

async function testUnion() {
  await mongoose.connect(process.env.MONGODB_URL || "mongodb://127.0.0.1:27017/bondy");
  const result = await Event.aggregate([
    { $limit: 1 },
    { $project: { _id: 1, type: "event" } },
    { $unionWith: { coll: "courses", pipeline: [{ $limit: 1 }, { $project: { _id: 1, type: "course" } }] } }
  ]);
  console.log("Union result:", result);
  process.exit(0);
}

testUnion().catch(err => { console.error(err); process.exit(1); });
