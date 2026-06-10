/**
 * updateFreeEventsPrice.js
 * -----------------------------------------------------------
 * Standalone script that finds all events with ticket price = 0
 * and updates them to have a realistic non-zero price (e.g., $15).
 * -----------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Event } = require("../db/index");

const updateFreeEvents = async () => {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("✅ Connected to MongoDB for updating free events...");

    const events = await Event.find({ "tickets.price": 0 });
    console.log(`📋 Found ${events.length} events containing free tickets.`);

    let updatedCount = 0;
    for (const event of events) {
      let isUpdated = false;

      // Update each ticket inside the tickets array if the price is 0
      event.tickets = event.tickets.map(t => {
        if (t.price === 0) {
          t.price = 15; // Set a default price of 15 instead of 0
          isUpdated = true;
        }
        return t;
      });

      if (isUpdated) {
        // Mark the tickets array as modified for mongoose to track nested updates
        event.markModified("tickets");
        await event.save();
        updatedCount++;
      }
    }

    console.log(`✅ Successfully updated ticket prices to non-zero for ${updatedCount} events.`);
  } catch (error) {
    console.error("❌ Error updating event ticket prices:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
};

updateFreeEvents();
