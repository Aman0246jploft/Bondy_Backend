const Joi = require("joi");

// Validation schema for transaction filters
const getTransactionsSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid("PENDING", "PAID", "FAILED", "CANCELLED", "REFUND_INITIATED").optional(),
    bookingType: Joi.string().valid("EVENT", "COURSE").optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
});

// Validation schema for wallet history filters
const getWalletHistorySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    type: Joi.string()
        .valid("TICKET_SALE", "PAYOUT_REQUEST", "PAYOUT_REJECTED", "REFUND", "ADJUSTMENT")
        .optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
});

// Validation schema for payout filters
const getPayoutsSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid("PENDING", "PAID", "CANCELLED").optional(),
});

// Validation schema for organizer ID parameter
const organizerIdSchema = Joi.object({
    organizerId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
        "string.pattern.base": "Invalid organizer ID format",
    }),
});

module.exports = {
    getTransactionsSchema,
    getWalletHistorySchema,
    getPayoutsSchema,
    organizerIdSchema,
};
