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
const constantsMessage = require("../../utils/constantsMessage");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
const { notifyPayoutResult } = require("../services/serviceNotification");

// --- Organizer APIs ---

// 1. Get Earnings Summary (Organizer)
const getOrganizerEarnings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { filterType, startDate, endDate } = req.query;

    const user = await User.findById(userId).select(
      "totalEarnings payoutBalance bankDetails roleId verifications bankAccounts",
    );

    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    // Construct date filter query
    let dateFilter = {};
    const now = new Date();

    if (filterType === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter.createdAt = { $gte: startOfMonth };
    } else if (filterType === 'this_year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      dateFilter.createdAt = { $gte: startOfYear };
    } else if (filterType === 'last_7_days') {
      const last7Days = new Date(now);
      last7Days.setDate(last7Days.getDate() - 7);
      dateFilter.createdAt = { $gte: last7Days };
    } else if (filterType === 'last_30_days') {
      const last30Days = new Date(now);
      last30Days.setDate(last30Days.getDate() - 30);
      dateFilter.createdAt = { $gte: last30Days };
    } else if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    } else if (startDate) {
      dateFilter.createdAt = { $gte: new Date(startDate) };
    } else if (endDate) {
      dateFilter.createdAt = { $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) };
    }

    const payoutQuery = { organizerId: userId, ...dateFilter };
    const walletHistoryQuery = { userId, ...dateFilter };
    const transactionQuery = { userId, status: "PAID", ...dateFilter };

    const payoutHistory = await Payout.find(payoutQuery).sort({
      createdAt: -1,
    });

    const walletHistory = await WalletHistory.find(walletHistoryQuery)
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 transactions

    // Fetch user's own ticket/course purchases (Transaction model)
    const userTransactions = await Transaction.find(transactionQuery)
      .populate("eventId", "eventTitle")
      .populate("courseId", "courseTitle")
      .sort({ createdAt: -1 })
      .limit(50);

    // Map Transactions to matched WalletHistory structure for a unified view
    const mappedTransactions = userTransactions.map((t) => ({
      _id: t._id,
      amount: -t.totalAmount, // Negative to show expenditure
      type: "PURCHASE",
      description:
        t.bookingType === "EVENT"
          ? `Event: ${t.eventId?.eventTitle || "Unknown Event"}`
          : `Course: ${t.courseId?.courseTitle || "Unknown Course"}`,
      createdAt: t.createdAt,
      bookingId: t.bookingId,
      status: t.status,
    }));

    // Combine WalletHistory (earnings/payouts/referrals) and Transactions (purchases)
    const combinedHistory = [...walletHistory, ...mappedTransactions]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);

    const minPayoutSetting = await GlobalSetting.findOne({
      key: "MIN_PAYOUT_CONFIG",
    });
    const minPayout = minPayoutSetting ? Number(minPayoutSetting.value) : 1000;

    // Format types and round amounts to 2 decimal places in walletHistory
    const formattedWalletHistory = combinedHistory.map((item) => {
      const doc = item.toObject ? item.toObject() : { ...item };

      if (typeof doc.amount === "number") {
        doc.amount = Number(doc.amount.toFixed(2));
      }
      if (typeof doc.balanceAfter === "number") {
        doc.balanceAfter = Number(doc.balanceAfter.toFixed(2));
      }

      const typeMapping = {
        COURSE_SALE: "Course Sale",
      };

      if (doc.type && typeMapping[doc.type]) {
        doc.type = typeMapping[doc.type];
      }

      return doc;
    });

    const approvedBankAccounts = (user.bankAccounts || []).filter(b => b.status === "approved" || b.isVerified === true);

    // --- Analytics: Compute summary for the filtered period ---
    // Earnings = sum of TICKET_SALE + COURSE_SALE in the filtered walletHistory
    const earningTypes = ["TICKET_SALE", "COURSE_SALE"];
    const deductionTypes = ["REFUND", "CANCELLATION_DEDUCTION"];

    // Use the full (unsliced) walletHistory for accurate period stats
    const allWalletInPeriod = await WalletHistory.find(walletHistoryQuery).lean();

    const periodEarnings = allWalletInPeriod
      .filter(w => earningTypes.includes(w.type))
      .reduce((sum, w) => sum + (w.amount || 0), 0);

    const periodDeductions = allWalletInPeriod
      .filter(w => deductionTypes.includes(w.type))
      .reduce((sum, w) => sum + Math.abs(w.amount || 0), 0);

    const periodNetEarnings = periodEarnings - periodDeductions;

    // Pending = total amount in PENDING payout requests (no date filter, reflects current state)
    const pendingPayouts = await Payout.find({ organizerId: userId, status: "PENDING" });
    const pendingAmount = pendingPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Available balance = payoutBalance (current withdrawable balance)
    const availableBalance = user.payoutBalance ? Number(user.payoutBalance.toFixed(2)) : 0;

    // Total balance = available + pending
    const totalBalance = Number((availableBalance + pendingAmount).toFixed(2));

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.EARNINGS_FETCHED, {
      // --- Existing keys (unchanged) ---
      totalEarnings: user.totalEarnings ? Number(user.totalEarnings.toFixed(2)) : 0,
      payoutBalance: user.payoutBalance ? Number(user.payoutBalance.toFixed(2)) : 0,
      bankAccounts: approvedBankAccounts,
      payoutHistory,
      walletHistory: formattedWalletHistory,
      minPayout,
      // --- New summary keys ---
      availableBalance,
      pending: Number(pendingAmount.toFixed(2)),
      totalBalance,
      analytics: {
        earnings: Number(periodEarnings.toFixed(2)),         // from bookings in period
        deductions: Number(periodDeductions.toFixed(2)),     // refunds & cancellations in period
        netEarnings: Number(periodNetEarnings.toFixed(2)),   // earnings - deductions
      },
    });
  } catch (error) {
    console.error("Error in getOrganizerEarnings:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2. Update Bank Details (Organizer) - Legacy
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.BANK_DETAILS_UPDATED, {
      bankDetails: user.bankDetails,
    });
  } catch (error) {
    console.error("Error in updateBankDetails:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2.1 Add Bank Account (Organizer)
const addBankAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bankName, bankHolderName, accountNumber, otherDetails } = req.body;

    if (!bankName || !bankHolderName || !accountNumber) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Bank Name, Holder Name, and Account Number are required.");
    }

    const user = await User.findById(userId);
    if (!user) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);

    const hasPendingBank = user.bankAccounts && user.bankAccounts.some(b => b.status === "pending");
    if (hasPendingBank) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.PENDING_BANK_ACCOUNT);
    }

    const isFirstBank = !user.bankAccounts || user.bankAccounts.length === 0;
    if (!user.bankAccounts) user.bankAccounts = [];

    user.bankAccounts.push({
      bankName,
      bankHolderName,
      accountNumber,
      otherDetails: otherDetails || null,
      isVerified: false,
      status: "pending",
      isPrimary: isFirstBank
    });

    await user.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Bank account added successfully. Waiting for admin approval.", {
      bankAccounts: user.bankAccounts
    });
  } catch (error) {
    console.error("Error in addBankAccount:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2.2 Set Primary Bank Account (Organizer)
const setPrimaryBankAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId } = req.params;

    const user = await User.findById(userId);
    if (!user) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);

    const accountToSet = user.bankAccounts.find(acc => acc._id.toString() === accountId);
    if (!accountToSet) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Bank account not found.");
    }

    if (accountToSet.status !== "approved") {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Only approved bank accounts can be set as primary.");
    }

    user.bankAccounts.forEach(acc => {
      acc.isPrimary = (acc._id.toString() === accountId);
    });

    await user.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Primary bank account updated successfully.", {
      bankAccounts: user.bankAccounts
    });
  } catch (error) {
    console.error("Error in setPrimaryBankAccount:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2.3 Remove Bank Account (Organizer)
const removeBankAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId } = req.params;

    const user = await User.findById(userId);
    if (!user) return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);

    const accountIndex = user.bankAccounts.findIndex(acc => acc._id.toString() === accountId);
    if (accountIndex === -1) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Bank account not found.");
    }

    const accountToRemove = user.bankAccounts[accountIndex];
    user.bankAccounts.splice(accountIndex, 1);

    // If the removed account was primary, set the first approved one as primary
    if (accountToRemove.isPrimary && user.bankAccounts.length > 0) {
      const approvedAccount = user.bankAccounts.find(acc => acc.status === "approved");
      if (approvedAccount) {
        approvedAccount.isPrimary = true;
      }
    }

    await user.save();

    return apiSuccessRes(HTTP_STATUS.OK, res, "Bank account removed successfully.", {
      bankAccounts: user.bankAccounts
    });
  } catch (error) {
    console.error("Error in removeBankAccount:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2.4 Get Bank Accounts (Organizer)
const getOrganizerBankAccounts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select("bankAccounts");
    if (!user) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }
    return apiSuccessRes(HTTP_STATUS.OK, res, "Bank accounts fetched successfully.", {
      bankAccounts: user.bankAccounts || []
    });
  } catch (error) {
    console.error("Error in getOrganizerBankAccounts:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// 2.5 Request Payout (Organizer)
const requestPayout = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, paymentReference, accountId } = req.body; // accountId to select specific bank

    if (!amount || amount <= 0) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_AMOUNT);
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
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    if (user.payoutBalance < amount) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INSUFFICIENT_BALANCE);
    }

    let selectedBank = null;
    if (accountId) {
      selectedBank = user.bankAccounts?.find(b => b._id.toString() === accountId);
      if (!selectedBank) {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Selected bank account not found.");
      }
      if (selectedBank.status !== "approved") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Selected bank account is not approved.");
      }
    } else {
      // Fallback to primary or any approved bank
      selectedBank = user.bankAccounts?.find(b => b.isPrimary && b.status === "approved") ||
        user.bankAccounts?.find(b => b.status === "approved");
    }

    if (!selectedBank) {
      // Fallback to legacy bank verification check just in case
      if (user.verifications?.bankVerification?.status !== "approved") {
        return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "No approved bank account found for payout.");
      }
    }

    let finalPaymentReference = paymentReference || "Requested by user";
    if (selectedBank) {
      finalPaymentReference = `${finalPaymentReference} (Bank: ${selectedBank.bankName}, Acc: ${selectedBank.accountNumber})`;
    } else if (user.verifications?.bankVerification?.bankName) {
      finalPaymentReference = `${finalPaymentReference} (Bank: ${user.verifications.bankVerification.bankName}, Acc: ${user.verifications.bankVerification.accountNumber})`;
    }

    // 1. Create Payout Request
    const newPayout = new Payout({
      organizerId: userId,
      amount: amount,
      status: "PENDING",
      paymentReference: finalPaymentReference,
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PAYOUT_REQUEST_SUBMITTED, {
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PENDING_PAYOUTS_FETCHED, {
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
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.USER_NOT_FOUND);
    }

    if (ORGANIZER.payoutBalance < amount) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        constantsMessage.INSUFFICIENT_BALANCE,
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PAYOUT_MARKED_PAID, {
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.ADMIN_STATS_FETCHED, { stats });
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
          constantsMessage.PAYOUT_NOT_FOUND,
        );
      if (payout.status !== "PENDING")
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.PAYOUT_NOT_PENDING,
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

      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PAYOUT_APPROVED);
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
          constantsMessage.PAYOUT_NOT_FOUND,
        );
      if (payout.status !== "PENDING")
        return apiErrorRes(
          HTTP_STATUS.BAD_REQUEST,
          res,
          constantsMessage.PAYOUT_NOT_PENDING,
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

      return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PAYOUT_REJECTED);
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.FINANCE_STATS_FETCHED, {
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.PAYOUTS_FETCHED, {
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

    return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.TRANSACTIONS_FETCHED, {
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
router.post("/bank-details", checkRole([roleId.ORGANIZER]), updateBankDetails); // Legacy (Changed from PUT to POST)
router.get("/bank-accounts", checkRole([roleId.ORGANIZER]), getOrganizerBankAccounts);
router.post("/bank-accounts", checkRole([roleId.ORGANIZER]), addBankAccount);
router.post("/bank-accounts/set-primary/:accountId", checkRole([roleId.ORGANIZER]), setPrimaryBankAccount); // Changed from PUT to POST
router.post("/bank-accounts/delete/:accountId", checkRole([roleId.ORGANIZER]), removeBankAccount); // Changed from DELETE to POST
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
