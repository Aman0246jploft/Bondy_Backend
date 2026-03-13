const express = require("express");
const router = express.Router();
const { PromotionPackage, Course, Transaction, User } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const { checkoutPromotionSchema } = require("../services/validations/coursePromotionValidation");
const { notifyPromotion, queueNotification } = require("../services/serviceNotification");


// @route   GET /api/v1/course-promotion/packages
// @desc    Get all active course promotion packages
// @access  Private (Organizer)
router.get("/packages", async (req, res) => {
  try {
    const packages = await PromotionPackage.find({ isActive: true, packageType: "COURSE" }).lean();
    return apiSuccessRes(HTTP_STATUS.OK, res, "Active course promotion packages retrieved successfully", packages);
  } catch (error) {
    console.error("Error fetching promotion packages:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, "Server Error");
  }
});

// @route   POST /api/v1/course-promotion/checkout
// @desc    Purchase a promotion for a course
// @access  Private (Organizer)
router.post("/checkout", async (req, res) => {
  try {
    const { error } = checkoutPromotionSchema.validate(req.body);
    if (error) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, error.details[0].message);
    }

    const { courseId, packageId } = req.body;
    const userId = req.user.userId;

    // Verify course exists and belongs to the user
    const course = await Course.findById(courseId);
    if (!course) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Course not found");
    }

    if (course.createdBy.toString() !== userId.toString()) {
      return apiErrorRes(HTTP_STATUS.UNAUTHORIZED, res, "You are not authorized to promote this course");
    }

    // Verify promotion package exists
    const promoPackage = await PromotionPackage.findById(packageId);
    if (!promoPackage || !promoPackage.isActive) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Promotion package not found or inactive");
    }

    // For simplicity, skip actual payment gateway integration here (QPay/SocialPay)
    // Assume payment is successful immediately.

    // 1. Create a mock completed transaction for the PROMOTION
    const bookingId = `PRM-CRS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const transaction = await Transaction.create({
      userId,
      courseId, // optional normally, but let's record it
      bookingType: "PROMOTION",
      promotionPackageId: packageId,
      bookingId,
      qty: 1,
      basePrice: promoPackage.price,
      totalAmount: promoPackage.price,
      status: "PAID",
    });

    // 2. Update the Course
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + promoPackage.durationInDays);

    course.isFeatured = true;
    course.featuredExpiry = expiryDate;
    course.activePromotionPackage = packageId;
    await course.save();

    // 3. Send Notifications (non-blocking via queue)
    // To Admin
    const admins = await User.find({ role: "admin" }).select("_id");
    if (admins && admins.length > 0) {
      admins.forEach((admin) => {
        queueNotification({
          recipient: String(admin._id),
          sender: null,
          type: "SYSTEM",
          title: "Course Promotion Purchased",
          message: `Organizer promoted course "${course.courseTitle}" with package "${promoPackage.name}".`,
          relatedId: String(course._id),
          onModel: "Course",
        }).catch((e) => console.error("[Notification] admin course promo:", e));
      });
    }

    // To Organizer
    notifyPromotion(
      String(userId),
      "Course",
      course.courseTitle,
      String(course._id),
      promoPackage.durationInDays
    ).catch((e) => console.error("[Notification] notifyPromotion (course):", e));

    return apiSuccessRes(HTTP_STATUS.OK, res, "Promotion activated successfully", {
      transactionId: transaction._id,
      featuredExpiry: expiryDate
    });

  } catch (error) {
    console.error("Error during promotion checkout:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, "Server Error");
  }
});

module.exports = router;
