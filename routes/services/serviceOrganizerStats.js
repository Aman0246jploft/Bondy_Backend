const {
  Transaction,
  User,
  WalletHistory,
  Payout,
  Event,
  Course,
} = require("../../db");
const { roleId } = require("../../utils/Role");
const { SUCCESS, SERVER_ERROR, DATA_NULL } = require("../../utils/constants");
const { resultDb } = require("../../utils/globalFunction");
const mongoose = require("mongoose");

/**
 * Get all transactions for a specific organizer with filters
 */
const getOrganizerTransactions = async (organizerId, filters = {}) => {
  try {
    const organizerObjectId = new mongoose.Types.ObjectId(organizerId);
    const pageNum = parseInt(filters.page) || 1;
    const limitNum = parseInt(filters.limit) || 10;
    const { status, bookingType, startDate, endDate } = filters;
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions
    const matchConditions = {
      status: "PAID", // Base: only PAID transactions
    };

    if (status) {
      matchConditions.status = status;
    }

    if (bookingType) {
      matchConditions.bookingType = bookingType;
    }

    if (startDate || endDate) {
      matchConditions.createdAt = {};
      if (startDate) {
        matchConditions.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchConditions.createdAt.$lte = new Date(endDate);
      }
    }
    16031711969063;
    // Aggregation pipeline
    const pipeline = [
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "eventInfo",
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          as: "courseInfo",
        },
      },
      {
        $match: {
          ...matchConditions,
          $or: [
            { "eventInfo.createdBy": organizerObjectId },
            { "courseInfo.createdBy": organizerObjectId },
          ],
        },
      },
      {
        $lookup: {
          from: "User",
          localField: "userId",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          eventInfo: { $arrayElemAt: ["$eventInfo", 0] },
          courseInfo: { $arrayElemAt: ["$courseInfo", 0] },
        },
      },
      {
        $project: {
          bookingId: 1,
          bookingType: 1,
          itemName: {
            $cond: {
              if: { $eq: ["$bookingType", "EVENT"] },
              then: "$eventInfo.eventTitle",
              else: "$courseInfo.courseTitle",
            },
          },
          customerName: {
            $concat: [
              { $ifNull: ["$customerInfo.firstName", ""] },
              " ",
              { $ifNull: ["$customerInfo.lastName", ""] },
            ],
          },
          customerEmail: "$customerInfo.email",
          qty: 1,
          basePrice: 1,
          taxAmount: 1,
          discountAmount: 1,
          totalAmount: 1,
          commissionAmount: 1,
          organizerEarning: 1,
          status: 1,
          createdAt: 1,
          discountCode: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    // Get total count
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Transaction.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Get paginated data
    const dataPipeline = [...pipeline, { $skip: skip }, { $limit: limitNum }];
    const transactions = await Transaction.aggregate(dataPipeline);

    // Calculate total admin commission from filtered results
    const commissionPipeline = [
      ...pipeline,
      {
        $group: {
          _id: null,
          totalCommission: { $sum: "$commissionAmount" },
          totalRevenue: { $sum: "$totalAmount" },
          totalOrganizerEarning: { $sum: "$organizerEarning" },
        },
      },
    ];
    const commissionResult = await Transaction.aggregate(commissionPipeline);
    const totals =
      commissionResult.length > 0
        ? commissionResult[0]
        : {
            totalCommission: 0,
            totalRevenue: 0,
            totalOrganizerEarning: 0,
          };

    return resultDb(SUCCESS, {
      transactions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      totals: {
        totalCommission: totals.totalCommission || 0,
        totalRevenue: totals.totalRevenue || 0,
        totalOrganizerEarning: totals.totalOrganizerEarning || 0,
      },
    });
  } catch (error) {
    console.error("Error in getOrganizerTransactions service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

/**
 * Get wallet history for a specific organizer with filters
 */
const getOrganizerWalletHistory = async (organizerId, filters = {}) => {
  try {
    const organizerObjectId = new mongoose.Types.ObjectId(organizerId);
    const { page = 1, limit = 10, type, startDate, endDate } = filters;
    const skip = (page - 1) * limit;

    // Build match conditions
    const matchConditions = {
      userId: organizerObjectId,
    };

    if (type) {
      matchConditions.type = type;
    }

    if (startDate || endDate) {
      matchConditions.createdAt = {};
      if (startDate) {
        matchConditions.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchConditions.createdAt.$lte = new Date(endDate);
      }
    }

    // Get total count
    const total = await WalletHistory.countDocuments(matchConditions);

    // Get paginated data
    const walletHistory = await WalletHistory.find(matchConditions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("transactionId", "bookingId bookingType")
      .populate("payoutId", "amount status")
      .lean();

    // Get current wallet balance from User
    const user = await User.findById(organizerId).select(
      "payoutBalance totalEarnings",
    );

    return resultDb(SUCCESS, {
      walletHistory,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      currentBalance: user?.payoutBalance || 0,
      totalEarnings: user?.totalEarnings || 0,
    });
  } catch (error) {
    console.error("Error in getOrganizerWalletHistory service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

/**
 * Get payout requests for a specific organizer with filters
 */
const getOrganizerPayouts = async (organizerId, filters = {}) => {
  try {
    const organizerObjectId = new mongoose.Types.ObjectId(organizerId);
    const { page = 1, limit = 10, status } = filters;
    const skip = (page - 1) * limit;

    // Build match conditions
    const matchConditions = {
      organizerId: organizerObjectId,
    };

    if (status) {
      matchConditions.status = status;
    }

    // Get total count
    const total = await Payout.countDocuments(matchConditions);

    // Get paginated data
    const payouts = await Payout.find(matchConditions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("transactionIds", "bookingId totalAmount")
      .lean();

    return resultDb(SUCCESS, {
      payouts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error in getOrganizerPayouts service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

/**
 * Get summary statistics for a specific organizer
 */
const getOrganizerStatsSummary = async (organizerId) => {
  try {
    const organizerObjectId = new mongoose.Types.ObjectId(organizerId);

    // Get user wallet info
    const user = await User.findById(organizerId).select(
      "payoutBalance totalEarnings",
    );
    if (!user) {
      return resultDb(SERVER_ERROR, "Organizer not found");
    }

    // Get event stats
    const eventStats = await Event.aggregate([
      { $match: { createdBy: organizerObjectId } },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          upcomingEvents: {
            $sum: { $cond: [{ $eq: ["$status", "Upcoming"] }, 1, 0] },
          },
          liveEvents: { $sum: { $cond: [{ $eq: ["$status", "Live"] }, 1, 0] } },
          pastEvents: { $sum: { $cond: [{ $eq: ["$status", "Past"] }, 1, 0] } },
        },
      },
    ]);

    // Get course stats
    const courseStats = await Course.aggregate([
      { $match: { createdBy: organizerObjectId } },
      {
        $group: {
          _id: null,
          totalCourses: { $sum: 1 },
        },
      },
    ]);

    // Get transaction stats
    const transactionStats = await Transaction.aggregate([
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "eventInfo",
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courseId",
          foreignField: "_id",
          as: "courseInfo",
        },
      },
      {
        $match: {
          status: "PAID",
          $or: [
            { "eventInfo.createdBy": organizerObjectId },
            { "courseInfo.createdBy": organizerObjectId },
          ],
        },
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          totalCommission: { $sum: "$commissionAmount" },
          totalOrganizerEarning: { $sum: "$organizerEarning" },
          totalTicketsSold: { $sum: "$qty" },
        },
      },
    ]);

    const summary = {
      wallet: {
        currentBalance: user.payoutBalance || 0,
        totalEarnings: user.totalEarnings || 0,
      },
      events: eventStats[0] || {
        totalEvents: 0,
        upcomingEvents: 0,
        liveEvents: 0,
        pastEvents: 0,
      },
      courses: courseStats[0] || { totalCourses: 0 },
      transactions: transactionStats[0] || {
        totalBookings: 0,
        totalRevenue: 0,
        totalCommission: 0,
        totalOrganizerEarning: 0,
        totalTicketsSold: 0,
      },
    };

    return resultDb(SUCCESS, summary);
  } catch (error) {
    console.error("Error in getOrganizerStatsSummary service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

module.exports = {
  getOrganizerTransactions,
  getOrganizerWalletHistory,
  getOrganizerPayouts,
  getOrganizerStatsSummary,
};
