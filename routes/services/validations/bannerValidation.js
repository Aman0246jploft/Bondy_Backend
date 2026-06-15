const Joi = require("joi");

const createBannerSchema = Joi.object({
  image: Joi.string().trim().required(),
  linkUrl: Joi.string().trim().uri().allow("", null).optional(),
  isActive: Joi.boolean().optional(),
});

const updateBannerSchema = Joi.object({
  image: Joi.string().trim().optional(),
  linkUrl: Joi.string().trim().uri().allow("", null).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

const bannerListSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).optional(),
});

module.exports = {
  createBannerSchema,
  updateBannerSchema,
  bannerListSchema,
};
