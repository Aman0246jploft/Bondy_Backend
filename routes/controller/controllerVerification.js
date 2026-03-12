const express = require("express");
const router = express.Router();

const perApiLimiter = require("../../middlewares/rateLimiter");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");

const HTTP_STATUS = require("../../utils/statusCode");
const User = require("../../db/models/User");
const { Referral, WalletHistory, Notification, GlobalSetting } = require("../../db");
const { roleId } = require("../../utils/Role");
const checkRole = require("../../middlewares/checkRole");
// Assuming there might be a middleware to check auth like 'verifyToken', using checkRole which likely includes auth check
// If checkRole doesn't imply auth, we might need an auth middleware.
// Assuming checkRole([]) works as "must be authenticated" or "must have one of these roles"

// Submit Verification Documents (Organizer)
const submitVerification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { documents } = req.body; // Array of { name, file }

    if (!documents || documents.length === 0) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "At least one document is required.",
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "User not found.");
    }

    const validNames = ["Business Proof", "Gov ID"];

    // Format documents with initial status and validation
    const newDocs = [];
    for (const doc of documents) {
      if (!doc.name || !validNames.includes(doc.name)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          `Invalid document name. Allowed: ${validNames.join(", ")}`,
        );
      }
      newDocs.push({
        name: doc.name,
        file: doc.file,
        status: "pending",
        reason: null,
      });
    }

    // Update user: Add documents and set verification status to pending
    user.documents = newDocs;
    user.organizerVerificationStatus = "pending";
    await user.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Verification documents submitted successfully.",
      {
        organizerVerificationStatus: user.organizerVerificationStatus,
        documents: user.documents,
      },
    );
  } catch (error) {
    console.error("Error in submitVerification:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Get Verification Requests (Admin)
const getVerificationRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;

    const query = {
      roleId: roleId.ORGANIZER,
    };

    // Only filter by document status, not organizerVerificationStatus
    if (status) {
      query["documents.status"] = status;
    }

    // Search logic
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select(
          "firstName lastName email countryCode contactNumber businessType organizerVerificationStatus documents createdAt",
        )
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    // Filter to show only documents matching the selected status
    const filteredUsers = users.map(user => {
      let filteredDocs = user.documents;

      // Filter documents by status if status parameter provided
      if (status) {
        filteredDocs = user.documents.filter(doc => doc.status === status);
      }

      return {
        ...user,
        documents: filteredDocs
      };
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Verification requests fetched successfully.",
      {
        requests: filteredUsers,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    );
  } catch (error) {
    console.error("Error in getVerificationRequests:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Approve/Reject Individual Document (Admin)
const verifyOrganizer = async (req, res) => {
  try {
    const { userId, documentId, action, reason } = req.body;
    // action: "approve" | "reject"

    if (!["approve", "reject"].includes(action)) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Invalid action. Use 'approve' or 'reject'.",
      );
    }

    if (!documentId) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Document ID is required.",
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "User not found.");
    }

    // Find the specific document
    const document = user.documents.id(documentId);
    if (!document) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Document not found.");
    }

    if (action === "approve") {
      document.status = "approved";
      document.reason = null;
    } else if (action === "reject") {
      if (!reason) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Reason is required for rejection.",
        );
      }
      document.status = "rejected";
      document.reason = reason;
    }

    await user.save(); // pre-save hook updates organizerVerificationStatus

    // ── Referral: credit reward when organizer gets verified ─────────────────────
    console.log("[REFERRAL] action:", action, "| user.isVerified:", user.isVerified, "| userId:", user._id);
    if (action === "approve" && user.isVerified === true) {
      try {
        const referral = await Referral.findOne({
          referee: user._id,
          status: "SIGNED_UP",
        });

        if (!referral) {
          console.warn("[REFERRAL] No SIGNED_UP referral found for referee:", user._id);
        } else {
          console.log("[REFERRAL] Found SIGNED_UP referral:", referral._id, "| referrer:", referral.referrer);

          const referrer = await User.findById(referral.referrer);
          if (!referrer) {
            console.warn("[REFERRAL] Referrer not found for id:", referral.referrer);
          } else {
            // Read reward amount from GlobalSetting (admin-configurable)
            const rewardSetting = await GlobalSetting.findOne({ key: "REFERRAL_REWARD_AMOUNT" });
            const rewardAmount = rewardSetting ? Number(rewardSetting.value) : 75000;
            console.log("[REFERRAL] Crediting ₮", rewardAmount, "to referrer:", referrer.email);

            // Complete referral
            referral.status = "COMPLETED";
            referral.rewardedAt = new Date();
            await referral.save();
            console.log("[REFERRAL] Referral marked COMPLETED");

            // Credit referrer wallet
            referrer.payoutBalance = (referrer.payoutBalance || 0) + rewardAmount;
            await referrer.save();
            console.log("[REFERRAL] Referrer payoutBalance updated to:", referrer.payoutBalance);

            // Log wallet history
            await WalletHistory.create({
              userId: referrer._id,
              amount: rewardAmount,
              type: "REFERRAL",
              balanceAfter: referrer.payoutBalance,
              description: `Referral reward — ${user.firstName} ${user.lastName} (${user.email}) got verified on Bondy.`,
            });
            console.log("[REFERRAL] WalletHistory entry created");

            // Notify referrer
            await Notification.create({
              recipient: referrer._id,
              type: "SYSTEM",
              title: "Referral Reward Credited! 🎉",
              message: `You earned ₮${rewardAmount.toLocaleString()} because your referral ${user.email} was successfully verified!`,
              relatedId: referral._id,
            });
            console.log("[REFERRAL] Notification sent to referrer");
          }
        }
      } catch (refErr) {
        console.error("[REFERRAL] Credit error:", refErr.message, refErr.stack);
      }
    }
    // ────────────────────────────────────────────────────────────────────────



    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      `Document ${action}d successfully.`,
      {
        document: {
          _id: document._id,
          name: document.name,
          status: document.status,
          reason: document.reason,
        },
        organizerVerificationStatus: user.organizerVerificationStatus,
      },
    );
  } catch (error) {
    console.error("Error in verifyOrganizer:", error);
    return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
  }
};

// Routes
// Note: Auth middleware usually needs to be explicitly applied if 'checkRole' doesn't handle finding user from token.
// Assuming 'checkRole' works as middleware that decodes token or follows a 'verifyToken' middleware.
// Based on controllerUser.js usage: router.get("/userList", checkRole([roleId.SUPER_ADMIN]), userList);
// I need perApiLimiter too perhaps?

// Organizer submits verification
router.post(
  "/submit",
  perApiLimiter(),
  checkRole([roleId.ORGANIZER]), // Must be organizer
  submitVerification,
);

// Admin gets requests
router.get(
  "/requests",
  checkRole([roleId.SUPER_ADMIN]),
  getVerificationRequests,
);

// Admin approves/rejects
router.post("/audit", checkRole([roleId.SUPER_ADMIN]), verifyOrganizer);

module.exports = router;
