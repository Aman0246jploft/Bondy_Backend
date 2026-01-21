const Joi = require("joi");

const chatList = Joi.object({
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).optional(),
});

const messageList = Joi.object({
    chatId: Joi.string().required(),
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).optional(),
});

const deleteMessage = Joi.object({
    messageId: Joi.string().required(),
    deleteType: Joi.string().valid("me", "everyone").required(),
});

const uploadFile = Joi.object({}); // Primarily handled by multers, validation on file type/size in multer

module.exports = {
    chatList,
    messageList,
    deleteMessage,
    uploadFile,
};
