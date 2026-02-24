const express = require("express");
const router = express.Router();
const { Comment, Event, User, Course } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const {
  createCommentSchema,
  updateCommentSchema,
  getCommentsSchema,
} = require("../services/validations/commentValidation");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
// const checkRole = require("../../middlewares/checkRole"); // Enable if needed
// const { roleId } = require("../../utils/Role");

// Create Comment or Reply
const createComment = async (req, res) => {
  try {
    const { content, entityId, entityModel, parentCommentId } = req.body;
    const userId = req.user.userId;

    let targetModel;
    if (entityModel === "Event") targetModel = Event;
    else if (entityModel === "Course") targetModel = Course;
    else {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid entity model");
    }

    const entity = await targetModel.findById(entityId);
    if (!entity) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        `${entityModel} not found`,
      );
    }

    if (parentCommentId) {
      const parent = await Comment.findById(parentCommentId);
      if (!parent) {
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "Parent comment not found",
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

    // Populate user details for immediate display
    await newComment.populate("user", "firstName lastName profileImage");

    return apiSuccessRes(
      HTTP_STATUS.CREATED,
      res,
      "Comment added successfully",
      { comment: newComment },
    );
  } catch (error) {
    console.error("Error in createComment:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Comments for an Event
const getComments = async (req, res) => {
  try {
    const { entityId, entityModel, page = 1, limit = 50 } = req.query; // Higher limit for comments usually
    const skip = (page - 1) * limit;

    const query = { entityId, entityModel };

    // Fetch all comments for the entity (paginated at top level could be tricky if we want full threading)
    // approach: Fetch flat list and let frontend thread, or fetch top-level and their children.
    // simpler approach for now: Fetch all for the entity paginated by creation time.

    // To support "reply on reply", we just need to return the parentComment ID.
    // The frontend can reconstruct the tree.

    const comments = await Comment.find(query)
      .populate("user", "firstName lastName profileImage")
      .populate("parentComment") // Optional: to confirm parent exists
      .sort({ createdAt: 1 }) // Oldest first usually for comments
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Comment.countDocuments(query);

    // Add totalReplies count to each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replyCount = await Comment.countDocuments({
          parentComment: comment._id,
        });
        return { ...comment, totalReplies: replyCount };
      }),
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, "Comments fetched successfully", {
      comments: commentsWithReplies,
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
const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    const comment = await Comment.findOne({ _id: commentId, user: userId });

    if (!comment) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Comment not found or you are not authorized",
      );
    }

    comment.content = content;
    await comment.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Comment updated successfully", {
      comment,
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
        "Comment not found or you are not authorized",
      );
    }

    // Logic: If we delete a parent, do we delete children?
    // Often simpler to just set content to "[Deleted]" or strictly delete them.
    // For now, let's delete the comment. Orphaned replies might exist.
    // Better practice: delete replies recursively orsoft delete.
    // Implementation: recursive delete check.

    await Comment.deleteMany({ parentComment: commentId }); // Delete immediate children (shallow).
    // Deep delete requires more recursive logic or graph lookup.
    // MongoDB $graphLookup can help find all descendants.

    await Comment.deleteOne({ _id: commentId });

    return apiSuccessRes(HTTP_STATUS.OK, res, "Comment deleted successfully");
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
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Comment not found");
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
      isLiked ? "Comment unliked" : "Comment liked",
      { likesCount: comment.likes.length, isLiked: !isLiked },
    );
  } catch (error) {
    console.error("Error in toggleLike:", error);
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
  validateRequest(getCommentsSchema),
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

module.exports = router;
