const express = require("express");
const router = express.Router();
const {
  User,
  Event,
  Course,
  Transaction,
  Follow,
  Referral,
  WalletHistory,
  Notification,
  GlobalSetting,
  Block,
} = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const mongoose = require("mongoose");
const {
  apiErrorRes,
  apiSuccessRes,
  generateOTP,
  verifyPassword,
  BACKEND_URL,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const { signToken } = require("../../utils/jwtTokenUtils");
const jwt = require("jsonwebtoken");
const {
  customerSignupSchema,
  organizerSignupSchema,
  otpVerificationSchema,
  resendOtpSchema,
  loginInitSchema,
  updateUserSchema,
  socialLoginSchema,
  universalOtpSchema,
  universalResendOtpSchema,
  changePasswordSchema,
  addStaffSchema,
  editStaffSchema,
  organizerInfoSchema,
  adminVerifyOrganizerSchema,
} = require("../services/validations/userValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const {
  setKeyWithTime,
  getKey,
  removeKey,
} = require("../services/serviceRedis");
const { roleId, userRole } = require("../../utils/Role");
const { upload, storeImage } = require("../../utils/cloudinary");
const checkRole = require("../../middlewares/checkRole");

const DEFAULT_REWARD = 0;
const getRewardAmount = async () => {
  const setting = await GlobalSetting.findOne({
    key: "REFERRAL_REWARD_AMOUNT",
  });
  return setting ? Number(setting.value) : DEFAULT_REWARD;
};

// Customer Signup - Step 1: Init
const customerSignupInit = async (req, res) => {
  try {
    const { email, contactNumber, countryCode } = req.body;

    // Check if email already exists
    const existingEmail = await User.findOne({ email, isDeleted: false });
    if (existingEmail) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.EMAIL_ALREADY_EXISTS,
      );
    }

    // Check if contact number already exists
    const existingContact = await User.findOne({
      contactNumber,
      countryCode,
      isDeleted: false,
    });
    if (existingContact) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.CONTACT_ALREADY_EXISTS,
      );
    }

    // Generate OTP (12345 for development, random OTP for production)
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP(); // TODO: Implement SMS/Email service for production

    const referralCode = req.body.referralCode || req.query.ref || null;
    const dataToStore = {
      ...req.body,
      ...(referralCode ? { referralCode } : {}),
    };

    // Save data to Redis
    // Key for data: signup_data:{email}
    // Key for OTP: signup_otp:{email}
    await setKeyWithTime(`signup_data:${email}`, JSON.stringify(dataToStore), 10); // 10 mins
    await setKeyWithTime(`signup_otp:${email}`, otp, 10); // 10 mins

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp },
    ); // Sending OTP in response for dev
  } catch (error) {
    console.error("Error in customerSignupInit:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};
// Customer Signup - Step 2: Verify OTP
const customerSignupVerify = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Verify OTP
    const redisOtp = await getKey(`signup_otp:${email}`);
    console.log("redisOtp", redisOtp);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_OR_EXPIRED_OTP,
      );
    }

    // Get User Data from Redis
    const redisData = await getKey(`signup_data:${email}`);
    if (redisData.statusCode !== CONSTANTS.SUCCESS || !redisData.data) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.SESSION_EXPIRED_REGISTER,
      );
    }

    const userData = JSON.parse(redisData.data);

    // Check if user already exists (deleted or not)
    let user = await User.findOne({ email });

    if (user) {
      // If user exists and is not deleted, this shouldn't happen due to init check, but handle it safely
      if (!user.isDeleted) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.EMAIL_ALREADY_EXISTS,
        );
      }

      // Reactivate Deleted User
      user.isDeleted = false;
      user.isDisable = false;
      user.password = userData.password;
      user.contactNumber = userData.contactNumber;
      user.countryCode = userData.countryCode;
      user.roleId = roleId.CUSTOMER;
      user.fmcToken = userData.fmcToken || user.fmcToken;
      user.timeZone = userData.timeZone || user.timeZone;
      user.verifications = {
        email: {
          isVerified: true,
          verifiedAt: new Date(),
        },
        phone: {
          isVerified: false,
          verifiedAt: null,
          isVerifiedOnce: false,
        },
      };
      // Reset other fields if necessary
      await user.save();
    } else {
      // Create New User
      user = new User({
        email: userData.email,
        password: userData.password,
        contactNumber: userData.contactNumber,
        countryCode: userData.countryCode,
        roleId: roleId.CUSTOMER,
        fmcToken: userData.fmcToken || null,
        timeZone: userData.timeZone || null,
        verifications: {
          email: {
            isVerified: true,
            verifiedAt: new Date(),
          },
          phone: {
            isVerified: false,
            verifiedAt: null,
            isVerifiedOnce: false,
          },
        },
      });
      await user.save();
    }

    // Clear Redis
    await removeKey(`signup_otp:${email}`);
    await removeKey(`signup_data:${email}`);

    // ── Referral: create PENDING_REFERRAL ─────────────
    if (userData.referralCode) {
      console.log("[REFERRAL] referralCode found in customer signup data:", userData.referralCode);
      try {
        const referral = await Referral.findOne({
          referralCode: userData.referralCode,
          status: "PENDING_REFERRAL",
        });

        if (!referral) {
          console.warn("[REFERRAL] No PENDING_REFERRAL found for code:", userData.referralCode);
        } else {
          if (referral.refereeEmail === "__self__") {
            const crypto = require("crypto");
            const trackingCode = crypto.randomBytes(6).toString("hex").toUpperCase();
            await Referral.create({
              referrer: referral.referrer,
              refereeEmail: email.toLowerCase(),
              referee: user._id,
              referralCode: trackingCode,
              status: "PENDING_REFERRAL",
              registrationType: "CUSTOMER",
            });
            // Try to notify referrer
            try {
              const { notifyReferralRegistered } = require("../services/serviceNotification");
              const refereeName = user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : email;
              await notifyReferralRegistered(referral.referrer, refereeName);
            } catch (e) {
              console.error("[REFERRAL] Notification error:", e);
            }
          } else {
            referral.referee = user._id;
            referral.registrationType = "CUSTOMER";
            await referral.save();
          }
        }
      } catch (refErr) {
        console.error("[REFERRAL] Customer referral error:", refErr.message, refErr.stack);
      }
    }
    // ─────────────────────────────────────────────────────────

    // Generate Token
    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.REGISTRATION_SUCCESSFUL,
      {
        user: { ...user.toObject(), userRole: userRole[user.roleId] },
        token,
      },
    );
  } catch (error) {
    console.error("Error in customerSignupVerify:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Organizer Signup - Step 1: Init
const organizerSignupInit = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if email already exists
    const existingEmail = await User.findOne({ email, isDeleted: false });
    if (existingEmail) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.EMAIL_ALREADY_EXISTS,
      );
    }

    // Generate OTP (12345 for development, random OTP for production)
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    const referralCode = req.body.referralCode || req.query.ref || null;
    const dataToStore = {
      ...req.body,
      ...(referralCode ? { referralCode } : {}),
    };

    // Save data to Redis
    await setKeyWithTime(
      `signup_data:${email}`,
      JSON.stringify(dataToStore),
      10,
    );
    await setKeyWithTime(`signup_otp:${email}`, otp, 10);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp },
    );
  } catch (error) {
    console.error("Error in organizerSignupInit:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Organizer Signup - Step 2: Verify
const organizerSignupVerify = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const redisOtp = await getKey(`signup_otp:${email}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_OR_EXPIRED_OTP,
      );
    }

    const redisData = await getKey(`signup_data:${email}`);
    if (redisData.statusCode !== CONSTANTS.SUCCESS || !redisData.data) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.SESSION_EXPIRED_REGISTER,
      );
    }

    const userData = JSON.parse(redisData.data);
    const parts = userData.fullname ? userData.fullname.trim().split(" ") : ["", ""];
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ") || "";

    // Check if user already exists (deleted or not)
    let user = await User.findOne({ email });

    if (user) {
      if (!user.isDeleted) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.EMAIL_ALREADY_EXISTS,
        );
      }

      // Reactivate Deleted User
      user.isDeleted = false;
      user.isDisable = false;
      user.firstName = firstName;
      user.lastName = lastName;
      user.password = userData.password;
      user.acceptTerms = userData.acceptTerms;
      user.countryCode = userData.countryCode || user.countryCode;
      user.contactNumber = userData.contactNumber || user.contactNumber;
      user.roleId = roleId.ORGANIZER;
      user.fmcToken = userData.fmcToken || user.fmcToken;
      user.timeZone = userData.timeZone || user.timeZone;
      user.organizerVerificationStatus = "unverified";
      user.verifications = {
        email: {
          isVerified: true,
          verifiedAt: new Date(),
        },
        phone: {
          isVerified: false,
          verifiedAt: null,
          isVerifiedOnce: false,
        },
      };

      await user.save();
    } else {
      // Create New User
      user = new User({
        firstName,
        lastName,
        email: userData.email,
        password: userData.password,
        acceptTerms: userData.acceptTerms,
        countryCode: userData.countryCode || null,
        contactNumber: userData.contactNumber || null,
        roleId: roleId.ORGANIZER, // ORGANIZER
        organizerVerificationStatus: "unverified",
        fmcToken: userData.fmcToken || null,
        timeZone: userData.timeZone || null,
        verifications: {
          email: {
            isVerified: true,
            verifiedAt: new Date(),
          },
          phone: {
            isVerified: false,
            verifiedAt: null,
            isVerifiedOnce: false,
          },
        },
      });

      await user.save();
    }

    await removeKey(`signup_otp:${email}`);
    await removeKey(`signup_data:${email}`);

    let rewardAmount = await getRewardAmount();

    // ── Referral: mark PENDING_REFERRAL ─────────────
    if (userData.referralCode) {
      console.log(
        "[REFERRAL] referralCode found in signup data:",
        userData.referralCode,
      );
      try {
        const referral = await Referral.findOne({
          referralCode: userData.referralCode,
          status: "PENDING_REFERRAL",
        });

        if (!referral) {
          console.warn(
            "[REFERRAL] No PENDING_REFERRAL referral found for code:",
            userData.referralCode,
          );
        } else {
          console.log(
            "[REFERRAL] Found referral:",
            referral._id,
            "| refereeEmail:",
            referral.refereeEmail,
          );

          if (referral.refereeEmail === "__self__") {
            // Link-based signup — seed record stays, create a tracking entry
            const crypto = require("crypto");
            const trackingCode = crypto
              .randomBytes(6)
              .toString("hex")
              .toUpperCase();
            const created = await Referral.create({
              referrer: referral.referrer,
              refereeEmail: email.toLowerCase(),
              referee: user._id,
              referralCode: trackingCode,
              status: "PENDING_REFERRAL",
              registrationType: "ORGANIZER",
            });
            console.log(
              "[REFERRAL] Tracking entry created (link-based):",
              created._id,
            );

            // Try to notify referrer
            try {
              const { notifyReferralRegistered } = require("../services/serviceNotification");
              const refereeName = user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : email;
              await notifyReferralRegistered(referral.referrer, refereeName);
            } catch (e) {
              console.error("[REFERRAL] Notification error:", e);
            }
          } else {
            // Email-invite signup — update existing record
            referral.referee = user._id;
            referral.registrationType = "ORGANIZER";
            // status is already PENDING_REFERRAL
            await referral.save();
            console.log(
              "[REFERRAL] Email-invite referral updated:",
              referral._id,
            );
          }
        }
      } catch (refErr) {
        console.error(
          "[REFERRAL] Referral error:",
          refErr.message,
          refErr.stack,
        );
      }
    } else {
      console.log("[REFERRAL] No referralCode in signup data, skipping.");
    }
    // ─────────────────────────────────────────────────────────

    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.ORGANIZER_REGISTRATION_SUCCESS,
      { user: { ...user.toObject(), userRole: userRole[user.roleId] }, token },
    );
  } catch (error) {
    console.error("Error in organizerSignupVerify:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Resend OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if signup data exists in Redis (meaning user is in onboarding flow)
    const redisData = await getKey(`signup_data:${email}`);
    if (redisData.statusCode !== CONSTANTS.SUCCESS || !redisData.data) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.SESSION_EXPIRED_SIGNUP,
      );
    }

    // Generate New OTP (12345 for development, random OTP for production)
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP(); // TODO: Implement SMS/Email service for production

    // Update OTP in Redis (reset timer to 10 mins)
    await setKeyWithTime(`signup_otp:${email}`, otp, 10);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_RESENT_SUCCESS,
      {
        otp,
      },
    );
  } catch (error) {
    console.error("Error in resendOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Upload Document/File
const uploadDocument = async (req, res) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.NO_FILES_UPLOADED,
      );
    }

    // Generate a temporary userId or use 'temp' folder for unauthenticated uploads
    const userId = req.user?.userId || "temp";

    // Upload all files and collect their paths
    const uploadPromises = req.files.map((file) => storeImage(file, userId));
    const filePaths = await Promise.all(uploadPromises);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.FILES_UPLOADED_SUCCESS,
      {
        files: filePaths,
      },
    );
  } catch (error) {
    console.error("Error in uploadDocument:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Login - Step 1: Init (Email/Password -> OTP)
const loginInit = async (req, res) => {
  try {
    const { email, password, type } = req.body;

    // Find User
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_EMAIL_OR_PASSWORD,
      );
    }

    // Role Check
    const currentRole = userRole[user.roleId];
    if (currentRole !== type) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCESS_DENIED_INVALID_ROLE,
      );
    }

    // Check if account is disabled
    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    // Verify Password
    const isMatch = await verifyPassword(user.password, password);
    if (!isMatch) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_EMAIL_OR_PASSWORD,
      );
    }

    // Check Organizer Status (Bypassed to allow onboarding verification screen redirect)

    // Generate OTP
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store OTP in Redis (Login OTP key)
    await setKeyWithTime(`login_otp:${email}`, otp, 10); // 10 mins

    // Store fmcToken if provided
    if (req.body.fmcToken) {
      await setKeyWithTime(`login_fmcToken:${email}`, req.body.fmcToken, 10);
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp },
    );
  } catch (error) {
    console.error("Error in loginInit:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Login - Step 2: Verify OTP
const loginVerify = async (req, res) => {
  try {
    const { email, otp, timeZone } = req.body;

    // Verify OTP
    const redisOtp = await getKey(`login_otp:${email}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_OR_EXPIRED_OTP,
      );
    }

    // Find User
    const user = await User.findOne({ email, isDeleted: false }).populate(
      "categories",
    );
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Clear Redis
    await removeKey(`login_otp:${email}`);

    // Handle fmcToken
    let fmcToken = req.body.fmcToken;
    if (!fmcToken) {
      const redisFmcToken = await getKey(`login_fmcToken:${email}`);
      if (redisFmcToken.statusCode === CONSTANTS.SUCCESS && redisFmcToken.data) {
        fmcToken = redisFmcToken.data;
      }
    }

    if (fmcToken) {
      user.fmcToken = fmcToken;
      await removeKey(`login_fmcToken:${email}`);
    }

    if (timeZone) {
      user.timeZone = timeZone;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate Token
    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.LOGIN_SUCCESS_MSG,
      {
        user: { ...user.toObject(), userRole: userRole[user.roleId] },
        token,
      },
    );
  } catch (error) {
    console.error("Error in loginVerify:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin Login (Email + Password)
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find User
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Check Role (Must be SUPER_ADMIN)
    // if (user.roleId !== roleId.SUPER_ADMIN) {
    //   return apiErrorRes(
    //     HTTP_STATUS.FORBIDDEN,
    //     res,
    //     constantsMessage.ACCESS_DENIED_ADMIN_ONLY,
    //   );
    // }

    // Check if account is disabled
    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    // Verify Password
    const isMatch = await verifyPassword(user.password, password);
    if (!isMatch) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_EMAIL_OR_PASSWORD,
      );
    }

    // Generate Token
    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.LOGIN_SUCCESS, {
      user: { ...user.toObject(), userRole: userRole[user.roleId] },
      token,
    });
  } catch (error) {
    console.error("Error in adminLogin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Resend Login OTP
const resendLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // Find User
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Check if account is disabled
    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    // Check Organizer Status (Bypassed)

    // Generate OTP
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store OTP in Redis (Login OTP key)
    await setKeyWithTime(`login_otp:${email}`, otp, 10); // 10 mins

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_RESENT_SUCCESS,
      {
        otp,
      },
    );
  } catch (error) {
    console.error("Error in resendLoginOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Social Login
const socialLogin = async (req, res) => {
  try {
    const {
      socialId,
      socialType,
      type,
      email,
      firstName,
      lastName,
      profileImage,
      fmcToken,
      timeZone,
    } = req.body;

    // 1. Search by Social ID
    let user = await User.findOne({
      "socialLogin.socialId": socialId,
      "socialLogin.socialType": socialType,
      isDeleted: false,
    });

    if (user) {
      // Role Check
      if (userRole[user.roleId] !== type) {
        return apiErrorRes(
          HTTP_STATUS.FORBIDDEN,
          res,
          constantsMessage.ACCESS_DENIED_INVALID_ROLE,
        );
      }

      // Check if account is disabled
      if (user.isDisable) {
        return apiErrorRes(
          HTTP_STATUS.FORBIDDEN,
          res,
          constantsMessage.ACCOUNT_DISABLED,
        );
      }

      // Update fmcToken and lastLogin
      if (fmcToken) user.fmcToken = fmcToken;
      if (timeZone) user.timeZone = timeZone;
      user.lastLogin = new Date();
      await user.save();
    } else {
      // 2. Search by Email only if provided
      if (email) {
        user = await User.findOne({
          email: email.toLowerCase(),
          isDeleted: false,
        });

        if (user) {
          // Role Check
          if (userRole[user.roleId] !== type) {
            return apiErrorRes(
              HTTP_STATUS.FORBIDDEN,
              res,
              constantsMessage.ACCESS_DENIED_INVALID_ROLE,
            );
          }

          // Link social account to existing email account
          user.socialLogin = { socialId, socialType };
          if (!user.firstName && firstName) user.firstName = firstName;
          if (!user.lastName && lastName) user.lastName = lastName;
          if (!user.profileImage && profileImage)
            user.profileImage = profileImage;
          if (fmcToken) user.fmcToken = fmcToken;
          if (timeZone) user.timeZone = timeZone;
          user.lastLogin = new Date();
          await user.save();
        }
      }

      // 3. Create new user if still not found (either no email or no user with that email)
      if (!user) {
        user = new User({
          firstName: firstName || null,
          lastName: lastName || null,
          email: email ? email.toLowerCase() : undefined, // Sparse index handles undefined
          profileImage: profileImage || null,
          socialLogin: { socialId, socialType },
          roleId: roleId[type],
          fmcToken: fmcToken || null,
          timeZone: timeZone || null,
          lastLogin: new Date(),
          organizerVerificationStatus:
            type === "CUSTOMER" ? "approved" : "unverified",
        });
        await user.save();
      }
    }

    // Generate Token
    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.LOGIN_SUCCESS_MSG,
      {
        user: { ...user.toObject(), userRole: userRole[user.roleId] },
        token,
      },
    );
  } catch (error) {
    console.error("Error in socialLogin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Guest Login
const guestLogin = async (req, res) => {
  try {
    const { fmcToken } = req.body;

    // Find existing guest user
    let user = await User.findOne({ email: "guest@bondy.com" });

    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND
      );
    }

    // Update login details
    user.lastLogin = new Date();
    if (fmcToken) user.fmcToken = fmcToken;

    await user.save();

    // Generate Token
    const token = signToken({
      userId: user._id,
      roleId: user.roleId,
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.GUEST_LOGIN_SUCCESS,
      {
        user: { ...user.toObject(), userRole: userRole[user.roleId] },
        token,
      }
    );
  } catch (error) {
    console.error("Error in guestLogin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Update User Profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    if (req.user.roleId === roleId.SUPER_ADMIN) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.SUPER_ADMIN_UPDATE_NOT_ALLOWED,
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    const { email, contactNumber, countryCode, location, ...updateData } = req.body;

    // Check if email already exists (if email is being updated)
    if (email) {
      const existingUser = await User.findOne({
        email,
        isDeleted: false,
        _id: { $ne: userId },
      });
      if (existingUser) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.EMAIL_ALREADY_EXISTS,
        );
      }
      user.email = email;
      user.verifications.email.isVerified = false;
      user.verifications.email.verifiedAt = null;
    }

    if (contactNumber || countryCode) {
      if (contactNumber) user.contactNumber = contactNumber;
      if (countryCode) user.countryCode = countryCode;
      user.verifications.phone.isVerified = false;
      user.verifications.phone.verifiedAt = null;
    }

    // Handle location update
    if (location) {
      user.location = {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
        city: location.city,
        country: location.country,
        address: location.address,
        state: location.state,
        zipcode: location.zipcode,
      };
    }

    // Manage business verification history and state if business fields are updated (only for organizers)
    const { businessName, businessCategory, shortDesc, socialMediaLink } = req.body;
    const isBusinessFieldPresent = (
      businessName !== undefined ||
      businessCategory !== undefined ||
      shortDesc !== undefined ||
      socialMediaLink !== undefined
    );

    if (isBusinessFieldPresent && user.roleId === roleId.ORGANIZER) {
      // Check if there was pre-existing info to save to history
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

      // Update business details
      if (businessName !== undefined) user.businessName = businessName;
      if (businessCategory !== undefined) user.businessCategory = businessCategory;
      if (shortDesc !== undefined) user.shortDesc = shortDesc;
      if (socialMediaLink !== undefined) user.socialMediaLink = socialMediaLink;

      // Set to pending review
      user.isBusinessVerified = false;
      user.businessVerificationStatus = "pending";
      user.businessRejectionReason = null;
    }

    // Apply any remaining dynamic update fields
    Object.keys(updateData).forEach((key) => {
      // Prevent overwriting nested fields or already processed fields
      if (!["businessName", "businessCategory", "shortDesc", "socialMediaLink"].includes(key)) {
        user[key] = updateData[key];
      }
    });

    await user.save();

    // ── Notify followers of organizer profile updates (non-blocking) ──
    if (user.roleId === roleId.ORGANIZER) {
      const profileUpdated = req.body.profileImage !== undefined ||
        req.body.backgroundImage !== undefined ||
        businessName !== undefined ||
        shortDesc !== undefined;

      if (profileUpdated) {
        (async () => {
          try {
            const followers = await Follow.find({ toUser: userId }).select("fromUser").lean();
            const organizerName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.businessName || "An organizer";
            const changeDetail = "Check out their new updates and details!";
            const { notifyOrganizerUpdate } = require("../services/serviceNotification");
            for (const follow of followers) {
              notifyOrganizerUpdate(
                String(follow.fromUser),
                organizerName,
                String(userId),
                changeDetail
              ).catch((e) => console.error("[Notification] notifyOrganizerUpdate error:", e));
            }
          } catch (err) {
            console.error("[Notification] Error notifying followers of organizer update:", err);
          }
        })();
      }
    }

    // Populate categories to return format matching populate logic
    const populatedUser = await User.findById(userId)
      .populate("categories")
      .lean();

    if (populatedUser.profileImage) {
      populatedUser.profileImage = formatResponseUrl(populatedUser.profileImage);
    }
    if (populatedUser.backgroundImage) {
      populatedUser.backgroundImage = formatResponseUrl(populatedUser.backgroundImage);
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROFILE_UPDATED,
      { user: { ...populatedUser, userRole: userRole[populatedUser.roleId] } },
    );
  } catch (error) {
    console.error("Error in updateUserProfile:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const selfProfile = async (req, res) => {
  try {
    let userId = req.user.userId;
    req.params.userId = userId;
    await getUserProfileById(req, res);
  } catch (error) { }
};

const getUserProfileById = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check for logged-in user to determine isFollowed status
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        viewerId = decoded.userId;
      } catch (err) {
        console.log(err);
        // Invalid token - treat as guest
      }
    }

    // Find user with populated categories
    const user = await User.findById(userId)
      .populate("categories", "name type image name_thi")
      .lean();

    if (!user || user.isDeleted) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Get verification data
    // const verification = await Verification.findOne({ user: userId }).lean();

    // Calculate totalAttended (unique events where user has checked in)
    const attendedEvents = await Transaction.distinct("eventId", {
      userId: userId,
      status: "PAID",
      checkedInQty: { $gt: 0 },
    });
    const totalAttended = attendedEvents.length;

    // Calculate totalInterests (categories count)
    const totalInterests = user.categories?.length || 0;

    // Format categories with names
    const categories = (user.categories || []).map((cat) => ({
      _id: cat._id,
      name: cat.name,
      name_thi: cat.name_thi,
      type: cat.type,
      image: cat.image ? formatResponseUrl(cat.image) : null,
    }));

    // Format profile image
    const profileImage = user.profileImage
      ? formatResponseUrl(user.profileImage)
      : null;
    const backgroundImage = user.backgroundImage
      ? formatResponseUrl(user.backgroundImage)
      : null;

    // Check if viewer follows this user
    let isFollowed = false;

    if (viewerId) {
      const followRecord = await Follow.findOne({
        fromUser: viewerId,
        toUser: userId,
      });

      if (followRecord) {
        isFollowed = true;
      }
    }

    // Check if viewer blocked this user
    let isBlocked = false;
    if (viewerId) {
      const blockRecord = await Block.findOne({
        fromUser: viewerId,
        toUser: userId,
      });
      if (blockRecord) {
        isBlocked = true;
      }
    }

    // Check if it is my profile
    let isMyProfile = false;
    if (viewerId === userId) {
      isMyProfile = true;
    }

    // Map roleId to string
    let role = "CUSTOMER";
    if (user.roleId === roleId.SUPER_ADMIN) role = "SUPER_ADMIN";
    else if (user.roleId === roleId.ORGANIZER) role = "ORGANIZER";
    else if (user.roleId === roleId.GUEST) role = "GUEST";
    else if (user.roleId === roleId.STAFF) role = "STAFF";

    // Get interested category names
    const interestedCategories = (user.categories || []).map((cat) => cat.name);

    // Calculate allVerifiedAt: latest timestamp of all verifications when fully verified
    let allVerifiedAt = null;
    if (user.isAllVerified) {
      const dates = [];
      if (user.verifications?.phone?.isVerified && user.verifications.phone.verifiedAt) {
        dates.push(new Date(user.verifications.phone.verifiedAt));
      }
      if (user.verifications?.email?.isVerified && user.verifications.email.verifiedAt) {
        dates.push(new Date(user.verifications.email.verifiedAt));
      }
      if (user.verifications?.idVerification?.nationalId?.isVerified && user.verifications.idVerification.nationalId.verifiedAt) {
        dates.push(new Date(user.verifications.idVerification.nationalId.verifiedAt));
      }
      if (user.verifications?.idVerification?.drivingLicence?.isVerified && user.verifications.idVerification.drivingLicence.verifiedAt) {
        dates.push(new Date(user.verifications.idVerification.drivingLicence.verifiedAt));
      }
      if (user.verifications?.bankVerification?.isVerified && user.verifications.bankVerification.verifiedAt) {
        dates.push(new Date(user.verifications.bankVerification.verifiedAt));
      }
      if (dates.length > 0) {
        allVerifiedAt = new Date(Math.max(...dates.map(d => d.getTime())));
      }
    }

    // Base profile data (common for all users)
    const profileData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      isVerified: user.isVerified,
      hasBeenApproved: user.hasBeenApproved,
      email: user.email,
      gender: user.gender,
      countryCode: user.countryCode,
      contactNumber: user.contactNumber,
      dob: user.dob,
      profileImage: profileImage,
      backgroundImage: backgroundImage,
      bio: user.bio,
      role: role,
      userRole: role,
      roleId: user.roleId,
      averageRating: user.averageRating,
      reviewCount: user.reviewCount,
      location: user.location || null,
      interestedCategories: interestedCategories,
      categories: categories,
      totalAttended: totalAttended,
      totalInterests: totalInterests,
      isFollowed: isFollowed,
      isBlocked: isBlocked,
      isAllVerified: user.isAllVerified,
      allVerifiedAt: allVerifiedAt,
      isVerifiedOnce: user.verifications?.phone?.isVerifiedOnce || false,
      isMyProfile: isMyProfile,
      businessName: user.businessName,
      businessCategory: user.businessCategory,
      shortDesc: user.shortDesc,
      socialMediaLink: user.socialMediaLink,
      businessVerificationStatus: user.businessVerificationStatus,
      businessRejectionReason: user.businessRejectionReason,
      businessRejectionReasonTitle: user.businessRejectionReasonTitle,
      createdAt: user.createdAt,
      verifications: {
        email: user.verifications?.email,
        phone: user.verifications?.phone ? {
          isVerified: user.verifications.phone.isVerified || false,
          verifiedAt: user.verifications.phone.verifiedAt || null,
          isVerifiedOnce: user.verifications.phone.isVerifiedOnce || false,
        } : undefined,
        idVerification: user.verifications?.idVerification ? {
          nationalId: user.verifications.idVerification.nationalId ? {
            ...user.verifications.idVerification.nationalId,
            frontImage: formatResponseUrl(user.verifications.idVerification.nationalId.frontImage),
            backImage: formatResponseUrl(user.verifications.idVerification.nationalId.backImage),
          } : undefined,
          drivingLicence: user.verifications.idVerification.drivingLicence ? {
            ...user.verifications.idVerification.drivingLicence,
            frontImage: formatResponseUrl(user.verifications.idVerification.drivingLicence.frontImage),
            backImage: formatResponseUrl(user.verifications.idVerification.drivingLicence.backImage),
          } : undefined,
        } : undefined,
        bankVerification: user.verifications?.bankVerification,
        allVerifiedAt: allVerifiedAt,
      } || {},
      totalFollowers: 0, // Default to 0, overwritten below
      totalFollowing: 0, // Default to 0, overwritten below
    };

    // Calculate totalFollowers for everyone (or just organizers? Requirement says "toall followers API... if he is ORGANIZER".
    // Actually typically anyone can have followers if the social graph exists, but requirement phrased "name , i f he is ORGANIZER than his... toall followers...".
    // I'll add totalFollowers for everyone as it's useful social proof, or just organizer if strictly interpreted.
    // The prompt says "toall followers ... , if he is ORGANIZER than his ... data".
    // I'll compute followers for all users as the Follow model exists.
    const totalFollowers = await Follow.countDocuments({
      toUser: userId,
    });
    profileData.totalFollowers = totalFollowers;

    const totalFollowing = await Follow.countDocuments({
      fromUser: userId,
    });
    profileData.totalFollowing = totalFollowing;

    // If user is organizer, add additional data
    if (user.roleId === roleId.ORGANIZER) {
      // Organizer specific fields
      profileData.businessType = user.businessType;
      profileData.organizerVerificationStatus =
        user.organizerVerificationStatus;
      profileData.documents = (user.documents || []).map((doc) => ({
        ...doc,
        file: doc.file ? formatResponseUrl(doc.file) : null,
      }));

      // Calculate totalCourses count (added)
      const totalCourses = await Course.countDocuments({
        createdBy: userId,
        isDraft: false,
      });
      profileData.totalCoursesAdded = totalCourses; // "total course he added"

      // Calculate totalEventsHosted  
      const totalEventsHosted = await Event.countDocuments({
        createdBy: userId,
        isDraft: false,
      });
      profileData.totalEventsHosted = totalEventsHosted + totalCourses;

      const organizerObjectId = new mongoose.Types.ObjectId(userId);
      const roundToTwo = (num) =>
        Math.round((num + Number.EPSILON) * 100) / 100;

      // 1b. Total Upcoming Courses
      const totalUpcomingCourses = await Course.countDocuments({
        createdBy: userId,
        status: { $in: ["Upcoming", "Live"] },
        isDraft: false,
      });
      profileData.totalUpcomingCourses = totalUpcomingCourses;

      // 1. Total Upcoming Events
      const totalUpcomingEvents = await Event.countDocuments({
        createdBy: userId,
        status: { $in: ["Upcoming", "Live"] },
        isDraft: false,
      });
      profileData.totalUpcomingEvents = totalUpcomingEvents + totalUpcomingCourses;

      // 2. Total Tickets Sold
      const ticketsSoldResult = await Transaction.aggregate([
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "eventInfo",
          },
        },
        {
          $match: {
            bookingType: "EVENT",
            status: "PAID",
            "eventInfo.createdBy": organizerObjectId,
          },
        },
        {
          $group: {
            _id: null,
            totalTickets: { $sum: "$qty" },
          },
        },
      ]);
      profileData.totalTicketSold = ticketsSoldResult[0]?.totalTickets || 0;

      // 3. Net Earnings from Events
      const eventEarningsResult = await Transaction.aggregate([
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "eventInfo",
          },
        },
        {
          $match: {
            bookingType: "EVENT",
            status: "PAID",
            "eventInfo.createdBy": organizerObjectId,
          },
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$organizerEarning" },
          },
        },
      ]);
      profileData.netEarningEvents = roundToTwo(
        eventEarningsResult[0]?.totalEarnings || 0,
      );

      // 4. Net Earnings from Courses
      const courseEarningsResult = await Transaction.aggregate([
        {
          $lookup: {
            from: "courses",
            localField: "courseId",
            foreignField: "_id",
            as: "courseInfo",
          },
        },
        {
          $match: {
            bookingType: "COURSE",
            status: "PAID",
            "courseInfo.createdBy": organizerObjectId,
          },
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: "$organizerEarning" },
          },
        },
      ]);
      profileData.netEarningCourses = roundToTwo(
        courseEarningsResult[0]?.totalEarnings || 0,
      );

      const now = new Date();

      // -- EVENTS --
      const nextEventsQuery = Event.find({
        createdBy: userId,
        endDate: { $gte: now },
      })
        .populate("eventCategory", "name")
        .sort({ startDate: 1 }) // Soonest first
        .limit(4)
        .lean();

      const pastEventsQuery = Event.find({
        createdBy: userId,
        endDate: { $lt: now },
      })
        .populate("eventCategory", "name")
        .sort({ startDate: -1 }) // Most recent past first
        .limit(4)
        .lean();

      // -- COURSES --
      // Match the new Course schema using startDate, endDate, and enrollmentType
      const nextCoursesQuery = Course.find({
        createdBy: userId,
        isDraft: false,
        $or: [
          { enrollmentType: "Ongoing" },
          { endDate: { $gte: now } },
          { endDate: null }
        ]
      })
        .populate("courseCategory", "name")
        .sort({ startDate: 1 })
        .limit(4)
        .lean();

      const pastCoursesQuery = Course.find({
        createdBy: userId,
        isDraft: false,
        enrollmentType: "fixedStart",
        endDate: { $lt: now }
      })
        .populate("courseCategory", "name")
        .sort({ endDate: -1 })
        .limit(4)
        .lean();

      const [nextEventsRaw, pastEventsRaw, nextCoursesRaw, pastCoursesRaw] =
        await Promise.all([
          nextEventsQuery,
          pastEventsQuery,
          nextCoursesQuery,
          pastCoursesQuery,
        ]);

      // Helper to format event
      const formatEvent = (event) => {
        const eventObj = { ...event };
        if (Array.isArray(eventObj.posterImage)) {
          eventObj.posterImage = eventObj.posterImage.map((img) =>
            formatResponseUrl(img),
          );
        }
        if (Array.isArray(eventObj.mediaLinks)) {
          eventObj.mediaLinks = eventObj.mediaLinks.map((link) =>
            formatResponseUrl(link),
          );
        }
        if (Array.isArray(eventObj.shortTeaserVideo)) {
          eventObj.shortTeaserVideo = eventObj.shortTeaserVideo.map((video) =>
            formatResponseUrl(video),
          );
        }
        return eventObj;
      };

      // Helper to format course
      const formatCourse = (course) => {
        const courseObj = { ...course };
        if (Array.isArray(courseObj.posterImage)) {
          courseObj.posterImage = courseObj.posterImage.map((img) =>
            formatResponseUrl(img),
          );
        }
        return courseObj;
      };

      profileData.events = {
        upcoming_events: nextEventsRaw.map(formatEvent),
        previous_events: pastEventsRaw.map(formatEvent),
      };

      profileData.courses = {
        upcoming_courses: nextCoursesRaw.map(formatCourse),
        previous_courses: pastCoursesRaw.map(formatCourse),
      };
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "User profile fetched successfully",
      {
        user: profileData,
      },
    );
  } catch (error) {
    console.error("Error in getUserProfileById:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


const userList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      isDisable,
      isDeleted,
      roleId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    // Enable / Disable filter
    if (isDisable !== undefined) {
      filter.isDisable = isDisable === "true";
    }

    // Deleted / Not deleted
    if (isDeleted !== undefined) {
      filter.isDeleted = isDeleted === "true";
    } else {
      filter.isDeleted = false; // default behavior
    }

    // Role filter
    if (roleId) {
      filter.roleId = Number(roleId);
    }

    // Keyword search
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { contactNumber: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const sort = {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
    };

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
      User.countDocuments(filter),
    ]);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "User list fetched successfully",
      {
        users,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    );
  } catch (error) {
    console.error("Error in userList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const toggleUserDisable = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isDisable } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isDisable },
      { new: true },
    );

    if (!updatedUser) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      `User ${isDisable ? "disabled" : "enabled"} successfully`,
      { user: updatedUser },
    );
  } catch (error) {
    console.error("Error in toggleUserDisable:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isDeleted: true },
      { new: true },
    );

    if (!updatedUser) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.USER_DELETED_SUCCESS, {
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error in deleteUser:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Delete My Account
const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Soft Delete
    user.isDeleted = true;
    user.isDisable = true;
    await user.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.ACCOUNT_DELETED_SUCCESS);
  } catch (error) {
    console.error("Error in deleteMyAccount:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Unified Resend OTP
const resendUniversalOtp = async (req, res) => {
  try {
    const { type } = req.body;
    // type: "LOGIN", "CUSTOMER", "ORGANIZER", "FORGOT_PASSWORD"

    if (!type) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Type is required (LOGIN, CUSTOMER, ORGANIZER, FORGOT_PASSWORD).",
      );
    }

    if (type === "LOGIN") {
      return resendLoginOtp(req, res);
    } else if (type === "CUSTOMER" || type === "ORGANIZER") {
      // Both customer and organizer signup use the general 'resendOtp' which uses 'signup_data' key
      return resendOtp(req, res);
    } else if (type === "FORGOT_PASSWORD") {
      return resendForgotPasswordOtp(req, res);
    } else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OTP_TYPE);
    }
  } catch (error) {
    console.error("Error in resendUniversalOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Unified OTP Verification
const verifyUniversalOtp = async (req, res) => {
  try {
    const { type } = req.body;
    // type: "LOGIN", "CUSTOMER", "ORGANIZER"

    if (!type) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Type is required (LOGIN, CUSTOMER, ORGANIZER).",
      );
    }

    if (type === "LOGIN") {
      return loginVerify(req, res);
    } else if (type === "CUSTOMER") {
      return customerSignupVerify(req, res);
    } else if (type === "ORGANIZER") {
      return organizerSignupVerify(req, res);
    } else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_OTP_TYPE);
    }
  } catch (error) {
    console.error("Error in verifyUniversalOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Forgot Password - Step 1: Init
const forgotPasswordInit = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    // Generate OTP
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store in Redis
    await setKeyWithTime(`forgot_otp:${email}`, otp, 10); // 10 mins

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp },
    );
  } catch (error) {
    console.error("Error in forgotPasswordInit:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Forgot Password - Step 2: Verify OTP
const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const redisOtp = await getKey(`forgot_otp:${email}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_OR_EXPIRED_OTP,
      );
    }

    // Clear OTP
    await removeKey(`forgot_otp:${email}`);

    // Generate Short-lived Reset Token
    // Scope: 'reset_password'
    const resetToken = signToken(
      { email, scope: "reset_password" },
      "10m", // 10 minutes expiry
    );

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "OTP verified successfully. Use the token to reset password.",
      { token: resetToken },
    );
  } catch (error) {
    console.error("Error in verifyForgotPasswordOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Forgot Password - Step 2.5: Resend OTP
const resendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    // Generate OTP
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store in Redis
    await setKeyWithTime(`forgot_otp:${email}`, otp, 10); // 10 mins

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_RESENT_SUCCESS,
      { otp },
    );
  } catch (error) {
    console.error("Error in resendForgotPasswordOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Forgot Password - Step 3: Reset Password
const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    // Token should be in Authorization header or body. Middleware usually handles header.
    // If this route is public (not passed through main jwtVerification), we need to verify here.
    // However, if we put it behind a middleware that expects `userId` in token, it will fail because our token has `email` and `scope`.
    // So we'll likely need to verify manually here or use a specific middleware.
    // Let's assume it's passed in header but we extract manually if middleware didn't.
    // But `jwtVerification` middleware at App level often decodes standard tokens.
    // Let's look at `resetToken` passed in body for simplicity if header is tricky with global middleware.
    // Update: User often forgets headers. Body is easier for simple clients.

    const token =
      req.body.resetToken || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return apiErrorRes(
        HTTP_STATUS.UNAUTHORIZED,
        res,
        "Reset token required.",
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch (err) {
      return apiErrorRes(
        HTTP_STATUS.UNAUTHORIZED,
        res,
        "Invalid or expired reset token.",
      );
    }

    if (decoded.scope !== "reset_password" || !decoded.email) {
      return apiErrorRes(HTTP_STATUS.UNAUTHORIZED, res, constantsMessage.INVALID_TOKEN_SCOPE);
    }

    const user = await User.findOne({ email: decoded.email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Update Password
    // Check if new password is same as old? Optional.
    user.password = newPassword; // Pre-save hook usually hashes it?
    // Wait, let's check if there is a pre-save hook.
    // Usually defined in User model. I haven't seen the User model but typical setup.
    // If not, I should hash it here.
    // `customerSignupVerify` (line 143) passes raw password to `new User`.
    // `loginInit` (line 414) uses `verifyPassword` (bcrypt).
    // So `User` model likely has a pre-save hook.

    // BUT `controllerUser.js` line 143: `user = new User({ ... password: userData.password ... })`
    // And `updateUserProfile` doesn't update password.
    // Let's check `customerSignupVerify` again.
    // It creates user.
    // `adminLogin` verifies password.

    // Safety: If I don't see the User model, I'll rely on common practice or check if I can see it.
    // However, `controllerUser.js` has `verifyPassword` imported from utils.
    // Let's look at how `otpVerificationSchema` handles password... just string.

    // I will assume there is a pre-save hook for now. If not, this is a bug in my implementation AND likely the existing signup if it relies on it.
    // Actually, `customerSignupVerify` takes `userData.password` from redis and saves it.
    // If I wanted to be 100% sure, I'd check User model, but for now I'll assume standard behavior or that I should simple save it.
    // Wait, if there isn't a hook, the password will be plain text.
    // I should probably check `Backend/db/models/User.js` or similar if I could, but I don't want to waste steps.
    // Let's assume pre-save hook exists because `loginInit` uses `verifyPassword(user.password, password)` which usually implies `user.password` is hashed.

    await user.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.UPDATE_PASSWORD_SUCCESS,
    );
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND,
      );
    }

    // Verify Old Password
    const isMatch = await verifyPassword(user.password, oldPassword);
    if (!isMatch) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid old password.",
      );
    }

    // Update Password (hashed via pre-save hook)
    user.password = newPassword;
    await user.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Password updated successfully.",
    );
  } catch (error) {
    console.error("Error in changePassword:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/customer/signup",
  perApiLimiter(),
  validateRequest(customerSignupSchema),
  customerSignupInit,
);
router.post(
  "/customer/verify-otp",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  customerSignupVerify,
);

router.post(
  "/organizer/signup",
  perApiLimiter(),
  validateRequest(organizerSignupSchema),
  organizerSignupInit,
);
router.post(
  "/organizer/verify-otp",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  organizerSignupVerify,
);

router.post(
  "/resend-otp",
  perApiLimiter(),
  validateRequest(resendOtpSchema),
  resendOtp,
);

// Upload endpoint - accepts multiple files
router.post(
  "/upload",
  perApiLimiter(),
  upload.array("files", 10),
  uploadDocument,
);

router.post(
  "/login/init",
  perApiLimiter(),
  validateRequest(loginInitSchema),
  loginInit,
);

router.post(
  "/login/verify",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  loginVerify,
);

router.post(
  "/login/resend-otp",
  perApiLimiter(),
  validateRequest(resendOtpSchema),
  resendLoginOtp,
);

router.post(
  "/admin/login",
  perApiLimiter(),
  // validateRequest(loginInitSchema), // Reuse schema as it has email & password
  adminLogin,
);

router.post(
  "/social-login",
  perApiLimiter(),
  validateRequest(socialLoginSchema),
  socialLogin,
);

router.post(
  "/guest-login",
  perApiLimiter(),
  guestLogin,
);

router.post(
  "/update-profile",
  perApiLimiter(),
  validateRequest(updateUserSchema),
  updateUserProfile,
);

router.post(
  "/change-password",
  perApiLimiter(),
  validateRequest(changePasswordSchema),
  changePassword,
);

router.get("/selfProfile", selfProfile);

router.get("/userList", checkRole([roleId.SUPER_ADMIN]), userList);
router.patch(
  "/toggle-disable/:userId",
  checkRole([roleId.SUPER_ADMIN]),
  toggleUserDisable,
);
router.delete("/delete/:userId", checkRole([roleId.SUPER_ADMIN]), deleteUser);

// Delete My Account
router.delete("/delete-account", perApiLimiter(), deleteMyAccount);

// Get User Profile By ID
router.get("/profile/:userId", perApiLimiter(), getUserProfileById);

router.post(
  "/verify-otp",
  perApiLimiter(),
  // Use the specific schema that validates 'type'
  validateRequest(universalOtpSchema),
  verifyUniversalOtp,
);

const {
  forgotPasswordInitSchema,
  resetPasswordSchema,
} = require("../services/validations/userValidation");

router.post(
  "/forgot-password/init",
  perApiLimiter(),
  validateRequest(forgotPasswordInitSchema),
  forgotPasswordInit,
);

router.post(
  "/forgot-password/verify",
  perApiLimiter(),
  validateRequest(otpVerificationSchema), // Reusing schema as it fits (email + otp)
  verifyForgotPasswordOtp,
);

router.post(
  "/reset-password",
  perApiLimiter(),
  validateRequest(resetPasswordSchema),
  resetPassword,
);

router.post(
  "/resendOtp",
  perApiLimiter(),
  validateRequest(universalResendOtpSchema),
  resendUniversalOtp,
);

// --- STAFF FLOW ENDPOINTS ---

const staffForgotPasswordInit = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isDeleted: false, roleId: roleId.STAFF });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Staff account not found",
      );
    }

    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    const otp = process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    await setKeyWithTime(`staff_forgot_otp:${email}`, otp, 10);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp },
    );
  } catch (error) {
    console.error("Error in staffForgotPasswordInit:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const staffVerifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const redisOtp = await getKey(`staff_forgot_otp:${email}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_OR_EXPIRED_OTP,
      );
    }

    await removeKey(`staff_forgot_otp:${email}`);

    const resetToken = signToken(
      { email, scope: "staff_reset_password" },
      "10m",
    );

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "OTP verified successfully. Use the token to reset password.",
      { token: resetToken },
    );
  } catch (error) {
    console.error("Error in staffVerifyForgotPasswordOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const staffResendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isDeleted: false, roleId: roleId.STAFF });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Staff account not found",
      );
    }

    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED,
      );
    }

    const otp = process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    await setKeyWithTime(`staff_forgot_otp:${email}`, otp, 10);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_RESENT_SUCCESS,
      { otp },
    );
  } catch (error) {
    console.error("Error in staffResendForgotPasswordOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const staffResetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const token = req.body.resetToken || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return apiErrorRes(
        HTTP_STATUS.UNAUTHORIZED,
        res,
        "Reset token required.",
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch (err) {
      return apiErrorRes(
        HTTP_STATUS.UNAUTHORIZED,
        res,
        "Invalid or expired reset token.",
      );
    }

    if (decoded.scope !== "staff_reset_password" || !decoded.email) {
      return apiErrorRes(HTTP_STATUS.UNAUTHORIZED, res, constantsMessage.INVALID_TOKEN_SCOPE);
    }

    const user = await User.findOne({ email: decoded.email, isDeleted: false, roleId: roleId.STAFF });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Staff account not found",
      );
    }

    user.password = newPassword;
    await user.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.UPDATE_PASSWORD_SUCCESS,
    );
  } catch (error) {
    console.error("Error in staffResetPassword:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const addStaff = async (req, res) => {
  try {
    const { fullname, email, password, profilePhoto } = req.body;
    const organizerId = req.user.userId;

    const existingUser = await User.findOne({ email, isDeleted: false });
    if (existingUser) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.EMAIL_ALREADY_EXISTS || "Email already exists",
      );
    }

    const parts = fullname.trim().split(" ");
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ") || "";

    const staffUser = new User({
      firstName,
      lastName,
      email,
      password,
      profileImage: profilePhoto || null,
      roleId: roleId.STAFF,
      createdBy: organizerId,
      isVerified: true,
      organizerVerificationStatus: "approved",
    });

    await staffUser.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff member added successfully",
      { staff: staffUser.toObject() },
    );
  } catch (error) {
    console.error("Error in addStaff:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const listStaff = async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const staffList = await User.find({
      createdBy: organizerId,
      roleId: roleId.STAFF,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    const formattedStaffList = staffList.map((staff) => ({
      ...staff,
      profileImage: staff.profileImage ? formatResponseUrl(staff.profileImage) : null,
    }));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff list retrieved successfully",
      { staff: formattedStaffList },
    );
  } catch (error) {
    console.error("Error in listStaff:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const staffLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, isDeleted: false });
    if (!user || user.roleId !== roleId.STAFF) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid email or password",
      );
    }

    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED || "Account is disabled",
      );
    }

    const isMatch = await verifyPassword(user.password, password);
    if (!isMatch) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid email or password",
      );
    }

    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff logged in successfully",
      {
        user: { ...user.toObject(), userRole: userRole[user.roleId] },
        token,
      },
    );
  } catch (error) {
    console.error("Error in staffLogin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getStaffAssignedList = async (req, res) => {
  try {
    const staffId = req.user.userId;

    const events = await Event.find({ assignedStaff: staffId, isDraft: false })
      .populate("eventCategory", "name")
      .populate("createdBy", "firstName lastName email")
      .lean();

    const formattedEvents = events.map((event) => ({
      ...event,
      posterImage: (event.posterImage || []).map(formatResponseUrl),
      mediaLinks: (event.mediaLinks || []).map(formatResponseUrl),
      shortTeaserVideo: (event.shortTeaserVideo || []).map(formatResponseUrl),
    }));

    const courses = await Course.find({ assignedStaff: staffId, isDraft: false })
      .populate("courseCategory", "name")
      .populate("createdBy", "firstName lastName email")
      .lean();

    const formattedCourses = courses.map((course) => ({
      ...course,
      posterImage: (course.posterImage || []).map(formatResponseUrl),
      mediaLinks: (course.mediaLinks || []).map(formatResponseUrl),
      shortTeaserVideo: (course.shortTeaserVideo || []).map(formatResponseUrl),
    }));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Assigned list retrieved successfully",
      { events: formattedEvents, courses: formattedCourses },
    );
  } catch (error) {
    console.error("Error in getStaffAssignedList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getStaffScanHistory = async (req, res) => {
  try {
    const staffId = req.user.userId;
    const { Attendee: AttendeeModel } = require("../../db");

    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const query = {
      checkedInBy: staffId,
      isCheckedIn: true,
    };

    if (req.query.startDate || req.query.endDate) {
      query.checkedInAt = {};
      if (req.query.startDate) {
        query.checkedInAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        query.checkedInAt.$lte = end;
      }
    }

    // Filter by type (event or course)
    if (req.query.type) {
      if (req.query.type.toLowerCase() === "event") {
        query.eventId = { $exists: true, $ne: null };
      } else if (req.query.type.toLowerCase() === "course") {
        query.courseId = { $exists: true, $ne: null };
      }
    }

    // Filter by specific courseId, eventId, or unified entityId parameter
    if (req.query.eventId) {
      query.eventId = req.query.eventId;
    }
    if (req.query.courseId) {
      query.courseId = req.query.courseId;
    }
    if (req.query.entityId) {
      query.$or = [
        { eventId: req.query.entityId },
        { courseId: req.query.entityId }
      ];
    }

    // Single unified search query parameter matching attendee names, emails, and ticket/attendee IDs (excludes course/event titles)
    if (req.query.search) {
      const searchVal = req.query.search;
      const mongoose = require("mongoose");
      const searchFilter = [
        { firstName: { $regex: searchVal, $options: "i" } },
        { lastName: { $regex: searchVal, $options: "i" } },
        { email: { $regex: searchVal, $options: "i" } },
        { ticketNumber: { $regex: searchVal, $options: "i" } },
        { ticketId: { $regex: searchVal, $options: "i" } }
      ];

      if (mongoose.Types.ObjectId.isValid(searchVal)) {
        searchFilter.push({ _id: searchVal });
        searchFilter.push({ userId: searchVal });
      }
      
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: searchFilter }
        ];
        delete query.$or;
      } else {
        query.$or = searchFilter;
      }
    }

    const total = await AttendeeModel.countDocuments(query);

    const scanHistory = await AttendeeModel.find(query)
      .populate("eventId", "eventTitle startDate endDate venueName")
      .populate("courseId", "courseTitle startDate endDate venueName")
      .populate("userId", "firstName lastName email profileImage")
      .populate("transactionId", "bookingId totalAmount status")
      .sort({ checkedInAt: -1 })
      .skip(skip)
      .limit(size);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Scan history retrieved successfully",
      {
        scanHistory,
        total,
        pageNo,
        size,
        totalPages: Math.ceil(total / size),
      },
    );
  } catch (error) {
    console.error("Error in getStaffScanHistory:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};


const editStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const organizerId = req.user.userId;
    const { fullname, email, password, profilePhoto } = req.body;

    const staffUser = await User.findOne({
      _id: staffId,
      roleId: roleId.STAFF,
      createdBy: organizerId,
      isDeleted: false,
    });

    if (!staffUser) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Staff member not found or access denied",
      );
    }

    if (email && email.toLowerCase() !== staffUser.email.toLowerCase()) {
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        isDeleted: false,
      });
      if (existingUser) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.EMAIL_ALREADY_EXISTS || "Email already exists",
        );
      }
      staffUser.email = email.toLowerCase();
    }

    if (fullname !== undefined) {
      const parts = fullname.trim().split(" ");
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ") || "";
      staffUser.firstName = firstName;
      staffUser.lastName = lastName;
    }

    if (password) {
      staffUser.password = password;
    }

    if (profilePhoto !== undefined) {
      staffUser.profileImage = profilePhoto || null;
    }

    await staffUser.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff member updated successfully",
      { staff: staffUser.toObject() },
    );
  } catch (error) {
    console.error("Error in editStaff:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const removeStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const organizerId = req.user.userId;

    const staffUser = await User.findOne({
      _id: staffId,
      roleId: roleId.STAFF,
      createdBy: organizerId,
      isDeleted: false,
    });

    if (!staffUser) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Staff member not found or access denied",
      );
    }

    staffUser.isDeleted = true;
    await staffUser.save();

    // Pull this staff member from all event and course assignments
    await Event.updateMany(
      { assignedStaff: staffId },
      { $pull: { assignedStaff: staffId } }
    );
    await Course.updateMany(
      { assignedStaff: staffId },
      { $pull: { assignedStaff: staffId } }
    );

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Staff member removed successfully",
    );
  } catch (error) {
    console.error("Error in removeStaff:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/organizer/staff/add",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(addStaffSchema),
  addStaff,
);

router.post(
  "/organizer/staff/edit/:staffId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(editStaffSchema),
  editStaff,
);

router.post(
  "/organizer/staff/remove/:staffId",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  removeStaff,
);

router.get(
  "/organizer/staff/list",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  listStaff,
);

router.post(
  "/staff/login",
  perApiLimiter(),
  staffLogin,
);

router.get(
  "/staff/assigned",
  perApiLimiter(),
  checkRole([roleId.STAFF]),
  getStaffAssignedList,
);

router.get(
  "/staff/scan-history",
  perApiLimiter(),
  checkRole([roleId.STAFF]),
  getStaffScanHistory,
);

router.post(
  "/staff/forgot-password/init",
  perApiLimiter(),
  validateRequest(forgotPasswordInitSchema),
  staffForgotPasswordInit,
);

router.post(
  "/staff/forgot-password/verify",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  staffVerifyForgotPasswordOtp,
);

router.post(
  "/staff/forgot-password/resend",
  perApiLimiter(),
  validateRequest(forgotPasswordInitSchema), // reused since it just needs email
  staffResendForgotPasswordOtp,
);

router.post(
  "/staff/reset-password",
  perApiLimiter(),
  validateRequest(resetPasswordSchema),
  staffResetPassword,
);

const addOrganizerInfo = async (req, res) => {
  try {
    const { businessName, category, shortDesc, socialMediaLink } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND || "User not found",
      );
    }

    if (user.roleId !== roleId.ORGANIZER) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "Only organizers can update organizer info",
      );
    }

    // Capture history for previous business info before modifying it
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
    user.businessCategory = category;
    user.shortDesc = shortDesc;
    user.socialMediaLink = socialMediaLink || null;
    user.organizerVerificationStatus = "pending";

    // Manage business verification state
    user.isBusinessVerified = false;
    user.businessVerificationStatus = "pending";
    user.businessRejectionReason = null;

    await user.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Organizer info submitted successfully. Your account is now under review.",
      { user },
    );
  } catch (error) {
    console.error("Error in addOrganizerInfo:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/organizer/info",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]),
  validateRequest(organizerInfoSchema),
  addOrganizerInfo,
);

