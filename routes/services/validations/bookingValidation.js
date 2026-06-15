const Joi = require("joi");

const initiateBookingSchema = Joi.object({
  eventId: Joi.string().optional().messages({
    "string.empty": "Event ID is required",
  }),
  courseId: Joi.string().optional().messages({
    "string.empty": "Course ID is required",
  }),
  // For Event bookings: the specific ticket type sub-doc _id (single or multiple)
  ticketId: Joi.string().optional(),
  qty: Joi.number().integer().min(1).optional().messages({
    "number.base": "Quantity must be a number",
    "number.min": "Quantity must be at least 1",
  }),
  tickets: Joi.array().items(Joi.object({
    ticketId: Joi.string().required().messages({
      "any.required": "Ticket ID is required for each ticket selection",
    }),
    qty: Joi.number().integer().min(1).required().messages({
      "number.min": "Quantity must be at least 1",
      "any.required": "Quantity is required for each ticket selection",
    }),
  })).optional(),
  // For Course bookings: the specific batch sub-doc _id
  batchId: Joi.string().when("courseId", {
    is: Joi.exist(),
    then: Joi.when("ongoingSlots", {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.when("passType", {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.required(),
      }),
    }),
    otherwise: Joi.optional(),
  }).messages({
    "any.required": "Batch ID is required for course booking",
  }),
  selectedDay: Joi.string().allow(null, "").optional(),
  ongoingSlots: Joi.array().items(Joi.object({
    batchId: Joi.string().allow(null, "").optional(),
    selectedDay: Joi.string().allow(null, "").optional(),
  })).optional(),
  discountCode: Joi.string().allow(null, "").optional(),
  passType: Joi.string().valid("1_month", "3_month").allow(null, "").optional(),
  bookingType: Joi.string().valid("EVENT", "COURSE").optional(),
}).or("eventId", "courseId");

const confirmPaymentSchema = Joi.object({
  transactionId: Joi.string().required().messages({
    "string.empty": "Transaction ID is required",
    "any.required": "Transaction ID is required",
  }),
});

const cancelBookingSchema = Joi.object({
  transactionId: Joi.string().required().messages({
    "string.empty": "Transaction ID is required",
    "any.required": "Transaction ID is required",
  }),
  reason: Joi.string().allow(null, "").optional(),
});

const cancelEventSchema = Joi.object({
  eventId: Joi.string().required().messages({
    "string.empty": "Event ID is required",
    "any.required": "Event ID is required",
  }),
  reason: Joi.string().allow(null, "").optional(),
});

const cancelCourseSchema = Joi.object({
  courseId: Joi.string().required().messages({
    "string.empty": "Course ID is required",
    "any.required": "Course ID is required",
  }),
  batchId: Joi.string().allow(null, "").optional(),
  date: Joi.string().allow(null, "").optional(),
  reason: Joi.string().allow(null, "").optional(),
});

const scanQRCodeSchema = Joi.object({
  qrCodeData: Joi.string().required().messages({
    "string.empty": "QR code data is required",
    "any.required": "QR code data is required",
  }),
});

const adjustCourseReservedSeatsSchema = Joi.object({
  courseId: Joi.string().required().messages({
    "string.empty": "Course ID is required",
    "any.required": "Course ID is required",
  }),
  batchId: Joi.string().required().messages({
    "string.empty": "Batch ID is required",
    "any.required": "Batch ID is required",
  }),
  date: Joi.string().allow(null, "").optional(),
  ReservedExternally: Joi.number().integer().min(0).required().messages({
    "number.base": "Reserved seats must be a number",
    "number.min": "Reserved seats cannot be negative",
    "any.required": "Reserved seats is required",
  }),
});

module.exports = {
  initiateBookingSchema,
  confirmPaymentSchema,
  cancelBookingSchema,
  cancelEventSchema,
  cancelCourseSchema,
  scanQRCodeSchema,
  adjustCourseReservedSeatsSchema,
};
