const express = require("express");
const router = express.Router();
const {
  Transaction,
  User,
  Payout,
  GlobalSetting,
  WalletHistory,
} = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const { notifyPayoutResult } = require("../services/serviceNotification");

// --- Organizer APIs ---

// 1. Get Earnings Summary (Organizer)
const getOrganizerEarnings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select(
      "totalEarnings payoutBalance bankDetails",
    );

    const payoutHistory = await Payout.find({ organizerId: userId }).sort({
      createdAt: -1,
    });

    const history = await WalletHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 transactions

    const minPayoutSetting = await GlobalSetting.findOne({
      key: "MIN_PAYOUT_CONFIG",
    });
    const minPayout = minPayoutSetting ? Number(minPayoutSetting.value) : 1000;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Earnings fetched successfully", {
      totalEarnings: user.totalEarnings,
      payoutBalance: user.payoutBalance,
      bankDetails: user.bankDetails,
      payoutHistory,
      walletHistory: history,
      minPayout,
    });
  } catch (error) {
    console.error("Error in getOrganizerEarnings:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2. Update Bank Details (Organizer)
const updateBankDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountName, accountNumber, bankName, ifscCode, swiftCode } =
      req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          bankDetails: {
            accountName,
            accountNumber,
            bankName,
            ifscCode,
            swiftCode,
          },
        },
      },
      { new: true },
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, "Bank details updated", {
      bankDetails: user.bankDetails,
    });
  } catch (error) {
    console.error("Error in updateBankDetails:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2.5 Request Payout (Organizer)
const requestPayout = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, paymentReference } = req.body; // paymentReference could be bank details hint or updated info

    if (!amount || amount <= 0) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid amount");
    }

    const minPayoutSetting = await GlobalSetting.findOne({
      key: "MIN_PAYOUT_CONFIG",
    });
    const minPayout = minPayoutSetting ? Number(minPayoutSetting.value) : 1000;

    if (amount < minPayout) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        `Minimum payout amount is ₮${minPayout.toLocaleString()}`,
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "User not found");
    }

    if (user.payoutBalance < amount) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Insufficient balance");
    }

    // 1. Create Payout Request
    const newPayout = new Payout({
      organizerId: userId,
      amount: amount,
      status: "PENDING",
      paymentReference: paymentReference || "Requested by user",
    });
    await newPayout.save();

    // 2. Debit User Balance
    user.payoutBalance -= amount;
    await user.save();

    // 3. Record in Wallet History
    const historyEntry = new WalletHistory({
      userId: userId,
      amount: -amount, // Negative for debit
      type: "PAYOUT_REQUEST",
      payoutId: newPayout._id,
      balanceAfter: user.payoutBalance,
      description: `Payout Request of ${amount}`,
    });
    await historyEntry.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Payout request submitted", {
      payout: newPayout,
      newBalance: user.payoutBalance,
    });
  } catch (error) {
    console.error("Error in requestPayout:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// --- Admin APIs ---

// 3. Get Pending Payouts (Admin)
const getPendingPayouts = async (req, res) => {
  try {
    const ORGANIZERs = await User.find({
      roleId: roleId.ORGANIZER,
      payoutBalance: { $gt: 0 },
    })
      .select(
        "firstName lastName email contactNumber bankDetails payoutBalance",
      )
      .sort({ payoutBalance: -1 });

    return apiSuccessRes(HTTP_STATUS.OK, res, "Pending payouts fetched", {
      ORGANIZERs,
    });
  } catch (error) {
    console.error("Error in getPendingPayouts:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 4. Mark Payout as Paid (Admin)
const markPayoutAsPaid = async (req, res) => {
  try {
    const { ORGANIZERId, amount, paymentReference, adminNote } = req.body;

    const ORGANIZER = await User.findById(ORGANIZERId);
    if (!ORGANIZER) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "ORGANIZER not found");
    }

    if (ORGANIZER.payoutBalance < amount) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Insufficient payout balance",
      );
    }

    // Create Payout Record
    const payout = new Payout({
      organizerId: ORGANIZERId,
      amount,
      paymentReference,
      adminNote,
      status: "PAID",
      paidAt: new Date(),
    });
    await payout.save();

    // Deduct from Balance
    // NOTE: Balance was ALREADY deducted when payout was requested (PENDING).
    // If the admin is just marking it as PAID, we don't deduct again.
    // However, if the payout system allows "Admin Initiated Payouts" without request, only then we deduct.
    // But typically, Payout Request logic handles the deduction.
    // Let's assume this endpoint is for approving PENDING payouts or creating new immediate payouts.

    // Scenario A: Payout exists and is Pending -> just mark paid.
    // Scenario B: Admin creates new Payout completely (Manual Payout) -> deduct.

    // Let's check if we are updating an existing request or creating new.
    // The current code creates a NEW Payout object. This implies "Manual Payout".
    // If it's manual payout, yes, deduct.

    ORGANIZER.payoutBalance -= amount;
    await ORGANIZER.save();

    // Wallet History
    const walletEntry = new WalletHistory({
      userId: ORGANIZERId,
      amount: -amount,
      type: "ADJUSTMENT", // or MANUAL_PAYOUT
      payoutId: payout._id,
      balanceAfter: ORGANIZER.payoutBalance,
      description: `Admin manual payout: ${adminNote || "No notes"}`,
    });
    await walletEntry.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Payout marked as paid", {
      payout,
    });
  } catch (error) {
    console.error("Error in markPayoutAsPaid:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 5. Get Admin Stats (Admin)
const getAdminStats = async (req, res) => {
  try {
    const paidTransactions = await Transaction.find({ status: "PAID" });

    const stats = {
      totalVolume: 0,
      totalCommission: 0,
      totalEarningToOrganizers: 0,
      transactionCount: paidTransactions.length,
      eventTransactionCount: 0,
      courseTransactionCount: 0,
    };

    paidTransactions.forEach((tnx) => {
      stats.totalVolume += tnx.totalAmount;
      stats.totalCommission += tnx.commissionAmount || 0;
      stats.totalEarningToOrganizers += tnx.organizerEarning || 0;

      if (tnx.bookingType === "EVENT") stats.eventTransactionCount++;
      else stats.courseTransactionCount++;
    });

    // Payout stats
    const paidPayouts = await Payout.find({ status: "PAID" });
    const pendingPayoutBalance = await User.aggregate([
      { $match: { payoutBalance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$payoutBalance" } } },
    ]);

    stats.totalPayoutsMade = paidPayouts.reduce((sum, p) => sum + p.amount, 0);
    stats.totalPayoutsPending =
      pendingPayoutBalance.length > 0 ? pendingPayoutBalance[0].total : 0;

    return apiSuccessRes(HTTP_STATUS.OK, res, "Admin stats fetched", { stats });
  } catch (error) {
    console.error("Error in getAdminStats:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Cleaned up duplicate lines
// Route to approve/reject payout requests would be better than just "mark-paid" (which creates new)
// But following existing pattern, we can add a route to approve existing.
router.post(
  "/approve-request",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { payoutId, transactionId, adminNote } = req.body;
      // transactionId here is bank transaction ID, not DB ID

      const payout = await Payout.findById(payoutId);
      if (!payout)
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "Payout request not found",
        );
      if (payout.status !== "PENDING")
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Payout is not pending",
        );

      payout.status = "PAID";
      payout.paymentReference = transactionId;
      payout.adminNote = adminNote;
      payout.paidAt = new Date();
      await payout.save();

      // No balance change needed as it was deducted on request.
      // Just log history? Optional, since 'PAYOUT_REQUEST' already logged the debit.
      // Maybe log a 'PAYOUT_COMPLETED' event?

      // Notify the organizer (non-blocking)
      notifyPayoutResult(
        String(payout.organizerId),
        "approved",
        payout.amount,
        String(payout._id),
        adminNote,
      ).catch((e) =>
        console.error("[Notification] notifyPayoutResult (approved):", e),
      );

      return apiSuccessRes(HTTP_STATUS.OK, res, "Payout approved");
    } catch (e) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, e.message);
    }
  },
);

router.post(
  "/reject-request",
  checkRole([roleId.SUPER_ADMIN]),
  async (req, res) => {
    try {
      const { payoutId, adminNote } = req.body;

      const payout = await Payout.findById(payoutId);
      if (!payout)
        return apiErrorRes(
          HTTP_STATUS.NOT_FOUND,
          res,
          "Payout request not found",
        );
      if (payout.status !== "PENDING")
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          "Payout is not pending",
        );

      payout.status = "CANCELLED"; // or REJECTED
      payout.adminNote = adminNote;
      await payout.save();

      // CMS: Refund the amount back to user
      const user = await User.findById(payout.organizerId);
      user.payoutBalance += payout.amount;
      await user.save();

      // Log History
      const walletEntry = new WalletHistory({
        userId: user._id,
        amount: payout.amount,
        type: "PAYOUT_REJECTED",
        payoutId: payout._id,
        balanceAfter: user.payoutBalance,
        description: `Payout rejected: ${adminNote || "No reason provided"}`,
      });
      await walletEntry.save();

      // Notify the organizer (non-blocking)
      notifyPayoutResult(
        String(payout.organizerId),
        "rejected",
        payout.amount,
        String(payout._id),
        adminNote,
      ).catch((e) =>
        console.error("[Notification] notifyPayoutResult (rejected):", e),
      );

      return apiSuccessRes(HTTP_STATUS.OK, res, "Payout rejected and refunded");
    } catch (e) {
      return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, e.message);
    }
  },
);

