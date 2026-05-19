const express = require("express");
const router = express.Router();
const { RefundPolicy } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const constantsMessage = require("../../utils/constantsMessage");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const validateRequest = require("../../middlewares/validateRequest");
const {
  createRefundPolicySchema,
  updateRefundPolicySchema,
} = require("../services/validations/refundPolicyValidation");

// 1. Get Refund Policies List
const getRefundPolicies = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { type } = req.query;

    let query = { isDeleted: false };

    if (type) {
      query.type = { $in: [type.toLowerCase(), "both"] };
    }

    // If not super admin, restrict to global policies or those created by the logged-in user
    if (userRole !== roleId.SUPER_ADMIN) {
      query.isDisable = false;
      if (userId) {
        query.$or = [{ isGlobal: true }, { createdBy: userId }];
      } else {
        query.isGlobal = true;
      }
    }

    const policies = await RefundPolicy.find(query)
      .populate("createdBy", "firstName lastName profileImage")
      .sort({ isGlobal: -1, createdAt: -1 });

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_POLICIES_FETCHED, {
      policies,
    });
  } catch (error) {
    console.error("Error in getRefundPolicies:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2. Get Single Refund Policy Details
const getRefundPolicyDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const policy = await RefundPolicy.findOne({ _id: id, isDeleted: false })
      .populate("createdBy", "firstName lastName profileImage");

    if (!policy) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.REFUND_POLICY_NOT_FOUND);
    }

    // Access check: must be global or created by the user, unless user is Super Admin
    if (
      userRole !== roleId.SUPER_ADMIN &&
      !policy.isGlobal &&
      (!userId || policy.createdBy?.toString() !== userId)
    ) {
      return apiErrorRes(HTTP_STATUS.FORBIDDEN, res, constantsMessage.REFUND_POLICY_FORBIDDEN);
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_POLICIES_FETCHED, {
      policy,
    });
  } catch (error) {
    console.error("Error in getRefundPolicyDetails:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 3. Create Refund Policy
const createRefundPolicy = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { name, description, refundPercentage, daysBefore, isGlobal, type } = req.body;

    // Only Admin can create Global refund policies
    let policyIsGlobal = false;
    if (isGlobal === true) {
      if (userRole !== roleId.SUPER_ADMIN) {
        return apiErrorRes(
          HTTP_STATUS.FORBIDDEN,
          res,
          constantsMessage.ACCESS_DENIED_ADMIN_ONLY
        );
      }
      policyIsGlobal = true;
    }

    const newPolicy = new RefundPolicy({
      name,
      description,
      refundPercentage,
      daysBefore,
      type: type || "both",
      isGlobal: policyIsGlobal,
      createdBy: policyIsGlobal ? null : userId,
    });

    await newPolicy.save();

    return apiSuccessRes(HTTP_STATUS.CREATED, res, constantsMessage.REFUND_POLICY_CREATED, {
      policy: newPolicy,
    });
  } catch (error) {
    console.error("Error in createRefundPolicy:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 4. Update Refund Policy
const updateRefundPolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const updateData = req.body;

    const policy = await RefundPolicy.findOne({ _id: id, isDeleted: false });

    if (!policy) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.REFUND_POLICY_NOT_FOUND);
    }

    // Ownership check: must be owner or super admin
    if (userRole !== roleId.SUPER_ADMIN && policy.createdBy?.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.REFUND_POLICY_FORBIDDEN
      );
    }

    // Global toggle check: only Super Admin can set or modify isGlobal
    if (updateData.isGlobal !== undefined && userRole !== roleId.SUPER_ADMIN) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.ACCESS_DENIED_ADMIN_ONLY
      );
    }

    Object.assign(policy, updateData);
    await policy.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_POLICY_UPDATED, {
      policy,
    });
  } catch (error) {
    console.error("Error in updateRefundPolicy:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 5. Soft Delete Refund Policy
const deleteRefundPolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const policy = await RefundPolicy.findOne({ _id: id, isDeleted: false });

    if (!policy) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.REFUND_POLICY_NOT_FOUND);
    }

    // Ownership check: must be owner or super admin
    if (userRole !== roleId.SUPER_ADMIN && policy.createdBy?.toString() !== userId) {
      return apiErrorRes(
        HTTP_STATUS.FORBIDDEN,
        res,
        constantsMessage.REFUND_POLICY_FORBIDDEN
      );
    }

    policy.isDeleted = true;
    await policy.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.REFUND_POLICY_DELETED);
  } catch (error) {
    console.error("Error in deleteRefundPolicy:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes configuration
router.get("/list", getRefundPolicies);
router.get("/detail/:id", getRefundPolicyDetails);

router.post(
  "/create",
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(createRefundPolicySchema),
  createRefundPolicy
);

router.post(
  "/edit/:id",
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(updateRefundPolicySchema),
  updateRefundPolicy
);

router.put(
  "/update/:id",
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  validateRequest(updateRefundPolicySchema),
  updateRefundPolicy
);

router.delete(
  "/delete/:id",
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  deleteRefundPolicy
);

router.post(
  "/delete/:id",
  checkRole([roleId.ORGANIZER, roleId.SUPER_ADMIN]),
  deleteRefundPolicy
);

module.exports = router;
