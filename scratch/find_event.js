const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function run() {
  await mongoose.connect(process.env.DB_STRING);
  const { Event } = require("../db");
  const event = await Event.findById("6a33972efd8a6b702b657803").lean();
  console.log("Event details:", {
    _id: event?._id,
    title: event?.eventTitle,
    isDraft: event?.isDraft,
    startDate: event?.startDate,
    endDate: event?.endDate,
    startTime: event?.startTime,
    endTime: event?.endTime,
  });
  await mongoose.disconnect();
}
run();
