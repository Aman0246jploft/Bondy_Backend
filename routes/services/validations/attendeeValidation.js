const Joi = require("joi");

const createAttendeesSchema = Joi.object({
    transactionId: Joi.string().required(),
    attendees: Joi.array()
        .items(
            Joi.object({
                firstName: Joi.string().trim().required(),
                lastName: Joi.string().trim().required(),
                email: Joi.string().email().required(),
                contactNumber: Joi.string().trim().optional(),
            }),
        )
        .min(1)
        .required(),
});

const checkInSchema = Joi.object({
    ticketNumber: Joi.string().required(),
});

const scanQRSchema = Joi.object({
    qrCodeData: Joi.string().required(),
    eventId: Joi.string().optional(),
    courseId: Joi.string().optional(),
});

module.exports = {
    createAttendeesSchema,
    checkInSchema,
    scanQRSchema,
};
