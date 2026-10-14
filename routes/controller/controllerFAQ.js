const express = require("express");
const router = express.Router();
const { FAQ, FAQTopic } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const validateRequest = require("../../middlewares/validateRequest");
const faqValidation = require("../services/validations/faqValidation");

const topicFields = "name name_mn slug order isActive";

const normalizeFAQ = (faq) => {
  const item = faq.toObject ? faq.toObject() : faq;
  const populatedCategory = item.categoryId && typeof item.categoryId === "object"
    ? item.categoryId
    : null;
  const category = populatedCategory
    ? {
      _id: populatedCategory._id,
      name: populatedCategory.name,
      name_mn: populatedCategory.name_mn,
      slug: populatedCategory.slug,
      order: populatedCategory.order,
      isActive: populatedCategory.isActive,
    }
    : null;

  return {
    ...item,
    categoryId: category?._id || item.categoryId || null,
    category,
  };
};

const slugify = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const findTopic = (categoryId, activeOnly = false) => FAQTopic.findOne({
  _id: categoryId,
  ...(activeOnly ? { isActive: true } : {}),
});

// Public: Get all active FAQs
const getFAQs = async (req, res) => {
  try {
    const records = await FAQ.find({ isActive: true })
      .populate({ path: "categoryId", select: topicFields, match: { isActive: true } })
      .sort({ order: 1 })
      .lean();
    const faqs = records.filter((faq) => faq.categoryId).map(normalizeFAQ);
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
    const records = await FAQ.find()
      .populate({ path: "categoryId", select: topicFields })
      .sort({ order: 1 })
      .lean();
    const faqs = records.map(normalizeFAQ);
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
    const { categoryId, question, question_mn, answer, answer_mn, order, isActive } = req.body;
    const topic = await findTopic(categoryId, true);
    if (!topic) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Please select an active FAQ topic.");
    }

    const newFAQ = new FAQ({
      categoryId,
      question,
      question_mn,
      answer,
      answer_mn,
      order,
      isActive,
    });
    await newFAQ.save();
    await newFAQ.populate({ path: "categoryId", select: topicFields });
    return apiSuccessRes(HTTP_STATUS.CREATED, res, constantsMessage.FAQ_CREATED, {
      faq: normalizeFAQ(newFAQ),
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Admin: Update FAQ
const updateFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, question, question_mn, answer, answer_mn, order, isActive } = req.body;
    const topic = await findTopic(categoryId);
    if (!topic) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "The selected FAQ topic does not exist.");
    }

    const updatedFAQ = await FAQ.findByIdAndUpdate(
      id,
      { categoryId, question, question_mn, answer, answer_mn, order, isActive },
      { new: true, runValidators: true },
    ).populate(
      { path: "categoryId", select: topicFields },
    );
    if (!updatedFAQ) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.FAQ_NOT_FOUND);
    }
    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FAQ_UPDATED, {
      faq: normalizeFAQ(updatedFAQ),
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
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

// Public: Active common topics for help-center navigation.
const getTopics = async (req, res) => {
  try {
    const topics = await FAQTopic.find({ isActive: true })
      .select(topicFields)
      .sort({ order: 1, name: 1 })
      .lean();
    return apiSuccessRes(HTTP_STATUS.OK, res, "FAQ topics fetched successfully.", { topics });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Admin: All topics, including inactive ones.
const getAllTopicsAdmin = async (req, res) => {
  try {
    const topics = await FAQTopic.find()
      .select(topicFields)
      .sort({ order: 1, name: 1 })
      .lean();
    return apiSuccessRes(HTTP_STATUS.OK, res, "FAQ topics fetched successfully.", { topics });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

const createTopic = async (req, res) => {
  try {
    const { name, name_mn, order, isActive } = req.body;
    const slug = slugify(name);
    if (!slug) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Topic name must contain letters or numbers.");
    }
    const existing = await FAQTopic.findOne({ slug });
    if (existing) {
      return apiErrorRes(HTTP_STATUS.CONFLICT, res, "An FAQ topic with this English name already exists.");
    }

    const topic = await FAQTopic.create({ name, name_mn, slug, order, isActive });
    return apiSuccessRes(HTTP_STATUS.CREATED, res, "FAQ topic created successfully.", { topic });
  } catch (error) {
    const status = error?.code === 11000 ? HTTP_STATUS.CONFLICT : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    return apiErrorRes(status, res, error.message);
  }
};

const updateTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_mn, order, isActive } = req.body;
    const topic = await FAQTopic.findByIdAndUpdate(
      id,
      { name, name_mn, order, isActive },
      { new: true, runValidators: true },
    );
    if (!topic) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "FAQ topic not found.");
    }
    return apiSuccessRes(HTTP_STATUS.OK, res, "FAQ topic updated successfully.", { topic });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

const deleteTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const topic = await FAQTopic.findById(id);
    if (!topic) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "FAQ topic not found.");
    }

    const faqCount = await FAQ.countDocuments({ categoryId: id });
    if (faqCount > 0) {
      return apiErrorRes(
        HTTP_STATUS.CONFLICT,
        res,
        `This topic is used by ${faqCount} FAQ${faqCount === 1 ? "" : "s"}. Move those FAQs or deactivate the topic instead.`,
      );
    }

    await topic.deleteOne();
    return apiSuccessRes(HTTP_STATUS.OK, res, "FAQ topic deleted successfully.");
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Routes
router.get("/list", getFAQs);
router.get("/admin/list", checkRole([roleId.SUPER_ADMIN]), getAllFAQsAdmin);
router.get("/topics", getTopics);
router.get("/admin/topics", checkRole([roleId.SUPER_ADMIN]), getAllTopicsAdmin);
router.post(
  "/admin/topics",
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(faqValidation.createTopic),
  createTopic,
);
router.put(
  "/admin/topics/:id",
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(faqValidation.updateTopic),
  updateTopic,
);
router.delete("/admin/topics/:id", checkRole([roleId.SUPER_ADMIN]), deleteTopic);
router.post(
  "/create",
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(faqValidation.createFAQ),
  createFAQ,
);
router.put(
  "/update/:id",
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(faqValidation.updateFAQ),
  updateFAQ,
);
router.delete("/delete/:id", checkRole([roleId.SUPER_ADMIN]), deleteFAQ);

module.exports = router;
