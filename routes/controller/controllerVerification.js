const express = require("express");
const router = express.Router();

const perApiLimiter = require("../../middlewares/rateLimiter");
const {
  apiSuccessRes,
  apiErrorRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");

const HTTP_STATUS = require("../../utils/statusCode");
const User = require("../../db/models/User");
const { Referral, WalletHistory, GlobalSetting } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const { roleId } = require("../../utils/Role");
const checkRole = require("../../middlewares/checkRole");
const {
  notifyReferralReward,
  notifyVerificationResult,
} = require("../services/serviceNotification");
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
        constantsMessage.DOCUMENTS_REQUIRED,
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    let finalDocuments = documents;
    if (user.isVerified) {
      // If already verified, only allow re-uploading "Gov ID". Remove "Business Proof" from the payload.
      finalDocuments = documents.filter((doc) => doc.name !== "Business Proof");

      if (finalDocuments.length === 0) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "You are already verified. Only 'Gov ID' can be updated.",
        );
      }
    }

    const validNames = ["Business Proof", "Gov ID"];

    // Merge logic: Preserve approved documents, update others to pending
    const existingDocs = user.documents || [];
    const updatedDocsMap = new Map();

    // 1. Populate map with existing approved documents
    existingDocs.forEach(doc => {
      if (doc.status === "approved") {
        updatedDocsMap.set(doc.name, {
          name: doc.name,
          file: doc.file,
          status: "approved",
          reason: null
        });
      }
    });

    // 2. Process new documents from request
    for (const doc of finalDocuments) {
      if (!doc.name || !validNames.includes(doc.name)) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          `Invalid document name. Allowed: ${validNames.join(", ")}`,
        );
      }

      // Rule: If "Business Proof" is already approved, do not overwrite it
      if (doc.name === "Business Proof" && updatedDocsMap.has("Business Proof")) {
        continue;
      }

      // Add or Update to pending
      updatedDocsMap.set(doc.name, {
        name: doc.name,
        file: doc.file,
        status: "pending",
        reason: null,
      });
    }

    // Convert map back to array
    user.documents = Array.from(updatedDocsMap.values());
    user.organizerVerificationStatus = "pending";
    await user.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.VERIFICATION_DOCS_UPDATED,
      {
        organizerVerificationStatus: user.organizerVerificationStatus,
        documents: (user.documents || []).map((doc) => ({
          ...doc.toObject ? doc.toObject() : doc,
          file: doc.file ? formatResponseUrl(doc.file) : null,
        })),
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
        documents: (filteredDocs || []).map((doc) => ({
          ...doc,
          file: doc.file ? formatResponseUrl(doc.file) : null,
        })),
      };
    });

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.VERIFICATION_REQUESTS_FETCHED,
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
        constantsMessage.INVALID_VERIFICATION_ACTION,
      );
    }

    if (!documentId) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.DOCUMENT_ID_REQUIRED,
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    // Find the specific document
    const document = user.documents.id(documentId);
    if (!document) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.DOCUMENT_NOT_FOUND);
    }

    if (action === "approve") {
      document.status = "approved";
      document.reason = null;
    } else if (action === "reject") {
      // Rule: If Business Proof is already approved, do not allow rejection
      if (document.name === "Business Proof" && document.status === "approved") {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.BUSINESS_PROOF_REJECTION_ERROR,
        );
      }

      if (!reason) {
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.REJECTION_REASON_REQUIRED,
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
            const rewardAmount = rewardSetting ? Number(rewardSetting.value) : 0;
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

            // Notify referrer via BullMQ queue (non-blocking)
            notifyReferralReward(
              String(referrer._id),
              rewardAmount,
              `${user.email}`,
              String(referral._id)
            ).catch((e) => console.error("[Notification] notifyReferralReward:", e));
            console.log("[REFERRAL] Referral reward notification queued");
          }
        }
      } catch (refErr) {
        console.error("[REFERRAL] Credit error:", refErr.message, refErr.stack);
      }
    }
    // ──────────────────────────────────────────────────────────────────────── 

    // Notify the organizer about their verification result (non-blocking)
    notifyVerificationResult(String(userId), action, reason)
      .catch((e) => console.error("[Notification] notifyVerificationResult:", e));

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      constantsMessage.DOCUMENT_STATUS_UPDATED,
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
