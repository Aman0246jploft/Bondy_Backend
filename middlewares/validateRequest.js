const { apiErrorRes } = require("../utils/globalFunction");
const HTTP_STATUS = require("../utils/statusCode");


const validateRequest = (schema) => (req, res, next) => {
  // const { error } = schema.validate(req.body, { abortEarly: true });
  // if (error) {
  //   // Remove quotes from field names in error message
  //   const message = error.details[0].message.replace(/"/g, '');
  //   return apiErrorRes(
  //     HTTP_STATUS.BAD_REQUEST,
  //     res,
  //     message
  //   );
  // }
  // next();
  const data = req.method === "GET" ? req.query : (req.body || {});

  // Bypass validation if saving/updating as draft
  if (req.method !== "GET" && (data.isDraft === true || data.isDraft === "true")) {
    return next();
  }

  const { error } = schema.validate(data, { abortEarly: true, allowUnknown: true });

  if (error) {
    const message = error.details[0].message.replace(/"/g, '');
    return apiErrorRes(
      HTTP_STATUS.BAD_REQUEST,
      res,
      message
    );
  }

  next();
};

module.exports = validateRequest;
