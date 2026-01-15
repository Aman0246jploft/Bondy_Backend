const Joi = require("joi");

const initiateBookingSchema = Joi.object({
    eventId: Joi.string().required().messages({
        "string.empty": "Event ID is required",
        "any.required": "Event ID is required",
    }),
    qty: Joi.number().integer().min(1).required().messages({
        "number.base": "Quantity must be a number",
        "number.min": "Quantity must be at least 1",
        "any.required": "Quantity is required",
    }),
    discountCode: Joi.string().allow(null, "").optional(),
});

const confirmPaymentSchema = Joi.object({
    transactionId: Joi.string().required().messages({
        "string.empty": "Transaction ID is required",
        "any.required": "Transaction ID is required",
    }),
});

module.exports = {
    initiateBookingSchema,
    confirmPaymentSchema,
};
