const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { Referral, User, WalletHistory, GlobalSetting } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { roleId } = require("../../utils/Role");
const { notifyReferralReward } = require("../services/serviceNotification");

// ─── Helper: get reward amount from DB (admin-configurable) ───────────────────
const DEFAULT_REWARD = 75000;
const getRewardAmount = async () => {
  const setting = await GlobalSetting.findOne({ key: "REFERRAL_REWARD_AMOUNT" });
  return setting ? Number(setting.value) : DEFAULT_REWARD;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateReferralCode = (userId) => {
  return crypto
    .createHash("sha256")
    .update(userId.toString() + Date.now().toString())
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
};

// ─── GET /my-code — Get or create my referral code/link ──────────────────────
router.get("/my-code", perApiLimiter(), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Upsert a "seed" referral entry for the organizer to hold their code
    let referral = await Referral.findOne({ referrer: userId, refereeEmail: "__self__" });
    if (!referral) {
      const code = generateReferralCode(userId);
      referral = await Referral.create({
        referrer: userId,
        refereeEmail: "__self__",
        referralCode: code,
        status: "PENDING",
      });
    }

    const baseUrl = process.env.FRONTEND_URL || "https://bondy.com";
    const referralLink = `${baseUrl}/register?ref=${referral.referralCode}`;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Referral code fetched", {
      referralCode: referral.referralCode,
      referralLink,
    });
  } catch (error) {
    console.error("Get referral code error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

// ─── GET /stats — Get referral stats + history for current organizer ──────────
router.get("/stats", perApiLimiter(), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Exclude the self-seed record
    const referrals = await Referral.find({
      referrer: userId,
      refereeEmail: { $ne: "__self__" },
    })
      .populate("referee", "firstName lastName email profileImage")
      .sort({ createdAt: -1 })
      .lean();

    const totalReferrals = referrals.length;
    const signedUp = referrals.filter((r) => ["SIGNED_UP", "COMPLETED"].includes(r.status)).length;
    const completed = referrals.filter((r) => r.status === "COMPLETED").length;
    const totalRewardEarned = referrals
      .filter((r) => r.status === "COMPLETED")
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Referral stats fetched", {
      totalReferrals,
      signedUp,
      completed,
      totalRewardEarned,
      history: referrals,
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

// ─── POST /invite — Send invite by email ──────────────────────────────────────
router.post("/invite", perApiLimiter(), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email } = req.body;

    if (!email) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Email is required");
    }

    // Get the organizer's referral code
    let seedReferral = await Referral.findOne({ referrer: userId, refereeEmail: "__self__" });
    if (!seedReferral) {
      const code = generateReferralCode(userId);
      seedReferral = await Referral.create({
        referrer: userId,
        refereeEmail: "__self__",
        referralCode: code,
        status: "PENDING",
      });
    }

    // Check if already invited
    const existing = await Referral.findOne({
      referrer: userId,
      refereeEmail: email.toLowerCase().trim(),
    });
    if (existing) {
      return apiErrorRes(HTTP_STATUS.CONFLICT, res, "This email has already been invited by you");
    }

    // Check if user already exists on platform
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return apiErrorRes(HTTP_STATUS.CONFLICT, res, "This user is already registered on Bondy");
    }

    // Create individual referral for this email
    const inviteCode = generateReferralCode(userId + email);
    const rewardAmount = await getRewardAmount();
    const newReferral = await Referral.create({
      referrer: userId,
      refereeEmail: email.toLowerCase().trim(),
      referralCode: inviteCode,
      status: "PENDING",
      rewardAmount,
    });

    // In a real system, send an email here via nodemailer/sendgrid
    // For now we return the referral link
    const baseUrl = process.env.FRONTEND_URL || "https://bondy.com";
    const referralLink = `${baseUrl}/register?ref=${inviteCode}`;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Invite sent successfully", {
      referralLink,
      referralCode: inviteCode,
      refereeEmail: newReferral.refereeEmail,
    });
  } catch (error) {
    console.error("Invite error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

// ─── POST /complete — Called internally when a referred organizer completes verification ──
// This would be triggered from the admin verification flow or webhook
router.post("/complete", perApiLimiter(), async (req, res) => {
  try {
    const { referralCode, refereeUserId } = req.body;

    if (!referralCode || !refereeUserId) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "referralCode and refereeUserId are required");
    }

    const referral = await Referral.findOne({ referralCode, status: { $in: ["PENDING", "SIGNED_UP"] } });
    if (!referral) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Referral not found or already completed");
    }

    const referrer = await User.findById(referral.referrer);
    if (!referrer) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Referrer not found");
    }

    // Update referral
    referral.referee = refereeUserId;
    referral.status = "COMPLETED";
    referral.rewardedAt = new Date();
    await referral.save();

    // Credit reward to referrer wallet
    const rewardAmount = await getRewardAmount();
    referrer.payoutBalance = (referrer.payoutBalance || 0) + rewardAmount;
    await referrer.save();

    // Log wallet history
    await WalletHistory.create({
      userId: referrer._id,
      amount: rewardAmount,
      type: "REFERRAL",
      balanceAfter: referrer.payoutBalance,
      description: `Referral reward for inviting a new organizer (code: ${referralCode})`,
    });

    // Notify referrer (non-blocking via queue)
    notifyReferralReward(
      String(referrer._id),
      rewardAmount,
      `referral code ${referralCode}`,
      String(referral._id)
    ).catch((e) => console.error("[Notification] notifyReferralReward (complete):", e));

    return apiSuccessRes(HTTP_STATUS.OK, res, "Referral completed and reward credited", {
      rewardAmount,
      newBalance: referrer.payoutBalance,
    });
  } catch (error) {
    console.error("Complete referral error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

module.exports = router;
