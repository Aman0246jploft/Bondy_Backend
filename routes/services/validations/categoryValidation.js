const Joi = require("joi");

const createCategorySchema = Joi.object({
    name: Joi.string().trim().required(),
    image: Joi.string().optional().allow(null, "")
});

const updateCategorySchema = Joi.object({
    name: Joi.string().trim().optional(),
    image: Joi.string().optional().allow(null, ""),
    isDisable: Joi.boolean().optional()
}).min(1); // At least one field must be provided

const categoryListSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
    search: Joi.string().optional().allow("")
});

module.exports = {
    createCategorySchema,
    updateCategorySchema,
    categoryListSchema
};
