const mongoose = require("mongoose");
const GlobalSetting = require("./models/GlobalSetting");

const { DB_STRING } = process.env;

const startTime = Date.now();

mongoose
  .connect(DB_STRING)
  .then(async () => {
    const endTime = Date.now();
    console.log(`✅ DB Connected successfully in ${endTime - startTime}ms`);
    require("../cron/eventStatus.cron");
    require("../cron/bookingCleanup.cron");
    require("../cron/promotionExpiryCron");
    require("../cron/courseStatus.cron")

    // Seed default global settings (only if not already set)
    try {
      await GlobalSetting.findOneAndUpdate(
        { key: "MIN_PAYOUT_CONFIG" },
        { $setOnInsert: { key: "MIN_PAYOUT_CONFIG", value: "1000", description: "Minimum payout amount allowed for organizers (e.g. 1000)" } },
        { upsert: true, new: true }
      );
      await GlobalSetting.findOneAndUpdate(
        { key: "COMMISSION_CONFIG" },
        { $setOnInsert: { key: "COMMISSION_CONFIG", value: "10", description: "Default platform commission percentage (e.g. 10 for 10%)" } },
        { upsert: true, new: true }
      );
      console.log("✅ Default global settings seeded");
    } catch (seedErr) {
      console.error("Seed error:", seedErr.message);
    }
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
  WalletHistory: require("./models/WalletHistory"),
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
  Notification: require("./models/Notification"),
  Attendee: require("./models/Attendee"),
  Wishlist: require("./models/Wishlist"),
  UserSetting: require("./models/UserSetting"),
  PromotionPackage: require("./models/PromotionPackage"),
  Referral: require("./models/Referral"),
  Bug: require("./models/Bug"),
};
