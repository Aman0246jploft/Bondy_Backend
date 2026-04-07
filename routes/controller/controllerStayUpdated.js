const express = require("express");
const router = express.Router();
const { StayUpdated } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

// 1. Signup for Updates (Public)
const signupForUpdates = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Email is required");
    }

    const lowerCaseEmail = email.toLowerCase().trim();

    // Check if already exists
    const existing = await StayUpdated.findOne({ email: lowerCaseEmail });
    if (existing) {
      return apiSuccessRes(HTTP_STATUS.OK, res, "Your email is already on our updates list!");
    }

    const newSignup = new StayUpdated({ email: lowerCaseEmail });
    await newSignup.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Successfully added to our updates list!");
  } catch (error) {
    console.error("Error in signupForUpdates:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2. Get Updates Signup List (Admin)
const getSignups = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const total = await StayUpdated.countDocuments();
    const signups = await StayUpdated.find()
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Update signups fetched", {
      signups,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Error in getSignups:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 3. Delete Signup (Admin)
const deleteSignup = async (req, res) => {
  try {
    const { id } = req.params;
    const signup = await StayUpdated.findByIdAndDelete(id);
    if (!signup) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Signup not found");
    }
    return apiSuccessRes(HTTP_STATUS.OK, res, "Signup removed");
  } catch (error) {
    console.error("Error in deleteSignup:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// --- Routes ---
router.post("/signup", signupForUpdates);
router.get("/list", checkRole([roleId.SUPER_ADMIN]), getSignups);
router.delete("/delete/:id", checkRole([roleId.SUPER_ADMIN]), deleteSignup);

module.exports = router;
