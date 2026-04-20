const express = require("express");
const router = express.Router();
const { Comment, Event, User, Course } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
  toObjectId,
} = require("../../utils/globalFunction");
const {
  createCommentSchema,
  updateCommentSchema,
  getCommentsSchema,
} = require("../services/validations/commentValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { userRole } = require("../../utils/Role");
const {
  notifyCommentOnEntity,
  notifyReplyToComment,
} = require("../services/serviceNotification");
// const checkRole = require("../../middlewares/checkRole"); // Enable if needed
// const { roleId } = require("../../utils/Role");

// Create Comment or Reply
// const createComment = async (req, res) => {
//   try {
//     const { content, entityId, entityModel, parentCommentId } = req.body;
//     const userId = req.user.userId;

//     let targetModel;
//     if (entityModel === "Event") targetModel = Event;
//     else if (entityModel === "Course") targetModel = Course;
//     else {
//       return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid entity model");
//     }

//     const entity = await targetModel.findById(entityId);
//     if (!entity) {
//       return apiErrorRes(
//         HTTP_STATUS.NOT_FOUND,
//         res,
//         `${entityModel} not found`,
//       );
//     }

//     if (parentCommentId) {
//       const parent = await Comment.findById(parentCommentId);
//       if (!parent) {
//         return apiErrorRes(
//           HTTP_STATUS.NOT_FOUND,
//           res,
//           constantsMessage.PARENT_COMMENT_NOT_FOUND,
//         );
//       }
//     }

//     const newComment = new Comment({
//       content,
//       entityId,
//       entityModel,
//       user: userId,
//       parentComment: parentCommentId || null,
//     });

//     await newComment.save();

//     // Populate user details for immediate display
//     await newComment.populate("user", "firstName lastName profileImage");

//     if (newComment.user && newComment.user.profileImage) {
//       newComment.user.profileImage = formatResponseUrl(
//         newComment.user.profileImage,
//       );
//     }

//     return apiSuccessRes(
//       HTTP_STATUS.CREATED,
//       res,
//       "Comment added successfully",
//       { comment: newComment },
//     );
//   } catch (error) {
//     console.error("Error in createComment:", error);
//     return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
//   }
// };

const createComment = async (req, res) => {
  try {
    const { content, entityId, entityModel, parentCommentId } = req.body;
    const userId = req.user.userId;

    let targetModel;
    if (entityModel === "Event") targetModel = Event;
    else if (entityModel === "Course") targetModel = Course;
    else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_ENTITY_MODEL);
    }

    const entity = await targetModel.findById(entityId);
    if (!entity) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.ENTITY_NOT_FOUND,
      );
    }

    if (parentCommentId) {
      const parent = await Comment.findById(parentCommentId);
      if (!parent) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          constantsMessage.PARENT_COMMENT_NOT_FOUND,
        );
      }
    }

    const newComment = new Comment({
      content,
      entityId,
      entityModel,
      user: userId,
      parentComment: parentCommentId || null,
    });

    await newComment.save();

    // ── Queue notifications (non-blocking) ──────────────────────────────────
    try {
      const commenter = await User.findById(userId).select("firstName lastName");
      const commenterName = commenter ? `${commenter.firstName} ${commenter.lastName}` : "Someone";

      if (parentCommentId) {
        // Reply: notify the parent comment author (skip if replying to own comment)
        const parentComment = await Comment.findById(parentCommentId).select("user");
        if (parentComment && String(parentComment.user) !== String(userId)) {
          notifyReplyToComment(
            String(parentComment.user),
            commenterName,
            entityModel,
            String(entityId),
            String(parentCommentId),
            String(userId)
          ).catch((e) => console.error("[Notification] notifyReplyToComment:", e));
        }
      } else {
        // Top-level comment: notify entity owner (skip if commenter IS the owner)
        const targetModel = entityModel === "Event" ? Event : Course;
        const entityDoc = await targetModel.findById(entityId).select("createdBy eventTitle courseTitle");
        if (entityDoc && String(entityDoc.createdBy) !== String(userId)) {
          const entityTitle = entityDoc.eventTitle || entityDoc.courseTitle || "your post";
          notifyCommentOnEntity(
            String(entityDoc.createdBy),
            commenterName,
            entityModel,
            String(entityId),
            entityTitle,
            String(userId)
          ).catch((e) => console.error("[Notification] notifyCommentOnEntity:", e));
        }
      }
    } catch (notifErr) {
      console.error("[Notification] Comment notification error:", notifErr.message);
    }
    // ───────────────────────────────────────────────────────────────────────

    // 🔥 Fetch newly created comment with same structure as getComments
    const createdComment = await Comment.aggregate([
      {
        $match: {
          _id: newComment._id,
        },
      },

      // Count replies
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "parentComment",
          as: "replies",
        },
      },
      {
        $addFields: {
          totalReplies: { $size: "$replies" },
        },
      },
      {
        $project: {
          replies: 0,
        },
      },

      // Populate user
      {
        $lookup: {
          from: "User", // make sure this matches your actual collection name
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          content: 1,
          entityId: 1,
          entityModel: 1,
          parentComment: 1,
          createdAt: 1,
          totalReplies: 1,
          "user._id": 1,
          "user.firstName": 1,
          "user.lastName": 1,
          "user.profileImage": 1,
          "user.roleId": 1,
        },
      },
    ]);

    let formattedComment = createdComment[0];

    if (formattedComment?.user?.profileImage) {
      formattedComment.user.profileImage = formatResponseUrl(
        formattedComment.user.profileImage,
      );
    }

    if (formattedComment?.user?.roleId) {
      formattedComment.user.userRole =
        userRole[formattedComment.user.roleId] || null;

      delete formattedComment.user.roleId;
    }

    return apiSuccessRes(
      HTTP_STATUS.CREATED,
      res,
      constantsMessage.COMMENT_ADDED,
      { ...formattedComment },
    );
  } catch (error) {
    console.error("Error in createComment:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Comments for an Event
// const getComments = async (req, res) => {
//   try {
//     const { entityId, entityModel, page = 1, limit = 50 } = req.query; // Higher limit for comments usually
//     const skip = (page - 1) * limit;

//     const query = { entityId };

//     // Fetch all comments for the entity (paginated at top level could be tricky if we want full threading)
//     // approach: Fetch flat list and let frontend thread, or fetch top-level and their children.
//     // simpler approach for now: Fetch all for the entity paginated by creation time.

//     // To support "reply on reply", we just need to return the parentComment ID.
//     // The frontend can reconstruct the tree.

//     const comments = await Comment.find(query)
//       .populate("user", "firstName lastName profileImage")
//       .populate("parentComment") // Optional: to confirm parent exists
//       .sort({ createdAt: 1 }) // Oldest first usually for comments
//       .skip(skip)
//       .limit(parseInt(limit))
//       .lean();
//       console.log("Fetched comments11:", query);

//     const totalCount = await Comment.countDocuments(query);

//     // Add totalReplies count to each comment
//     const commentsWithReplies = await Promise.all(
//       comments.map(async (comment) => {
//         const replyCount = await Comment.countDocuments({
//           parentComment: comment._id,
//         });
//         return { ...comment, totalReplies: replyCount };
//       }),
//     );

//     return apiSuccessRes(HTTP_STATUS.OK, res, "Comments fetched successfully", {
//       comments: commentsWithReplies,
//       total: totalCount,
//       page: parseInt(page),
//       limit: parseInt(limit),
//     });
//   } catch (error) {
//     console.error("Error in getComments:", error);
//     return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
//   }
// };

const getComments = async (req, res) => {
  try {
    const { entityId, page = 1, limit = 50 } = req.query;

    const skip = (page - 1) * limit;
    const objectEntityId = toObjectId(entityId);
    console.log(
      "Fetching comments for entityId:",
      entityId,
      "ObjectId:",
      objectEntityId,
    );

    const comments = await Comment.aggregate([
      {
        $match: {
          entityId: objectEntityId,
          parentComment: null, // ✅ ONLY TOP-LEVEL COMMENTS
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },

      // Count replies
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "parentComment",
          as: "replies",
        },
      },
      {
        $addFields: {
          totalReplies: { $size: "$replies" },
        },
      },
      {
        $project: {
          replies: 0,
        },
      },

      // Populate user manually
      {
        $lookup: {
          from: "User", // collection name (usually lowercase plural)
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          content: 1,
          entityId: 1,
          entityModel: 1,
          parentComment: 1,
          createdAt: 1,
          totalReplies: 1,
          "user._id": 1,
          "user.firstName": 1,
          "user.lastName": 1,
          "user.profileImage": 1,
          "user.roleId": 1,
        },
      },
    ]);
    const formattedReplies = comments.map((reply) => {
      if (reply.user && reply.user.profileImage) {
        reply.user.profileImage = formatResponseUrl(reply.user.profileImage);
        reply.user.userRole = userRole[reply.user.roleId] || null;
        delete reply.user.roleId;
      }
      return reply;
    });
    const totalCount = await Comment.countDocuments({
      entityId: objectEntityId,
      parentComment: null,
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.COMMENTS_FETCHED, {
      comments: formattedReplies,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getComments:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};
// Update Comment
// const updateComment = async (req, res) => {
//   try {
//     const { commentId } = req.params;
//     const { content } = req.body;
//     const userId = req.user.userId;

//     const comment = await Comment.findOne({ _id: commentId, user: userId });

//     if (!comment) {
//       return apiErrorRes(
//         HTTP_STATUS.NOT_FOUND,
//         res,
//         "Comment not found or you are not authorized",
//       );
//     }

//     comment.content = content;
//     await comment.save();

//     return apiSuccessRes(HTTP_STATUS.OK, res, "Comment updated successfully", {
//       comment,
//     });
//   } catch (error) {
//     console.error("Error in updateComment:", error);
//     return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
//   }
// };
const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    const existingComment = await Comment.findOne({
      _id: commentId,
      user: userId,
    });

    if (!existingComment) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.COMMENT_NOT_FOUND_OR_UNAUTHORIZED,
      );
    }

    existingComment.content = content;
    await existingComment.save();

    // ✅ Re-fetch with aggregation (same as getComments)
    const updatedComment = await Comment.aggregate([
      {
        $match: {
          _id: existingComment._id,
        },
      },

      // Count replies
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "parentComment",
          as: "replies",
        },
      },
      {
        $addFields: {
          totalReplies: { $size: "$replies" },
        },
      },
      {
        $project: {
          replies: 0,
        },
      },

      // Populate user
      {
        $lookup: {
          from: "User",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $project: {
          content: 1,
          entityId: 1,
          entityModel: 1,
          parentComment: 1,
          createdAt: 1,
          totalReplies: 1,
          "user._id": 1,
          "user.firstName": 1,
          "user.lastName": 1,
          "user.profileImage": 1,
          "user.roleId": 1,
        },
      },
    ]);

    let formattedComment = updatedComment[0];

    if (formattedComment?.user) {
      if (formattedComment.user.profileImage) {
        formattedComment.user.profileImage = formatResponseUrl(
          formattedComment.user.profileImage,
        );
      }

      formattedComment.user.userRole =
        userRole[formattedComment.user.roleId] || null;

      delete formattedComment.user.roleId;
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.COMMENT_UPDATED, {
      ...formattedComment,
    });
  } catch (error) {
    console.error("Error in updateComment:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Delete Comment
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    // Allow user to delete their own comment.
    // Ideally event organizer should also be able to delete.
    const comment = await Comment.findOne({ _id: commentId, user: userId });

    if (!comment) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        constantsMessage.COMMENT_NOT_FOUND_OR_UNAUTHORIZED,
      );
    }

    console.log("Deleting comment:", commentId, "by user:", userId);

    // Logic: If we delete a parent, do we delete children?
    // Often simpler to just set content to "[Deleted]" or strictly delete them.
    // For now, let's delete the comment. Orphaned replies might exist.
    // Better practice: delete replies recursively orsoft delete.
    // Implementation: recursive delete check.

    // await Comment.deleteMany({ parentComment: commentId }); // Delete immediate children (shallow).
    // Deep delete requires more recursive logic or graph lookup.
    // MongoDB $graphLookup can help find all descendants.

    // await Comment.deleteOne({ _id: commentId });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.COMMENT_DELETED);
  } catch (error) {
    console.error("Error in deleteComment:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Toggle Like
const toggleLike = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.COMMENT_NOT_FOUND);
    }

    const isLiked = comment.likes.includes(userId);

    if (isLiked) {
      comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    } else {
      comment.likes.push(userId);
    }

    await comment.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      isLiked ? constantsMessage.COMMENT_UNLIKED : constantsMessage.COMMENT_LIKED,
      { likesCount: comment.likes.length, isLiked: !isLiked },
    );
  } catch (error) {
    console.error("Error in toggleLike:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Replies for a Parent Comment
const getReplies = async (req, res) => {
  try {
    const { parentCommentId, page = 1, limit = 10 } = req.query;

    if (!parentCommentId) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.PARENT_COMMENT_ID_REQUIRED,
      );
    }

    const objectParentCommentId = toObjectId(parentCommentId);
    const skip = (page - 1) * limit;

    // Verify parent comment exists
    const parentExists = await Comment.findById(objectParentCommentId);
    if (!parentExists) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Parent comment not found",
      );
    }

    const replies = await Comment.aggregate([
      {
        $match: {
          parentComment: objectParentCommentId, // ✅ FETCH BY PARENT ID
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },

      // Count nested replies (replies of replies)
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "parentComment",
          as: "nestedReplies",
        },
      },
      {
        $addFields: {
          totalReplies: { $size: "$nestedReplies" },
        },
      },
      {
        $project: {
          nestedReplies: 0,
        },
      },

      // Populate user
      {
        $lookup: {
          from: "User", // ⚠️ Make sure this matches your actual collection name
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          content: 1,
          entityId: 1,
          entityModel: 1,
          parentComment: 1,
          createdAt: 1,
          totalReplies: 1,
          "user._id": 1,
          "user.firstName": 1,
          "user.lastName": 1,
          "user.profileImage": 1,
          "user.roleId": 1,
        },
      },
    ]);

    const totalCount = await Comment.countDocuments({
      parentComment: objectParentCommentId,
    });

    const formattedReplies = replies.map((reply) => {
      if (reply.user && reply.user.profileImage) {
        reply.user.profileImage = formatResponseUrl(reply.user.profileImage);
        reply.user.userRole = userRole[reply.user.roleId] || null;
        delete reply.user.roleId;
      }
      return reply;
    });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REPLIES_FETCHED, {
      comments: replies,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error in getReplies:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/create",
  perApiLimiter(),
  validateRequest(createCommentSchema),
  createComment,
);

router.get(
  "/list",
  perApiLimiter(),
  // validateRequest(getCommentsSchema),
  getComments,
);

router.post(
  "/update/:commentId",
  perApiLimiter(),
  validateRequest(updateCommentSchema),
  updateComment,
);

router.post("/delete/:commentId", perApiLimiter(), deleteComment);

router.post(
  "/like/:commentId",
  perApiLimiter(),
  // validateRequest(toggleLikeSchema), // validation usually for body, params check implicitly handled or needs specific middleware if we want strict param check
  toggleLike,
);

router.get("/replies", perApiLimiter(), getReplies);

module.exports = router;
