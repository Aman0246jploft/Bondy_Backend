const express = require("express");
const router = express.Router();
const { Review, User, Event, Course } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { roleId } = require("../../utils/Role");
const {
  addReviewSchema,
  updateReviewSchema,
  getReviewsSchema,
} = require("../services/validations/reviewValidation");

// Add Review
const addReview = async (req, res) => {
  try {
    const { entityId, entityModel, review } = req.body;
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
    });

    await newReview.save();

    // Populate user details for immediate display
    await newReview.populate("userId", "firstName lastName profileImage isVerified");

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Review added successfully",
      newReview,
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
    const { review } = req.body;
    const userId = req.user.userId;

    const existingReview = await Review.findOne({ _id: reviewId, userId });

    if (!existingReview) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Review not found or not authorized",
      );
    }

    existingReview.review = review;
    await existingReview.save();

    await existingReview.populate("userId", "firstName lastName profileImage isVerified");

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Review updated successfully",
      existingReview,
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

    const total = await Review.countDocuments(query);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Reviews fetched successfully", {
      reviews,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
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
  validateRequest(getReviewsSchema),
  getReviews,
);

module.exports = router;
