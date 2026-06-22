const { PromoCode } = require("../../db");
const crypto = require("crypto");
const { notifyReferralReward } = require("./serviceNotification");

const generateCouponCode = () => {
  return "REF" + crypto.randomBytes(4).toString("hex").toUpperCase();
};

const evaluateReferralRewards = async (user, successfulReferralCount) => {
  if (!user || !successfulReferralCount) return;

  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(now.getDate() + 30);

  let newCoupon = null;

  if (successfulReferralCount === 1) {
    // 1st successful referral: 10% discount, max 10k MNT, min 30k MNT
    const code = generateCouponCode();
    newCoupon = await PromoCode.create({
      code,
      description: "1st Successful Referral Reward - 10% Off",
      discountType: "percentage",
      discountValue: 10,
      maxUsage: 1,
      validFrom: now,
      validUntil: thirtyDaysLater,
      active: true,
      userId: user._id,
      minOrderAmount: 30000,
      maxDiscountAmount: 10000,
    });
    
    // Notify
    await notifyReferralReward(user._id, "10% Discount Coupon", "your 1st successful referral");
  } 
  else if (successfulReferralCount === 5) {
    // 5th successful referral: 25k MNT fixed, min 30k MNT
    const code = generateCouponCode();
    newCoupon = await PromoCode.create({
      code,
      description: "5th Successful Referral Reward - 25,000 MNT Off",
      discountType: "fixed",
      discountValue: 25000,
      maxUsage: 1,
      validFrom: now,
      validUntil: thirtyDaysLater,
      active: true,
      userId: user._id,
      minOrderAmount: 30000,
      maxDiscountAmount: null, // fixed value doesn't need max
    });

    // Notify
    await notifyReferralReward(user._id, "25,000 MNT Discount Coupon", "your 5th successful referral");
  }

  return newCoupon;
};

module.exports = {
  evaluateReferralRewards,
};
