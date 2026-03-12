const mongoose = require("mongoose");

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

    // Seed default global settings (only if not already set)
    try {
      const GlobalSetting = require("./models/GlobalSetting");
      await GlobalSetting.findOneAndUpdate(
        { key: "REFERRAL_REWARD_AMOUNT" },
        { $setOnInsert: { key: "REFERRAL_REWARD_AMOUNT", value: 75000, description: "Referral reward credited to organizer who invited a verified new organizer (in MNT)" } },
        { upsert: true, new: true }
      );
      console.log("✅ REFERRAL_REWARD_AMOUNT setting seeded");
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
};
