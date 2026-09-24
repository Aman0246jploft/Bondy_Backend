const mongoose = require('mongoose');
require('dotenv').config();
const Transaction = require('../db/models/Transaction');
const Attendee = require('../db/models/Attendee');

async function clearBookings() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB.");

  const txCountBefore = await Transaction.countDocuments();
  const attCountBefore = await Attendee.countDocuments();
  console.log(`Current Transactions (Bookings): ${txCountBefore}`);
  console.log(`Current Attendees (Tickets): ${attCountBefore}`);

  // Delete all transactions and attendees
  const txResult = await Transaction.deleteMany({});
  const attResult = await Attendee.deleteMany({});

  console.log(`Deleted ${txResult.deletedCount} transactions (bookings).`);
  console.log(`Deleted ${attResult.deletedCount} attendees (tickets).`);

  const txCountAfter = await Transaction.countDocuments();
  const attCountAfter = await Attendee.countDocuments();
  console.log(`Remaining Transactions: ${txCountAfter}`);
  console.log(`Remaining Attendees: ${attCountAfter}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

clearBookings().catch(console.error);
