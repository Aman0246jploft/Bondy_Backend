const express = require("express");
const router = express.Router();

const perApiLimiter = require("../../middlewares/rateLimiter");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");

const HTTP_STATUS = require("../../utils/statusCode");
const User = require("../../db/models/User");
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
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "At least one document is required.");
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
                return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, `Invalid document name. Allowed: ${validNames.join(", ")}`);
            }
            newDocs.push({
                name: doc.name,
                file: doc.file,
                status: "pending",
                reason: null
            });
        }

        // Update user: Add documents and set verification status to pending
        user.documents = newDocs;
        user.organizerVerificationStatus = "pending";
        await user.save();

        return apiSuccessRes(HTTP_STATUS.OK, res, "Verification documents submitted successfully.", {
            organizerVerificationStatus: user.organizerVerificationStatus,
            documents: user.documents
        });

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
            roleId: roleId.ORGANISER
        };

        if (status) {
            query.organizerVerificationStatus = status;
        }

        // Search logic
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [users, total] = await Promise.all([
            User.find(query)
                .select("firstName lastName email countryCode contactNumber businessType organizerVerificationStatus documents createdAt")
                .sort({ createdAt: -1 }) // Newest first
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        return apiSuccessRes(HTTP_STATUS.OK, res, "Verification requests fetched successfully.", {
            requests: users,
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit))
        });

    } catch (error) {
        console.error("Error in getVerificationRequests:", error);
        return apiErrorRes(HTTP_STATUS.INTERNAL_SERVER_ERROR, res, error.message);
    }
};

// Approve/Reject Verification (Admin)
const verifyOrganizer = async (req, res) => {
    try {
        const { userId, action, reason } = req.body;
        // action: "approve" | "reject"

        if (!['approve', 'reject'].includes(action)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid action. Use 'approve' or 'reject'.");
        }

        const user = await User.findById(userId);
        if (!user) {
            return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "User not found.");
        }

        if (action === "approve") {
            user.organizerVerificationStatus = "approved";
            user.documents.forEach(doc => {
                doc.status = "approved";
                doc.reason = null;
            });
        } else if (action === "reject") {
            if (!reason) {
                return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Reason is required for rejection.");
            }
            user.organizerVerificationStatus = "rejected";
            user.documents.forEach(doc => {
                if (doc.status === 'pending') {
                    doc.status = "rejected";
                    doc.reason = reason;
                }
            });
        }

        await user.save();

        return apiSuccessRes(HTTP_STATUS.OK, res, `Organizer verification ${action}d successfully.`);

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
    checkRole([roleId.ORGANISER]), // Must be organizer
    submitVerification
);

// Admin gets requests
router.get(
    "/requests",
    checkRole([roleId.SUPER_ADMIN]),
    getVerificationRequests
);

// Admin approves/rejects
router.post(
    "/audit",
    checkRole([roleId.SUPER_ADMIN]),
    verifyOrganizer
);

module.exports = router;
