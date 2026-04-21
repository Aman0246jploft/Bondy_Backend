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
  createQueue,
  registerWorker,
  addJob,
} = require("./serviceBullMQ");

// ─────────────────────────────────────────────
// Queue Initialisation
// ─────────────────────────────────────────────
const notificationQueue = createQueue("notificationQueue");

// ─────────────────────────────────────────────
// BullMQ Processor
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
    webLink,
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
        webLink: webLink || null,
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
          data: {
            type,
            deepLink: deepLink || "",
            webLink: webLink || "",
            relatedId: relatedId ? relatedId.toString() : "",
          }
        });
      }
    }

    // 4. Handle Email (gated by emailNotification preference)
    if (settings.emailNotification) {
      // TODO: Integrate Email Service (e.g. SendGrid / Nodemailer)
      console.log(`[Notification] Email queued for ${recipient} (Placeholder)`);
    }

    // 5. Handle WhatsApp (gated by whatsappNotification preference)
    if (settings.whatsappNotification) {
      // TODO: Integrate WhatsApp Service (e.g. Twilio)
      console.log(`[Notification] WhatsApp queued for ${recipient} (Placeholder)`);
    }

    // 6. Handle SMS (gated by smsNotification preference)
    if (settings.smsNotification) {
      // TODO: Integrate SMS Service (e.g. Twilio / Vonage)
      console.log(`[Notification] SMS queued for ${recipient} (Placeholder)`);
    }

    console.log(
      `[Notification] Processed for user: ${recipient} | type: ${type} | channels: [In-App: ${!!settings.inAppNotification}, Push: ${!!settings.pushNotification}, Email: ${!!settings.emailNotification}]`
    );
  } catch (error) {
    console.error("[Notification] Processor error:", error);
    throw error; // Let BullMQ retry the job
  }
};

// Start processing
registerWorker("notificationQueue", notificationProcessor);

// ─────────────────────────────────────────────
// Core: Add a notification to the queue
// ─────────────────────────────────────────────
/**
 * Low-level queue helper. All named helpers below call this.
 */
