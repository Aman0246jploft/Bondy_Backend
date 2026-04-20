const express = require("express");
const router = express.Router();
const { FAQ } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

// Public: Get all active FAQs
const getFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find({ isActive: true }).sort({ order: 1 });
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FAQS_FETCHED, {
      faqs,
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin: Get all FAQs (including inactive)
const getAllFAQsAdmin = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ order: 1 });
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FAQS_FETCHED, {
      faqs,
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin: Create FAQ
const createFAQ = async (req, res) => {
  try {
    const { question, answer, order, isActive } = req.body;
    const newFAQ = new FAQ({ question, answer, order, isActive });
    await newFAQ.save();
    return apiSuccessRes(HTTP_STATUS.CREATED, res, constantsMessage.FAQ_CREATED, {
      faq: newFAQ,
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin: Update FAQ
const updateFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, order, isActive } = req.body;
    const updatedFAQ = await FAQ.findByIdAndUpdate(
      id,
      { question, answer, order, isActive },
      { new: true },
    );
    if (!updatedFAQ) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.FAQ_NOT_FOUND);
    }
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FAQ_UPDATED, {
      faq: updatedFAQ,
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin: Delete FAQ
const deleteFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedFAQ = await FAQ.findByIdAndDelete(id);
    if (!deletedFAQ) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.FAQ_NOT_FOUND);
    }
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FAQ_DELETED);
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.get("/list", getFAQs);
router.get("/admin/list", checkRole([roleId.SUPER_ADMIN]), getAllFAQsAdmin);
router.post("/create", checkRole([roleId.SUPER_ADMIN]), createFAQ);
router.put("/update/:id", checkRole([roleId.SUPER_ADMIN]), updateFAQ);
router.delete("/delete/:id", checkRole([roleId.SUPER_ADMIN]), deleteFAQ);

module.exports = router;
