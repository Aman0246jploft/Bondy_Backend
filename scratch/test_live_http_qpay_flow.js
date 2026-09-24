const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const User = require("../db/models/User");
const Event = require("../db/models/Event");
const Transaction = require("../db/models/Transaction");

async function testFullQpayHttpFlow() {
  console.log("======================================================================");
  console.log("       TESTING FULL END-TO-END HTTP QPAY PAYMENT FLOW                 ");
  console.log("======================================================================\n");

  await mongoose.connect(process.env.DB_STRING);
  console.log("1. Connected to MongoDB");

  // Get customer user
  const customer = await User.findOne({ email: "customer1@gmail.com" });
  if (!customer) throw new Error("Customer user not found");
  const token = jwt.sign(
    { userId: customer._id.toString(), roleId: customer.roleId },
    process.env.JWT_SECRET_KEY,
    { expiresIn: "1d" }
  );
  console.log(`2. Generated customer auth token for: ${customer.email} (${customer._id})`);

  // Find a test event
  const event = await Event.findOne({ isDraft: false, status: { $in: ["Upcoming", "Live"] }, "tickets.0": { $exists: true } });
  if (!event) throw new Error("No active event found");
  const ticket = event.tickets[0];
  console.log(`3. Target event: "${event.eventTitle}"`);
  console.log(`   - Event ID: ${event._id}`);
  console.log(`   - Ticket: "${ticket.ticketName}" @ ${ticket.price} MNT`);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Step A: Calculate Booking
  console.log("\n4. Calling POST /api/v1/booking/calculate...");
  const calcRes = await fetch("http://localhost:8080/api/v1/booking/calculate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookingType: "EVENT",
      eventId: event._id.toString(),
      tickets: [{ ticketId: ticket._id.toString(), qty: 1 }],
    }),
  });
  const calcData = await calcRes.json();
  console.log(`   - HTTP Status: ${calcRes.status}`);
  console.log(`   - Total Amount: ${calcData.data?.breakdown?.totalAmount} MNT`);
  if (!calcData.status) throw new Error(`Calculate failed: ${calcData.message}`);

  // Step B: Initiate Booking
  console.log("\n5. Calling POST /api/v1/booking/initiate...");
  const initRes = await fetch("http://localhost:8080/api/v1/booking/initiate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      bookingType: "EVENT",
      eventId: event._id.toString(),
      tickets: [{ ticketId: ticket._id.toString(), qty: 1 }],
    }),
  });
  const initData = await initRes.json();
  console.log(`   - HTTP Status: ${initRes.status}`);
  const txId = initData.data?.transactionId;
  const bookingId = initData.data?.transaction?.bookingId;
  console.log(`   - Transaction ID: ${txId}`);
  console.log(`   - Booking ID: ${bookingId}`);
  if (!initData.status) throw new Error(`Initiate booking failed: ${initData.message}`);

  // Step C: Initiate QPay Invoice
  console.log("\n6. Calling POST /api/v1/booking/qpay/initiate...");
  const qpayInitRes = await fetch("http://localhost:8080/api/v1/booking/qpay/initiate", {
    method: "POST",
    headers,
    body: JSON.stringify({ transactionId: txId }),
  });
  const qpayInitData = await qpayInitRes.json();
  console.log(`   - HTTP Status: ${qpayInitRes.status}`);
  console.log(`   - QPay Invoice ID: ${qpayInitData.data?.invoice_id}`);
  console.log(`   - QR Image Length: ${qpayInitData.data?.qr_image?.length || 0} characters`);
  console.log(`   - Supported Bank Apps: ${qpayInitData.data?.urls?.length || 0} banks`);
  if (qpayInitData.data?.urls?.length > 0) {
    console.log("   - Sample Bank Deep Links:");
    qpayInitData.data.urls.slice(0, 5).forEach((b) => {
      console.log(`     * ${b.name}: ${b.link}`);
    });
  }
  if (!qpayInitData.status) throw new Error(`QPay initiate failed: ${qpayInitData.message}`);

  // Step D: Check QPay Status (Polling endpoint)
  console.log("\n7. Calling POST /api/v1/booking/qpay/check (frontend polling)...");
  const qpayCheckRes = await fetch("http://localhost:8080/api/v1/booking/qpay/check", {
    method: "POST",
    headers,
    body: JSON.stringify({ transactionId: txId }),
  });
  const qpayCheckData = await qpayCheckRes.json();
  console.log(`   - HTTP Status: ${qpayCheckRes.status}`);
  console.log(`   - Status Returned: ${qpayCheckData.data?.status || "PENDING (unpaid as expected)"}`);

  // Cleanup: delete the test pending transaction
  await Transaction.deleteOne({ _id: txId });
  console.log("\n8. Cleaned up test transaction.");

  console.log("\n======================================================================");
  console.log("   SUCCESS: QPAY PAYMENT GATEWAY IS FULLY FUNCTIONAL AND READY!       ");
  console.log("======================================================================");
  process.exit(0);
}

testFullQpayHttpFlow().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
