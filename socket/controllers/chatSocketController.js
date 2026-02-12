const Chat = require("../../db/models/Chat");
const Message = require("../../db/models/Message");
const {
  sendMessageSchema,
  joinChatSchema,
  chatListSchema,
  messageListSchema,
  deleteMessageSchema,
} = require("../validations/socketValidation");

const onlineUsers = new Map(); // userId -> socketId

// Helper to get socketId by userId
const getSocketId = (userId) => onlineUsers.get(userId.toString());

const chatSocketController = (io, socket) => {
  const userObj = socket.user;
  const userId = (userObj.userId || userObj._id || userObj.id).toString();

  // 1. Handle Online Status
  onlineUsers.set(userId, socket.id);
  io.emit("user_online", { userId });

  // 2. Disconnect
  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("user_offline", { userId });
  });
  console.log("onlineUsers", onlineUsers);
  // 3. Join Chat Room
  socket.on("join_chat", ({ chatId }) => {
    socket.join(chatId);
    console.log(`User ${userId} joined chat ${chatId}`);
  });

  // 4. Send Message
  socket.on("send_message", async (data, ack) => {
    const { error, value } = sendMessageSchema.validate(data);
    if (error) {
      if (typeof ack === "function")
        return ack({ status: "error", message: error.details[0].message });
      return;
    }

    let { chatId, receiverId, content, fileUrl, fileType } = value;

    try {
      let chat;

      // Scenario A: ChatId provided
      if (chatId) {
        chat = await Chat.findById(chatId);
        if (!chat) {
          if (typeof ack === "function")
            ack({ status: "error", message: "Chat not found" });
          return;
        }
      }
      // Scenario B: No ChatId, but ReceiverId provided (Find or Create)
      else if (receiverId) {
        // Check self-message
        if (receiverId === userId) {
          if (typeof ack === "function")
            ack({ status: "error", message: "Cannot chat with yourself" });
          return;
        }

        // Find existing chat with these 2 participants
        chat = await Chat.findOne({
          participants: { $all: [userId, receiverId], $size: 2 },
        });

        if (!chat) {
          // Create new chat
          chat = await Chat.create({
            participants: [userId, receiverId],
            lastMessage: {
              content: content || "File",
              sender: userId,
              createdAt: new Date(),
            },
            unreadCounts: {
              [receiverId]: 1, // Start with 1 unread for receiver
              [userId]: 0,
            },
          });

          // IMPORTANT: Join the sender to this new room immediately
          socket.join(chat._id.toString());

          // Use chatId for subsequent logic
          chatId = chat._id.toString();

          // If receiver is online, force them to join the room
          const receiverSocketId = getSocketId(receiverId);
          if (receiverSocketId) {
            const receiverSocket = io.sockets.sockets.get(receiverSocketId);
            if (receiverSocket) {
              receiverSocket.join(chatId);
              // Also emit new_chat so they know a new room exists
              io.to(receiverSocketId).emit("new_chat", chat);
            }
          }
        } else {
          chatId = chat._id.toString();
        }
      }

      // Block Check
      if (chat.blockedBy && chat.blockedBy.length > 0) {
        if (typeof ack === "function")
          ack({
            status: "error",
            message: "You cannot message in this conversation.",
          });
        return;
      }

      // Create Message
      const newMessage = await Message.create({
        chat: chatId,
        sender: userId,
        content,
        fileUrl,
        fileType,
      });

      // Update Chat (lastMessage)
      chat.lastMessage = {
        content: content || "File",
        sender: userId,
        createdAt: new Date(),
      };

      // Increment unread for OTHERS
      chat.participants.forEach((pId) => {
        if (pId.toString() !== userId) {
          const key = pId.toString();
          const current = chat.unreadCounts.get(key) || 0;
          chat.unreadCounts.set(key, current + 1);
        }
      });

      await chat.save();
      const populatedMessage = await newMessage.populate(
        "sender",
        "firstName lastName profileImage",
      );

      // Populate chat to send as update
      const populatedChat = await Chat.findById(chatId).populate(
        "participants",
        "firstName lastName profileImage",
      );

      // Format chat object with unread counts and online status
      const formatChatForUser = (chatDoc, targetUserId) => {
        const chatObj = chatDoc.toObject();
        chatObj.unreadCount =
          chatDoc.unreadCounts.get(targetUserId.toString()) || 0;
        chatObj.participants = chatObj.participants.map((p) => {
          p.isOnline = onlineUsers.has(p._id.toString());
          return p;
        });
        return chatObj;
      };

      // Emit 'update_chat_list' to all participants individually to ensure correct unread counts
      chat.participants.forEach((pId) => {
        const pIdStr = pId.toString();
        const pSocketId = getSocketId(pIdStr);
        if (pSocketId) {
          const formattedChat = formatChatForUser(populatedChat, pIdStr);
          io.to(pSocketId).emit("update_chat_list", formattedChat);
        }
      });

      // Emit to Room (standard message receive)
      socket.to(chatId).emit("receive_message", populatedMessage);

      if (typeof ack === "function") {
        ack({ status: "ok", data: populatedMessage, chatId: chatId }); // Return chatId just in case
      }
    } catch (err) {
      console.error("SendMessage Error:", err);
      if (typeof ack === "function")
        ack({ status: "error", message: "Internal Server Error" });
    }
  });

  // 5. Typing Indicator
  socket.on("typing", ({ chatId }) => {
    socket.to(chatId).emit("typing", { chatId, userId });
  });

  socket.on("stop_typing", ({ chatId }) => {
    socket.to(chatId).emit("stop_typing", { chatId, userId });
  });

  // 6. Get Chat List (Socket)
  socket.on("get_chat_list", async (data, ack) => {
    const { error, value } = chatListSchema.validate(data || {});
    if (error) {
      const payload = { status: "error", message: error.details[0].message };

      if (typeof ack === "function") ack(payload);
      else socket.emit("get_chat_list_response", payload);

      return;
    }

    const { page = 1, limit = 20 } = value;
    const skip = (page - 1) * limit;

    try {
      const chats = await Chat.find({ participants: userId })
        .populate("participants", "firstName lastName profileImage")
        .sort({ "lastMessage.createdAt": -1 })
        .skip(skip)
        .limit(limit);

      // const chatsWithCount = chats.map((chat) => {
      //   const chatObj = chat.toObject();
      //   chatObj.unreadCount = chat.unreadCounts.get(userId.toString()) || 0;

      //   chatObj.participants = chatObj.participants.map((p) => ({
      //     ...p,
      //     isOnline: onlineUsers.has(p._id.toString()),
      //   }));

      //   return chatObj;
      // });
      const chatsWithCount = chats.map((chat) => {
        const chatObj = chat.toObject();
        const currentUserId = userId.toString();

        chatObj.unreadCount = chat.unreadCounts.get(currentUserId) || 0;

        chatObj.participants = chatObj.participants.map((p) => ({
          ...p,
          isOnline: onlineUsers.has(p._id.toString()),
        }));

        // ✅ ADD THIS (important)
        chatObj.otherUser = chatObj.participants.find(
          (p) => p._id.toString() !== currentUserId,
        );

        return chatObj;
      });

      const payload = { status: "ok", data: chatsWithCount };

      if (typeof ack === "function") {
        ack(payload); // real clients
      } else {
        socket.emit("get_chat_list_response", payload); // Postman
      }
    } catch (err) {
      console.error("GetChatList Error", err);

      const payload = { status: "error", message: "Error fetching chats" };

      if (typeof ack === "function") ack(payload);
      else socket.emit("get_chat_list_response", payload);
    }
  });

  // 7. Get Message List (Socket)
  socket.on("get_message_list", async (data, ack) => {
    const { error, value } = messageListSchema.validate(data);
    if (error) {
      const payload = { status: "error", message: error.details[0].message };

      if (typeof ack === "function") ack(payload);
      else socket.emit("get_message_list_response", payload);
      return;
    }

    const { chatId, page = 1, limit = 50 } = value;

    try {
      const chat = await Chat.findOne({ _id: chatId, participants: userId });
      if (!chat) {
        const payload = { status: "error", message: "Chat not found" };

        if (typeof ack === "function") ack(payload);
        else socket.emit("get_message_list_response", payload);
        return;
      }

      const messages = await Message.find({
        chat: chatId,
        isDeletedForEveryone: false,
        deletedFor: { $ne: userId },
      })
        .populate("sender", "firstName lastName profileImage")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      chat.unreadCounts.set(userId.toString(), 0);
      await chat.save();

      const payload = { status: "ok", data: messages };

      if (typeof ack === "function") ack(payload);
      else socket.emit("get_message_list_response", payload);
    } catch (err) {
      const payload = { status: "error", message: "Error fetching messages" };

      if (typeof ack === "function") ack(payload);
      else socket.emit("get_message_list_response", payload);
    }
  });

  // 8. Delete Message (Socket)
  socket.on("delete_message", async (data, ack) => {
    const { error, value } = deleteMessageSchema.validate(data);
    if (error) {
      if (typeof ack === "function")
        ack({ status: "error", message: error.details[0].message });
      return;
    }

    const { messageId, deleteType } = value;

    try {
      const message = await Message.findById(messageId);
      if (!message) {
        if (typeof ack === "function")
          ack({ status: "error", message: "Message not found" });
        return;
      }

      if (deleteType === "everyone") {
        if (message.sender.toString() !== userId) {
          if (typeof ack === "function")
            ack({ status: "error", message: "Unauthorized" });
          return;
        }
        message.isDeletedForEveryone = true;
      } else {
        if (!message.deletedFor.includes(userId)) {
          message.deletedFor.push(userId);
        }
      }

      await message.save();

      // Notify room if deleted for everyone
      if (deleteType === "everyone") {
        io.to(message.chat.toString()).emit("message_deleted", { messageId });
      }

      if (typeof ack === "function") ack({ status: "ok" });
    } catch (err) {
      console.error("DeleteMessage Error", err);
      if (typeof ack === "function")
        ack({ status: "error", message: "Error deleting message" });
    }
  });
};

module.exports = { chatSocketController, onlineUsers };