const queueNotification = async (payload, opts = {}) => {
  try {
    await addJob(notificationQueue, payload, opts);
    return resultDb(SUCCESS, { message: "Notification queued successfully" });
  } catch (error) {
    console.error("[Notification] Error queuing notification:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

// ─────────────────────────────────────────────
// Named Helpers (called by controllers)
// Fire-and-forget logic.
// ─────────────────────────────────────────────

/**
 * Notify recipient of a new message.
 */
const notifyChat = (senderId, recipientId, senderName, chatId, messageContent) => {
  return queueNotification({
    recipient: recipientId,
    sender: senderId,
    type: "CHAT",
    title: `New Message from ${senderName}`,
    message: messageContent || "Sent you a message",
    relatedId: chatId,
    onModel: "Chat",
    deepLink: `/chat/${chatId}`,
    webLink: `/chat/${chatId}`,
  });
};

/**
 * Notify a user that someone followed them.
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
    webLink: `/profile/${sender}`,
  });
};

/**
 * Booking Confirmed
 */
const notifyBookingConfirmed = (recipient, bookingType, itemTitle, transactionId) => {
  return queueNotification({
    recipient,
    sender: null,
    type: bookingType === "EVENT" ? "EVENT" : "COURSE",
    title: "Booking Confirmed 🎟️",
    message: `Your booking for "${itemTitle}" has been confirmed!`,
    relatedId: transactionId,
    deepLink: `/tickets/${transactionId}`,
    webLink: `/bookings`,
  });
};

/**
 * Organizer: New Booking
 */
const notifyOrganizerNewBooking = (organizerId, buyerName, bookingType, itemTitle, itemId) => {
  return queueNotification({
    recipient: organizerId,
    type: bookingType === "EVENT" ? "EVENT" : "COURSE",
    title: "New Booking Received 🎉",
    message: `${buyerName} booked your ${bookingType === "EVENT" ? "event" : "course"} "${itemTitle}".`,
    relatedId: itemId,
    onModel: bookingType === "EVENT" ? "Event" : "Course",
    deepLink: `/${bookingType === "EVENT" ? "events" : "courses"}/${itemId}`,
    webLink: `/${bookingType === "EVENT" ? "events" : "courses"}/${itemId}`,
  });
};

/**
 * Comment notifications
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
    webLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Reply notifications
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
    webLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Organizer Verification Result
 */
const notifyVerificationResult = (organizerId, action, reason) => {
  const approved = action === "approve";
  return queueNotification({
    recipient: organizerId,
    type: "USER",
    title: approved ? "Verification Approved ✅" : "Verification Rejected ❌",
    message: approved
      ? "Your verification document has been approved. You are now a verified organizer on Bondy!"
      : `Your verification document was rejected. Reason: ${reason || "Please contact support for details."}`,
    deepLink: "/profile/verification",
    webLink: "/profile",
  });
};

/**
 * Payout Result
 */
const notifyPayoutResult = (organizerId, status, amount, payoutId, adminNote) => {
  const approved = status === "approved";
  return queueNotification({
    recipient: organizerId,
    type: "PAYOUT",
    title: approved ? "Payout Approved 💸" : "Payout Rejected",
    message: approved
      ? `Your payout request of ₮${amount?.toLocaleString()} has been approved and is being processed.`
      : `Your payout request of ₮${amount?.toLocaleString()} was rejected. ${adminNote ? `Note: ${adminNote}` : "Please contact support for details."}`,
    relatedId: payoutId,
    onModel: "Payout",
    deepLink: "/earnings",
    webLink: "/earnings",
  });
};

/**
 * Referral Reward
 */
const notifyReferralReward = (referrerId, rewardAmount, referreeName, referralId) => {
  return queueNotification({
    recipient: referrerId,
    type: "SYSTEM",
    title: "Referral Reward Credited! 🎉",
    message: `You earned ₮${rewardAmount?.toLocaleString()} because your referral ${referreeName} was successfully verified!`,
    relatedId: referralId,
    deepLink: "/earnings",
    webLink: "/earnings",
  });
};

/**
 * Promotion Active
 */
const notifyPromotion = (organizerId, entityModel, entityTitle, entityId, durationInDays) => {
  return queueNotification({
    recipient: organizerId,
    type: entityModel === "Event" ? "EVENT" : "COURSE",
    title: "Promotion Activated 🚀",
    message: `Your ${entityModel === "Event" ? "event" : "course"} "${entityTitle}" is now actively featured for ${durationInDays} days!`,
    relatedId: entityId,
    onModel: entityModel,
    deepLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
    webLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Promotion Expired
 */
const notifyPromotionExpiry = (organizerId, entityModel, entityTitle, entityId) => {
  return queueNotification({
    recipient: organizerId,
    type: "SYSTEM",
    title: `${entityModel} Promotion Expired`,
    message: `Your ${entityModel.toLowerCase()}'s featured promotion for "${entityTitle}" has ended. Promote again to stay on top!`,
    relatedId: entityId,
    onModel: entityModel,
    deepLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
    webLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Notify Organizer about new Review
 */
const notifyNewReview = (organizerId, reviewerName, entityModel, entityId, rating) => {
  return queueNotification({
    recipient: organizerId,
    type: "SYSTEM",
    title: "New Review Received ⭐",
    message: `${reviewerName} gave a ${rating}-star review on your ${entityModel.toLowerCase()}.`,
    relatedId: entityId,
    onModel: entityModel,
    deepLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
    webLink: `/${entityModel === "Event" ? "events" : "courses"}/${entityId}`,
  });
};

/**
 * Notify User about Support Ticket Update
 */
const notifySupportTicketUpdate = (userId, ticketId, status) => {
  return queueNotification({
    recipient: userId,
    type: "SYSTEM",
    title: "Support Ticket Update",
    message: `Your support ticket ${ticketId} has been updated to "${status}".`,
    relatedId: ticketId,
    onModel: "SupportTicket",
    deepLink: `/support/${ticketId}`,
    webLink: `/support`,
  });
};

/**
 * Notify User about Report Resolution
 */
const notifyReportResolved = (userId, reportId, status) => {
  return queueNotification({
    recipient: userId,
    type: "SYSTEM",
    title: "Report Resolved",
    message: `The report you submitted has been ${status.toLowerCase()}. Thank you for keeping Bondy safe.`,
    relatedId: reportId,
    onModel: "Report",
    deepLink: "/settings", 
    webLink: "/settings",
  });
};

/**
 * Notify Attendees about Event Changes
 */
const notifyEventChange = (attendeeId, eventTitle, eventId, changeDetail) => {
  return queueNotification({
    recipient: attendeeId,
    type: "EVENT",
    title: `Update on ${eventTitle}`,
    message: `Important update regarding the event: ${changeDetail}`,
    relatedId: eventId,
    onModel: "Event",
    deepLink: `/events/${eventId}`,
    webLink: `/events/${eventId}`,
  });
};

/**
 * Notify Attendees about Course Changes
 */
const notifyCourseChange = (attendeeId, courseTitle, courseId, changeDetail) => {
  return queueNotification({
    recipient: attendeeId,
    type: "COURSE",
    title: `Update on ${courseTitle}`,
    message: `Important update regarding the course: ${changeDetail}`,
    relatedId: courseId,
    onModel: "Course",
    deepLink: `/courses/${courseId}`,
    webLink: `/courses/${courseId}`,
  });
};

// ─────────────────────────────────────────────
// Fetch / CRUD operations (used by controller)
// ─────────────────────────────────────────────

const getUserNotifications = async (payload) => {
  try {
    const { recipient, page = 1, limit = 10, type, isRead } = payload;
    let query = { recipient, isDeleted: false };
    if (type) query.type = type;
    if (isRead !== undefined) query.isRead = isRead;

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .populate("sender", "firstName lastName profileImage isVerified")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const totalUnread = await Notification.countDocuments({
      recipient,
      isRead: false,
      isDeleted: false,
    });

    return resultDb(SUCCESS, {
      notifications,
      total,
      totalPages: Math.ceil(total / limit),
      page: parseInt(page),
      limit: parseInt(limit),
      totalUnread,
    });
  } catch (error) {
    console.error("[Notification] Error fetching notifications:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

const markRead = async (notificationId, recipient) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient },
      { isRead: true },
      { new: true }
    );
    if (!notification) return resultDb(NOT_FOUND, "Notification not found");
    return resultDb(SUCCESS, notification);
  } catch (error) {
    console.error("[Notification] Error marking read:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

const markAllRead = async (recipient) => {
  try {
    await Notification.updateMany({ recipient, isRead: false }, { isRead: true });
    return resultDb(SUCCESS, { message: "All notifications marked as read" });
  } catch (error) {
    console.error("[Notification] Error marking all read:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

const deleteNotification = async (notificationId, recipient) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient },
      { isDeleted: true },
      { new: true }
    );
    if (!notification) return resultDb(NOT_FOUND, "Notification not found");
    return resultDb(SUCCESS, { message: "Notification deleted successfully" });
  } catch (error) {
    console.error("[Notification] Error deleting notification:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

const deleteMultipleNotifications = async (notificationIds, recipient) => {
  try {
    const result = await Notification.updateMany(
      { _id: { $in: notificationIds }, recipient },
      { isDeleted: true }
    );
    return resultDb(SUCCESS, {
      message: `${result.modifiedCount} notifications deleted successfully`,
      deletedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("[Notification] Error deleting multiple notifications:", error);
    return resultDb(SERVER_ERROR_CODE, DATA_NULL);
  }
};

module.exports = {
  queueNotification,
  notifyChat,
  notifyFollow,
  notifyBookingConfirmed,
  notifyOrganizerNewBooking,
  notifyCommentOnEntity,
  notifyReplyToComment,
  notifyVerificationResult,
  notifyPayoutResult,
  notifyReferralReward,
  notifyPromotion,
  notifyPromotionExpiry,
  notifyNewReview,
  notifySupportTicketUpdate,
  notifyReportResolved,
  notifyEventChange,
  notifyCourseChange,
  getUserNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  deleteMultipleNotifications,
};
