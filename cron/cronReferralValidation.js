const cron = require("node-cron");
const { Referral, Transaction } = require("../db");
const { evaluateReferralRewards } = require("../routes/services/serviceReward");

// Run every hour to check for referrals that have passed their refund window
const cronReferralValidation = () => {
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    console.log(`[CRON] Running ReferralValidationJob at ${now.toISOString()}...`);
    try {
      // Log current pending count regardless of date to see what exists in database
      const totalPendingValidation = await Referral.countDocuments({ status: "PENDING_VALIDATION" });
      console.log(`[CRON] Total PENDING_VALIDATION referrals in DB: ${totalPendingValidation}`);

      // Find referrals waiting for validation where the refund window has expired
      const pendingReferrals = await Referral.find({
        status: "PENDING_VALIDATION",
        refundWindowEndDate: { $lt: now }
      }).populate("referrer");

      console.log(`[CRON] Found ${pendingReferrals.length} referrals whose refund windows have expired (refundWindowEndDate < now).`);

      for (const referral of pendingReferrals) {
        console.log(`[CRON] Processing referral ID: ${referral._id}, refereeEmail: ${referral.refereeEmail}, refundWindowEndDate: ${referral.refundWindowEndDate}`);
        try {
          // Check if order was refunded
          const order = await Transaction.findById(referral.qualifyingOrderId);

          if (!order) {
            console.log(`[CRON] Order ${referral.qualifyingOrderId} not found for referral ${referral._id}. Reverting status to PENDING_REFERRAL.`);
            referral.status = "PENDING_REFERRAL";
            referral.qualifyingOrderId = null;
            referral.orderDate = null;
            referral.refundWindowEndDate = null;
            await referral.save();
            continue;
          }

          console.log(`[CRON] Order found: ID: ${order._id}, status: "${order.status}", paymentStatus: "${order.paymentStatus}"`);

          // In this system, check if the transaction is marked as 'refunded' or similar
          // Assuming 'status' on Transaction might be 'REFUNDED' or 'CANCELLED'
          if (order.status === "REFUNDED" || order.status === "CANCELLED" || order.paymentStatus === "refunded") {
            console.log(`[CRON] Order ${order._id} was refunded or cancelled. Reverting referral ${referral._id} status to PENDING_REFERRAL.`);
            referral.status = "PENDING_REFERRAL";
            referral.qualifyingOrderId = null;
            referral.orderDate = null;
            referral.refundWindowEndDate = null;
            await referral.save();
            continue;
          }

          // Order is valid, transition to SUCCESSFUL_REFERRAL
          console.log(`[CRON] Validation passed for referral ${referral._id}. Transitioning status to SUCCESSFUL_REFERRAL.`);
          referral.status = "SUCCESSFUL_REFERRAL";
          referral.successfulAt = new Date();
          await referral.save();

          // Increment successful referral count
          if (referral.referrer) {
            const oldCount = referral.referrer.successfulReferralCount || 0;
            referral.referrer.successfulReferralCount = oldCount + 1;
            console.log(`[CRON] Incrementing referrer ${referral.referrer._id} successful count: ${oldCount} -> ${referral.referrer.successfulReferralCount}`);
            await referral.referrer.save();

            // Trigger reward evaluation
            console.log(`[CRON] Triggering reward evaluation for referrer ID: ${referral.referrer._id} with new count: ${referral.referrer.successfulReferralCount}`);
            await evaluateReferralRewards(referral.referrer, referral.referrer.successfulReferralCount);
          } else {
            console.warn(`[CRON] Warning: Referral ${referral._id} has no populated referrer!`);
          }

          console.log(`[CRON] Referral ${referral._id} successfully validated.`);
        } catch (innerErr) {
          console.error(`[CRON] Error validating referral ${referral._id}:`, innerErr);
        }
      }
    } catch (err) {
      console.error("[CRON] ReferralValidationJob error:", err);
    }
  });
};

module.exports = cronReferralValidation;
