const express = require("express");
const router = express.Router();
const { Transaction, User, Payout, GlobalSetting } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

// --- Organizer APIs ---

// 1. Get Earnings Summary (Organizer)
const getOrganizerEarnings = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).select("totalEarnings payoutBalance bankDetails");

        const payoutHistory = await Payout.find({ organizerId: userId }).sort({ createdAt: -1 });

        return apiSuccessRes(HTTP_STATUS.OK, res, "Earnings fetched successfully", {
            totalEarnings: user.totalEarnings,
            payoutBalance: user.payoutBalance,
            bankDetails: user.bankDetails,
            payoutHistory,
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
        const { accountName, accountNumber, bankName, ifscCode, swiftCode } = req.body;

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
            { new: true }
        );

        return apiSuccessRes(HTTP_STATUS.OK, res, "Bank details updated", {
            bankDetails: user.bankDetails,
        });
    } catch (error) {
        console.error("Error in updateBankDetails:", error);
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// --- Admin APIs ---

// 3. Get Pending Payouts (Admin)
const getPendingPayouts = async (req, res) => {
    try {
        const organisers = await User.find({ roleId: roleId.ORGANISER, payoutBalance: { $gt: 0 } })
            .select("firstName lastName email contactNumber bankDetails payoutBalance")
            .sort({ payoutBalance: -1 });

        return apiSuccessRes(HTTP_STATUS.OK, res, "Pending payouts fetched", { organisers });
    } catch (error) {
        console.error("Error in getPendingPayouts:", error);
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// 4. Mark Payout as Paid (Admin)
const markPayoutAsPaid = async (req, res) => {
    try {
        const { organiserId, amount, paymentReference, adminNote } = req.body;

        const organiser = await User.findById(organiserId);
        if (!organiser) {
            return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Organiser not found");
        }

        if (organiser.payoutBalance < amount) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Insufficient payout balance");
        }

        // Create Payout Record
        const payout = new Payout({
            organizerId: organiserId,
            amount,
            paymentReference,
            adminNote,
            status: "PAID",
            paidAt: new Date(),
        });
        await payout.save();

        // Deduct from Balance
        organiser.payoutBalance -= amount;
        await organiser.save();

        return apiSuccessRes(HTTP_STATUS.OK, res, "Payout marked as paid", { payout });
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
            stats.totalCommission += (tnx.commissionAmount || 0);
            stats.totalEarningToOrganizers += (tnx.organizerEarning || 0);

            if (tnx.bookingType === "EVENT") stats.eventTransactionCount++;
            else stats.courseTransactionCount++;
        });

        // Payout stats
        const paidPayouts = await Payout.find({ status: "PAID" });
        const pendingPayoutBalance = await User.aggregate([
            { $match: { payoutBalance: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: "$payoutBalance" } } }
        ]);

        stats.totalPayoutsMade = paidPayouts.reduce((sum, p) => sum + p.amount, 0);
        stats.totalPayoutsPending = pendingPayoutBalance.length > 0 ? pendingPayoutBalance[0].total : 0;

        return apiSuccessRes(HTTP_STATUS.OK, res, "Admin stats fetched", { stats });
    } catch (error) {
        console.error("Error in getAdminStats:", error);
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// --- Routes Definitions ---

// Organizer Routes
router.get("/earnings", checkRole([roleId.ORGANISER]), getOrganizerEarnings);
router.put("/bank-details", checkRole([roleId.ORGANISER]), updateBankDetails);

// Admin Routes
router.get("/pending-payouts", checkRole([roleId.SUPER_ADMIN]), getPendingPayouts);
router.post("/mark-paid", checkRole([roleId.SUPER_ADMIN]), markPayoutAsPaid);
router.get("/admin-stats", checkRole([roleId.SUPER_ADMIN]), getAdminStats);

module.exports = router;
