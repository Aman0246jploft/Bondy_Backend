const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const Transaction = require("./db/models/Transaction");
const Attendee = require("./db/models/Attendee");
const { connectDB } = require("./db/connection");
const { resolveSubBookingQR } = require("./routes/controller/controllerAttendee");

async function test() {
  await connectDB();
  
  // Find a transaction with tickets
  const txn = await Transaction.findOne({ "tickets.subBookingId": { $exists: true } });
  if (!txn) {
    console.log("No txn found");
    process.exit();
  }
  
  const subId = txn.tickets[0].subBookingId;
  console.log("Testing subBookingId:", subId);
  
  // Reset it
  await Transaction.updateOne(
    { "tickets.subBookingId": subId },
    { $set: { "tickets.$.isCheckedIn": false } }
  );
  
  try {
    const res1 = await resolveSubBookingQR(subId, txn.userId);
    console.log("First scan success:", res1.ticketId);
  } catch(e) {
    console.log("First scan error:", e.message);
  }
  
  try {
    const res2 = await resolveSubBookingQR(subId, txn.userId);
    console.log("Second scan success:", res2.ticketId);
  } catch(e) {
    console.log("Second scan error:", e.message);
  }
  
  process.exit();
}

test();
