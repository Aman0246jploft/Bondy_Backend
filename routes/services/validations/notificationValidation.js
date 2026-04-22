const Joi = require("joi");

const getNotifications = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    type: Joi.string().valid("EVENT", "COURSE", "CHAT", "FOLLOW", "USER", "SYSTEM", "REVIEW", "PAYOUT").optional(),
    isRead: Joi.boolean().optional(),
});

const markAsRead = Joi.object({
    notificationId: Joi.string().required(),
});

const deleteMultiple = Joi.object({
    notificationIds: Joi.array().items(Joi.string()).min(1).required(),
});

module.exports = {
    getNotifications,
    markAsRead,
    deleteMultiple,
};
