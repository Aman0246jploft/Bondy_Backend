const Joi = require("joi");

const getNotifications = Joi.object({
    pageNo: Joi.number().integer().min(1).optional(),
    size: Joi.number().integer().min(1).optional(),
    type: Joi.string().valid("EVENT", "COURSE", "CHAT", "FOLLOW", "USER", "SYSTEM").optional(),
    isRead: Joi.boolean().optional(),
});

const markAsRead = Joi.object({
    notificationId: Joi.string().required(),
});

module.exports = {
    getNotifications,
    markAsRead,
};
