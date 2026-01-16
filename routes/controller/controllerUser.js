const express = require("express");
const router = express.Router();
const {
  User,
  Event,
  Course,
  Transaction,
  Follow,
  Verification,
} = require("../../db");
const CONSTANTS = require("../../utils/constants");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  generateOTP,
  verifyPassword,
  BACKEND_URL,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const { signToken } = require("../../utils/jwtTokenUtils");
const {
  customerSignupSchema,
  organizerSignupSchema,
  otpVerificationSchema,
  resendOtpSchema,
  loginInitSchema,
  updateUserSchema,
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

// Update User Profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    if (req.user.roleId === roleId.SUPER_ADMIN) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.SUPER_ADMIN_UPDATE_NOT_ALLOWED
      );
    }

    const { email, location, ...updateData } = req.body;

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
          constantsMessage.EMAIL_ALREADY_EXISTS
        );
      }
      updateData.email = email;
    }

    // Handle location update
    if (location) {
      updateData.location = {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
        city: location.city,
        country: location.country,
        address: location.address,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).lean();

    if (!updatedUser) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND
      );
    }
    if (updatedUser.profileImage) {
      updatedUser.profileImage = `${BACKEND_URL}/${updatedUser.profileImage}`;
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROFILE_UPDATED,
      { user: updatedUser }
    );
  } catch (error) {
    console.error("Error in updateUserProfile:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const getUserProfileById = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user with populated categories
    const user = await User.findById(userId)
      .populate("categories", "name type image")
      .lean();

    if (!user || user.isDeleted) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.USER_NOT_FOUND
      );
    }

    // Get verification data
    const verification = await Verification.findOne({ user: userId }).lean();

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
      type: cat.type,
      image: cat.image ? formatResponseUrl(cat.image) : null,
    }));

    // Format profile image
    const profileImage = user.profileImage
      ? formatResponseUrl(user.profileImage)
      : null;

    // Base profile data (common for all users)
    const profileData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImage: profileImage,
      bio: user.bio,
      categories: categories,
      totalAttended: totalAttended,
      totalInterests: totalInterests,
      verification: verification || null,
    };

    // If user is organizer, add additional data
    if (user.roleId === roleId.ORGANISER) {
      // Add location
      profileData.location = user.location || null;

      // Calculate totalFollowers
      const totalFollowers = await Follow.countDocuments({
        toUser: userId,
      });
      profileData.totalFollowers = totalFollowers;

      // Calculate totalEventsHosted
      const totalEventsHosted = await Event.countDocuments({
        createdBy: userId,
      });
      profileData.totalEventsHosted = totalEventsHosted;

      // Get all events created by this organizer
      const events = await Event.find({
        createdBy: userId,
      })
        .populate("eventCategory", "name")
        .sort({ startDate: -1 })
        .lean();

      // Get all courses created by this organizer
      const courses = await Course.find({
        createdBy: userId,
      })
        .populate("courseCategory", "name")
        .sort({ createdAt: -1 })
        .lean();

      const now = new Date();

      // Separate events into next and past
      const nextEvents = [];
      const pastEvents = [];

      events.forEach((event) => {
        const eventObj = { ...event };

        // Format poster images
        if (Array.isArray(eventObj.posterImage)) {
          eventObj.posterImage = eventObj.posterImage.map((img) =>
            formatResponseUrl(img)
          );
        }

        // Format media links
        if (Array.isArray(eventObj.mediaLinks)) {
          eventObj.mediaLinks = eventObj.mediaLinks.map((link) =>
            formatResponseUrl(link)
          );
        }

        // Format teaser videos
        if (Array.isArray(eventObj.shortTeaserVideo)) {
          eventObj.shortTeaserVideo = eventObj.shortTeaserVideo.map((video) =>
            formatResponseUrl(video)
          );
        }

        if (new Date(event.endDate) >= now) {
          nextEvents.push(eventObj);
        } else {
          pastEvents.push(eventObj);
        }
      });

      // Separate courses into next and past (based on schedules)
      const nextCourses = [];
      const pastCourses = [];

      courses.forEach((course) => {
        const courseObj = { ...course };

        // Format poster images
        if (Array.isArray(courseObj.posterImage)) {
          courseObj.posterImage = courseObj.posterImage.map((img) =>
            formatResponseUrl(img)
          );
        }

        // Check if course has any future schedules
        const hasFutureSchedule =
          course.schedules &&
          course.schedules.some(
            (schedule) => new Date(schedule.endDate) >= now
          );

        if (
          hasFutureSchedule ||
          !course.schedules ||
          course.schedules.length === 0
        ) {
          // If no schedules or has future schedules, consider it next
          nextCourses.push(courseObj);
        } else {
          // All schedules are past
          pastCourses.push(courseObj);
        }
      });

      profileData.events = {
        next: nextEvents,
        past: pastEvents,
      };

      profileData.courses = {
        next: nextCourses,
        past: pastCourses,
      };
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "User profile fetched successfully",
      {
        profile: profileData,
      }
    );
  } catch (error) {
    console.error("Error in getUserProfileById:", error);
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

router.post(
  "/update-profile",
  perApiLimiter(),
  validateRequest(updateUserSchema),
  updateUserProfile
);

// Get User Profile By ID
router.get("/profile/:userId", perApiLimiter(), getUserProfileById);

module.exports = router;
