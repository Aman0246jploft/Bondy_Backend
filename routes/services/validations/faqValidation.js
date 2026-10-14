const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const faqPayload = {
  categoryId: objectId.required(),
  question: Joi.string().trim().min(1).required(),
  question_mn: Joi.string().trim().allow("").optional(),
  answer: Joi.string().trim().min(1).required(),
  answer_mn: Joi.string().trim().allow("").optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
};

const createFAQ = Joi.object(faqPayload);
const updateFAQ = Joi.object(faqPayload);

const topicPayload = {
  name: Joi.string().trim().min(1).max(120).required(),
  name_mn: Joi.string().trim().min(1).max(120).required(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
};

const createTopic = Joi.object(topicPayload);
const updateTopic = Joi.object(topicPayload);

module.exports = {
  createFAQ,
  updateFAQ,
  createTopic,
  updateTopic,
};
