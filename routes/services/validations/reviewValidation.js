const Joi = require("joi");

const addReviewSchema = Joi.object({
    entityId: Joi.string().required().hex().length(24),
    entityModel: Joi.string().valid("Event", "Course").required(),
    review: Joi.string().required().trim().min(3),
});

const updateReviewSchema = Joi.object({
    review: Joi.string().required().trim().min(3),
});

const getReviewsSchema = Joi.object({
    entityId: Joi.string().required().hex().length(24),
    entityModel: Joi.string().valid("Event", "Course").required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
});

module.exports = {
    addReviewSchema,
    updateReviewSchema,
    getReviewsSchema,
};
