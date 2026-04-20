const express = require("express");
const router = express.Router();
const organizerStatsService = require("../services/serviceOrganizerStats");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const { SUCCESS } = require("../../utils/constants");
const { roleId } = require("../../utils/Role");
const checkRole = require("../../middlewares/checkRole");
const mongoose = require("mongoose");

/**
 * Validate MongoDB ObjectId
 */
const validateObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Get all transactions for a specific organizer (Admin only)
 */
router.get(
  "/admin/organizer/:organizerId/transactions",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { organizerId } = req.params;

      if (!validateObjectId(organizerId)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_ORGANIZER_ID,
        );
      }

      const filters = req.query;

      const result = await organizerStatsService.getOrganizerTransactions(
        organizerId,
        filters,
      );

      if (result.statusCode === SUCCESS) {
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.ORGANIZER_TRANSACTIONS_FETCHED,
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          constantsMessage.FETCH_TRANSACTIONS_FAILED,
        );
      }
    } catch (error) {
      console.error("Error in getOrganizerTransactions controller:", {
        message: error.message,
        stack: error.stack,
        organizerId: req.params.organizerId,
      });
      return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Get wallet history for a specific organizer (Admin only)
 */
router.get(
  "/admin/organizer/:organizerId/wallet-history",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { organizerId } = req.params;

      if (!validateObjectId(organizerId)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_ORGANIZER_ID,
        );
      }

      const filters = req.query;

      const result = await organizerStatsService.getOrganizerWalletHistory(
        organizerId,
        filters,
      );

      if (result.statusCode === SUCCESS) {
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.WALLET_HISTORY_FETCHED,
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          constantsMessage.FETCH_WALLET_HISTORY_FAILED,
        );
      }
    } catch (error) {
      console.error("Error in getOrganizerWalletHistory controller:", error);
      return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Get payout requests for a specific organizer (Admin only)
 */
router.get(
  "/admin/organizer/:organizerId/payouts",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { organizerId } = req.params;

      if (!validateObjectId(organizerId)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_ORGANIZER_ID,
        );
      }

      const filters = req.query;

      const result = await organizerStatsService.getOrganizerPayouts(
        organizerId,
        filters,
      );

      if (result.statusCode === SUCCESS) {
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.PAYOUT_HISTORY_FETCHED,
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          constantsMessage.FETCH_PAYOUTS_FAILED,
        );
      }
    } catch (error) {
      console.error("Error in getOrganizerPayouts controller:", error);
      return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Get summary statistics for a specific organizer (Admin only)
 */
router.get(
  "/admin/organizer/:organizerId/stats-summary",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { organizerId } = req.params;

      if (!validateObjectId(organizerId)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.INVALID_ORGANIZER_ID,
        );
      }

      const result =
        await organizerStatsService.getOrganizerStatsSummary(organizerId);

      if (result.statusCode === SUCCESS) {
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          constantsMessage.ORGANIZER_STATS_FETCHED,
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          constantsMessage.FETCH_STATS_FAILED,
        );
      }
    } catch (error) {
      console.error("Error in getOrganizerStatsSummary controller:", error);
      return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Get dashboard data for the logged-in organizer
 */
router.get("/dashboard", checkRole([roleId.ORGANIZER]), async (req, res) => {
  try {
    const organizerId = req.user.userId; // Extracted from token

    if (!validateObjectId(organizerId)) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_ORGANIZER_ID);
    }

    const result =
      await organizerStatsService.getOrganizerDashboardData(organizerId);

    if (result.statusCode === SUCCESS) {
      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.ORGANIZER_DASHBOARD_FETCHED,
        result.data,
      );
    } else {
      return apiErrorRes(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        res,
        constantsMessage.FETCH_DASHBOARD_FAILED,
      );
    }
  } catch (error) {
    console.error("Error in getOrganizerDashboardData controller:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
});

module.exports = router;
