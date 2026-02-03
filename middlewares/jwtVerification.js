// middlewares/jwtVerification.js
const jwt = require("jsonwebtoken");
const { apiErrorRes } = require("../utils/globalFunction");
const HTTP_STATUS = require("../utils/statusCode");
const CONSTANTS = require("../utils/constants");

const publicRoutes = [
  "/api/v1/user/customer/signup",
  "/api/v1/user/customer/verify-otp",

  "/api/v1/user/organizer/signup",
  "/api/v1/user/organizer/verify-otp",

  "/api/v1/user/login/init",
  "/api/v1/user/login/verify",

  "/api/v1/user/admin/login",

  "/api/v1/user/upload",
  "/api/v1/event/list",
  "/api/v1/faq/list",
  "/api/v1/globalsetting/all",
  "/api/v1/globalsetting/",
  "/api/v1/user/social-login",

  "/api/v1/category/list",
  "/api/v1/event/details/",
  
  
];

function jwtVerification() {
  return (req, res, next) => {
    const isPublic = publicRoutes.some((route) => req.path.startsWith(route));
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
          // If route is public, ignore error and continue as guest
          if (isPublic) {
            return next();
          }
          return apiErrorRes(
            HTTP_STATUS.FORBIDDEN,
            res,
            "Invalid or expired token",
            null,
            CONSTANTS.ERROR_CODE_ONE,
            CONSTANTS.ERROR_TRUE,
          );
        }
        req.user = decoded;
        next();
      });
    } else {
      // No token provided
      if (isPublic) {
        return next(); // Allow public access (guest)
      }
      return apiErrorRes(
        HTTP_STATUS.UNAUTHORIZED,
        res,
        "Authorization token missing",
        null,
        CONSTANTS.ERROR_CODE_ONE,
        CONSTANTS.ERROR_TRUE,
      );
    }
  };
}

module.exports = jwtVerification;
