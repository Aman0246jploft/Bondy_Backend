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
        constantsMessage.CANNOT_FOLLOW_SELF,
      );
    }

    const existingFollow = await Follow.findOne({ fromUser, toUser });
    if (existingFollow) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.ALREADY_FOLLOWING,
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
      constantsMessage.FOLLOW_SUCCESS,
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
        constantsMessage.NOT_FOLLOWING,
      );
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.UNFOLLOW_SUCCESS,
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

const { roleId, userRole } = require("../../utils/Role");

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
        "firstName lastName profileImage email isVerified roleId",
      )
      .populate(
        "toUser",
        "firstName lastName profileImage email isVerified roleId",
      )
      .skip(skip)
      .limit(size)
      .lean();

    // Determine which followers the logged-in user is following
    const loginUserId = req.user ? req.user.userId : null;
    let followedUserIds = new Set();
    if (loginUserId) {
      const followerIds = followers.map((f) => f.fromUser?._id).filter(Boolean);
      const follows = await Follow.find({
        fromUser: loginUserId,
        toUser: { $in: followerIds },
      })
        .select("toUser")
        .lean();
      followedUserIds = new Set(follows.map((f) => f.toUser.toString()));
    }

    // Format profile images and add isFollowed status
    followers.forEach((f) => {
      if (f.fromUser) {
        if (f.fromUser.profileImage) {
          f.fromUser.profileImage = formatResponseUrl(f.fromUser.profileImage);
        }
        f.fromUser.userRole = userRole[f.fromUser.roleId] || "GUEST";
        f.isFollowed = followedUserIds.has(f.fromUser._id.toString());
      } else {
        f.isFollowed = false;
      }

      if (f.toUser) {
        if (f.toUser.profileImage) {
          f.toUser.profileImage = formatResponseUrl(f.toUser.profileImage);
        }
        f.toUser.userRole = userRole[f.toUser.roleId] || "GUEST";
      }
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.FOLLOWERS_FETCHED,
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
      .populate(
        "fromUser",
        "firstName lastName profileImage email isVerified roleId",
      )
      .populate(
        "toUser",
        "firstName lastName profileImage email isVerified roleId",
      )
      .skip(skip)
      .limit(size)
      .lean();

    // Determine which of the followed users the logged-in user is also following
    const loginUserId = req.user ? req.user.userId : null;
    let followedUserIds = new Set();
    if (loginUserId) {
      const followingIds = following.map((f) => f.toUser?._id).filter(Boolean);
      const follows = await Follow.find({
        fromUser: loginUserId,
        toUser: { $in: followingIds },
      })
        .select("toUser")
        .lean();
      followedUserIds = new Set(follows.map((f) => f.toUser.toString()));
    }

    // Format profile images and add isFollowed status
    following.forEach((f) => {
      if (f.fromUser) {
        if (f.fromUser.profileImage) {
          f.fromUser.profileImage = formatResponseUrl(f.fromUser.profileImage);
        }
        f.fromUser.userRole = userRole[f.fromUser.roleId] || "GUEST";
      }

      if (f.toUser) {
        if (f.toUser.profileImage) {
          f.toUser.profileImage = formatResponseUrl(f.toUser.profileImage);
        }
        f.toUser.userRole = userRole[f.toUser.roleId] || "GUEST";
        f.isFollowed = followedUserIds.has(f.toUser._id.toString());
      } else {
        f.isFollowed = false;
      }
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.FOLLOWING_FETCHED,
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
