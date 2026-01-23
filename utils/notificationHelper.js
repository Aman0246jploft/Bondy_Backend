const { queueNotification } = require("../routes/services/serviceNotification");

/**
 * Reusable utility to send notifications from anywhere in the app.
 * Adds the notification to the Bull queue for asynchronous processing.
 * 
 * @param {Object} params
 * @param {String} params.recipient - User ID of the receiver
 * @param {String} params.sender - User ID of the sender (optional)
 * @param {String} params.type - Enum: [EVENT, COURSE, CHAT, FOLLOW, USER, SYSTEM]
 * @param {String} params.title - Notification title
 * @param {String} params.message - Notification body content
 * @param {String} params.relatedId - ID of the related entity (Event, Course, etc.)
 * @param {String} params.onModel - Model name [Event, Course, User, Chat]
 * @param {Object} params.metadata - Extra data (e.g. imageUrl)
 * @param {String} params.deepLink - Direct path for frontend (e.g. "/event/123")
 */
const sendAppNotification = async ({
    recipient,
    sender = null,
    type,
    title,
    message,
    relatedId = null,
    onModel = null,
    metadata = {},
    deepLink = null,
}) => {
    try {
        const payload = {
            recipient,
            sender,
            type,
            title,
            message,
            relatedId,
            onModel,
            metadata,
            deepLink,
        };

        // Add to Bull queue via service
        await queueNotification(payload);

        return true;
    } catch (error) {
        console.error("Error in sendAppNotification helper:", error);
        return false;
    }
};

module.exports = {
    sendAppNotification,
};
