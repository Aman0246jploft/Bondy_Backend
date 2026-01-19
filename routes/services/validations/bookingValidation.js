const Joi = require("joi");

const initiateBookingSchema = Joi.object({
  eventId: Joi.string().optional().messages({
    "string.empty": "Event ID is required",
  }),
  courseId: Joi.string().optional().messages({
    "string.empty": "Course ID is required",
  }),
  scheduleId: Joi.string().when("courseId", {
    is: Joi.exist(),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }).messages({
    "any.required": "Schedule ID is required for course booking",
  }),
  qty: Joi.number().integer().min(1).required().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be at least 1",
    "any.required": "Quantity is required",
  }),
  discountCode: Joi.string().allow(null, "").optional(),
}).or("eventId", "courseId");

const confirmPaymentSchema = Joi.object({
  transactionId: Joi.string().required().messages({
    "string.empty": "Transaction ID is required",
    "any.required": "Transaction ID is required",
  }),
});

const scanQRCodeSchema = Joi.object({
  qrCodeData: Joi.string().required().messages({
    "string.empty": "QR code data is required",
    "any.required": "QR code data is required",
  }),
});

module.exports = {
  initiateBookingSchema,
  confirmPaymentSchema,
  scanQRCodeSchema,
};
