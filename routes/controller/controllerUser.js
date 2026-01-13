const express = require("express");
const router = express.Router();
const { User } = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  generateOTP,
  verifyPassword,
} = require("../../utils/globalFunction");
const { signToken } = require("../../utils/jwtTokenUtils");
const {
  customerSignupSchema,
  organizerSignupSchema,
  otpVerificationSchema,
  resendOtpSchema,
  loginInitSchema,
} = require("../services/validations/userValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const {
  setKeyWithTime,
  getKey,
  removeKey,
} = require("../services/serviceRedis");
const { roleId } = require("../../utils/Role");
const { upload, storeImage } = require("../../utils/cloudinary");

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
        constantsMessage.EMAIL_ALREADY_EXISTS
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
        constantsMessage.CONTACT_ALREADY_EXISTS
      );
    }

    // Generate OTP (12345 for development, random OTP for production)
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP(); // TODO: Implement SMS/Email service for production

    // Save data to Redis
    // Key for data: signup_data:{email}
    // Key for OTP: signup_otp:{email}
    await setKeyWithTime(`signup_data:${email}`, JSON.stringify(req.body), 10); // 10 mins
    await setKeyWithTime(`signup_otp:${email}`, otp, 10); // 10 mins

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp }
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
        constantsMessage.INVALID_OR_EXPIRED_OTP
      );
    }

    // Get User Data from Redis
    const redisData = await getKey(`signup_data:${email}`);
    if (redisData.statusCode !== CONSTANTS.SUCCESS || !redisData.data) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.SESSION_EXPIRED_REGISTER
      );
    }

    const userData = JSON.parse(redisData.data);

    // Create User
    const newUser = new User({
      email: userData.email,
      password: userData.password,
      contactNumber: userData.mobileNumber,
      countryCode: userData.countryCode,
      roleId: roleId.CUSTOMER,
    });

    await newUser.save();

    // Clear Redis
    await removeKey(`signup_otp:${email}`);
    await removeKey(`signup_data:${email}`);

    // Generate Token
    const token = signToken({ userId: newUser._id, roleId: newUser.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.REGISTRATION_SUCCESSFUL,
      {
        user: newUser,
        token,
      }
    );
  } catch (error) {
    console.error("Error in customerSignupVerify:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Organizer Signup - Step 1: Init
const organizerSignupInit = async (req, res) => {
  try {
    const { email, contactNumber, countryCode } = req.body;

    // Check if email already exists
    const existingEmail = await User.findOne({ email, isDeleted: false });
    if (existingEmail) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.EMAIL_ALREADY_EXISTS
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
        constantsMessage.CONTACT_ALREADY_EXISTS
      );
    }

    // Generate OTP (12345 for development, random OTP for production)
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP(); // TODO: Implement SMS/Email service for production

    // Save data to Redis
    await setKeyWithTime(`signup_data:${email}`, JSON.stringify(req.body), 10);
    await setKeyWithTime(`signup_otp:${email}`, otp, 10);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp }
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
        constantsMessage.INVALID_OR_EXPIRED_OTP
      );
    }

    const redisData = await getKey(`signup_data:${email}`);
    if (redisData.statusCode !== CONSTANTS.SUCCESS || !redisData.data) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.SESSION_EXPIRED_REGISTER
      );
    }

    const userData = JSON.parse(redisData.data);

    const newUser = new User({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      contactNumber: userData.mobileNumber,
      countryCode: userData.countryCode,
      businessType: userData.businessType,
      acceptTerms: userData.acceptTerms,
      documents: userData.documents,
      roleId: roleId.ORGANISER, // ORGANIZER
      organizerVerificationStatus: "pending",
    });

    await newUser.save();

    await removeKey(`signup_otp:${email}`);

    await removeKey(`signup_data:${email}`);

    const token = signToken({ userId: newUser._id, roleId: newUser.roleId });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.ORGANIZER_REGISTRATION_SUCCESS,
      { user: newUser, token }
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
        constantsMessage.SESSION_EXPIRED_SIGNUP
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
      }
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
        constantsMessage.NO_FILES_UPLOADED
      );
    }

    // Generate a temporary userId or use 'temp' folder for unauthenticated uploads
    const userId = req.body.userId || "temp";

    // Upload all files and collect their paths
    const uploadPromises = req.files.map((file) => storeImage(file, userId));
    const filePaths = await Promise.all(uploadPromises);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.FILES_UPLOADED_SUCCESS,
      {
        files: filePaths,
      }
    );
  } catch (error) {
    console.error("Error in uploadDocument:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Login - Step 1: Init (Email/Password -> OTP)
const loginInit = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find User
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_EMAIL_OR_PASSWORD
      );
    }

    // Check if account is disabled
    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED
      );
    }

    // Verify Password
    const isMatch = await verifyPassword(user.password, password);
    if (!isMatch) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_EMAIL_OR_PASSWORD
      );
    }

    // Check Organizer Status
    if (
      user.roleId === roleId.ORGANISER &&
      user.organizerVerificationStatus !== "approved"
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        `${constantsMessage.ACCOUNT_STATUS_PREFIX}${user.organizerVerificationStatus}${constantsMessage.WAIT_FOR_ADMIN_APPROVAL}`
      );
    }

    // Generate OTP
    const otp =
      process.env.NODE_ENV === "development" ? "12345" : generateOTP();

    // Store OTP in Redis (Login OTP key)
    await setKeyWithTime(`login_otp:${email}`, otp, 10); // 10 mins

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.OTP_SENT_SUCCESS,
      { otp }
    );
  } catch (error) {
    console.error("Error in loginInit:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Login - Step 2: Verify OTP
const loginVerify = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Verify OTP
    const redisOtp = await getKey(`login_otp:${email}`);
    if (redisOtp.statusCode !== CONSTANTS.SUCCESS || redisOtp.data !== otp) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_OR_EXPIRED_OTP
      );
    }

    // Find User
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND
      );
    }

    // Clear Redis
    await removeKey(`login_otp:${email}`);

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
        user,
        token,
      }
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
        constantsMessage.USER_NOT_FOUND
      );
    }

    // Check Role (Must be SUPER_ADMIN)
    if (user.roleId !== roleId.SUPER_ADMIN) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        "Access denied. Admin only."
      );
    }

    // Check if account is disabled
    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED
      );
    }

    // Verify Password
    const isMatch = await verifyPassword(user.password, password);
    if (!isMatch) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INVALID_EMAIL_OR_PASSWORD
      );
    }

    // Generate Token
    const token = signToken({ userId: user._id, roleId: user.roleId });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.LOGIN_SUCCESS, {
      user,
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
        constantsMessage.USER_NOT_FOUND
      );
    }

    // Check if account is disabled
    if (user.isDisable) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCOUNT_DISABLED
      );
    }

    // Check Organizer Status
    if (
      user.roleId === roleId.ORGANISER &&
      user.organizerVerificationStatus !== "approved"
    ) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        `${constantsMessage.ACCOUNT_STATUS_PREFIX}${user.organizerVerificationStatus}${constantsMessage.WAIT_FOR_ADMIN_APPROVAL}`
      );
    }

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
      }
    );
  } catch (error) {
    console.error("Error in resendLoginOtp:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/customer/signup",
  perApiLimiter(),
  validateRequest(customerSignupSchema),
  customerSignupInit
);
router.post(
  "/customer/verify-otp",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  customerSignupVerify
);

router.post(
  "/organizer/signup",
  perApiLimiter(),
  validateRequest(organizerSignupSchema),
  organizerSignupInit
);
router.post(
  "/organizer/verify-otp",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  organizerSignupVerify
);

router.post(
  "/resend-otp",
  perApiLimiter(),
  validateRequest(resendOtpSchema),
  resendOtp
);

// Upload endpoint - accepts multiple files
router.post(
  "/upload",
  perApiLimiter(),
  upload.array("files", 10),
  uploadDocument
);

router.post(
  "/login/init",
  perApiLimiter(),
  validateRequest(loginInitSchema),
  loginInit
);

router.post(
  "/login/verify",
  perApiLimiter(),
  validateRequest(otpVerificationSchema),
  loginVerify
);

router.post(
  "/login/resend-otp",
  perApiLimiter(),
  validateRequest(resendOtpSchema),
  resendLoginOtp
);

router.post(
  "/admin/login",
  perApiLimiter(),
  validateRequest(loginInitSchema), // Reuse schema as it has email & password
  adminLogin
);

module.exports = router;
