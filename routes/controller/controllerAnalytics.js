const express = require("express");
const router = express.Router();
const analyticsService = require("../services/serviceAnalytics");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
const HTTP_STATUS = require("../../utils/statusCode");
const { roleId } = require("../../utils/Role");
const checkRole = require("../../middlewares/checkRole");

/**
 * Global Admin Analytics
 */
router.get(
  "/admin/global-stats",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const result = await analyticsService.getAdminStats();
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        "Global stats fetched successfully",
        result.data
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Organizer Stats
 */
router.get(
  "/organizer/stats",
  checkRole([roleId.ORGANIZER]),
  async (req, res) => {
    try {
      const result = await analyticsService.getOrganizerStats(req.user.userId);
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        "Organizer stats fetched successfully",
        result.data
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Customer Stats
 */
router.get(
  "/customer/stats",
  checkRole([roleId.CUSTOMER]),
  async (req, res) => {
    try {
      const result = await analyticsService.getCustomerStats(req.user.userId);
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        "Customer stats fetched successfully",
        result.data
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Admin view of any user's stats
 */
router.get(
  "/admin/user-stats/:userId",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await analyticsService.getUserStatsForAdmin(userId);
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        "User specific stats fetched successfully",
        result.data
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

module.exports = router;
