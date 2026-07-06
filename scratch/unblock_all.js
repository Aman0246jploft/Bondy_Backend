const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("Connected to MongoDB database.");

    const { Block, Chat } = require("../db");

    // 1. Delete all block records
    const blockDeleteRes = await Block.deleteMany({});
    console.log(`Deleted ${blockDeleteRes.deletedCount} block documents.`);

    // 2. Clear blockedBy array on all chats
    const chatUpdateRes = await Chat.updateMany({}, { $set: { blockedBy: [] } });
    console.log(`Reset blockedBy on ${chatUpdateRes.modifiedCount} chats.`);

    console.log("Unblocked all users successfully!");
  } catch (err) {
    console.error("Error clearing blocks:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from database.");
  }
}

run();
