const express = require("express");
const router = express.Router();
const notificationService = require("../services/serviceNotification");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const validateRequest = require("../../middlewares/validateRequest");
const notificationValidation = require("../services/validations/notificationValidation");
const checkRole = require("../../middlewares/checkRole");
const CONSTANTS = require("../../utils/constants");
const { User, Notification, AdminNotificationLog } = require("../../db");
const { roleId } = require("../../utils/Role");
const { sendFirebaseNotification } = require("../../utils/firebasePushNotification");
const socketIO = require("../../socket/socketIO");

/**
 * Get notifications for the logged-in user (supports GET and POST)
 */
const getNotificationsHandler = async (req, res) => {
  try {
    const inputData = req.method === "GET" ? req.query : req.body;
    const payload = {
      page: inputData.page ? parseInt(inputData.page) : 1,
      limit: inputData.limit ? parseInt(inputData.limit) : 10,
      type: inputData.type,
      isRead: inputData.isRead !== undefined ? (inputData.isRead === "true" || inputData.isRead === true) : undefined,
      category: inputData.category,
      recipient: req.user.userId,
    };

    const result = await notificationService.getUserNotifications(payload);
    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.NOTIFICATIONS_FETCHED,
      result.data,
    );
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.get("/my-notifications", validateRequest(notificationValidation.getNotifications), getNotificationsHandler);
router.post("/my-notifications", validateRequest(notificationValidation.getNotifications), getNotificationsHandler);

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
        req.user.userId,
      );

      if (result.statusCode !== CONSTANTS.SUCCESS) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, result.data);
      }

      return apiSuccessRes(
        HTTP_STATUS.OK,
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
    const result = await notificationService.markAllRead(req.user.userId);
    return apiSuccessRes(
      HTTP_STATUS.OK,
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
        req.user.userId,
      );

      if (result.statusCode !== CONSTANTS.SUCCESS) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, result.data);
      }

      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.NOTIFICATION_DELETED,
        result.data,
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * Delete multiple notifications
 */
router.post(
  "/delete-multiple",
  validateRequest(notificationValidation.deleteMultiple),
  async (req, res) => {
    try {
      const { notificationIds } = req.body;
      const result = await notificationService.deleteMultipleNotifications(
        notificationIds,
        req.user.userId,
      );

      if (result.statusCode !== CONSTANTS.SUCCESS) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, result.data);
      }

      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        constantsMessage.NOTIFICATIONS_DELETED_SUCCESSFULLY,
        result.data,
      );
    } catch (error) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  },
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin Custom Notification Endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Get active recipient counts for each target group (everyone, users, organizers)
 */
router.get(
  "/admin/recipient-counts",
  checkRole([roleId.SUPER_ADMIN, roleId.STAFF]),
  async (req, res) => {
    try {
      const baseFilter = { isDeleted: { $ne: true }, isDisable: { $ne: true } };

      const [usersCount, organizersCount, everyoneCount] = await Promise.all([
        User.countDocuments({ ...baseFilter, roleId: roleId.CUSTOMER }),
        User.countDocuments({ ...baseFilter, roleId: roleId.ORGANIZER }),
        User.countDocuments({ ...baseFilter, roleId: { $in: [roleId.CUSTOMER, roleId.ORGANIZER] } }),
      ]);

      return apiSuccessRes(HTTP_STATUS.OK, res, "Recipient counts fetched successfully.", {
        users: usersCount,
        organizers: organizersCount,
        everyone: everyoneCount,
      });
    } catch (error) {
      console.error("Error fetching recipient counts:", error);
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  }
);

/**
 * Send custom notification to specific recipient group (everyone, users, organizers)
 */
router.post(
  "/admin/send",
  checkRole([roleId.SUPER_ADMIN, roleId.STAFF]),
  validateRequest(notificationValidation.sendCustomNotification),
  async (req, res) => {
    try {
      const { target, title, message, deepLink, webLink } = req.body;
      const baseFilter = { isDeleted: { $ne: true }, isDisable: { $ne: true } };

      let roleFilter = {};
      if (target === "users") {
        roleFilter = { roleId: roleId.CUSTOMER };
      } else if (target === "organizers") {
        roleFilter = { roleId: roleId.ORGANIZER };
      } else if (target === "everyone") {
        roleFilter = { roleId: { $in: [roleId.CUSTOMER, roleId.ORGANIZER] } };
      }

      const recipients = await User.find({ ...baseFilter, ...roleFilter })
        .select("_id fmcToken")
        .lean();

      if (!recipients || recipients.length === 0) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          `No active recipients found for target group "${target}".`
        );
      }

      const adminSenderId = req.user?.userId || null;

      // 1. Bulk insert in-app notifications
      const notificationDocs = recipients.map((r) => ({
        recipient: r._id,
        sender: adminSenderId,
        type: "SYSTEM",
        title: title.trim(),
        message: message.trim(),
        deepLink: deepLink ? deepLink.trim() : null,
        webLink: webLink ? webLink.trim() : null,
        metadata: {
          targetGroup: target,
          isBroadcast: "true",
          sentAt: new Date().toISOString(),
        },
        isRead: false,
        isDeleted: false,
      }));

      await Notification.insertMany(notificationDocs, { ordered: false });

      // 2. Record log in AdminNotificationLog
      const logEntry = await AdminNotificationLog.create({
        sender: adminSenderId,
        title: title.trim(),
        message: message.trim(),
        targetGroup: target,
        recipientCount: recipients.length,
        deepLink: deepLink ? deepLink.trim() : null,
        webLink: webLink ? webLink.trim() : null,
        status: "SENT",
      });

      // 3. Dispatch Firebase push notifications (background, non-blocking)
      const tokenRecipients = recipients.filter((r) => r.fmcToken);
      if (tokenRecipients.length > 0) {
        Promise.allSettled(
          tokenRecipients.map((r) =>
            sendFirebaseNotification({
              token: r.fmcToken,
              title: title.trim(),
              body: message.trim(),
              data: {
                type: "SYSTEM",
                target,
                deepLink: deepLink ? deepLink.trim() : "",
                webLink: webLink ? webLink.trim() : "",
              },
            })
          )
        ).catch((err) => console.error("Error sending push notifications:", err));
      }

      // 4. Emit socket broadcast
      try {
        const io = socketIO.getIO ? socketIO.getIO() : null;
        if (io) {
          io.emit("new_broadcast_notification", {
            title: title.trim(),
            message: message.trim(),
            targetGroup: target,
          });
        }
      } catch (socketErr) {
        console.warn("Socket broadcast warning:", socketErr);
      }

      return apiSuccessRes(
        HTTP_STATUS.OK,
        res,
        `Notification successfully sent to ${recipients.length} recipients.`,
        {
          recipientCount: recipients.length,
          targetGroup: target,
          log: logEntry,
        }
      );
    } catch (error) {
      console.error("Error sending custom admin notification:", error);
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  }
);

/**
 * Get notification history sent by admin
 */
router.get(
  "/admin/history",
  checkRole([roleId.SUPER_ADMIN, roleId.STAFF]),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.max(1, parseInt(req.query.limit) || 10);
      const skip = (page - 1) * limit;

      const [total, logs] = await Promise.all([
        AdminNotificationLog.countDocuments(),
        AdminNotificationLog.find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("sender", "firstName lastName email profileImage")
          .lean(),
      ]);

      return apiSuccessRes(HTTP_STATUS.OK, res, "Notification history fetched successfully.", {
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (error) {
      console.error("Error fetching notification history:", error);
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
  }
);

module.exports = router;
