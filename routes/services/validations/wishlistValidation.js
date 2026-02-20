const Joi = require("joi");

const addToWishlistSchema = Joi.object({
    entityId: Joi.string().required(),
    entityModel: Joi.string().valid("Event", "Course").required(),
});

const removeFromWishlistSchema = Joi.object({
    entityId: Joi.string().required(),
});

module.exports = {
    addToWishlistSchema,
    removeFromWishlistSchema,
};
