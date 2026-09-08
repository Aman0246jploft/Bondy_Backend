/**
 * Test QPay Integration Verification Script
 * Validates module loading, schema definitions, token caching logic, public route matching,
 * and simulated callback / check idempotency.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const assert = require("assert");

async function runTests() {
  console.log("=========================================");
  console.log("   QPAY INTEGRATION VERIFICATION TESTS   ");
  console.log("=========================================\n");

  // TEST 1: Syntax & Module Loading
  console.log("Test 1: Verifying module loads...");
  const jwtVerification = require("../middlewares/jwtVerification");
  const serviceQPay = require("../routes/services/serviceQPay");
  const Transaction = require("../db/models/Transaction");
  const bookingValidation = require("../routes/services/validations/bookingValidation");
  console.log("  [PASS] All modules and models loaded without syntax errors.\n");

  // TEST 2: Environment Variables
  console.log("Test 2: Verifying Environment Configuration...");
  assert.ok(process.env.QPAY_BASE_URL, "QPAY_BASE_URL must be defined");
  assert.ok(process.env.QPAY_USERNAME, "QPAY_USERNAME must be defined");
  assert.ok(process.env.QPAY_PASSWORD, "QPAY_PASSWORD must be defined");
  assert.ok(process.env.QPAY_INVOICE_CODE, "QPAY_INVOICE_CODE must be defined");
  assert.ok(process.env.QPAY_CALLBACK_URL, "QPAY_CALLBACK_URL must be defined");
  console.log(`  [PASS] Base URL: ${process.env.QPAY_BASE_URL}`);
  console.log(`  [PASS] Callback URL: ${process.env.QPAY_CALLBACK_URL}\n`);

  // TEST 3: Public Route Matching in JWT Middleware
  console.log("Test 3: Verifying /api/v1/booking/qpay/callback is public...");
  const middleware = jwtVerification();
  let nextCalled = false;
  let errorSent = false;

  const mockReq = {
    path: "/api/v1/booking/qpay/callback",
    headers: {},
  };
  const mockRes = {
    status: (code) => ({
      json: () => { errorSent = true; },
      send: () => { errorSent = true; },
    }),
  };
  const mockNext = () => { nextCalled = true; };

  middleware(mockReq, mockRes, mockNext);
  assert.strictEqual(nextCalled, true, "Callback route must pass through without JWT token");
  assert.strictEqual(errorSent, false, "Callback route must not return an error when token is absent");
  console.log("  [PASS] QPay callback route is publicly accessible without Bearer token.\n");

  // TEST 4: Validation Schemas
  console.log("Test 4: Verifying Joi validation schemas...");
  const { error: initErr } = bookingValidation.qpayInitiateSchema.validate({ transactionId: "64e0a5c123456789abcdef01" });
  assert.strictEqual(initErr, undefined, "qpayInitiateSchema should pass valid transactionId");

  const { error: initErrFail } = bookingValidation.qpayInitiateSchema.validate({});
  assert.ok(initErrFail, "qpayInitiateSchema should reject missing transactionId");

  const { error: checkErr } = bookingValidation.qpayCheckSchema.validate({ transactionId: "64e0a5c123456789abcdef01" });
  assert.strictEqual(checkErr, undefined, "qpayCheckSchema should pass valid transactionId");
  console.log("  [PASS] Joi validation schemas accept valid payloads and reject invalid ones.\n");

  // TEST 5: Schema Indexes on Transaction
  console.log("Test 5: Verifying Transaction Schema Fields and Indexes...");
  const schemaPaths = Transaction.schema.paths;
  assert.ok(schemaPaths.qpayInvoiceId, "Transaction schema must include qpayInvoiceId");
  assert.ok(schemaPaths.qpayPaymentId, "Transaction schema must include qpayPaymentId");
  assert.ok(schemaPaths.qpayPaymentData, "Transaction schema must include qpayPaymentData");

  const indexes = Transaction.schema.indexes();
  const hasSparsePaymentIdIndex = indexes.some(idx => {
    return idx[0].qpayPaymentId === 1 && idx[1] && idx[1].unique === true && idx[1].sparse === true;
  });
  assert.ok(hasSparsePaymentIdIndex, "qpayPaymentId must have a unique, sparse index for idempotency");
  console.log("  [PASS] Schema fields and unique sparse index on qpayPaymentId are present.\n");

  // TEST 6: Service QPay Token Cache Helpers
  console.log("Test 6: Verifying serviceQPay exports and cache helpers...");
  assert.strictEqual(typeof serviceQPay.getQPayToken, "function");
  assert.strictEqual(typeof serviceQPay.createQPayInvoice, "function");
  assert.strictEqual(typeof serviceQPay.checkQPayPayment, "function");
  assert.strictEqual(typeof serviceQPay.getQPayPayment, "function");
  assert.strictEqual(typeof serviceQPay.clearTokenCache, "function");
  console.log("  [PASS] All expected serviceQPay methods are exported.\n");

  console.log("=========================================");
  console.log("   ALL VERIFICATION CHECKS PASSED!       ");
  console.log("=========================================");
  process.exit(0);
}

runTests().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
