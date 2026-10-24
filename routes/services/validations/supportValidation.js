const Joi = require("joi");

const createTicketSchema = Joi.object({
    category: Joi.string().required().trim(),
    subject: Joi.string().required().trim().min(5).max(100),
    description: Joi.string().required().min(10).max(1000),
    referenceNumber: Joi.string().trim().max(50).optional().allow(""),
    images: Joi.array().items(Joi.string().uri()).optional()
});

const updateTicketStatusSchema = Joi.object({
    status: Joi.string()
        .valid("Pending", "Open", "Resolved", "Cancelled", "Reopen", "closed")
        .required(),
    adminComment: Joi.string().optional().allow(""),
});

const userUpdateTicketStatusSchema = Joi.object({
    status: Joi.string()
        .valid("Reopen", "closed")
        .required(),
});

const getTicketsSchema = Joi.object({
    status: Joi.string()
        .valid("Pending", "Open", "Resolved", "Cancelled", "Reopen", "closed")
        .optional(),
    category: Joi.string().optional(),
    ticketId: Joi.string().optional(),
    referenceNumber: Joi.string().optional(),
    search: Joi.string().optional(),
    userId: Joi.string().hex().length(24).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref("startDate")).optional().messages({
        "date.min": "The end date must be later than the start date.",
    }),
});

module.exports = {
    createTicketSchema,
    updateTicketStatusSchema,
    userUpdateTicketStatusSchema,
    getTicketsSchema,
};
