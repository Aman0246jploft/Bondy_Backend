const express = require("express");
const router = express.Router();

const perApiLimiter = require("../../middlewares/rateLimiter");
const {
  apiSuccessRes,
  apiErrorRes,
  formatResponseUrl,
  generateOTP,
} = require("../../utils/globalFunction");

const CONSTANTS = require("../../utils/constants");
const {
  setKeyWithTime,
  getKey,
  removeKey,
} = require("../services/serviceRedis");

const HTTP_STATUS = require("../../utils/statusCode");
const User = require("../../db/models/User");
const { Referral, WalletHistory, GlobalSetting } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const { roleId } = require("../../utils/Role");
const checkRole = require("../../middlewares/checkRole");

const OTP_EXPIRY_MINUTES = process.env.OTP_EXPIRY_MINUTES ? parseInt(process.env.OTP_EXPIRY_MINUTES, 10) : 10;

// Submit Verification Documents (Organizer)
const submitVerification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nationalId, drivingLicence, bankVerification } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    let updated = false;

    // 1. National ID Submission
    if (nationalId) {
      const { frontImage, backImage } = nationalId;
      if (!frontImage || !backImage) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Both front and back images are required for National ID.",
        );
      }

      // If pre-existing submission, push to history
      if (user.verifications.idVerification.nationalId.frontImage) {
        user.verifications.history.push({
          type: "nationalId",
          frontImage: user.verifications.idVerification.nationalId.frontImage,
          backImage: user.verifications.idVerification.nationalId.backImage,
          status: user.verifications.idVerification.nationalId.status,
          rejectionReason: user.verifications.idVerification.nationalId.rejectionReason,
          actionBy: user._id,
          createdAt: user.verifications.idVerification.nationalId.verifiedAt || new Date(),
        });
      }

      user.verifications.idVerification.nationalId = {
        frontImage,
        backImage,
        isVerified: false,
        rejectionReason: null,
        verifiedAt: null,
        status: "pending",
      };
      updated = true;
    }

    // 2. Driving Licence Submission
    if (drivingLicence) {
      const { frontImage, backImage } = drivingLicence;
      if (!frontImage || !backImage) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Both front and back images are required for Driving Licence.",
        );
      }

      // If pre-existing submission, push to history
      if (user.verifications.idVerification.drivingLicence.frontImage) {
        user.verifications.history.push({
          type: "drivingLicence",
          frontImage: user.verifications.idVerification.drivingLicence.frontImage,
          backImage: user.verifications.idVerification.drivingLicence.backImage,
          status: user.verifications.idVerification.drivingLicence.status,
          rejectionReason: user.verifications.idVerification.drivingLicence.rejectionReason,
          actionBy: user._id,
          createdAt: user.verifications.idVerification.drivingLicence.verifiedAt || new Date(),
        });
      }

      user.verifications.idVerification.drivingLicence = {
        frontImage,
        backImage,
        isVerified: false,
        rejectionReason: null,
        verifiedAt: null,
        status: "pending",
      };
      updated = true;
    }

    // 3. Bank Account Submission
    if (bankVerification) {
      const { bankName, bankHolderName, accountNumber, otherDetails } = bankVerification;
      if (!bankName || !bankHolderName || !accountNumber) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Bank Name, Holder Name, and Account Number are required for Bank Verification.",
        );
      }

      // If pre-existing submission, push to history
      if (user.verifications.bankVerification.bankName) {
        user.verifications.history.push({
          type: "bankVerification",
          bankName: user.verifications.bankVerification.bankName,
          bankHolderName: user.verifications.bankVerification.bankHolderName,
          accountNumber: user.verifications.bankVerification.accountNumber,
          otherDetails: user.verifications.bankVerification.otherDetails,
          status: user.verifications.bankVerification.status,
          rejectionReason: user.verifications.bankVerification.rejectionReason,
          actionBy: user._id,
          createdAt: user.verifications.bankVerification.verifiedAt || new Date(),
        });
      }

      user.verifications.bankVerification = {
        bankName,
        bankHolderName,
        accountNumber,
        otherDetails: otherDetails || null,
        isVerified: false,
        rejectionReason: null,
        verifiedAt: null,
        status: "pending",
      };
      updated = true;
    }

    // 4. Business Verification Submission
    const businessVerification = req.body.businessVerification;
    if (businessVerification) {
      const { businessName, businessCategory, shortDesc, socialMediaLink } = businessVerification;
      if (!businessName || !businessCategory) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Business Name and Business Category are required for Business Verification.",
        );
      }

      // If pre-existing submission, push to history
      const hasPreExistingInfo = (
        user.businessName ||
        user.businessCategory ||
        user.shortDesc ||
        user.socialMediaLink
      );

      if (hasPreExistingInfo) {
        user.verifications.history.push({
          type: "businessVerification",
          businessName: user.businessName,
          businessCategory: user.businessCategory,
          shortDesc: user.shortDesc,
          socialMediaLink: user.socialMediaLink,
          status: user.businessVerificationStatus || "unverified",
          rejectionReason: user.businessRejectionReason || null,
          actionBy: user._id,
          createdAt: new Date(),
        });
      }

      user.businessName = businessName;
      user.businessCategory = businessCategory;
      user.shortDesc = shortDesc || null;
      user.socialMediaLink = socialMediaLink || null;
      user.isBusinessVerified = false;
      user.businessVerificationStatus = "pending";
      user.businessRejectionReason = null;
      updated = true;
    }

    if (!updated) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "No verification details provided. Please submit nationalId, drivingLicence, bankVerification, or businessVerification.",
      );
    }

    await user.save(); // The pre-save hook updates organizerVerificationStatus based on these values

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.VERIFICATION_DOCS_UPDATED || "Verification documents updated successfully.",
      {
        organizerVerificationStatus: user.organizerVerificationStatus,
        isBusinessVerified: user.isBusinessVerified,
        businessVerificationStatus: user.businessVerificationStatus,
        businessRejectionReason: user.businessRejectionReason,
        verifications: user.verifications,
      },
    );
  } catch (error) {
    console.error("Error in submitVerification:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Get Verification Requests (Admin)
const getVerificationRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;

    const query = {
      roleId: roleId.ORGANIZER,
    };

    // Filter by individual verification statuses
    if (status) {
      query.$or = [
        { "verifications.idVerification.nationalId.status": status },
        { "verifications.idVerification.drivingLicence.status": status },
        { "verifications.bankVerification.status": status },
        { "businessVerificationStatus": status }
      ];
    }

    // Search logic
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select(
          "firstName lastName email countryCode contactNumber businessType businessName businessCategory shortDesc socialMediaLink isBusinessVerified businessVerificationStatus businessRejectionReason organizerVerificationStatus verifications createdAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    // Format URLs for any images in the response
    const formattedUsers = users.map(user => {
      const verifications = { ...user.verifications };
      if (verifications.idVerification) {
        if (verifications.idVerification.nationalId?.frontImage) {
          verifications.idVerification.nationalId.frontImage = formatResponseUrl(verifications.idVerification.nationalId.frontImage);
        }
        if (verifications.idVerification.nationalId?.backImage) {
          verifications.idVerification.nationalId.backImage = formatResponseUrl(verifications.idVerification.nationalId.backImage);
        }
        if (verifications.idVerification.drivingLicence?.frontImage) {
          verifications.idVerification.drivingLicence.frontImage = formatResponseUrl(verifications.idVerification.drivingLicence.frontImage);
        }
        if (verifications.idVerification.drivingLicence?.backImage) {
          verifications.idVerification.drivingLicence.backImage = formatResponseUrl(verifications.idVerification.drivingLicence.backImage);
        }
      }
      return {
        ...user,
        verifications
      };
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.VERIFICATION_REQUESTS_FETCHED || "Verification requests fetched successfully.",
      {
        requests: formattedUsers,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    );
  } catch (error) {
    console.error("Error in getVerificationRequests:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Approve/Reject Individual Document (Admin)
const verifyOrganizer = async (req, res) => {
  try {
    const { userId, type, action, reason } = req.body;
    // type: "nationalId" | "drivingLicence" | "bankVerification"
    // action: "approve" | "reject"

    if (!["approve", "reject"].includes(action)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_VERIFICATION_ACTION || "Invalid action. Use 'approve' or 'reject'.",
      );
    }

    if (!["nationalId", "drivingLicence", "bankVerification", "businessVerification"].includes(type)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid verification type. Must be 'nationalId', 'drivingLicence', 'bankVerification', or 'businessVerification'.",
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const isApprove = action === "approve";

    if (type === "nationalId") {
      if (user.verifications.idVerification.nationalId.status === "unverified") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "National ID has not been submitted yet.");
      }
      user.verifications.idVerification.nationalId.isVerified = isApprove;
      user.verifications.idVerification.nationalId.status = isApprove ? "approved" : "rejected";
      user.verifications.idVerification.nationalId.rejectionReason = isApprove ? null : reason;
      user.verifications.idVerification.nationalId.verifiedAt = new Date();

      // Log history
      user.verifications.history.push({
        type: "nationalId",
        frontImage: user.verifications.idVerification.nationalId.frontImage,
        backImage: user.verifications.idVerification.nationalId.backImage,
        status: isApprove ? "approved" : "rejected",
        rejectionReason: isApprove ? null : reason,
        actionBy: req.user.userId,
        createdAt: new Date(),
      });
    } else if (type === "drivingLicence") {
      if (user.verifications.idVerification.drivingLicence.status === "unverified") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Driving Licence has not been submitted yet.");
      }
      user.verifications.idVerification.drivingLicence.isVerified = isApprove;
      user.verifications.idVerification.drivingLicence.status = isApprove ? "approved" : "rejected";
      user.verifications.idVerification.drivingLicence.rejectionReason = isApprove ? null : reason;
      user.verifications.idVerification.drivingLicence.verifiedAt = new Date();

      // Log history
      user.verifications.history.push({
        type: "drivingLicence",
        frontImage: user.verifications.idVerification.drivingLicence.frontImage,
        backImage: user.verifications.idVerification.drivingLicence.backImage,
        status: isApprove ? "approved" : "rejected",
        rejectionReason: isApprove ? null : reason,
        actionBy: req.user.userId,
        createdAt: new Date(),
      });
    } else if (type === "bankVerification") {
      if (user.verifications.bankVerification.status === "unverified") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Bank details have not been submitted yet.");
      }
      user.verifications.bankVerification.isVerified = isApprove;
      user.verifications.bankVerification.status = isApprove ? "approved" : "rejected";
      user.verifications.bankVerification.rejectionReason = isApprove ? null : reason;
      user.verifications.bankVerification.verifiedAt = new Date();

      // Log history
      user.verifications.history.push({
        type: "bankVerification",
        bankName: user.verifications.bankVerification.bankName,
        bankHolderName: user.verifications.bankVerification.bankHolderName,
        accountNumber: user.verifications.bankVerification.accountNumber,
        otherDetails: user.verifications.bankVerification.otherDetails,
        status: isApprove ? "approved" : "rejected",
        rejectionReason: isApprove ? null : reason,
        actionBy: req.user.userId,
        createdAt: new Date(),
      });

      // Synchronize with classic bankDetails for payout compatibility
      if (isApprove) {
        user.bankDetails = {
          accountName: user.verifications.bankVerification.bankHolderName,
          accountNumber: user.verifications.bankVerification.accountNumber,
          bankName: user.verifications.bankVerification.bankName,
          ifscCode: user.verifications.bankVerification.otherDetails || "",
          swiftCode: "",
        };
      }
    } else if (type === "businessVerification") {
      if (user.businessVerificationStatus === "unverified") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Business details have not been submitted yet.");
      }
      user.isBusinessVerified = isApprove;
      user.businessVerificationStatus = isApprove ? "approved" : "rejected";
      user.businessRejectionReason = isApprove ? null : reason;

      // Log history
      user.verifications.history.push({
        type: "businessVerification",
        businessName: user.businessName,
        businessCategory: user.businessCategory,
        shortDesc: user.shortDesc,
        socialMediaLink: user.socialMediaLink,
        status: isApprove ? "approved" : "rejected",
        rejectionReason: isApprove ? null : reason,
        actionBy: req.user.userId,
        createdAt: new Date(),
      });
    }

    await user.save(); // save updates verification status and isVerified

    // --- Referral: credit reward when organizer gets verified ---
    if (isApprove && user.isVerified === true) {
      try {
        const referral = await Referral.findOne({
          referee: user._id,
          status: "SIGNED_UP",
        });

        if (referral) {
          const referrer = await User.findById(referral.referrer);
          if (referrer) {
            const rewardSetting = await GlobalSetting.findOne({ key: "REFERRAL_REWARD_AMOUNT" });
            const rewardAmount = rewardSetting ? Number(rewardSetting.value) : 0;

            referral.status = "COMPLETED";
            referral.rewardedAt = new Date();
            await referral.save();

            referrer.payoutBalance = (referrer.payoutBalance || 0) + rewardAmount;
            await referrer.save();

            await WalletHistory.create({
              userId: referrer._id,
              amount: rewardAmount,
              type: "REFERRAL",
              balanceAfter: referrer.payoutBalance,
              description: `Referral reward — ${user.firstName} ${user.lastName} (${user.email}) got verified on Bondy.`,
            });

            notifyReferralReward(
              String(referrer._id),
              rewardAmount,
              `${user.email}`,
              String(referral._id)
            ).catch((e) => console.error("[Notification] notifyReferralReward:", e));
          }
        }
      } catch (refErr) {
        console.error("[REFERRAL] Credit error:", refErr.message);
      }
    }

    // Notify the organizer about their verification result (non-blocking)
    notifyVerificationResult(String(userId), action, reason)
      .catch((e) => console.error("[Notification] notifyVerificationResult:", e));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.DOCUMENT_STATUS_UPDATED || "Verification status updated successfully.",
      {
        type,
        status: isApprove ? "approved" : "rejected",
        organizerVerificationStatus: user.organizerVerificationStatus,
      },
    );
  } catch (error) {
    console.error("Error in verifyOrganizer:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Send Phone OTP
const sendPhoneOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const countryCode = req.body.countryCode || user.countryCode;
    const contactNumber = req.body.contactNumber || user.contactNumber;

    if (!contactNumber || !countryCode) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Country code and contact number are required.");
    }

    const otp = process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store in Redis (backend-managed minutes)
    await setKeyWithTime(`phone_verify_otp:${userId}`, otp, OTP_EXPIRY_MINUTES);
    await setKeyWithTime(`phone_verify_data:${userId}`, JSON.stringify({ countryCode, contactNumber }), OTP_EXPIRY_MINUTES);

    return apiSuccessRes(HTTP_STATUS.OK, res, "OTP sent successfully to your phone number.", { otp });
  } catch (error) {
    console.error("Error in sendPhoneOTP:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Resend Phone OTP
const resendPhoneOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const redisData = await getKey(`phone_verify_data:${userId}`);
    let countryCode = req.body.countryCode;
    let contactNumber = req.body.contactNumber;

    if (redisData.statusCode === CONSTANTS.SUCCESS && redisData.data) {
      const parsed = JSON.parse(redisData.data);
      countryCode = countryCode || parsed.countryCode;
      contactNumber = contactNumber || parsed.contactNumber;
    }

    countryCode = countryCode || user.countryCode;
    contactNumber = contactNumber || user.contactNumber;

    if (!contactNumber || !countryCode) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Country code and contact number are required to resend OTP.");
    }

    const otp = process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    await setKeyWithTime(`phone_verify_otp:${userId}`, otp, OTP_EXPIRY_MINUTES);
    await setKeyWithTime(`phone_verify_data:${userId}`, JSON.stringify({ countryCode, contactNumber }), OTP_EXPIRY_MINUTES);

    return apiSuccessRes(HTTP_STATUS.OK, res, "OTP resent successfully to your phone number.", { otp });
  } catch (error) {
    console.error("Error in resendPhoneOTP:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Verify Phone OTP
const verifyPhoneOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otp } = req.body;

    if (!otp) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "OTP is required.");
    }

    const redisOtp = await getKey(`phone_verify_otp:${userId}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OR_EXPIRED_OTP);
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const redisData = await getKey(`phone_verify_data:${userId}`);
    if (redisData.statusCode === CONSTANTS.SUCCESS && redisData.data) {
      const { countryCode, contactNumber } = JSON.parse(redisData.data);
      user.countryCode = countryCode;
      user.contactNumber = contactNumber;
    }

    user.verifications.phone.isVerified = true;
    user.verifications.phone.verifiedAt = new Date();

    await user.save();

    await removeKey(`phone_verify_otp:${userId}`);
    await removeKey(`phone_verify_data:${userId}`);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Phone number verified successfully.", {
      verifications: user.verifications,
    });
  } catch (error) {
    console.error("Error in verifyPhoneOTP:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Send Email OTP
const sendEmailOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const email = req.body.email || user.email;

    if (!email) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Email is required.");
    }

    const otp = process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store in Redis (backend-managed minutes)
    await setKeyWithTime(`email_verify_otp:${userId}`, otp, OTP_EXPIRY_MINUTES);
    await setKeyWithTime(`email_verify_data:${userId}`, email.toLowerCase(), OTP_EXPIRY_MINUTES);

    return apiSuccessRes(HTTP_STATUS.OK, res, "OTP sent successfully to your email address.", { otp });
  } catch (error) {
    console.error("Error in sendEmailOTP:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Resend Email OTP
const resendEmailOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const redisData = await getKey(`email_verify_data:${userId}`);
    let email = req.body.email;

    if (redisData.statusCode === CONSTANTS.SUCCESS && redisData.data) {
      email = email || redisData.data;
    }

    email = email || user.email;

    if (!email) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Email is required to resend OTP.");
    }

    const otp = process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    await setKeyWithTime(`email_verify_otp:${userId}`, otp, OTP_EXPIRY_MINUTES);
    await setKeyWithTime(`email_verify_data:${userId}`, email.toLowerCase(), OTP_EXPIRY_MINUTES);

    return apiSuccessRes(HTTP_STATUS.OK, res, "OTP resent successfully to your email address.", { otp });
  } catch (error) {
    console.error("Error in resendEmailOTP:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Verify Email OTP
const verifyEmailOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otp } = req.body;

    if (!otp) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "OTP is required.");
    }

    const redisOtp = await getKey(`email_verify_otp:${userId}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OR_EXPIRED_OTP);
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    const redisData = await getKey(`email_verify_data:${userId}`);
    if (redisData.statusCode === CONSTANTS.SUCCESS && redisData.data) {
      user.email = redisData.data;
    }

    user.verifications.email.isVerified = true;
    user.verifications.email.verifiedAt = new Date();

    await user.save();

    await removeKey(`email_verify_otp:${userId}`);
    await removeKey(`email_verify_data:${userId}`);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Email verified successfully.", {
      verifications: user.verifications,
    });
  } catch (error) {
    console.error("Error in verifyEmailOTP:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Routes

// Phone OTP Verification
router.post(
  "/phone/send-otp",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.CUSTOMER]),
  sendPhoneOTP,
);
router.post(
  "/phone/resend-otp",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.CUSTOMER]),
  resendPhoneOTP,
);
router.post(
  "/phone/verify-otp",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.CUSTOMER]),
  verifyPhoneOTP,
);

// Email OTP Verification
router.post(
  "/email/send-otp",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.CUSTOMER]),
  sendEmailOTP,
);
router.post(
  "/email/resend-otp",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.CUSTOMER]),
  resendEmailOTP,
);
router.post(
  "/email/verify-otp",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER, roleId.CUSTOMER]),
  verifyEmailOTP,
);

// Organizer submits verification (National ID, Driving Licence, Bank)
router.post(
  "/submit",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  submitVerification,
);

// Admin gets requests
router.get(
  "/requests",
  checkRole([roleId.SUPER_ADMIN]),
  getVerificationRequests,
);

// Admin approves/rejects specific verification component
router.post(
  "/audit",
  checkRole([roleId.SUPER_ADMIN]),
  verifyOrganizer,
);

module.exports = router;
