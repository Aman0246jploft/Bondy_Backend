/**
 * End-to-End Route & Handler Flow Test
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const assert = require("assert");
const bookingRouter = require("../routes/controller/controllerBooking");

async function testRoutesAndHandlers() {
  console.log("=========================================");
  console.log("   TESTING QPAY ROUTE STACK & CALLBACK   ");
  console.log("=========================================\n");

  // TEST 1: Inspect Express router layer for QPay routes
  console.log("Test 1: Inspecting router for QPay routes...");
  const registeredRoutes = bookingRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  const initiateRoute = registeredRoutes.find((r) => r.path === "/qpay/initiate");
  const checkRoute = registeredRoutes.find((r) => r.path === "/qpay/check");
  const callbackRoute = registeredRoutes.find((r) => r.path === "/qpay/callback");

  assert.ok(initiateRoute, "POST /qpay/initiate route must be registered on router");
  assert.ok(initiateRoute.methods.includes("post"), "/qpay/initiate must support POST");

  assert.ok(checkRoute, "POST /qpay/check route must be registered on router");
  assert.ok(checkRoute.methods.includes("post"), "/qpay/check must support POST");

  assert.ok(callbackRoute, "GET /qpay/callback route must be registered on router");
  assert.ok(callbackRoute.methods.includes("get"), "/qpay/callback must support GET");

  console.log("  [PASS] All 3 QPay routes are correctly registered in Express router:\n",
    "   - POST /qpay/initiate\n",
    "   - POST /qpay/check\n",
    "   - GET /qpay/callback\n"
  );

  // TEST 2: Verify Webhook Callback Response Type
  console.log("Test 2: Verifying callback handler response format...");
  const callbackLayer = bookingRouter.stack.find(
    (layer) => layer.route && layer.route.path === "/qpay/callback"
  );
  const callbackHandler = callbackLayer.route.stack[0].handle;

  // Case A: Missing payment ID
  let statusCaptured = null;
  let bodyCaptured = null;
  const mockResMissing = {
    status(code) {
      statusCaptured = code;
      return this;
    },
    send(body) {
      bodyCaptured = body;
      return this;
    },
  };

  await callbackHandler({ query: {} }, mockResMissing);
  assert.strictEqual(statusCaptured, 400, "Missing payment ID must return 400");
  assert.strictEqual(typeof bodyCaptured, "string", "Response body must be plain text, never JSON");
  assert.strictEqual(bodyCaptured, "MISSING_PAYMENT_ID");
  console.log(`  [PASS] Missing payment ID response: HTTP ${statusCaptured} -> "${bodyCaptured}" (plain text)\n`);

  // Case B: Secret mismatch
  let secretStatus = null;
  let secretBody = null;
  const mockResSecret = {
    status(code) {
      secretStatus = code;
      return this;
    },
    send(body) {
      secretBody = body;
      return this;
    },
  };
  await callbackHandler({ query: { qpay_payment_id: "12345", secret: "wrong_secret" } }, mockResSecret);
  assert.strictEqual(secretStatus, 403, "Secret mismatch must return 403");
  assert.strictEqual(secretBody, "FORBIDDEN");
  console.log(`  [PASS] Secret mismatch response: HTTP ${secretStatus} -> "${secretBody}" (plain text)\n`);

  console.log("=========================================");
  console.log("   ALL ROUTE & HANDLER TESTS PASSED!     ");
  console.log("=========================================");
  process.exit(0);
}

testRoutesAndHandlers().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
