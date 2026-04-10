const express = require("express");
const router = express.Router();
const { Category } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  BACKEND_URL,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const constantsMessage = require("../../utils/constantsMessage");
const validateRequest = require("../../middlewares/validateRequest");
const {
  createCategorySchema,
  updateCategorySchema,
  categoryListSchema,
} = require("../services/validations/categoryValidation");

// Create Category
const createCategory = async (req, res) => {
  try {
    const { name, type, image, name_thi } = req.body;
    const lowerCaseName = name.toLowerCase().trim();
    const lowerCaseType = type.toLowerCase().trim();
    const lowerCaseNameThi = name_thi ? name_thi.toLowerCase().trim() : null;

    // Check if category exists with same name AND type (including soft-deleted)
    const existingCategory = await Category.findOne({
      name: lowerCaseName,
      type: lowerCaseType,
    });

    if (existingCategory) {
      if (existingCategory.isDeleted) {
        // Restore soft-deleted category
        existingCategory.isDeleted = false;
        existingCategory.deletedAt = null;
        if (image) existingCategory.image = image; // Update image if provided
        await existingCategory.save();
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.CATEGORY_RESTORED,
          { category: existingCategory },
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          `Category with name "${name}" already exists for type "${type}"`,
        );
      }
    }

    // Create new category
    const newCategory = new Category({
      name: lowerCaseName,
      type: lowerCaseType,
      image: image || null,
      name_thi: lowerCaseNameThi,
    });

    await newCategory.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.CATEGORY_CREATED,
      { category: newCategory },
    );
  } catch (error) {
    console.error("Error in createCategory:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Category List with Pagination
const getCategoryList = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const query = { isDeleted: false };

    // Filter by type if provided, otherwise default to "event" and "course"
    if (type) {
      query.type = type.toLowerCase();
    } else {
      query.type = { $in: ["event", "course"] };
    }

    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const total = await Category.countDocuments(query);
    const categories = await Category.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    const formattedCategories = categories.map((cat) => ({
      ...cat,
      image: cat.image ? formatResponseUrl(cat.image) : null,
    }));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.CATEGORIES_FETCHED,
      {
        categories: formattedCategories,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    );
  } catch (error) {
    console.error("Error in getCategoryList:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Update Category
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, image, isDisable, name_thi } = req.body;

    const category = await Category.findOne({ _id: id, isDeleted: false });
    if (!category) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.CATEGORY_NOT_FOUND,
      );
    }

    // If updating name or type, check for duplicates
    if (name || type) {
      const checkName = name ? name.toLowerCase().trim() : category.name;
      const checkType = type ? type.toLowerCase().trim() : category.type;

      // Check for duplicate name + type combination excluding current category
      const existingName = await Category.findOne({
        name: checkName,
        type: checkType,
        _id: { $ne: id },
        isDeleted: false,
      });

      if (existingName) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          `Category with name "${checkName}" already exists for type "${checkType}"`,
        );
      }

      if (name) {
        category.name = checkName;
      }
      if (type) {
        category.type = checkType;
      }
    }

    if (image !== undefined) {
      category.image = image;
    }
    if (isDisable !== undefined) {
      category.isDisable = isDisable;
    }
    if (name_thi !== undefined) {
      category.name_thi = name_thi ? name_thi.toLowerCase().trim() : null;
    }
    await category.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.CATEGORY_UPDATED,
      { category },
    );
  } catch (error) {
    console.error("Error in updateCategory:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Delete Category (Soft Delete)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findOne({ _id: id, isDeleted: false });
    if (!category) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.CATEGORY_NOT_FOUND,
      );
    }

    category.isDeleted = true;
    category.deletedAt = new Date();
    await category.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.CATEGORY_DELETED,
      { categoryId: id },
    );
  } catch (error) {
    console.error("Error in deleteCategory:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post(
  "/create",
  perApiLimiter(),
  validateRequest(createCategorySchema),
  checkRole([roleId.SUPER_ADMIN]),
  createCategory,
);
router.get(
  "/list",
  perApiLimiter(),
  validateRequest(categoryListSchema, "query"),
  getCategoryList,
);
router.post(
  "/update/:id",
  perApiLimiter(),
  validateRequest(updateCategorySchema),
  checkRole([roleId.SUPER_ADMIN]),
  updateCategory,
);
router.delete(
  "/delete/:id",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  deleteCategory,
);

module.exports = router;
