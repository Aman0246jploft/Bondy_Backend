const { Notification, User, UserSetting } = require("../../db");
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

// ─────────────────────────────────────────────
// Queue Initialisation
// ─────────────────────────────────────────────
const notificationQueue = createQueue("notificationQueue");
handleQueueEvents(notificationQueue);

// ─────────────────────────────────────────────
// BullMQ Processor
// Runs INSIDE the worker – never on the request thread.
// ─────────────────────────────────────────────
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
    // 1. Fetch recipient's UserSetting (create with defaults if missing)
    let settings = await UserSetting.findOne({ userId: recipient });
    if (!settings) {
      settings = await UserSetting.create({ userId: recipient });
    }

    // 2. Save in-app notification (gated by inAppNotification preference)
    let savedNotification = null;
    if (settings.inAppNotification !== false) {
      savedNotification = await Notification.create({
        recipient,
        sender: sender || null,
        type,
        title,
        message,
        relatedId: relatedId || null,
        onModel: onModel || null,
        metadata: metadata || {},
        deepLink: deepLink || null,
      });
    }

    // 3. Send push notification (gated by pushNotification preference)
    if (settings.pushNotification !== false) {
      const user = await User.findById(recipient).select("fmcToken");
      if (user && user.fmcToken) {
        await sendFirebaseNotification({
          token: user.fmcToken,
          title,
          body: message,
          imageUrl: metadata?.imageUrl || null,
        });
      }
    }

    console.log(
      `[Notification] Processed for user: ${recipient} | inApp: ${settings.inAppNotification} | push: ${settings.pushNotification}`
    );
  } catch (error) {
    console.error("[Notification] Processor error:", error);
    throw error; // Let Bull retry the job
  }
};

// Start processing
processQueue(notificationQueue, notificationProcessor);

// ─────────────────────────────────────────────
// Core: Add a notification to the queue
// ─────────────────────────────────────────────
/**
 * Low-level queue helper.  All named helpers below call this.
 * Controllers should call the named helpers—not this function directly.
 *
 * @param {Object} payload  - Notification payload (matches Notification schema)
 * @param {Object} [opts]   - BullMQ job options (attempts, delay, etc.)
 */
