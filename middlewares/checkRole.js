const { apiErrorRes } = require("../utils/globalFunction");
const HTTP_STATUS = require("../utils/statusCode");

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user || !req.user.roleId) {
                return apiErrorRes(HTTP_STATUS.UNAUTHORIZED, res, "Unauthorized access.");
            }

            if (!allowedRoles.includes(req.user.roleId)) {
                return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, "Access denied. Insufficient permissions.");
            }

            next();
        } catch (error) {
            console.error("Error in checkRole middleware:", error);
            return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, "Internal Server Error");
        }
    };
};

module.exports = checkRole;
