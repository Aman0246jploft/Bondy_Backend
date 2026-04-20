const express = require("express");
const router = express.Router();
const { PromotionPackage } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const validateRequest = require("../../middlewares/validateRequest");
const {
  createPromotionPackageSchema,
  updatePromotionPackageSchema,
  getByIdSchema,
} = require("../services/validations/adminValidations");

// Create Promotion Package
const createPackage = async (req, res) => {
  try {
    const { name, durationInDays, placements, price, isActive } = req.body;

    const newPackage = new PromotionPackage({
      name,
      durationInDays,
      placements,
      price,
      isActive,
    });
    await newPackage.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROMO_PACKAGE_CREATED,
      newPackage,
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

// Update Promotion Package
const updatePackage = async (req, res) => {
  try {
    const { id, ...updateData } = req.body;

    const updatedPackage = await PromotionPackage.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updatedPackage) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROMO_PACKAGE_UPDATED,
      updatedPackage,
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

// Get List (Admin gets all, organizer will only get active ones depending on the route, but let's make a generic list)
const getPackageList = async (req, res) => {
  try {
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const { isActive } = req.query;
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const total = await PromotionPackage.countDocuments(query);
    const packages = await PromotionPackage.find(query).skip(skip).limit(size).lean();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROMO_PACKAGES_FETCHED,
      {
        packages,
        total,
        pageNo,
        size,
      },
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

// Get By Id
const getPackageById = async (req, res) => {
  try {
    const { id } = req.body;
    const pkg = await PromotionPackage.findById(id).lean();

    if (!pkg) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROMO_PACKAGE_DETAILS_FETCHED,
      pkg,
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

// Delete
const deletePackage = async (req, res) => {
  try {
    const { id } = req.body;
    const pkg = await PromotionPackage.findByIdAndDelete(id);

    if (!pkg) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.PROMO_PACKAGE_DELETED,
      null,
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

// Routes
router.post(
  "/create",
  perApiLimiter(),
  validateRequest(createPromotionPackageSchema),
  createPackage,
);

router.post(
  "/update",
  perApiLimiter(),
  validateRequest(updatePromotionPackageSchema),
  updatePackage,
);

router.post("/list", perApiLimiter(), getPackageList);

router.post(
  "/getById",
  perApiLimiter(),
  validateRequest(getByIdSchema),
  getPackageById,
);

router.post(
  "/delete",
  perApiLimiter(),
  validateRequest(getByIdSchema),
  deletePackage,
);

module.exports = router;
