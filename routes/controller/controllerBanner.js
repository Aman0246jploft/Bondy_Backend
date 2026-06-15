const express = require("express");
const router = express.Router();
const { Banner } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const perApiLimiter = require("../../middlewares/rateLimiter");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const validateRequest = require("../../middlewares/validateRequest");
const {
  createBannerSchema,
  updateBannerSchema,
  bannerListSchema,
} = require("../services/validations/bannerValidation");

// Create Banner (Admin only)
const createBanner = async (req, res) => {
  try {
    const { image, linkUrl, isActive } = req.body;

    const newBanner = new Banner({
      image,
      linkUrl: linkUrl || "",
      isActive: isActive !== undefined ? isActive : true,
    });

    await newBanner.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Banner created successfully",
      { banner: newBanner }
    );
  } catch (error) {
    console.error("Error in createBanner:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Banners (Admin only - with pagination and includes inactive ones)
const getBannersAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const query = { isDeleted: false };

    const total = await Banner.countDocuments(query);
    const banners = await Banner.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    const formattedBanners = banners.map((banner) => ({
      ...banner,
      image: banner.image ? formatResponseUrl(banner.image) : null,
    }));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Banners fetched successfully",
      {
        banners: formattedBanners,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      }
    );
  } catch (error) {
    console.error("Error in getBannersAdmin:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Active Banners (Public API - No auth required)
const getBannersPublic = async (req, res) => {
  try {
    const query = { isDeleted: false, isActive: true };

    const banners = await Banner.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const formattedBanners = banners.map((banner) => ({
      ...banner,
      image: banner.image ? formatResponseUrl(banner.image) : null,
    }));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Active banners fetched successfully",
      { banners: formattedBanners }
    );
  } catch (error) {
    console.error("Error in getBannersPublic:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Update Banner (Admin only)
const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { image, linkUrl, isActive } = req.body;

    const banner = await Banner.findOne({ _id: id, isDeleted: false });
    if (!banner) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Banner not found"
      );
    }

    if (image !== undefined) {
      banner.image = image;
    }
    if (linkUrl !== undefined) {
      banner.linkUrl = linkUrl || "";
    }
    if (isActive !== undefined) {
      banner.isActive = isActive;
    }

    await banner.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Banner updated successfully",
      { banner }
    );
  } catch (error) {
    console.error("Error in updateBanner:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Toggle Banner Active Status (Admin only)
const toggleBannerActive = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findOne({ _id: id, isDeleted: false });
    if (!banner) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Banner not found"
      );
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Banner status toggled successfully",
      {
        bannerId: banner._id,
        isActive: banner.isActive,
      }
    );
  } catch (error) {
    console.error("Error in toggleBannerActive:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Delete Banner (Soft delete, Admin only)
const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findOne({ _id: id, isDeleted: false });
    if (!banner) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Banner not found"
      );
    }

    banner.isDeleted = true;
    banner.deletedAt = new Date();
    await banner.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Banner deleted successfully",
      { bannerId: id }
    );
  } catch (error) {
    console.error("Error in deleteBanner:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post(
  "/create",
  perApiLimiter(),
  validateRequest(createBannerSchema),
  checkRole([roleId.SUPER_ADMIN]),
  createBanner
);

router.get(
  "/admin/list",
  perApiLimiter(),
  validateRequest(bannerListSchema, "query"),
  checkRole([roleId.SUPER_ADMIN]),
  getBannersAdmin
);

// Public banner route
router.get(
  "/list",
  perApiLimiter(),
  getBannersPublic
);

router.post(
  "/update/:id",
  perApiLimiter(),
  validateRequest(updateBannerSchema),
  checkRole([roleId.SUPER_ADMIN]),
  updateBanner
);

router.post(
  "/toggle-active/:id",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  toggleBannerActive
);

router.delete(
  "/delete/:id",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  deleteBanner
);

module.exports = router;
