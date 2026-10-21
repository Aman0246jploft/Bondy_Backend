const globalFunction = require("./globalFunction");
const CONSTANT = require("./constants");
const HTTP_STATUS = require("./statusCode");
const apiErrorRes = globalFunction.apiErrorRes;

function errorHandler(err, req, res, next) {
  console.log("errerr  ", err);
  if (err && (err.code === "LIMIT_FILE_SIZE" || err.message?.includes("File too large"))) {
    return apiErrorRes(
      HTTP_STATUS.BAD_REQUEST,
      res,
      "File size exceeds limit. Maximum allowed size is 50MB."
    );
  }
  if (typeof err === "string") {
    return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Error");
  }
  if (err.name === "UnauthorizedError") {
    return apiErrorRes(
      HTTP_STATUS.UNAUTHORIZED,
      res,
      "Send valid token!!!",
      CONSTANT.DATA_NULL,
      CONSTANT.INVALID_TOKEN
    );
  }
  return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, err.message);
}

module.exports = errorHandler;
