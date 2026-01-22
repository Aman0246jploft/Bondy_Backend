const Joi = require("joi");

const createTicketSchema = Joi.object({
    category: Joi.string().required().trim(),
    subject: Joi.string().required().trim().min(3).max(100),
    description: Joi.string().required().min(10),
    images: Joi.array().items(Joi.string().uri()).optional()
});

const updateTicketStatusSchema = Joi.object({
    status: Joi.string()
        .valid("Pending", "Open", "Resolved", "Cancelled", "Reopen")
        .required(),
    adminComment: Joi.string().optional().allow(""),
});

const getTicketsSchema = Joi.object({
    status: Joi.string()
        .valid("Pending", "Open", "Resolved", "Cancelled", "Reopen")
        .optional(),
    category: Joi.string().optional(),
    ticketId: Joi.string().optional(),
    search: Joi.string().optional(),
    userId: Joi.string().hex().length(24).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
});

module.exports = {
    createTicketSchema,
    updateTicketStatusSchema,
    getTicketsSchema,
};
