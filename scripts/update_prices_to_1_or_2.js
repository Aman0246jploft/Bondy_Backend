const mongoose = require('mongoose');
require('dotenv').config();
const Event = require('../db/models/Event');
const Course = require('../db/models/Course');
const User = require('../db/models/User');

async function main() {
  await mongoose.connect(process.env.DB_STRING);
  console.log("Connected to MongoDB.");

  const organizer = await User.findOne({ email: "test3@yopmail.com" });
  if (!organizer) {
    throw new Error("Organizer test3@yopmail.com not found!");
  }
  const orgId = organizer._id;

  // 1. Update Events
  const events = await Event.find({ createdBy: orgId });
  console.log(`Found ${events.length} events for test3@yopmail.com.`);

  let updatedEventsCount = 0;
  for (const event of events) {
    let ticketsModified = false;
    if (event.tickets && event.tickets.length > 0) {
      event.tickets.forEach((t, idx) => {
        if (!t.isFreeTicket) {
          // Set to 1 or 2
          t.price = (idx % 2 === 0) ? 1 : 2;
          ticketsModified = true;
        }
      });
    }

    // Rebuild addOns string
    const addOns = event.tickets.map(t => {
      const desc = (t.ticketShortDesc || "").replace(/[\r\n]+/g, ' ');
      const startStr = t.salesStart ? new Date(t.salesStart).toISOString().split('T')[0] : '';
      const endStr = t.salesEnd ? new Date(t.salesEnd).toISOString().split('T')[0] : '';
      return `${t.ticketName || ''}|${desc}|${t.price}|${t.qty || 100}|${startStr}|${endStr}`;
    }).join('||');

    await Event.collection.updateOne(
      { _id: event._id },
      { 
        $set: { 
          tickets: event.tickets,
          addOns: addOns,
          updatedAt: new Date()
        } 
      }
    );
    updatedEventsCount++;
  }
  console.log(`Updated prices for ${updatedEventsCount} events to 1-2 MNT.`);

  // 2. Update Courses
  const courses = await Course.find({ createdBy: orgId });
  console.log(`Found ${courses.length} courses for test3@yopmail.com.`);

  let updatedCoursesCount = 0;
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const newPrice = (i % 2 === 0) ? 1 : 2;
    await Course.collection.updateOne(
      { _id: course._id },
      { 
        $set: { 
          price: newPrice,
          updatedAt: new Date()
        } 
      }
    );
    updatedCoursesCount++;
  }
  console.log(`Updated prices for ${updatedCoursesCount} courses to 1-2 MNT.`);

  // 3. Verification check
  const sampleEvent = await Event.findOne({ createdBy: orgId, isFreeEvent: false });
  console.log("Sample Event tickets after update:", sampleEvent.eventTitle, sampleEvent.tickets.map(t => ({ name: t.ticketName, price: t.price })));

  const sampleCourse = await Course.findOne({ createdBy: orgId });
  console.log("Sample Course price after update:", sampleCourse.courseTitle, "Price:", sampleCourse.price);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

main().catch(console.error);
