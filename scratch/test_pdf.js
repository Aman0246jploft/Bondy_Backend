const fs = require("fs");
const path = require("path");

// Mock process.env for DB just in case, but we don't connect to db here
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { generateTicketPdf } = require("../utils/pdfGenerator");

const mockTicket = {
  bookingId: "BNDY-123456",
  status: "PAID",
  qty: 2,
  ticketName: "VIP Ticket",
  bookingType: "EVENT",
  createdAt: new Date(),
  qrCodeString: "test-qr-code-string",
  eventId: {
    eventTitle: "Mock Concert Event",
    startDate: new Date(),
    venueAddress: {
      address: "123 Test Street",
      city: "Test City",
      state: "Test State",
      country: "Test Country"
    }
  }
};

const run = async () => {
  try {
    const outPath = path.join(__dirname, "test.pdf");
    const writeStream = fs.createWriteStream(outPath);
    console.log("Generating PDF...");
    await generateTicketPdf(mockTicket, writeStream);
    console.log("PDF generated successfully at:", outPath);
  } catch (err) {
    console.error("PDF generation failed:", err);
  }
};

run();
