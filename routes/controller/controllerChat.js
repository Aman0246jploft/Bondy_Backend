const router = require("express").Router();
const Chat = require("../../db/models/Chat");
const Message = require("../../db/models/Message");
const User = require("../../db/models/User");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const HTTP_STATUS = require("../../utils/statusCode");
const constantsMessage = require("../../utils/constantsMessage");
const CONSTANTS = require("../../utils/constants");
const upload = require("../../middlewares/multer"); // Assuming multer setup exists
const { uploadFile } = require("../services/validations/chatValidation");

// 1. Upload File (HTTP)
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.NO_FILE_UPLOADED,
        null,
      );
    }
    // Construct public URL - adjust based on your set up (local vs cloudinary)
    // Assuming local storage based on index.js static serve
    const fileUrl = `${process.env.BASE_URL}/uploads/${req.file.filename}`;

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FILE_UPLOADED, {
      fileUrl,
      fileType: req.file.mimetype,
    });
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      constantsMessage.FILE_UPLOAD_ERROR,
      error,
    );
  }
});

// 2. Get Chat List - MOVED TO SOCKET
// router.get("/list", async (req, res) => {
//     try {
//         const { error, value } = chatList.validate(req.query);
//         if (error) {
//             return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, error.details[0].message);
//         }

//         const { page = 1, limit = 20 } = value;
//         const skip = (page - 1) * limit;
//         const userId = req.user._id || req.user.id;

//         const chats = await Chat.find({ participants: userId })
//             .populate("participants", "firstName lastName profileImage")
//             .sort({ "lastMessage.createdAt": -1 })
//             .skip(skip)
//             .limit(limit);

//         // Transform to add unreadCount for current user
//         const chatsWithCount = chats.map(chat => {
//             const chatObj = chat.toObject();
//             chatObj.unreadCount = chat.unreadCounts.get(userId.toString()) || 0;
//             return chatObj;
//         });

//         return apiSuccessRes(HTTP_STATUS.OK, res, "Chat list fetched", chatsWithCount);
//     } catch (error) {
//         return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, "Error fetching chat list", error);
//     }
// });

// 3. Get Messages - MOVED TO SOCKET
// router.get("/message/list", async (req, res) => {
//     try {
//         const { error, value } = messageList.validate(req.query);
//         if (error) {
//             return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, error.details[0].message);
//         }

//         const { chatId, page = 1, limit = 50 } = value;
//         const skip = (page - 1) * limit;
//         const userId = req.user._id || req.user.id;

//         // Check if user is participant
//         const chat = await Chat.findOne({ _id: chatId, participants: userId });
//         if (!chat) {
//             return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Chat not found or access denied");
//         }

//         const messages = await Message.find({
//             chat: chatId,
//             isDeletedForEveryone: false,
//             deletedFor: { $ne: userId } // Not in deletedFor array
//         })
//             .populate("sender", "firstName lastName profileImage")
//             .sort({ createdAt: -1 }) // Latest first
//             .skip(skip)
//             .limit(limit);

//         // Reset unread count for this user in background
//         if (chat.unreadCounts.get(userId.toString()) > 0) {
//             chat.unreadCounts.set(userId.toString(), 0);
//             await chat.save();
//         }

//         return apiSuccessRes(HTTP_STATUS.OK, res, "Messages fetched", messages);
//     } catch (error) {
//         return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, "Error fetching messages", error);
//     }
// });

// 4. Delete Message - MOVED TO SOCKET
// router.post("/message/delete", async (req, res) => {
//     try {
//         const { error, value } = deleteMessage.validate(req.body);
//         if (error) {
//             return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, error.details[0].message);
//         }

//         const { messageId, deleteType } = value;
//         const userId = req.user._id || req.user.id;

//         const message = await Message.findById(messageId);
//         if (!message) {
//             return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.CONTACT_NOT_FOUND);
//         }

//         // Verify ownership for 'everyone' delete
//         if (deleteType === "everyone") {
//             if (message.sender.toString() !== userId.toString()) {
//                 return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, constantsMessage.CONTACT_ID_REQUIRED);
//             }
//             message.isDeletedForEveryone = true;
//         } else {
//             // Delete for me: add to deletedFor array if not already there
//             if (!message.deletedFor.includes(userId)) {
//                 message.deletedFor.push(userId);
//             }
//         }

//         await message.save();
//         return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.MESSAGE_SENT);

//     } catch (error) {
//         return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, "Error deleting message", error);
//     }
// });

module.exports = router;
