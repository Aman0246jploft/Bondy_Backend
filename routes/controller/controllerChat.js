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


module.exports = router;
