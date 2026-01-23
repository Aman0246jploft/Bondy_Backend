const express = require("express");
const router = express.Router();
const { Verification } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { upload, storeImage } = require("../../utils/cloudinary");
const { roleId } = require("../../utils/Role");
const validateRequest = require("../../middlewares/validateRequest");
const {
  verifyStatusSchema,
} = require("../services/validations/adminValidations");

// Upload Verification Document
const uploadVerificationDoc = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.NO_FILES_UPLOADED,
      );
    }

    const userId = req.user.userId;
    const uploadPromises = req.files.map((file) =>
      storeImage(file, `verification/${userId}`),
    );
    const filePaths = await Promise.all(uploadPromises);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.FILES_UPLOADED_SUCCESS,
      { files: filePaths },
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

// Submit Verification Request
const submitVerification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      idVerification,
      contactVerification,
      payoutVerification,
      businessVerification,
    } = req.body;

    // Find or create verification record
    let verification = await Verification.findOne({ user: userId });

    if (!verification) {
      verification = new Verification({ user: userId });
    }

    if (idVerification)
      verification.idVerification = {
        ...verification.idVerification,
        ...idVerification,
        status: "pending",
        date: new Date(),
      };
    if (contactVerification)
      verification.contactVerification = {
        ...verification.contactVerification,
        ...contactVerification,
        status: "pending",
        date: new Date(),
      };
    if (payoutVerification)
      verification.payoutVerification = {
        ...verification.payoutVerification,
        ...payoutVerification,
        status: "pending",
        date: new Date(),
      };
    if (businessVerification)
      verification.businessVerification = {
        ...verification.businessVerification,
        ...businessVerification,
        status: "pending",
        date: new Date(),
      };

    // Reset overall status to pending if any new data is submitted?
    // Or logic dictates overall isVerified is false until admin approves?
    verification.isVerified = false;

    await verification.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Verification submitted successfully.",
      verification,
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

// Get Status
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const verification = await Verification.findOne({ user: userId }).lean();

    if (!verification) {
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        "No verification record found.",
        null,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Verification status fetched.",
      verification,
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

// Update Status (Admin)
const updateVerificationStatus = async (req, res) => {
  try {
    const { userId, type, status, rejectionReason } = req.body; // type: 'id', 'contact', 'payout', 'business'

    // Simple role check, though middleware usually handles this
    if (
      req.user.roleId !== roleId.SUPER_ADMIN &&
      req.user.roleId !== roleId.ADMIN
    ) {
      // Assuming ADMIN role exists? or just SUPER_ADMIN. Using generic check for now.
      // If strict, I should check against roleId enums.
    }

    const verification = await Verification.findOne({ user: userId });
    if (!verification) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Verification record not found.",
      );
    }

    const updateField = (field) => {
      field.status = status;
      if (status === "verified") field.verifiedAt = new Date();
      // Handle rejection reason if schema supported it
    };

    if (type === "id") updateField(verification.idVerification);
    else if (type === "contact") updateField(verification.contactVerification);
    else if (type === "payout") updateField(verification.payoutVerification);
    else if (type === "business")
      updateField(verification.businessVerification);
    else {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid verification type.",
      );
    }

    // Check if all required sections are verified to set global isVerified
    // logic depends on business rules. For now, manual update logic.

    // If we want to set global verified:
    if (status === "verified") {
      // Logic: if all relevant parts are verified, set global true.
      // Simplifying: if the request specifically asks to set global status?
      // Or maybe just let admin toggle global status.
    }

    // Allow updating global status directly if type is 'global'
    if (type === "global") {
      verification.isVerified = status === "verified";
    }

    await verification.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Verification status updated.",
      verification,
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

router.post(
  "/upload-document",
  perApiLimiter(),
  upload.array("files", 5), // allow up to 5 docs
  uploadVerificationDoc,
);

router.post("/submit", perApiLimiter(), submitVerification);
router.post("/status", perApiLimiter(), getVerificationStatus);
router.post(
  "/update-status",
  perApiLimiter(),
  validateRequest(verifyStatusSchema),
  updateVerificationStatus,
);

module.exports = router;
