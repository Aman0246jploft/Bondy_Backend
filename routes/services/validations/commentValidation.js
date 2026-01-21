const Joi = require("joi");

const createCommentSchema = Joi.object({
    content: Joi.string().required(),
    eventId: Joi.string().required(), // Assuming ObjectId string
    parentCommentId: Joi.string().allow(null, ""), // Optional for replies
});

const updateCommentSchema = Joi.object({
    content: Joi.string().required(),
});

const getCommentsSchema = Joi.object({
    eventId: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
});

const toggleLikeSchema = Joi.object({
    commentId: Joi.string().required(),
});

module.exports = {
    createCommentSchema,
    updateCommentSchema,
    getCommentsSchema,
    toggleLikeSchema,
};
