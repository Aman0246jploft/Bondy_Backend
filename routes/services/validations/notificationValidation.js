const Joi = require("joi");

const getNotifications = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    type: Joi.string().valid("EVENT", "COURSE", "CHAT", "FOLLOW", "USER", "SYSTEM", "REVIEW", "PAYOUT").optional(),
    isRead: Joi.boolean().optional(),
    category: Joi.string().valid("bookings", "payments", "eventupdates", "event_updates").allow("", null).optional(),
});

const markAsRead = Joi.object({
    notificationId: Joi.string().required(),
});

const deleteMultiple = Joi.object({
    notificationIds: Joi.array().items(Joi.string()).min(1).required(),
});

const sendCustomNotification = Joi.object({
    target: Joi.string().valid("everyone", "users", "organizers").required(),
    title: Joi.string().trim().min(1).max(200).required(),
    message: Joi.string().trim().min(1).max(2000).required(),
    deepLink: Joi.string().allow("", null).optional(),
    webLink: Joi.string().allow("", null).optional(),
});

module.exports = {
    getNotifications,
    markAsRead,
    deleteMultiple,
    sendCustomNotification,
};
