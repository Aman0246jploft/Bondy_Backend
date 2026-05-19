const Joi = require("joi");

const createRefundPolicySchema = Joi.object({
  name: Joi.string().required().trim().messages({
    "any.required": "Policy name is required",
    "string.empty": "Policy name cannot be empty",
  }),
  description: Joi.string().required().trim().messages({
    "any.required": "Policy description is required",
    "string.empty": "Policy description cannot be empty",
  }),
  refundPercentage: Joi.number().min(0).max(100).default(100).messages({
    "number.min": "Refund percentage must be at least 0",
    "number.max": "Refund percentage cannot exceed 100",
  }),
  daysBefore: Joi.number().integer().min(0).default(0).messages({
    "number.min": "Days before must be at least 0",
  }),
  type: Joi.string().valid("event", "course", "both").default("both").lowercase().optional(),
  isGlobal: Joi.boolean().optional(),
});

const updateRefundPolicySchema = Joi.object({
  name: Joi.string().optional().trim(),
  description: Joi.string().optional().trim(),
  refundPercentage: Joi.number().min(0).max(100),
  daysBefore: Joi.number().integer().min(0),
  type: Joi.string().valid("event", "course", "both").lowercase().optional(),
  isGlobal: Joi.boolean().optional(),
  isDisable: Joi.boolean().optional(),
}).min(1);

module.exports = {
  createRefundPolicySchema,
  updateRefundPolicySchema,
};
