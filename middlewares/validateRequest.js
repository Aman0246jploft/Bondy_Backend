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
  const data = req.body || {}; // 👈 ensures it's at least an object
  const { error } = schema.validate(data, { abortEarly: true });

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
