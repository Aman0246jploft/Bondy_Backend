const Joi = require("joi");

// Tax Schemas
const createTaxSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().valid("percentage", "fixed").required(),
  value: Joi.number().required(),
  active: Joi.boolean().default(true),
  description: Joi.string().optional().allow(""),
});

const updateTaxSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().optional(),
  type: Joi.string().valid("percentage", "fixed").optional(),
  value: Joi.number().optional(),
  active: Joi.boolean().optional(),
  description: Joi.string().optional().allow(""),
});

// PromoCode Schemas
const createPromoCodeSchema = Joi.object({
  code: Joi.string().uppercase().required(),
  description: Joi.string().optional().allow(""),
  discountType: Joi.string().valid("percentage", "fixed").required(),
  discountValue: Joi.number().required(),
  maxUsage: Joi.number().default(0),
  validFrom: Joi.date().required(),
  validUntil: Joi.date().required(),
  active: Joi.boolean().default(true),
});
const updatePromoCodeSchema = Joi.object({
  id: Joi.string().required(),
  code: Joi.string().uppercase().optional(),
  description: Joi.string().optional().allow(""),
  discountType: Joi.string().valid("percentage", "fixed").optional(),
  discountValue: Joi.number().optional(),
  maxUsage: Joi.number().optional(),
  validFrom: Joi.date().optional(),
  validUntil: Joi.date().optional(),
  active: Joi.boolean().optional(),
});

// Follow Schema
const followUserSchema = Joi.object({
  toUser: Joi.string().required(),
});

// Block Schema
const blockUserSchema = Joi.object({
  toUser: Joi.string().required(),
});

// Report Schema
const reportUserSchema = Joi.object({
  toUser: Joi.string().required(),
  reason: Joi.string().required(),
  description: Joi.string().optional().allow(""),
});

// Verification Status Update Schema (Admin)
const verifyStatusSchema = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string()
    .valid("id", "contact", "payout", "business", "global")
    .required(),
  status: Joi.string().valid("pending", "verified", "rejected").required(),
  rejectionReason: Joi.string().optional().allow(""),
});

const getByIdSchema = Joi.object({
  id: Joi.string().required(),
});

module.exports = {
  createTaxSchema,
  updateTaxSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  followUserSchema,
  blockUserSchema,
  reportUserSchema,
  verifyStatusSchema,
  getByIdSchema,
};
