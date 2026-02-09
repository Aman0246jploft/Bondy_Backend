const { Notification, User } = require("../../db");
const {
  SUCCESS,
  SERVER_ERROR_CODE,
  NOT_FOUND,
  DATA_NULL,
} = require("../../utils/constants");
const { resultDb } = require("../../utils/globalFunction");
const {
  sendFirebaseNotification,
} = require("../../utils/firebasePushNotification");
const {
  addJobToQueue,
  createQueue,
  processQueue,
  handleQueueEvents,
} = require("./serviceBull");

// Initialize Notification Queue
const notificationQueue = createQueue("notificationQueue");
handleQueueEvents(notificationQueue);

/**
 * Processor for the notification queue
 * This handles the actual DB insertion and Push Notification delivery
 */
const notificationProcessor = async (job) => {
  const {
    recipient,
    sender,
    type,
    title,
    message,
    relatedId,
    onModel,
    metadata,
    deepLink,
  } = job.data;

  try {
    // 1. Save to Database
    const newNotification = await Notification.create({
      recipient,
      sender,
      type,
      title,
      message,
      relatedId,
      onModel,
      metadata,
      deepLink,
    });

    // 2. Fetch recipient's FCM token
    const user = await User.findById(recipient).select("fmcToken");

    if (user && user.fmcToken) {
      // 3. Send Push Notification
      await sendFirebaseNotification({
        token: user.fmcToken,
        title,
        body: message,
        imageUrl: metadata?.imageUrl || null,
      });
    }

    console.log(`Notification processed and saved for user: ${recipient}`);
  } catch (error) {
    console.error("Error in notification processor:", error);
    throw error;
  }
};

// Start processing the queue
processQueue(notificationQueue, notificationProcessor);

/**
 * Service to add a notification to the queue
 */
const queueNotification = async (payload) => {
  try {
    await addJobToQueue(notificationQueue, payload);
    return resultDb(SUCCESS, { message: "Notification queued successfully" });
  } catch (error) {
    console.error("Error queuing notification:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Fetch notifications for a specific user
 */
const getUserNotifications = async (payload) => {
  try {
    const { recipient, pageNo = 1, size = 10, type, isRead } = payload;

    let query = { recipient, isDeleted: false };
    if (type) query.type = type;
    if (isRead !== undefined) query.isRead = isRead;

    const total = await Notification.countDocuments(query);
    const list = await Notification.find(query)
      .populate("sender", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .skip((pageNo - 1) * size)
      .limit(size)
      .lean();

    const totalUnread = await Notification.countDocuments({
      recipient,
      isRead: false,
      isDeleted: false,
    });

    return resultDb(SUCCESS, {
      total,
      totalUnread,
      list,
    });
  } catch (error) {
    console.error("Error fetching user notifications:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Mark a single notification as read
 */
const markRead = async (notificationId, recipient) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient },
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return resultDb(NOT_FOUND, "Notification not found");
    }

    return resultDb(SUCCESS, notification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Mark all notifications as read for a user
 */
const markAllRead = async (recipient) => {
  try {
    await Notification.updateMany(
      { recipient, isRead: false },
      { isRead: true },
    );
    return resultDb(SUCCESS, { message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Soft delete a notification
 */
const deleteNotification = async (notificationId, recipient) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient },
      { isDeleted: true },
      { new: true },
    );

    if (!notification) {
      return resultDb(NOT_FOUND, "Notification not found");
    }

    return resultDb(SUCCESS, { message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

module.exports = {
  queueNotification,
  getUserNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  notificationProcessor, // Exporting for testing if needed
};
