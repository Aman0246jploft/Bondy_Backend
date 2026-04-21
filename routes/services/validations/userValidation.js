const Joi = require("joi");

const customerSignupSchema = Joi.object({
  email: Joi.string().email().required(),
  countryCode: Joi.string().required(),
  contactNumber: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().strict(),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const organizerSignupSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  countryCode: Joi.string().required(),
  contactNumber: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().strict(),
  businessType: Joi.string().optional(),
  acceptTerms: Joi.boolean().valid(true).required(),
  documents: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().optional(),
        file: Joi.string().required(),
      }),
    )
    .optional(),
  referralCode: Joi.string().optional().allow(null, ""),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const loginInitSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  type: Joi.string().valid("ORGANIZER", "CUSTOMER", "GUEST").required(),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const otpVerificationSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(5).required(),
  type: Joi.string().optional(),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const universalOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(5).required(),
  type: Joi.string().valid("LOGIN", "CUSTOMER", "ORGANIZER").required(),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const universalResendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  type: Joi.string()
    .valid("LOGIN", "CUSTOMER", "ORGANIZER", "FORGOT_PASSWORD")
    .required(),
});

const resendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().optional(),
  lastName: Joi.string().trim().optional(),
  profileImage: Joi.string().optional().allow(null, ""),
  gender: Joi.string().optional(),
  email: Joi.string().email().optional(),
  countryCode: Joi.string().optional().allow(null, ""),
  contactNumber: Joi.string().optional().allow(null, ""),
  dob: Joi.date().optional().allow(null, ""),
  bio: Joi.string().optional(),
  categories: Joi.array().items(Joi.string()).optional(),
  location: Joi.object({
    latitude: Joi.number().optional().allow(null, ""),
    longitude: Joi.number().optional().allow(null, ""),
    city: Joi.string().optional().allow(null, ""),
    country: Joi.string().optional().allow(null, ""),
    address: Joi.string().trim().optional().allow(null, ""),
    state: Joi.string().optional().allow(null, ""),
    zipcode: Joi.string().optional().allow(null, ""),
  }).optional().allow(null, ""),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const socialLoginSchema = Joi.object({
  socialId: Joi.string().required(),
  socialType: Joi.string().required(),
  type: Joi.string().valid("ORGANIZER", "CUSTOMER", "GUEST").required(),
  email: Joi.string().email().optional().allow(null, ""),
  firstName: Joi.string().optional().allow(null, ""),
  lastName: Joi.string().optional().allow(null, ""),
  profileImage: Joi.string().optional().allow(null, ""),
  fmcToken: Joi.string().optional().allow(null, ""),
});

const forgotPasswordInitSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref("newPassword"))
    .required()
    .strict(),
  resetToken: Joi.string().optional(), // In case it's passed in body, though headers is better
});

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref("newPassword"))
    .required()
    .strict(),
});

module.exports = {
  customerSignupSchema,
  organizerSignupSchema,
  otpVerificationSchema,
  resendOtpSchema,
  loginInitSchema,
  updateUserSchema,
  socialLoginSchema,
  universalOtpSchema,
  universalResendOtpSchema,
  forgotPasswordInitSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
