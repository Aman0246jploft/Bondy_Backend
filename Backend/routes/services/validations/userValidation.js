const Joi = require("joi");

const customerSignupSchema = Joi.object({
    email: Joi.string().email().required(),
    countryCode: Joi.string().required(),
    contactNumber: Joi.string().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().strict()
});

const organizerSignupSchema = Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    countryCode: Joi.string().required(),
    contactNumber: Joi.string().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().strict(),
    businessType: Joi.string().required(),
    acceptTerms: Joi.boolean().valid(true).required(),
    documents: Joi.array().items(
        Joi.object({
            file: Joi.string().required(),
            // status will be set to pending by default in backend
        })
    ).optional()
});

const loginInitSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const otpVerificationSchema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(5).required()
});

const resendOtpSchema = Joi.object({
    email: Joi.string().email().required()
});

module.exports = {
    customerSignupSchema,
    organizerSignupSchema,
    otpVerificationSchema,
    resendOtpSchema,
    loginInitSchema
};
