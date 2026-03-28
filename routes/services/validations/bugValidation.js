const Joi = require("joi");

const reportBugSchema = Joi.object({
  title: Joi.string().required().trim().min(3).max(100),
  description: Joi.string().allow("").trim().max(1000),
  image: Joi.string().allow("").trim().optional(),
});

const getBugsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).default(10),
});

module.exports = {
  reportBugSchema,
  getBugsSchema,
};
