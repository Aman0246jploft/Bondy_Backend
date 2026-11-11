require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Category = require("../db/models/Category");
const SupportTicket = require("../db/models/SupportTicket");

const defaultSupportTicketCategories = [
  { name: "Events & Courses", name_thi: "Эвент ба сургалт", type: "support_ticket" },
  { name: "Bookings & Registrations", name_thi: "Захиалга ба бүртгэл", type: "support_ticket" },
  { name: "Payments & Payouts", name_thi: "Төлбөр ба татан авалт", type: "support_ticket" },
  { name: "Staff & QR", name_thi: "Ажилтнууд ба QR", type: "support_ticket" },
  { name: "Verification", name_thi: "Баталгаажуулалт", type: "support_ticket" },
  { name: "Account & Settings", name_thi: "Бүртгэл ба тохиргоо", type: "support_ticket" },
  { name: "Other", name_thi: "Бусад", type: "support_ticket" },
];

async function seed() {
  console.log("Connecting to MongoDB...");
  if (!process.env.DB_STRING) {
    console.error("Missing DB_STRING in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_STRING, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("Connected to MongoDB.");

  for (const item of defaultSupportTicketCategories) {
    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      type: "support_ticket",
      isDeleted: false,
    });

    if (!existing) {
      const created = await Category.create({
        name: item.name,
        name_thi: item.name_thi,
        type: "support_ticket",
        isDeleted: false,
        isDisable: false,
      });
      console.log(`[Created] ${created.name} (${created.name_thi}) - ID: ${created._id}`);
    } else {
      let updated = false;
      if (!existing.name_thi || existing.name_thi !== item.name_thi) {
        existing.name_thi = item.name_thi;
        updated = true;
      }
      if (existing.name !== item.name) {
        existing.name = item.name;
        updated = true;
      }
      if (existing.isDisable) {
        existing.isDisable = false;
        updated = true;
      }
      if (updated) {
        await existing.save();
        console.log(`[Updated] ${existing.name} (${existing.name_thi}) - ID: ${existing._id}`);
      } else {
        console.log(`[Exists] ${existing.name} (${existing.name_thi}) - ID: ${existing._id}`);
      }
    }
  }

  // Backfill existing support tickets
  const allSTCategories = await Category.find({ type: "support_ticket", isDeleted: false });
  console.log(`Total support_ticket categories in DB: ${allSTCategories.length}`);

  for (const stCat of allSTCategories) {
    const res = await SupportTicket.updateMany(
      {
        $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
        category: { $regex: new RegExp(`^${stCat.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      },
      { $set: { categoryId: stCat._id, category: stCat.name } }
    );
    if (res.modifiedCount > 0) {
      console.log(`Backfilled ${res.modifiedCount} tickets for category "${stCat.name}"`);
    }
  }

  console.log("Seeding finished successfully!");
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});

