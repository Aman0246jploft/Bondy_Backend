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
    require("../cron/cronReferralValidation")();
    require("../cron/reminderCron")();

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
      await GlobalSetting.findOneAndUpdate(
        { key: "SOCIAL_LINKS" },
        {
          $setOnInsert: {
            key: "SOCIAL_LINKS",
            value: {
              facebook: "#",
              linkedin: "#",
              instagram: "#",
              youtube: "#",
              apple_store: "#",
              google_play: "#"
            },
            description: "Social media and app store links for the website footer"
          }
        },
        { upsert: true, new: true }
      );
      await GlobalSetting.findOneAndUpdate(
        { key: "FEATURE_EVENT_FEE" },
        { $setOnInsert: { key: "FEATURE_EVENT_FEE", value: "0", description: "Fee for featuring an event" } },
        { upsert: true, new: true }
      );
      // await GlobalSetting.findOneAndUpdate(
      //   { key: "REFERRAL_REWARD_AMOUNT" },
      //   { $setOnInsert: { key: "REFERRAL_REWARD_AMOUNT", value: "0", description: "Reward amount for referrals" } },
      //   { upsert: true, new: true }
      // );
      await GlobalSetting.findOneAndUpdate(
        { key: "BOOKING_CUT_OFF_CONFIG" },
        {
          $setOnInsert: {
            key: "BOOKING_CUT_OFF_CONFIG",
            value: [
              { key: "1h", label: "1 hour before session" },
              { key: "2h", label: "2 hours before session" },
              { key: "4h", label: "4 hours before session" },
              { key: "12h", label: "12 hours before session" },
              { key: "24h", label: "24 hours before session" },
              { key: "48h", label: "48 hours before session" }
            ],
            description: "Available options for course/class booking cut-off times"
          }
        },
        { upsert: true, new: true }
      );
      await GlobalSetting.findOneAndUpdate(
        { key: "FOOTER_LINKS" },
        {
          $setOnInsert: {
            key: "FOOTER_LINKS",
            value: {
              explore: [
                { label: "Events", labelEn: "Events", labelMn: "Арга хэмжээ", href: "/Explore" },
                { label: "Courses", labelEn: "Courses", labelMn: "Сургалт", href: "/Programs-Listing" },
                { label: "Organizers", labelEn: "Organizers", labelMn: "Зохион байгуулагчид", href: "/Organizers" }
              ],
              organizer: [
                { label: "Become an organizer", labelEn: "Become an organizer", labelMn: "Зохион байгуулагч болох", href: "/register?role=organizer" },
                { label: "Partner with us", labelEn: "Partner with us", labelMn: "Хамтрагч болох", href: "/#partner" },
                { label: "Dashboard", labelEn: "Dashboard", labelMn: "Хяналтын самбар", href: "/Dashboard" }
              ],
              help: [
                { label: "Contact Us", labelEn: "Contact Us", labelMn: "Холбоо барих", href: "/contact-us" },
                { label: "Privacy Policy", labelEn: "Privacy Policy", labelMn: "Нууцлалын бодлого", href: "/privacy-policy" },
                { label: "Terms of Service", labelEn: "Terms of Service", labelMn: "Үйлчилгээний нөхцөл", href: "/terms" }
              ],
              titles: {
                explore: { en: "Explore", mn: "Судлах" },
                organizer: { en: "Organizer", mn: "Зохион байгуулагч" },
                help: { en: "Help", mn: "Тусламж" }
              }
            },
            description: "Footer navigation links and column titles for the website"
          }
        },
        { upsert: true, new: true }
      );
      console.log("✅ Default global settings seeded");

      // Seed major banks of Mongolia
      const BankModel = require("./models/Bank");
      const mongolianBanks = [
        "Bank of Mongolia",
        "Khan Bank",
        "Trade and Development Bank",
        "Golomt Bank",
        "State Bank",
        "XacBank",
        "Capitron Bank",
        "National Investment Bank",
        "Chinggis Khaan Bank"
      ];
      for (const name of mongolianBanks) {
        await BankModel.findOneAndUpdate(
          { bankName: name },
          { $setOnInsert: { bankName: name, isActive: true } },
          { upsert: true, new: true }
        );
      }
      console.log("✅ Mongolian banks seeded successfully");

      // Seed default cancellation reasons
      const CancellationReasonModel = require("./models/CancellationReason");
      const defaultReasons = [
        "Cannot attend due to personal reasons",
        "Schedule conflict",
        "Health issues",
        "Travel restrictions"
      ];
      for (const reason of defaultReasons) {
        await CancellationReasonModel.findOneAndUpdate(
          { reason },
          { $setOnInsert: { reason, isActive: true } },
          { upsert: true, new: true }
        );
      }
      console.log("✅ Default cancellation reasons seeded");

      // Seed managed FAQ common topics without overwriting admin edits.
      const FAQTopicModel = require("./models/FAQTopic");
      const FAQModel = require("./models/FAQ");
      const defaultFAQTopics = [
        { name: "Events & courses", name_mn: "Эвент ба сургалт", slug: "events-courses", order: 1 },
        { name: "Bookings & registrations", name_mn: "Захиалга ба бүртгэл", slug: "bookings-registrations", order: 2 },
        { name: "Payments & payouts", name_mn: "Төлбөр ба татан авалт", slug: "payments-payouts", order: 3 },
        { name: "Staff & QR", name_mn: "Ажилтнууд ба QR", slug: "staff-qr", order: 4 },
        { name: "Verification", name_mn: "Баталгаажуулалт", slug: "verification", order: 5 },
        { name: "Account & settings", name_mn: "Бүртгэл ба тохиргоо", slug: "account-settings", order: 6 },
      ];
      for (const topic of defaultFAQTopics) {
        await FAQTopicModel.findOneAndUpdate(
          { slug: topic.slug },
          { $setOnInsert: { ...topic, isActive: true } },
          { upsert: true, new: true },
        );
      }

      // Existing FAQs predate categories. Keep them usable and ensure every
      // public/admin FAQ response can include a populated topic.
      const defaultFAQTopic = await FAQTopicModel.findOne({ slug: "account-settings" });
      if (defaultFAQTopic) {
        await FAQModel.updateMany(
          { $or: [{ categoryId: { $exists: false } }, { categoryId: null }] },
          { $set: { categoryId: defaultFAQTopic._id } },
        );
      }
      console.log("✅ FAQ common topics seeded successfully");

      // Seed starter bilingual FAQs, only for topics that have none yet, so
      // admin deletions/edits are never overwritten on restart.
      const defaultFAQs = {
        "events-courses": [
          {
            question: "How do I publish an event or a course?",
            question_mn: "Эвент эсвэл сургалтаа хэрхэн нийтлэх вэ?",
            answer: "Create the listing from your dashboard, fill in the details, dates, venue and ticket prices, then submit it. Once your organizer account is verified and the listing is reviewed, it goes live.",
            answer_mn: "Хянах самбараас шинэ зар үүсгээд дэлгэрэнгүй мэдээлэл, огноо, байршил, тасалбарын үнийг бөглөж илгээнэ. Таны байгууллагын бүртгэл баталгаажсан, зар шалгагдсаны дараа нийтлэгдэнэ.",
          },
          {
            question: "Can I edit or cancel a listing after it is published?",
            question_mn: "Нийтэлсэн зараа засах эсвэл цуцлах боломжтой юу?",
            answer: "Yes. You can edit the description, schedule and capacity at any time. If you cancel a listing, attendees who already booked are notified and refunded according to your cancellation policy.",
            answer_mn: "Тийм. Тайлбар, хуваарь, багтаамжийг хүссэн үедээ засна. Зараа цуцалбал захиалга хийсэн оролцогчид мэдэгдэл хүлээн авч, цуцлалтын бодлогын дагуу буцаан олголт авна.",
          },
        ],
        "bookings-registrations": [
          {
            question: "Where can I see who booked my event or course?",
            question_mn: "Миний эвент, сургалтад хэн захиалга өгснийг хаанаас харах вэ?",
            answer: "Open My Orders to see every booking with its number, buyer, status and date. Select a booking to see the full details.",
            answer_mn: "Миний захиалга хэсэгт захиалга бүрийн дугаар, худалдан авагч, төлөв, огноог харна. Захиалгыг сонгож дэлгэрэнгүйг нээнэ.",
          },
          {
            question: "What should I do if an attendee cannot find their booking?",
            question_mn: "Оролцогч захиалгаа олж чадахгүй байвал яах вэ?",
            answer: "Ask for the booking number from their confirmation message and look it up in My Orders. If you still cannot find it, send us a request with the booking number and we will check it for you.",
            answer_mn: "Баталгаажуулалтын мессежээс захиалгын дугаарыг асууж, Миний захиалга хэсгээс хайна. Олдохгүй бол захиалгын дугаартай хүсэлт илгээвэл бид шалгаж өгнө.",
          },
        ],
        "payments-payouts": [
          {
            question: "When do I receive my payout?",
            question_mn: "Орлогыг хэзээ авах вэ?",
            answer: "Earnings become available for payout after the event or course has taken place. Request a withdrawal from the Earnings page and it is processed to your bank account within a few business days.",
            answer_mn: "Эвент, сургалт болж өнгөрсний дараа орлого татан авах боломжтой болно. Орлого хэсгээс татан авалтын хүсэлт илгээвэл хэдхэн ажлын өдрийн дотор банкны дансанд шилжинэ.",
          },
          {
            question: "Which fees does Bondy charge?",
            question_mn: "Bondy ямар шимтгэл авдаг вэ?",
            answer: "Bondy charges a service fee on each paid ticket sold. The fee and your net earnings are shown for every booking on the Earnings page.",
            answer_mn: "Bondy зарагдсан төлбөртэй тасалбар бүрээс үйлчилгээний шимтгэл авна. Шимтгэл болон цэвэр орлогыг Орлого хэсэгт захиалга бүрээр харуулна.",
          },
        ],
        "staff-qr": [
          {
            question: "How do I add staff to scan tickets?",
            question_mn: "Тасалбар уншуулах ажилтныг хэрхэн нэмэх вэ?",
            answer: "Go to Staff, add a team member with their details and give them access. They can then sign in and scan attendee QR codes at the entrance.",
            answer_mn: "Ажилтнууд хэсэгт орж гишүүний мэдээллийг оруулан эрх олгоно. Тэд нэвтэрч орц дээр оролцогчдын QR кодыг уншуулна.",
          },
          {
            question: "What if a QR code does not scan?",
            question_mn: "QR код уншигдахгүй бол яах вэ?",
            answer: "Ask the attendee to increase their screen brightness and open the ticket again. You can also search the booking by its number and check them in manually.",
            answer_mn: "Оролцогчоос дэлгэцийн гэрлийг нэмж тасалбараа дахин нээлгэнэ үү. Мөн захиалгыг дугаараар нь хайж гараар бүртгэж болно.",
          },
        ],
        verification: [
          {
            question: "Why do I need to verify my organizer account?",
            question_mn: "Байгууллагын бүртгэлээ яагаад баталгаажуулах шаардлагатай вэ?",
            answer: "Verification confirms your identity and organization so attendees can trust your listings and so we can safely send your payouts.",
            answer_mn: "Баталгаажуулалт нь таны болон байгууллагын мэдээллийг нотолдог тул оролцогчид таны зарыг итгэлтэй үзэж, бид орлогыг аюулгүй шилжүүлэх боломжтой болно.",
          },
          {
            question: "How long does verification take?",
            question_mn: "Баталгаажуулалт хэр удаан үргэлжлэх вэ?",
            answer: "Most submissions are reviewed within one to three business days. You will get a notification as soon as the review is complete or if more documents are needed.",
            answer_mn: "Ихэнх хүсэлтийг 1-3 ажлын өдрийн дотор хянана. Хяналт дууссан эсвэл нэмэлт бичиг баримт шаардлагатай үед танд мэдэгдэл ирнэ.",
          },
        ],
        "account-settings": [
          {
            question: "How do I update my profile and contact details?",
            question_mn: "Профайл болон холбоо барих мэдээллээ хэрхэн шинэчлэх вэ?",
            answer: "Open Profile from the menu, edit your name, photo and contact details, and save your changes.",
            answer_mn: "Цэснээс Профайл хэсгийг нээж нэр, зураг, холбоо барих мэдээллээ засаад хадгална.",
          },
          {
            question: "How do I change the app language?",
            question_mn: "Апп-ын хэлийг хэрхэн солих вэ?",
            answer: "Use the language switch (MN / EN) in the top bar. Your choice is remembered the next time you visit.",
            answer_mn: "Дээд талын хэл солих товч (MN / EN)-ийг ашиглана. Таны сонголт дараагийн удаа санагдана.",
          },
        ],
      };
      for (const [slug, faqs] of Object.entries(defaultFAQs)) {
        const topic = await FAQTopicModel.findOne({ slug });
        if (!topic) continue;
        // Only seed topics that have no bilingual FAQ yet.
        const bilingual = await FAQModel.countDocuments({
          categoryId: topic._id,
          question_mn: { $exists: true, $ne: "" },
        });
        if (bilingual > 0) continue;
        for (const [i, f] of faqs.entries()) {
          await FAQModel.updateOne(
            { categoryId: topic._id, question: f.question },
            { $setOnInsert: { ...f, categoryId: topic._id, order: i + 1, isActive: true } },
            { upsert: true },
          );
        }
      }
      console.log("✅ Default FAQs seeded successfully");
    } catch (seedErr) {
      console.error("Seed error:", seedErr.message);
    }
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err.message);
  });

module.exports = {
  User: require("./models/User"),
  Bank: require("./models/Bank"),
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
  FAQTopic: require("./models/FAQTopic"),
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
  StayUpdated: require("./models/StayUpdated"),
  EventView: require("./models/EventView"),
  CourseView: require("./models/CourseView"),
  CancellationReason: require("./models/CancellationReason"),
  Banner: require("./models/Banner"),
  SearchHistory: require("./models/SearchHistory"),
  AdminNotificationLog: require("./models/AdminNotificationLog"),
};
