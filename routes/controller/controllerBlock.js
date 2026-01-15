const express = require("express");
const router = express.Router();
const { Block } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const perApiLimiter = require("../../middlewares/rateLimiter");

// Block a user
const blockUser = async (req, res) => {
    try {
        const fromUser = req.user.userId;
        const { toUser } = req.body;

        if (fromUser === toUser) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "You cannot block yourself.");
        }

        const existingBlock = await Block.findOne({ fromUser, toUser });
        if (existingBlock) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "User already blocked.");
        }

        const newBlock = new Block({ fromUser, toUser });
        await newBlock.save();

        return apiSuccessRes(HTTP_STATUS.OK, res, "User blocked successfully.", newBlock);
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message, error.message);
    }
};

// Unblock a user
const unblockUser = async (req, res) => {
    try {
        const fromUser = req.user.userId;
        const { toUser } = req.body;

        const deletedBlock = await Block.findOneAndDelete({ fromUser, toUser });

        if (!deletedBlock) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "User is not blocked.");
        }

        return apiSuccessRes(HTTP_STATUS.OK, res, "User unblocked successfully.", null);
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message, error.message);
    }
};

// Get Blocked Users
const getBlockedUsers = async (req, res) => {
    try {
        const userId = req.user.userId;
        const pageNo = parseInt(req.query.pageNo) || 1;
        const size = parseInt(req.query.size) || 10;
        const skip = (pageNo - 1) * size;

        const total = await Block.countDocuments({ fromUser: userId });
        const blockedUsers = await Block.find({ fromUser: userId })
            .populate("toUser", "firstName lastName profileImage email")
            .skip(skip)
            .limit(size)
            .lean();

        return apiSuccessRes(HTTP_STATUS.OK, res, "Blocked users fetched successfully.", {
            blockedUsers,
            total,
            pageNo,
            size,
        });
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message, error.message);
    }
};

const validateRequest = require("../../middlewares/validateRequest");
const { blockUserSchema } = require("../services/validations/adminValidations");

router.post("/create", perApiLimiter(), validateRequest(blockUserSchema), blockUser);
router.post("/delete", perApiLimiter(), validateRequest(blockUserSchema), unblockUser);
router.get("/list", perApiLimiter(), getBlockedUsers);

module.exports = router;
