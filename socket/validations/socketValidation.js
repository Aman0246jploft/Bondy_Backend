const Joi = require("joi");

const sendMessageSchema = Joi.object({
    chatId: Joi.string().optional(),
    receiverId: Joi.string().optional(),
    content: Joi.string().allow(""),
    fileUrl: Joi.string().allow(null, ""),
    fileType: Joi.string().valid("image", "video", "document", "audio").allow(null),
})
    .or("content", "fileUrl") // Content or File required
    .or("chatId", "receiverId"); // ChatId or ReceiverId required

const joinChatSchema = Joi.object({
    chatId: Joi.string().required(),
});

const chatListSchema = Joi.object({
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).optional(),
});

const messageListSchema = Joi.object({
    chatId: Joi.string().required(),
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).optional(),
});

const deleteMessageSchema = Joi.object({
    messageId: Joi.string().required(),
    deleteType: Joi.string().valid("me", "everyone").required(),
});

const createChatSchema = Joi.object({
    receiverId: Joi.string().required(),
});

module.exports = {
    sendMessageSchema,
    joinChatSchema,
    chatListSchema,
    messageListSchema,
    deleteMessageSchema,
    createChatSchema,
};
