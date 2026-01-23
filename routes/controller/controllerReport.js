const express = require("express");
const router = express.Router();
const { Report } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const perApiLimiter = require("../../middlewares/rateLimiter");
const validateRequest = require("../../middlewares/validateRequest");
const {
  reportUserSchema,
} = require("../services/validations/adminValidations");

// Create Report
const createReport = async (req, res) => {
  try {
    const fromUser = req.user.userId;
    const { toUser, reason, description } = req.body;

    if (fromUser === toUser) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "You cannot report yourself.",
      );
    }

    const existingReport = await Report.findOne({ fromUser, toUser });
    if (existingReport) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "You have already reported this user.",
      );
    }

    const newReport = new Report({
      fromUser,
      toUser,
      reason,
      description,
    });
    await newReport.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "User reported successfully.",
      newReport,
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

// List Reports (Admin)
const listReports = async (req, res) => {
  try {
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const total = await Report.countDocuments();
    const reports = await Report.find()
      .populate("fromUser", "firstName lastName email")
      .populate("toUser", "firstName lastName email")
      .skip(skip)
      .limit(size)
      .lean();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Reports fetched successfully.", {
      reports,
      total,
      pageNo,
      size,
    });
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

router.post(
  "/create",
  perApiLimiter(),
  validateRequest(reportUserSchema),
  createReport,
);
router.get("/list", perApiLimiter(), listReports);

module.exports = router;
