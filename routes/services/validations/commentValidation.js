const Joi = require("joi");

const createCommentSchema = Joi.object({
    content: Joi.string().required(),
    entityId: Joi.string().required().hex().length(24),
    entityModel: Joi.string().valid("Event", "Course").required(),
    parentCommentId: Joi.string().allow(null, "").hex().length(24), // Optional for replies
});

const updateCommentSchema = Joi.object({
    content: Joi.string().required(),
});

const getCommentsSchema = Joi.object({
    entityId: Joi.string().required().hex().length(24),
    entityModel: Joi.string().valid("Event", "Course").required(),
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
