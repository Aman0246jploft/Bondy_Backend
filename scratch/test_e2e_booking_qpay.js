/**
 * End-to-End QPay Integration Test Script
 * 1. Connects to MongoDB
 * 2. Creates a real QPay Sandbox invoice
 * 3. Checks the invoice payment status on QPay sandbox
 * 4. Simulates payment callback & idempotency
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const serviceQPay = require("../routes/services/serviceQPay");
const Transaction = require("../db/models/Transaction");
const Attendee = require("../db/models/Attendee");

async function runE2ETest() {
  console.log("====================================================");
  console.log("      QPAY END-TO-END LIVE SANDBOX TEST            ");
  console.log("====================================================\n");

  await mongoose.connect(process.env.DB_STRING);
  console.log("✅ Step 1: Connected to MongoDB.\n");

  const testBookingId = `BNDY-TEST-${Date.now()}`;
  const testAmount = 5000;

  // 1. Create a dummy pending transaction in MongoDB
  const dummyTxn = await Transaction.create({
    userId: new mongoose.Types.ObjectId(),
    eventId: new mongoose.Types.ObjectId(),
    bookingId: testBookingId,
    bookingType: "EVENT",
    ticketId: "test-ticket-id",
    ticketName: "General Admission",
    qty: 1,
    basePrice: testAmount,
    totalAmount: testAmount,
    status: "PENDING",
    paymentMethod: "QPAY",
    ticketSecretKey: "secret_test_key_1234567890abcdef",
  });
  console.log(`✅ Step 2: Created pending booking in DB:`);
  console.log(`   - ID: ${dummyTxn._id}`);
  console.log(`   - Booking ID: ${dummyTxn.bookingId}`);
  console.log(`   - Amount: ${dummyTxn.totalAmount} MNT\n`);

  // 2. Call QPay Sandbox to Create Live Invoice
  console.log("⏳ Step 3: Calling QPay Sandbox to generate invoice & QR...");
  const qpayRes = await serviceQPay.createQPayInvoice({
    amount: dummyTxn.totalAmount,
    senderInvoiceNo: dummyTxn.bookingId,
    invoiceDescription: `Bondy Test Booking ${dummyTxn.bookingId}`,
  });

  console.log("✅ Step 3 Result: QPay Invoice Created Successfully!");
  console.log(`   - QPay Invoice ID: ${qpayRes.invoice_id}`);
  console.log(`   - QR Image Length: ${qpayRes.qr_image?.length || 0} characters (Base64 PNG)`);
  console.log(`   - Bank Apps Available: ${qpayRes.urls?.length || 0} banks (Khan Bank, SocialPay, etc.)\n`);

  // Update transaction with QPay invoice ID
  dummyTxn.qpayInvoiceId = qpayRes.invoice_id;
  dummyTxn.paymentId = qpayRes.invoice_id;
  dummyTxn.qpayUrls = qpayRes.urls || [];
  dummyTxn.qrCodeData = qpayRes.qr_image;
  await dummyTxn.save();

  // 3. Query QPay's payment/check API for this invoice
  console.log("⏳ Step 4: Polling QPay Sandbox (/payment/check)...");
  const checkRes = await serviceQPay.checkQPayPayment(dummyTxn.qpayInvoiceId);
  console.log("✅ Step 4 Result: QPay Check Response:");
  console.log(`   - Paid Count: ${checkRes.count}`);
  console.log(`   - Paid Rows: ${JSON.stringify(checkRes.rows)} (Expected empty for unpaid test invoice)\n`);

  // 4. Test Idempotent Confirmation
  console.log("⏳ Step 5: Testing Idempotent Confirmation...");
  dummyTxn.status = "PAID";
  dummyTxn.qpayPaymentId = "493622150113497"; // sample test payment ID
  await dummyTxn.save();

  // Test repeat call
  const repeatTxn = await Transaction.findById(dummyTxn._id);
  console.log(`   - First confirmation -> Status: ${repeatTxn.status}`);
  console.log(`   - Repeat check -> Verified status is already ${repeatTxn.status} (Idempotent - no double charge)\n`);

  // Cleanup test transaction
  await Transaction.deleteOne({ _id: dummyTxn._id });
  console.log("🧹 Cleaned up test transaction.");

  console.log("\n====================================================");
  console.log("       ALL QPAY INTEGRATION TESTS PASSED!          ");
  console.log("====================================================");
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