const queueNotification = async (payload, opts = { attempts: 3, backoff: { type: "exponential", delay: 5000 } }) => {
  try {
    await addJobToQueue(notificationQueue, payload, opts);
    return resultDb(SUCCESS, { message: "Notification queued successfully" });
  } catch (error) {
    console.error("[Notification] Error queuing notification:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

// ─────────────────────────────────────────────
// Named Helpers (called by controllers)
// These are fire-and-forget: controllers do NOT need to await them.
// ─────────────────────────────────────────────

/**
 * Notify a user that someone followed them.
 * @param {string} sender     - ID of the user who followed
 * @param {string} recipient  - ID of the user who was followed
 * @param {string} senderName - Display name of the follower (firstName lastName)
 */
const notifyFollow = (sender, recipient, senderName) => {
  return queueNotification({
    recipient,
    sender,
    type: "FOLLOW",
    title: "New Follower",
    message: `${senderName} started following you.`,
    relatedId: sender,
    onModel: "User",
    deepLink: `/profile/${sender}`,
  });
};

/**
 * Notify a buyer that their booking/payment was confirmed.
 * @param {string} recipient    - buyer user ID
 * @param {string} bookingType  - "EVENT" | "COURSE"
 * @param {string} itemTitle    - event or course title
 * @param {string} transactionId
 */
const notifyBookingConfirmed = (recipient, bookingType, itemTitle, transactionId) => {
  return queueNotification({
    recipient,
    sender: null,
    type: bookingType === "EVENT" ? "EVENT" : "COURSE",
    title: "Booking Confirmed 🎟️",
    message: `Your booking for "${itemTitle}" has been confirmed!`,
    relatedId: transactionId,
    onModel: null,
    deepLink: `/tickets/${transactionId}`,
  });
};

/**
 * Notify an organizer that someone booked their event/course.
 * @param {string} organizerId
 * @param {string} buyerName
 * @param {string} bookingType  - "EVENT" | "COURSE"
 * @param {string} itemTitle
 * @param {string} itemId       - event or course ID
 */
const notifyOrganizerNewBooking = (organizerId, buyerName, bookingType, itemTitle, itemId) => {
  return queueNotification({
    recipient: organizerId,
    sender: null,
    type: bookingType === "EVENT" ? "EVENT" : "COURSE",
    title: "New Booking Received 🎉",
    message: `${buyerName} booked your ${bookingType === "EVENT" ? "event" : "course"} "${itemTitle}".`,
    relatedId: itemId,
    onModel: bookingType === "EVENT" ? "Event" : "Course",
    deepLink: `/${bookingType === "EVENT" ? "events" : "courses"}/${itemId}`,
  });
};

/**
 * Notify an entity owner (organizer) that a user commented on their event/course.
 * @param {string} ownerId
 * @param {string} commenterName
 * @param {string} entityModel  - "Event" | "Course"
 * @param {string} entityId
 * @param {string} entityTitle
 * @param {string} senderId     - commenter user ID
 */
const notifyCommentOnEntity = (ownerId, commenterName, entityModel, entityId, entityTitle, senderId) => {
  return queueNotification({
    recipient: ownerId,
    sender: senderId,
    type: entityModel === "Event" ? "EVENT" : "COURSE",
    title: "New Comment",
    message: `${commenterName} commented on your ${entityModel === "Event" ? "event" : "course"} "${entityTitle}".`,
    relatedId: entityId,
    onModel: entityModel,
    deepLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Notify a commenter that someone replied to their comment.
 * @param {string} recipient      - original commenter user ID
 * @param {string} replierName
 * @param {string} entityModel    - "Event" | "Course"
 * @param {string} entityId
 * @param {string} parentCommentId
 * @param {string} senderId
 */
const notifyReplyToComment = (recipient, replierName, entityModel, entityId, parentCommentId, senderId) => {
  return queueNotification({
    recipient,
    sender: senderId,
    type: entityModel === "Event" ? "EVENT" : "COURSE",
    title: "New Reply",
    message: `${replierName} replied to your comment.`,
    relatedId: parentCommentId,
    onModel: entityModel,
    deepLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Notify an organizer about their document verification result.
 * @param {string} organizerId
 * @param {"approve"|"reject"} action
 * @param {string} [reason]  - required when rejected
 */
const notifyVerificationResult = (organizerId, action, reason) => {
  const approved = action === "approve";
  return queueNotification({
    recipient: organizerId,
    sender: null,
    type: "USER",
    title: approved ? "Verification Approved ✅" : "Verification Rejected ❌",
    message: approved
      ? "Your verification document has been approved. You are now a verified organizer on Bondy!"
      : `Your verification document was rejected. Reason: ${reason || "Please contact support for details."}`,
    deepLink: "/profile/verification",
  });
};

/**
 * Notify an organizer about their payout request result.
 * @param {string} organizerId
 * @param {"approved"|"rejected"} status
 * @param {number} amount
 * @param {string} payoutId
 * @param {string} [adminNote]
 */
const notifyPayoutResult = (organizerId, status, amount, payoutId, adminNote) => {
  const approved = status === "approved";
  return queueNotification({
    recipient: organizerId,
    sender: null,
    type: "PAYOUT",
    title: approved ? "Payout Approved 💸" : "Payout Rejected",
    message: approved
      ? `Your payout request of ₮${amount?.toLocaleString()} has been approved and is being processed.`
      : `Your payout request of ₮${amount?.toLocaleString()} was rejected. ${adminNote ? `Note: ${adminNote}` : "Please contact support for details."}`,
    relatedId: payoutId,
    onModel: "Payout",
    deepLink: "/earnings",
  });
};

/**
 * Notify a referrer that their referral reward has been credited.
 * @param {string} referrerId
 * @param {number} rewardAmount
 * @param {string} referreeName  - firstName + lastName + email of verified user
 * @param {string} referralId
 */
const notifyReferralReward = (referrerId, rewardAmount, referreeName, referralId) => {
  return queueNotification({
    recipient: referrerId,
    sender: null,
    type: "SYSTEM",
    title: "Referral Reward Credited! 🎉",
    message: `You earned ₮${rewardAmount?.toLocaleString()} because your referral ${referreeName} was successfully verified!`,
    relatedId: referralId,
    deepLink: "/earnings",
  });
};

/**
 * Notify an organizer that their event/course promotion is active.
 * @param {string} organizerId
 * @param {"Event"|"Course"} entityModel
 * @param {string} entityTitle
 * @param {string} entityId
 * @param {number} durationInDays
 */
const notifyPromotion = (organizerId, entityModel, entityTitle, entityId, durationInDays) => {
  return queueNotification({
    recipient: organizerId,
    sender: null,
    type: entityModel === "Event" ? "EVENT" : "COURSE",
    title: "Promotion Activated 🚀",
    message: `Your ${entityModel === "Event" ? "event" : "course"} "${entityTitle}" is now actively featured for ${durationInDays} days!`,
    relatedId: entityId,
    onModel: entityModel,
    deepLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

// ─────────────────────────────────────────────
// Fetch / CRUD operations (used by controller)
// ─────────────────────────────────────────────

/**
 * Fetch paginated notifications for a user.
 */
const getUserNotifications = async (payload) => {
  try {
    const { recipient, pageNo = 1, size = 10, type, isRead } = payload;

    let query = { recipient, isDeleted: false };
    if (type) query.type = type;
    if (isRead !== undefined) query.isRead = isRead;

    const total = await Notification.countDocuments(query);
    const list = await Notification.find(query)
      .populate("sender", "firstName lastName profileImage isVerified")
      .sort({ createdAt: -1 })
      .skip((pageNo - 1) * size)
      .limit(size)
      .lean();

    const totalUnread = await Notification.countDocuments({
      recipient,
      isRead: false,
      isDeleted: false,
    });

    return resultDb(SUCCESS, { total, totalUnread, list });
  } catch (error) {
    console.error("[Notification] Error fetching notifications:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Mark a single notification as read (scoped to the requesting user).
 */
const markRead = async (notificationId, recipient) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return resultDb(NOT_FOUND, "Notification not found");
    }

    return resultDb(SUCCESS, notification);
  } catch (error) {
    console.error("[Notification] Error marking read:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Mark ALL unread notifications as read for a user.
 */
const markAllRead = async (recipient) => {
  try {
    await Notification.updateMany(
      { recipient, isRead: false },
      { isRead: true }
    );
    return resultDb(SUCCESS, { message: "All notifications marked as read" });
  } catch (error) {
    console.error("[Notification] Error marking all read:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

/**
 * Soft-delete a notification (scoped to the requesting user).
 */
const deleteNotification = async (notificationId, recipient) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient },
      { isDeleted: true },
      { new: true }
    );

    if (!notification) {
      return resultDb(NOT_FOUND, "Notification not found");
    }

    return resultDb(SUCCESS, { message: "Notification deleted successfully" });
  } catch (error) {
    console.error("[Notification] Error deleting notification:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────
module.exports = {
  // Core
  queueNotification,

  // Named helpers (fire-and-forget from controllers)
  notifyFollow,
  notifyBookingConfirmed,
  notifyOrganizerNewBooking,
  notifyCommentOnEntity,
  notifyReplyToComment,
  notifyVerificationResult,
  notifyPayoutResult,
  notifyReferralReward,
  notifyPromotion,

  // CRUD (used by controllerNotification.js)
  getUserNotifications,
  markRead,
  markAllRead,
  deleteNotification,
};
