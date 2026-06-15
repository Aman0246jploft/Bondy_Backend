require("dotenv").config();
const mongoose = require("mongoose");
const { Banner } = require("../db");

const bannersToInsert = [
  {
    "image": "https://images.unsplash.com/photo-1441986300917-64674bd600d8",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1512436991641-6745cdb1723f",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1483985988355-763728e1935b",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1491553895911-0055eca6402d",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f",
    "isActive": true
  },
  {
    "image": "https://images.unsplash.com/photo-1529139574466-a303027c1d8b",
    "isActive": true
  }
];

const { DB_STRING } = process.env;

mongoose.connect(DB_STRING)
  .then(async () => {
    console.log("Connected to MongoDB successfully.");

    // Clear existing banners first if needed? The user said "insert this data in the banner as of now".
    // Let's insert them.
    const result = await Banner.insertMany(bannersToInsert);
    console.log(`Successfully inserted ${result.length} banners.`);

    process.exit(0);
  })
  .catch((err) => {
    console.error("Database connection or insertion error:", err.message);
    process.exit(1);
  });
