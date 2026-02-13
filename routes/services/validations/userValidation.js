const Joi = require("joi");

const customerSignupSchema = Joi.object({
  email: Joi.string().email().required(),
  countryCode: Joi.string().required(),
  contactNumber: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().strict(),
});

const organizerSignupSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  countryCode: Joi.string().required(),
  contactNumber: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().strict(),
  businessType: Joi.string().required(),
  acceptTerms: Joi.boolean().valid(true).required(),
  documents: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().optional(),
        file: Joi.string().required(),
        // status will be set to pending by default in backend
      })
    )
    .optional(),
});

const loginInitSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  type: Joi.string().valid("ORGANIZER", "CUSTOMER", "GUEST").required(),
});

const otpVerificationSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(5).required(),
  type: Joi.string().optional(),
});

const universalOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(5).required(),
  type: Joi.string()
    .valid("LOGIN", "CUSTOMER", "ORGANIZER")
    .required(),
});

const universalResendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  type: Joi.string()
    .valid("LOGIN", "CUSTOMER", "ORGANIZER")
    .required(),
});

const resendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().optional(),
  lastName: Joi.string().trim().optional(),
  profileImage: Joi.string().optional(),
  gender: Joi.string().optional(),
  email: Joi.string().email().optional(),
  countryCode: Joi.string().optional().allow(null, ""),
  contactNumber: Joi.string().optional().allow(null, ""),
  dob: Joi.date().optional(),
  bio: Joi.string().optional(),
  categories: Joi.array().items(Joi.string()).optional(),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
    city: Joi.string().optional().allow(null, ""),
    country: Joi.string().optional().allow(null, ""),
    address: Joi.string().trim().optional().allow(null, ""),
    state: Joi.string().optional().allow(null, ""),
    zipcode: Joi.string().optional().allow(null, ""),
  }).optional(),
});

const socialLoginSchema = Joi.object({
  socialId: Joi.string().required(),
  socialType: Joi.string().required(),
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
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().strict(),
  resetToken: Joi.string().optional(), // In case it's passed in body, though headers is better
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
};
