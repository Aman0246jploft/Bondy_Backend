const admin = require("./createFirebaseUser");
async function sendFirebaseNotification(data) {
  let { token, title, body, imageUrl, data: payloadData } = data;
  try {
    const message = {
      token: token,
      notification: {
        title: title,
        body: body,
        image: imageUrl || undefined,
      },
      data: payloadData || {},
      android: {
        priority: "high",
        notification: {
          sound: "default",
          priority: "high",
          channelId: "default_channel",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "mutable-content": 1, // Enable rich media (images) on iOS
          },
        },
        headers: {
          "apns-priority": "10", // Deliver immediately
        },
      },
    };

    await admin.messaging().send(message);
  } catch (error) {
    console.error("Error sending notification:", error.message);
    // Handle the error appropriately, such as logging or retry logic
  }
}

module.exports = {
  sendFirebaseNotification,
};