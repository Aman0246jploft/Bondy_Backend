const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { Referral, User, WalletHistory, GlobalSetting, PromoCode } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { roleId } = require("../../utils/Role");

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
        status: "PENDING_REFERRAL",
      });
    }

    const baseUrl = process.env.FRONTEND_URL || "https://bondy.com";
    const referralLink = `${baseUrl}/register?ref=${referral.referralCode}`;

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFERRAL_CODE_FETCHED, {
      referralCode: referral.referralCode,
      referralLink,
    });
  } catch (error) {
    console.error("Get referral code error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

// ─── GET /stats — Get referral stats + history for current user ──────────────
router.get("/stats", perApiLimiter(), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Exclude the self-seed record
    const referrals = await Referral.find({
      referrer: userId,
      refereeEmail: { $ne: "__self__" },
    })
      .populate("referee", "firstName lastName email profileImage")
      .populate("qualifyingOrderId")
      .sort({ createdAt: -1 })
      .lean();

    const totalReferrals = referrals.length;
    const pendingReferrals = referrals.filter((r) => r.status === "PENDING_REFERRAL").length;
    const pendingValidation = referrals.filter((r) => r.status === "PENDING_VALIDATION").length;
    const successfulReferrals = referrals.filter((r) => r.status === "SUCCESSFUL_REFERRAL").length;

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFERRAL_STATS_FETCHED, {
      totalReferrals,
      pendingReferrals,
      pendingValidation,
      successfulReferrals,
      history: referrals,
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

// ─── GET /rewards — Get earned rewards for current user ──────────────────────
router.get("/rewards", perApiLimiter(), async (req, res) => {
  try {
    const userId = req.user.userId;

    const rewards = await PromoCode.find({
      userId: userId,
    }).sort({ createdAt: -1 });

    const totalCoupons = rewards.length;
    const now = new Date();

    const activeCoupons = rewards.filter((r) => {
      const isExpired = r.validUntil && now > new Date(r.validUntil);
      const isUsed = r.usedCount >= (r.maxUsage || 1);
      return r.active && !isUsed && !isExpired;
    }).length;

    const usedCoupons = rewards.filter((r) => r.usedCount >= (r.maxUsage || 1)).length;

    const expiredCoupons = rewards.filter((r) => {
      const isExpired = r.validUntil && now > new Date(r.validUntil);
      const isUsed = r.usedCount >= (r.maxUsage || 1);
      return isExpired && !isUsed;
    }).length;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Referral rewards fetched", {
      rewards,
      totalCoupons,
      activeCoupons,
      usedCoupons,
      expiredCoupons,
    });
  } catch (error) {
    console.error("Get referral rewards error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

// ─── POST /invite — Send invite by email ──────────────────────────────────────
router.post("/invite", perApiLimiter(), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email } = req.body;

    if (!email) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.EMAIL_REQUIRED);
    }

    // Get the organizer's referral code
    let seedReferral = await Referral.findOne({ referrer: userId, refereeEmail: "__self__" });
    if (!seedReferral) {
      const code = generateReferralCode(userId);
      seedReferral = await Referral.create({
        referrer: userId,
        refereeEmail: "__self__",
        referralCode: code,
        status: "PENDING_REFERRAL",
      });
    }

    // Check if already invited
    const existing = await Referral.findOne({
      referrer: userId,
      refereeEmail: email.toLowerCase().trim(),
    });
    if (existing) {
      return apiErrorRes(HTTP_STATUS.CONFLICT, res, constantsMessage.EMAIL_ALREADY_INVITED);
    }

    // Check if user already exists on platform
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return apiErrorRes(HTTP_STATUS.CONFLICT, res, constantsMessage.USER_ALREADY_REGISTERED);
    }

    // Create individual referral for this email
    const inviteCode = generateReferralCode(userId + email);
    const newReferral = await Referral.create({
      referrer: userId,
      refereeEmail: email.toLowerCase().trim(),
      referralCode: inviteCode,
      status: "PENDING_REFERRAL",
    });

    // In a real system, send an email here via nodemailer/sendgrid
    // For now we return the referral link
    const baseUrl = process.env.FRONTEND_URL || "https://bondy.com";
    const referralLink = `${baseUrl}/register?ref=${inviteCode}`;

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.INVITE_SENT, {
      referralLink,
      referralCode: inviteCode,
      refereeEmail: newReferral.refereeEmail,
    });
  } catch (error) {
    console.error("Invite error:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

module.exports = router;

