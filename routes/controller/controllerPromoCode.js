const express = require("express");
const router = express.Router();
const { PromoCode } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const validateRequest = require("../../middlewares/validateRequest");
const {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  getByIdSchema,
} = require("../services/validations/adminValidations");

// Create PromoCode
const createPromoCode = async (req, res) => {
  try {
    const { code, ...otherData } = req.body;

    const existingCode = await PromoCode.findOne({ code });
    if (existingCode) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Promo code already exists.",
      );
    }

    const newPromoCode = new PromoCode({
      code,
      ...otherData,
    });
    await newPromoCode.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Promo code created successfully.",
      newPromoCode,
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

// Update PromoCode
const updatePromoCode = async (req, res) => {
  try {
    const { id, code, ...updateData } = req.body;

    // Check code uniqueness if code is being updated
    if (code) {
      const existingCode = await PromoCode.findOne({ code, _id: { $ne: id } });
      if (existingCode) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Promo code already exists.", 
        );
      }
      updateData.code = code;
    }

    const promoCode = await PromoCode.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!promoCode) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Promo code updated successfully.",
      promoCode,
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

// Get List
const getPromoCodeList = async (req, res) => {
  try {
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const total = await PromoCode.countDocuments();
    const promoCodes = await PromoCode.find().skip(skip).limit(size).lean();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Promo codes fetched successfully.",
      {
        promoCodes,
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
const getPromoCodeById = async (req, res) => {
  try {
    const { id } = req.body;
    const promoCode = await PromoCode.findById(id).lean();

    if (!promoCode) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Promo code details fetched successfully.",
      promoCode,
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
const deletePromoCode = async (req, res) => {
  try {
    const { id } = req.body;
    const promoCode = await PromoCode.findByIdAndDelete(id);

    if (!promoCode) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Promo code deleted successfully.",
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
  validateRequest(createPromoCodeSchema),
  createPromoCode,
);

router.post(
  "/update",
  perApiLimiter(),
  validateRequest(updatePromoCodeSchema),
  updatePromoCode,
);

router.post("/list", perApiLimiter(), getPromoCodeList);

router.post(
  "/getById",
  perApiLimiter(),
  validateRequest(getByIdSchema),
  getPromoCodeById,
);

router.post(
  "/delete",
  perApiLimiter(),
  validateRequest(getByIdSchema),
  deletePromoCode,
);

module.exports = router;
