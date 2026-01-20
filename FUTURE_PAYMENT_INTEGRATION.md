# Future Payment Gateway Integration Guide

This document outlines the changes required to replace the current mock payment system with a real payment gateway (e.g., Stripe, Razorpay, PayPal).

## 1. Architectural Changes

### A. Environment Configuration
Add gateway-specific keys to your `.env` file:
```env
PAYMENT_GATEWAY_KEY=your_public_key
PAYMENT_GATEWAY_SECRET=your_secret_key
PAYMENT_WEBHOOK_SECRET=your_webhook_secret
```

### B. Transaction Model Updates
The `Transaction.js` model is already well-equipped, but you might need to add:
- `paymentGateway`: String (e.g., "STRIPE", "RAZORPAY").
- `gatewayResponse`: Object (to store the raw response for debugging).
- `refundId`: String (for tracking refunds).

## 2. Updated Booking Lifecycle

Currently, the flow is: `initiateBooking` -> `confirmPayment (Mock)`.
With a real gateway, the flow becomes:

1.  **Initiate Booking (`controllerBooking.js`)**:
    *   Initialize the gateway's Order/Session.
    *   Return the `orderId` or `sessionUrl` to the frontend.
2.  **Frontend Processing**:
    *   User completes payment on the gateway's UI.
3.  **Webhook Handling (New Component)**:
    *   The platform must listen for asynchronous notifications from the gateway.

## 3. Specific Code Changes

### [NEW] Webhook Controller
Create a new controller to handle gateway events:
- `handlePaymentSuccess`: Extracts the `transactionId` and calls the internal logic to mark as `PAID`.
- `handlePaymentFailure`: Marks transaction as `FAILED`.

### [MODIFY] `confirmPayment` in `controllerBooking.js`
Replace the mock logic with:
```javascript
// Example Stripe integration
const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
if (paymentIntent.status === "succeeded") {
    // Proceed with commissioning and earning logic (already implemented)
}
```

## 4. Security & Compliance

> [!CAUTION]
> **Data Privacy**: Never store raw Credit Card details (CVV, Card Number) in your database. Let the payment gateway handle the PCI compliance.

- **Webhook Signature**: Always verify the signature of incoming webhooks to prevent spoofing.
- **Idempotency**: Use `paymentId` or `bookingId` as idempotency keys to prevent double-charging on retries.

## 5. Automated Payouts (Optional)
If you wish to move from manual payouts to automated ones:
*   **Stripe Connect / Razorpay Route**: You can use these features to automatically split the payment at the source. This would remove the need for fixed `payoutBalance` tracking, as the gateway handles the split and payout to the organizer's connected account.
