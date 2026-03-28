const express = require("express");
const router = express.Router();
const { Bug, User } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes, formatResponseUrl } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const validateRequest = require("../../middlewares/validateRequest");
const { roleId } = require("../../utils/Role");
const upload = require("../../middlewares/upload");
const { reportBugSchema, getBugsSchema } = require("../services/validations/bugValidation");
// jwtVerification is already applied globally in index.js

// Report Bug
const reportBug = async (req, res) => {
  try {
    const { title, description, image } = req.body;
    const userId = req.user.userId;

    if (!title) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Title is required");
    }

    const newBug = new Bug({
      userId,
      title,
      description,
      image,
    });

    await newBug.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Bug reported successfully", newBug);
  } catch (error) {
    console.error("Error reporting bug:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// List Bugs (Admin only)
const getBugs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const bugs = await Bug.find()
      .populate("userId", "firstName lastName email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const formattedBugs = bugs.map((bug) => ({
      ...bug,
      image: formatResponseUrl(bug.image),
      userId: bug.userId ? {
        ...bug.userId,
        profileImage: formatResponseUrl(bug.userId.profileImage)
      } : null
    }));

    const total = await Bug.countDocuments();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Bugs fetched successfully", {
      bugs: formattedBugs,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error fetching bugs:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post(
  "/report",
  validateRequest(reportBugSchema),
  reportBug
);

router.get(
  "/list",
  // checkRole([roleId.SUPER_ADMIN]),
  validateRequest(getBugsSchema),
  getBugs
);

module.exports = router;
