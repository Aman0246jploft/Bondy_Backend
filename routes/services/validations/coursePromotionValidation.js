const Joi = require("joi");

const checkoutPromotionSchema = Joi.object({
  courseId: Joi.string().required(),
  packageId: Joi.string().required(),
});

module.exports = {
  checkoutPromotionSchema,
};
