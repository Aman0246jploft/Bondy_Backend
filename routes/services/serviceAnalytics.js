const { Transaction, User, Event, Course } = require("../../db");
const { roleId } = require("../../utils/Role");
const { SUCCESS, SERVER_ERROR, DATA_NULL } = require("../../utils/constants");
const { resultDb } = require("../../utils/globalFunction");
const mongoose = require("mongoose");

/**
 * Get Global Statistics for Admin
 */
const getAdminStats = async () => {
  try {
    const [userStats, eventStats, transactionStats] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalOrganizers: {
              $sum: { $cond: [{ $eq: ["$roleId", roleId.ORGANISER] }, 1, 0] },
            },
            totalCustomers: {
              $sum: { $cond: [{ $eq: ["$roleId", roleId.CUSTOMER] }, 1, 0] },
            },
          },
        },
      ]),
      Event.aggregate([
        {
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            upcomingEvents: {
              $sum: { $cond: [{ $eq: ["$status", "Upcoming"] }, 1, 0] },
            },
            liveEvents: {
              $sum: { $cond: [{ $eq: ["$status", "Live"] }, 1, 0] },
            },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { status: "PAID" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            totalCommission: { $sum: "$commissionAmount" },
            totalTicketsSold: { $sum: "$qty" },
          },
        },
      ]),
    ]);

    const stats = {
      users: userStats[0] || {
        totalUsers: 0,
        totalOrganizers: 0,
        totalCustomers: 0,
      },
      events: eventStats[0] || {
        totalEvents: 0,
        upcomingEvents: 0,
        liveEvents: 0,
      },
      finance: transactionStats[0] || {
        totalRevenue: 0,
        totalCommission: 0,
        totalTicketsSold: 0,
      },
    };

    return resultDb(SUCCESS, stats);
  } catch (error) {
    console.error("Error in getAdminStats service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

/**
 * Get Statistics for a specific Organizer
 */
const getOrganizerStats = async (organizerId) => {
  try {
    const organizerObjectId = new mongoose.Types.ObjectId(organizerId);

    const [eventStats, transactionStats] = await Promise.all([
      Event.aggregate([
        { $match: { createdBy: organizerObjectId } },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            upcomingEvents: {
              $sum: { $cond: [{ $eq: ["$status", "Upcoming"] }, 1, 0] },
            },
            liveEvents: {
              $sum: { $cond: [{ $eq: ["$status", "Live"] }, 1, 0] },
            },
            pastEvents: {
              $sum: { $cond: [{ $eq: ["$status", "Past"] }, 1, 0] },
            },
          },
        },
      ]),
      Transaction.aggregate([
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
            totalEarnings: { $sum: "$organizerEarning" },
            totalTicketsSold: { $sum: "$qty" },
            totalBookings: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = {
      events: eventStats[0] || {
        totalEvents: 0,
        upcomingEvents: 0,
        liveEvents: 0,
        pastEvents: 0,
      },
      performance: transactionStats[0] || {
        totalEarnings: 0,
        totalTicketsSold: 0,
        totalBookings: 0,
      },
    };

    return resultDb(SUCCESS, stats);
  } catch (error) {
    console.error("Error in getOrganizerStats service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

/**
 * Get Statistics for a specific Customer
 */
const getCustomerStats = async (customerId) => {
  try {
    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    const stats = await Transaction.aggregate([
      { $match: { userId: customerObjectId, status: "PAID" } },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: "$totalAmount" },
          totalBookings: { $sum: 1 },
          totalTicketsPurchased: { $sum: "$qty" },
        },
      },
    ]);

    return resultDb(
      SUCCESS,
      stats[0] || { totalSpent: 0, totalBookings: 0, totalTicketsPurchased: 0 },
    );
  } catch (error) {
    console.error("Error in getCustomerStats service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

/**
 * Generic Fetch for Admin to view User Stats
 */
const getUserStatsForAdmin = async (targetUserId) => {
  try {
    const user = await User.findById(targetUserId);
    if (!user) return resultDb(SERVER_ERROR, "User not found");

    if (user.roleId === roleId.ORGANISER) {
      return await getOrganizerStats(targetUserId);
    } else {
      return await getCustomerStats(targetUserId);
    }
  } catch (error) {
    console.error("Error in getUserStatsForAdmin service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
};

module.exports = {
  getAdminStats,
  getOrganizerStats,
  getCustomerStats,
  getUserStatsForAdmin,
};
