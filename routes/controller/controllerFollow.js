const express = require("express");
const router = express.Router();
const { Follow, User } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { notifyFollow } = require("../services/serviceNotification");

// Follow a user
const followUser = async (req, res) => {
  try {
    const fromUser = req.user.userId;
    const { toUser } = req.body;

    if (fromUser === toUser) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "You cannot follow yourself.",
      );
    }

    const existingFollow = await Follow.findOne({ fromUser, toUser });
    if (existingFollow) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Already following this user.",
      );
    }

    const newFollow = new Follow({ fromUser, toUser });
    await newFollow.save();

    // Queue a FOLLOW notification (non-blocking)
    const follower = await User.findById(fromUser).select("firstName lastName");
    if (follower) {
      notifyFollow(
        fromUser,
        toUser,
        `${follower.firstName} ${follower.lastName}`
      ).catch((err) => console.error("[Notification] notifyFollow error:", err));
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "User followed successfully.",
      newFollow,
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

// Unfollow a user
const unfollowUser = async (req, res) => {
  try {
    const fromUser = req.user.userId;
    const { toUser } = req.body;

    const deletedFollow = await Follow.findOneAndDelete({ fromUser, toUser });

    if (!deletedFollow) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "You are not following this user.",
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "User unfollowed successfully.",
      null,
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

// Get Followers (users who follow me)
const getFollowers = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId;
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const total = await Follow.countDocuments({ toUser: userId });
    const followers = await Follow.find({ toUser: userId })
      .populate(
        "fromUser",
        "firstName lastName profileImage email  isVerified",
      )
      .skip(skip)
      .limit(size)
      .lean();

    // Format profile images
    followers.forEach((f) => {
      if (f.fromUser && f.fromUser.profileImage) {
        f.fromUser.profileImage = formatResponseUrl(f.fromUser.profileImage);
      }
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Followers fetched successfully.",
      {
        followers,
        total,
        pageNo,
        size,
      },
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

// Get Following (users I follow)
const getFollowing = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.userId;
    const pageNo = parseInt(req.query.pageNo) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (pageNo - 1) * size;

    const total = await Follow.countDocuments({ fromUser: userId });
    const following = await Follow.find({ fromUser: userId })
      .populate("toUser", "firstName lastName profileImage email isVerified")
      .skip(skip)
      .limit(size)
      .lean();

    // Format profile images
    following.forEach((f) => {
      if (f.toUser && f.toUser.profileImage) {
        f.toUser.profileImage = formatResponseUrl(f.toUser.profileImage);
      }
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Following list fetched successfully.",
      {
        following,
        total,
        pageNo,
        size,
      },
    );
  } catch (error) {
    return apiErrorRes(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      res,
      error.message,
      error.message,
    );
  }
};

const validateRequest = require("../../middlewares/validateRequest");
const {
  followUserSchema,
} = require("../services/validations/adminValidations");

router.post(
  "/create",
  perApiLimiter(),
  validateRequest(followUserSchema),
  followUser,
);
router.post(
  "/delete",
  perApiLimiter(),
  validateRequest(followUserSchema),
  unfollowUser,
);
router.get("/followers", perApiLimiter(), getFollowers);
router.get("/following", perApiLimiter(), getFollowing);

module.exports = router;
