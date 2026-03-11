const Joi = require("joi");

const checkoutPromotionSchema = Joi.object({
  eventId: Joi.string().required(),
  packageId: Joi.string().required(),
});

module.exports = {
  checkoutPromotionSchema,
};
