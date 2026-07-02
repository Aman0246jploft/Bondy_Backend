const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { generateTicketPdf } = require("../utils/pdfGenerator");

const mockTicket = {
  bookingId: "BNDY-698621",
  status: "PAID",
  qty: 3,
  ticketName: "Premium Pass (x3)",
  bookingType: "EVENT",
  createdAt: new Date("2026-07-01T10:30:00Z"),
  qrCodeData: "TICKET-6a44cfa1a62a2d968f8cb600-6a1e806659",
  basePrice: 75,
  taxAmount: 3,
  discountAmount: 0,
  totalAmount: 78,
  userId: {
    firstName: "Kim",
    lastName: "Da",
    email: "kim.da@example.com",
  },
  eventId: {
    eventTitle: "\u{1F4F8}\u{2728} Lens & Light Photography Expo 2026 \u{1F680}\u{1F3A8}",
    shortdesc: "Capture stunning moments, master creative techniques, and connect with photography enthusiasts from around the world! Join us for an exciting day filled with workshops, live demonstrations, networking sessions, and more.",
    startDate: new Date("2026-07-15T16:00:00Z"),
    endDate: new Date("2026-07-15T20:30:00Z"),
    startTime: "16:00",
    endTime: "20:30",
    posterImage: ["https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=400"],
    refundPolicy: "No Refund",
    venueAddress: {
      address: "9VXJ+Q6R, university",
      city: "Vanasthali",
      state: "Rajasthan 304022",
      country: "India",
    },
    createdBy: {
      firstName: "Event",
      lastName: "Organizer",
    },
    eventCategory: {
      categoryTitle: "Photography",
    },
  },
};

const run = async () => {
  try {
    const outPath = path.join(__dirname, "test.pdf");
    const writeStream = fs.createWriteStream(outPath);
    console.log("Generating PDF...");
    await generateTicketPdf(mockTicket, writeStream);
    console.log("PDF generated at:", outPath);
  } catch (err) {
    console.error("PDF generation failed:", err);
  }
};

run();
