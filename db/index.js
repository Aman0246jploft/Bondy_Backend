const mongoose = require("mongoose");

const { DB_STRING } = process.env;

const startTime = Date.now();

mongoose
  .connect(DB_STRING)
  .then(() => {
    const endTime = Date.now();
    console.log(`✅ DB Connected successfully in ${endTime - startTime}ms`);
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err.message);
  });

module.exports = {
  User: require("./models/User"),
  Category: require("./models/Category"),
  Event: require("./models/Event"),
  Course: require("./models/Course"),
  Transaction: require("./models/Transaction"),
  Follow: require("./models/Follow"),
  Block: require("./models/Block"),
  Report: require("./models/ReportUser"),
  Verification: require("./models/userVerification"),
  Tax: require("./models/Tax"),
  PromoCode: require("./models/PromoCode"),
  Payout: require("./models/Payout"),
  GlobalSetting: require("./models/GlobalSetting"),
  FAQ: require("./models/FAQ"),
  Comment: require("./models/Comment"),
  Chat: require("./models/Chat"),
  Message: require("./models/Message"),
  Review: require("./models/Review"),
  SupportTicket: require("./models/SupportTicket"),
};
