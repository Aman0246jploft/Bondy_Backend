const router = require("express").Router();
const { Report, User } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const perApiLimiter = require("../../middlewares/rateLimiter");
const validateRequest = require("../../middlewares/validateRequest");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const {
  reportUserSchema,
  resolveReportSchema,
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

    const existingReport = await Report.findOne({ fromUser, toUser, status: "pending" });
    if (existingReport) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "You have already reported this user. Please wait for admin review.",
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
    );
  }
};

// List Reports (Admin)
const listReports = async (req, res) => {
  try {
    const { pageNo = 1, size = 10, status, search } = req.query;
    const pageNoInt = parseInt(pageNo);
    const sizeInt = parseInt(size);
    const skip = (pageNoInt - 1) * sizeInt;

    const query = {};
    if (status) {
      query.status = status;
    }

    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999); // Inclusion of whole end day
        query.createdAt.$lte = end;
      }
    }

    // Search logic: can search in reason or description
    // For searching user names, we'd need to populate or use aggregation
    if (search) {
      query.$or = [
        { reason: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Report.countDocuments(query);
    const reports = await Report.find(query)
      .populate("fromUser", "firstName lastName email")
      .populate("toUser", "firstName lastName email isDisable")
      .populate("resolvedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(sizeInt)
      .lean();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Reports fetched successfully.", {
      reports,
      total,
      pageNo: pageNoInt,
      size: sizeInt,
      totalPages: Math.ceil(total / sizeInt),
    });
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
    );
  }
};

// Resolve Report (Admin)
const resolveReport = async (req, res) => {
  try {
    const { id, status, adminComment, banUser } = req.body;
    const adminId = req.user.userId;

    const report = await Report.findById(id);
    if (!report) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Report not found.");
    }

    if (report.status !== "pending") {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Report is already ${report.status}.`,
      );
    }

    report.status = status;
    report.adminComment = adminComment || null;
    report.resolvedAt = new Date();
    report.resolvedBy = adminId;

    await report.save();

    // If banUser is true, disable the reported user (toUser)
    if (banUser && status === "resolved") {
      await User.findByIdAndUpdate(report.toUser, { isDisable: true });
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      `Report ${status} successfully.`,
      report,
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
    );
  }
};

// Delete Report (Admin)
const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReport = await Report.findByIdAndDelete(id);

    if (!deletedReport) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Report not found.");
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Report deleted successfully.");
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
    );
  }
};

// Routes
router.post(
  "/create",
  perApiLimiter(),
  validateRequest(reportUserSchema),
  createReport,
);

router.get(
  "/list",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  listReports
);

router.post(
  "/resolve",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(resolveReportSchema),
  resolveReport,
);

router.delete(
  "/delete/:id",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  deleteReport
);

module.exports = router;
