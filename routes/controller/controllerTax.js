const express = require("express");
const router = express.Router();
const { Tax } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const validateRequest = require("../../middlewares/validateRequest");
const {
  createTaxSchema,
  updateTaxSchema,
  getByIdSchema,
} = require("../services/validations/adminValidations");

// Create Tax
const createTax = async (req, res) => {
  try {
    const { name, type, value, active, description } = req.body;

    const existingTax = await Tax.findOne({ name });
    if (existingTax) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.TAX_ALREADY_EXISTS,
      );
    }

    const newTax = new Tax({
      name,
      type,
      value,
      active,
      description,
    });
    await newTax.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.TAX_CREATED,
      newTax,
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

// Update Tax
const updateTax = async (req, res) => {
  try {
    const { id, ...updateData } = req.body;

    const tax = await Tax.findByIdAndUpdate(id, updateData, { new: true });
    if (!tax) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TAX_UPDATED, tax);
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
const getTaxList = async (req, res) => {
  try {
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const total = await Tax.countDocuments();
    const taxes = await Tax.find().skip(skip).limit(size).lean();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.TAX_LIST_FETCHED,
      {
        taxes,
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
const getTaxById = async (req, res) => {
  try {
    const { id } = req.body;
    const tax = await Tax.findById(id).lean();

    if (!tax) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.TAX_DETAILS_FETCHED,
      tax,
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
const deleteTax = async (req, res) => {
  try {
    const { id } = req.body;
    const tax = await Tax.findByIdAndDelete(id);

    if (!tax) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.NOT_FOUND,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.TAX_DELETED,
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
  validateRequest(createTaxSchema),
  createTax,
);

router.post(
  "/update",
  perApiLimiter(),
  validateRequest(updateTaxSchema),
  updateTax,
);

router.get("/list", perApiLimiter(), getTaxList);

router.post(
  "/getById",
  perApiLimiter(),
  validateRequest(getByIdSchema),
  getTaxById,
);

router.post(
  "/delete",
  perApiLimiter(),
  validateRequest(getByIdSchema),
  deleteTax,
);

module.exports = router;