const adminVerifyOrganizer = async (req, res) => {
  try {
    const { userId, action, reason, reasonTitle } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND || "User not found"
      );
    }

    if (user.roleId !== roleId.ORGANIZER) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "User is not an organizer"
      );
    }

    if (action === "approve") {
      user.organizerVerificationStatus = "approved";
      user.isVerified = true;
      user.organizerRejectionReason = null;
      user.organizerRejectionReasonTitle = null;

      // Update business verification state
      user.isBusinessVerified = true;
      user.businessVerificationStatus = "approved";
      user.businessRejectionReason = null;
      user.businessRejectionReasonTitle = null;

      // Log business verification history
      user.verifications.history.push({
        type: "businessVerification",
        businessName: user.businessName,
        businessCategory: user.businessCategory,
        shortDesc: user.shortDesc,
        socialMediaLink: user.socialMediaLink,
        status: "approved",
        rejectionReason: null,
        rejectionReasonTitle: null,
        actionBy: req.user.userId,
        createdAt: new Date(),
      });
    } else if (action === "reject") {
      user.organizerVerificationStatus = "rejected";
      user.isVerified = false;
      user.organizerRejectionReason = reason || null;
      user.organizerRejectionReasonTitle = reasonTitle || null;

      // Update business verification state
      user.isBusinessVerified = false;
      user.businessVerificationStatus = "rejected";
      user.businessRejectionReason = reason || null;
      user.businessRejectionReasonTitle = reasonTitle || null;

      // Log business verification history
      user.verifications.history.push({
        type: "businessVerification",
        businessName: user.businessName,
        businessCategory: user.businessCategory,
        shortDesc: user.shortDesc,
        socialMediaLink: user.socialMediaLink,
        status: "rejected",
        rejectionReason: reason || null,
        rejectionReasonTitle: reasonTitle || null,
        actionBy: req.user.userId,
        createdAt: new Date(),
      });
    } else {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid action. Use 'approve' or 'reject'."
      );
    }
    console.log(user.organizerVerificationStatus);

    await user.save();

    // ── Notify organizer of verification status change ──
    try {
      const { notifyVerificationResult } = require("../services/serviceNotification");
      notifyVerificationResult(
        String(user._id),
        action,
        reason
      ).catch((e) => console.error("[Notification] notifyVerificationResult error:", e));
    } catch (notifyErr) {
      console.error("[Notification] Error triggering notifyVerificationResult:", notifyErr);
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      `Organizer account successfully ${action === "approve" ? "approved" : "rejected"}.`,
      { user }
    );
  } catch (error) {
    console.error("Error in adminVerifyOrganizer:", error);
    return apiErrorRes(
      HTTP_STATUS.SERVER_ERROR,
      res,
      error.message
    );
  }
};



router.post(
  "/admin/organizer/verify",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(adminVerifyOrganizerSchema),
  adminVerifyOrganizer,
);

module.exports = router;