// ─── Admin: Finance Stats ────────────────────────────────────────────────────
const getFinanceStats = async (req, res) => {
  try {
    const [paidTxns, pendingPayouts, paidPayouts, refundTxns] =
      await Promise.all([
        Transaction.find({
          status: "PAID",
          bookingType: { $in: ["EVENT", "COURSE"] },
        }),
        Payout.find({ status: "PENDING" }).populate(
          "organizerId",
          "firstName lastName email",
        ),
        Payout.find({ status: "PAID" }),
        Transaction.find({ status: "REFUND_INITIATED" }),
      ]);

    const totalRevenue = paidTxns.reduce((s, t) => s + (t.totalAmount || 0), 0);
    const totalCommission = paidTxns.reduce(
      (s, t) => s + (t.commissionAmount || 0),
      0,
    );
    const totalOrganizerEarnings = paidTxns.reduce(
      (s, t) => s + (t.organizerEarning || 0),
      0,
    );
    const totalPayoutsMade = paidPayouts.reduce(
      (s, p) => s + (p.amount || 0),
      0,
    );
    const pendingPayoutsAmount = pendingPayouts.reduce(
      (s, p) => s + (p.amount || 0),
      0,
    );
    const refundTotal = refundTxns.reduce(
      (s, t) => s + (t.totalAmount || 0),
      0,
    );

    // Recent 10 paid transactions
    const recentTransactions = await Transaction.find({
      status: "PAID",
      bookingType: { $in: ["EVENT", "COURSE"] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "firstName lastName email")
      .populate("eventId", "eventTitle")
      .populate("courseId", "courseTitle")
      .lean();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Finance stats fetched", {
      totalRevenue,
      totalCommission,
      totalOrganizerEarnings,
      totalPayoutsMade,
      pendingPayoutsAmount,
      pendingPayoutCount: pendingPayouts.length,
      refundCount: refundTxns.length,
      refundTotal,
      transactionCount: paidTxns.length,
      recentTransactions,
    });
  } catch (error) {
    console.error("Error in getFinanceStats:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// ─── Admin: All Payouts (paginated) ──────────────────────────────────────────
const getAllPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    const query = {};
    if (status && status !== "ALL") query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    let payouts = await Payout.find(query)
      .populate(
        "organizerId",
        "firstName lastName email bankDetails payoutBalance",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    if (search) {
      const q = search.toLowerCase();
      payouts = payouts.filter(
        (p) =>
          p.organizerId?.firstName?.toLowerCase().includes(q) ||
          p.organizerId?.lastName?.toLowerCase().includes(q) ||
          p.organizerId?.email?.toLowerCase().includes(q) ||
          String(p._id).includes(q),
      );
    }

    const total = await Payout.countDocuments(query);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Payouts fetched", {
      payouts,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("Error in getAllPayouts:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// ─── Admin: All Transactions (paginated) ──────────────────────────────────────
const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const query = { status: "PAID", bookingType: { $in: ["EVENT", "COURSE"] } };

    let transactionsQuery = Transaction.find(query)
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName email")
      .populate("eventId", "eventTitle")
      .populate("courseId", "courseTitle")
      .lean();

    let allTransactions = await transactionsQuery;

    if (search) {
      const q = search.toLowerCase();
      allTransactions = allTransactions.filter(
        (t) =>
          String(t._id).toLowerCase().includes(q) ||
          t.userId?.firstName?.toLowerCase().includes(q) ||
          t.userId?.lastName?.toLowerCase().includes(q) ||
          t.userId?.email?.toLowerCase().includes(q) ||
          t.eventId?.eventTitle?.toLowerCase().includes(q) ||
          t.courseId?.courseTitle?.toLowerCase().includes(q),
      );
    }

    const total = allTransactions.length;
    const skip = (Number(page) - 1) * Number(limit);
    const paginatedTransactions = allTransactions.slice(
      skip,
      skip + Number(limit),
    );

    return apiSuccessRes(HTTP_STATUS.OK, res, "Transactions fetched", {
      transactions: paginatedTransactions,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("Error in getAllTransactions:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// --- Routes Definitions ---

// Organizer Routes
router.get("/earnings", getOrganizerEarnings);
router.put("/bank-details", checkRole([roleId.ORGANIZER]), updateBankDetails);
router.post("/request-payout", checkRole([roleId.ORGANIZER]), requestPayout);

// Admin Routes
router.get(
  "/pending-payouts",
  checkRole([roleId.SUPER_ADMIN]),
  getPendingPayouts,
);
router.post("/mark-paid", checkRole([roleId.SUPER_ADMIN]), markPayoutAsPaid);
router.get("/finance-stats", checkRole([roleId.SUPER_ADMIN]), getFinanceStats);
router.get("/all-payouts", checkRole([roleId.SUPER_ADMIN]), getAllPayouts);
router.get(
  "/all-transactions",
  checkRole([roleId.SUPER_ADMIN]),
  getAllTransactions,
);
router.get("/admin-stats", checkRole([roleId.SUPER_ADMIN]), getAdminStats);

module.exports = router;
