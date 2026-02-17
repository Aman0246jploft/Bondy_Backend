const express = require("express");
const router = express.Router();
const organizerStatsService = require("../services/serviceOrganizerStats");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
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
          "Invalid organizer ID",
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
          "Organizer transactions fetched successfully",
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          "Failed to fetch transactions",
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
          "Invalid organizer ID",
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
          "Wallet history fetched successfully",
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          "Failed to fetch wallet history",
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
          "Invalid organizer ID",
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
          "Payout history fetched successfully",
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          "Failed to fetch payouts",
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
          "Invalid organizer ID",
        );
      }

      const result =
        await organizerStatsService.getOrganizerStatsSummary(organizerId);

      if (result.statusCode === SUCCESS) {
        return apiSuccessRes(
          HTTP_STATUS.OK,
          res,
          "Organizer statistics fetched successfully",
          result.data,
        );
      } else {
        return apiErrorRes(
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          res,
          "Failed to fetch statistics",
        );
      }
    } catch (error) {
      console.error("Error in getOrganizerStatsSummary controller:", error);
      return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
    }
  },
);

module.exports = router;
