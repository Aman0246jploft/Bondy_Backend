const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const DB_STRING = process.env.DB_STRING;

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(DB_STRING);
    console.log("Connected.");

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections in DB:");
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(` - ${col.name}: ${count} docs`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
