const express = require("express");
const router = express.Router();
const notificationService = require("../services/serviceNotification");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const validateRequest = require("../../middlewares/validateRequest");
const notificationValidation = require("../services/validations/notificationValidation");
const checkRole = require("../../middlewares/checkRole");

/**
 * Get notifications for the logged-in user
 */
router.post(
  "/my-notifications",
  validateRequest(notificationValidation.getNotifications),
  async (req, res) => {
    try {
      const payload = {
        ...req.body,
        recipient: req.user.userId,
      };

      const result = await notificationService.getUserNotifications(payload);
      return apiSuccessRes(
        HTTP_STATUS.SUCCESS,
        res,
        constantsMessage.NOTIFICATIONS_FETCHED,
        result.data,
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Mark a notification as read
 */
router.post(
  "/mark-read",
  validateRequest(notificationValidation.markAsRead),
  async (req, res) => {
    try {
      const { notificationId } = req.body;
      const result = await notificationService.markRead(
        notificationId,
        req.user._id,
      );

      if (result.status !== HTTP_STATUS.SUCCESS) {
        return apiErrorRes(result.status, res, result.data);
      }

      return apiSuccessRes(
        HTTP_STATUS.SUCCESS,
        res,
        constantsMessage.NOTIFICATION_MARKED_READ,
        result.data,
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Mark all notifications as read
 */
router.post("/mark-all-read", async (req, res) => {
  try {
    const result = await notificationService.markAllRead(req.user._id);
    return apiSuccessRes(
      HTTP_STATUS.SUCCESS,
      res,
      constantsMessage.ALL_NOTIFICATIONS_MARKED_READ,
      result.data,
    );
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
});

/**
 * Delete a notification
 */
router.post(
  "/delete",
  validateRequest(notificationValidation.markAsRead), // Reuse markAsRead validation since it only needs notificationId
  async (req, res) => {
    try {
      const { notificationId } = req.body;
      const result = await notificationService.deleteNotification(
        notificationId,
        req.user._id,
      );

      if (result.status !== HTTP_STATUS.SUCCESS) {
        return apiErrorRes(result.status, res, result.data);
      }

      return apiSuccessRes(
        HTTP_STATUS.SUCCESS,
        res,
        result.data,
        constantsMessage.NOTIFICATION_DELETED,
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

module.exports = router;
