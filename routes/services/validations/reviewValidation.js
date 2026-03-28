const Joi = require("joi");

const addReviewSchema = Joi.object({
    entityId: Joi.string().required().hex().length(24),
    entityModel: Joi.string().valid("Event", "Course").required(),
    review: Joi.string().required().trim().min(3),
    rating: Joi.number().integer().min(1).max(5).required(),
});

const updateReviewSchema = Joi.object({
    review: Joi.string().trim().min(3),
    rating: Joi.number().integer().min(1).max(5),
});

const getReviewsSchema = Joi.object({
    entityId: Joi.string().required().hex().length(24),
    entityModel: Joi.string().valid("Event", "Course").required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
});

const getOrganizerReviewsSchema = Joi.object({
    organizerId: Joi.string().required().hex().length(24),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
});

module.exports = {
    addReviewSchema,
    updateReviewSchema,
    getReviewsSchema,
    getOrganizerReviewsSchema,
};
