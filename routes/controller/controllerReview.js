const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { Review, User, Event, Course } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { roleId } = require("../../utils/Role");
const {
  addReviewSchema,
  updateReviewSchema,
  getReviewsSchema,
  getOrganizerReviewsSchema,
} = require("../services/validations/reviewValidation");

// Helper function to update user average rating
const updateUserAverageRating = async (organizerId) => {
  try {
    const stats = await Review.aggregate([
      { $match: { targetUserId: new mongoose.Types.ObjectId(organizerId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    const averageRating = stats.length > 0 ? stats[0].averageRating : 0;
    const reviewCount = stats.length > 0 ? stats[0].reviewCount : 0;

    await User.findByIdAndUpdate(organizerId, {
      averageRating: parseFloat(averageRating.toFixed(1)),
      reviewCount,
    });
  } catch (error) {
    console.error("Error updating user average rating:", error);
  }
};

// Add Review
const addReview = async (req, res) => {
  try {
    const { entityId, entityModel, review, rating } = req.body;
    const userId = req.user.userId;

    let EntityModel;
    if (entityModel === "Event") EntityModel = Event;
    else if (entityModel === "Course") EntityModel = Course;
    else
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid Entity Model");

    const entity = await EntityModel.findById(entityId);
    if (!entity) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Entity not found");
    }

    const newReview = new Review({
      userId,
      entityId,
      entityModel,
      review,
      rating,
      targetUserId: entity.createdBy,
    });

    await newReview.save();

    // Update organizer's average rating
    if (entity.createdBy) {
      await updateUserAverageRating(entity.createdBy);
    }

    // Populate user details for immediate display
    await newReview.populate("userId", "firstName lastName profileImage isVerified");

    const responseData = newReview.toObject();
    if (responseData.userId) {
      responseData.userId.profileImage = formatResponseUrl(responseData.userId.profileImage);
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Review added successfully",
      responseData,
    );
  } catch (error) {
    console.error("Error adding review:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Update Review
const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { review, rating } = req.body;
    const userId = req.user.userId;

    const existingReview = await Review.findOne({ _id: reviewId, userId });

    if (!existingReview) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Review not found or not authorized",
      );
    }

    if (review !== undefined) existingReview.review = review;
    if (rating !== undefined) existingReview.rating = rating;

    await existingReview.save();

    // Update organizer's average rating
    let EntityModel;
    if (existingReview.entityModel === "Event") EntityModel = Event;
    else if (existingReview.entityModel === "Course") EntityModel = Course;

    if (EntityModel) {
      const entity = await EntityModel.findById(existingReview.entityId);
      if (entity && entity.createdBy) {
        await updateUserAverageRating(entity.createdBy);
      }
    }

    await existingReview.populate("userId", "firstName lastName profileImage isVerified");

    const responseData = existingReview.toObject();
    if (responseData.userId) {
      responseData.userId.profileImage = formatResponseUrl(responseData.userId.profileImage);
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Review updated successfully",
      responseData,
    );
  } catch (error) {
    console.error("Error updating review:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Delete Review
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.userId;
    // Allow admin to delete? For now just user.
    // If strict role check needed, can also check if req.user.role === SUPER_ADMIN

    const query = { _id: reviewId };
    if (req.user.role !== roleId.SUPER_ADMIN) {
      query.userId = userId;
    }

    const existingReview = await Review.findOne(query);

    if (!existingReview) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Review not found or not authorized",
      );
    }

    await Review.deleteOne({ _id: reviewId });

    // Update organizer's average rating
    if (existingReview.targetUserId) {
      await updateUserAverageRating(existingReview.targetUserId);
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Review deleted successfully");
  } catch (error) {
    console.error("Error deleting review:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Reviews
const getReviews = async (req, res) => {
  try {
    const { entityId, entityModel, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const query = { entityId, entityModel };

    const reviews = await Review.find(query)
      .populate("userId", "firstName lastName profileImage isVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const formattedReviews = reviews.map((r) => ({
      ...r,
      userId: r.userId
        ? {
            ...r.userId,
            profileImage: formatResponseUrl(r.userId.profileImage),
          }
        : null,
    }));

    const total = await Review.countDocuments(query);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Reviews fetched successfully", {
      reviews: formattedReviews,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Organizer Reviews
const getOrganizerReviews = async (req, res) => {
  try {
    const { organizerId, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const query = { targetUserId: organizerId };

    const reviews = await Review.find(query)
      .populate("userId", "firstName lastName profileImage isVerified")
      .populate({
        path: "entityId",
        select: "eventTitle courseTitle posterImage",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const formattedReviews = reviews.map((r) => ({
      ...r,
      userId: r.userId
        ? {
            ...r.userId,
            profileImage: formatResponseUrl(r.userId.profileImage),
          }
        : null,
      entityId: r.entityId
        ? {
            ...r.entityId,
            posterImage: (r.entityId.posterImage || []).map((img) =>
              formatResponseUrl(img),
            ),
          }
        : null,
    }));

    const total = await Review.countDocuments(query);

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Organizer reviews fetched successfully",
      {
        reviews: formattedReviews,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    );
  } catch (error) {
    console.error("Error fetching organizer reviews:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

router.post(
  "/add",
  perApiLimiter(),
  checkRole([roleId.CUSTOMER, roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(addReviewSchema),
  addReview,
);

router.post(
  "/update/:reviewId",
  perApiLimiter(),
  checkRole([roleId.CUSTOMER, roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(updateReviewSchema),
  updateReview,
);

router.post(
  "/delete/:reviewId",
  perApiLimiter(),
  checkRole([roleId.CUSTOMER, roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  deleteReview,
);

router.get(
  "/list",
  perApiLimiter(),
  // validateRequest(getReviewsSchema),
  getReviews,
);

router.get(
  "/organizer-list",
  perApiLimiter(),
  validateRequest(getOrganizerReviewsSchema),
  getOrganizerReviews,
);

module.exports = router;
