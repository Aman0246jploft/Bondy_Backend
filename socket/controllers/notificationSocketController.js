const notificationService = require("../../routes/services/serviceNotification");

const notificationSocketController = (io, socket) => {
    const userObj = socket.user;
    const userId = (userObj.userId || userObj._id || userObj.id).toString();

    // Ensure user joins their private room for notifications
    socket.join(userId);

    // 1. Emit initial unread count on connection
    const sendInitialCount = async () => {
        try {
            const count = await notificationService.getUnreadCount(userId);
            socket.emit("unread_notification_count", { count });
        } catch (err) {
            console.error("[Socket/Notification] Error sending initial count:", err);
        }
    };

    sendInitialCount();

    // 2. Listen for manual count requests
    socket.on("get_unread_notification_count", async (data, ack) => {
        try {
            const count = await notificationService.getUnreadCount(userId);
            const payload = { status: "ok", count };

            if (typeof ack === "function") {
                ack(payload);
            } else {
                socket.emit("unread_notification_count", payload);
            }
        } catch (err) {
            console.error("[Socket/Notification] Error fetching unread count:", err);
            if (typeof ack === "function") {
                ack({ status: "error", message: "Failed to fetch count" });
            }
        }
    });
};

module.exports = { notificationSocketController };
