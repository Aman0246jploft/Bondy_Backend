const { Transaction, User, Event, Course, SupportTicket, Payout } = require("../../db");
const { roleId } = require("../../utils/Role");
const { SUCCESS, SERVER_ERROR, DATA_NULL } = require("../../utils/constants");
const { resultDb } = require("../../utils/globalFunction");
const mongoose = require("mongoose");

/**
 * Get Global Statistics for Admin
 */
const getAdminStats = async () => {
  try {
    const [
      userStats,
      eventStats,
      courseStats,
      transactionStats,
      ticketStats,
      verificationStats,
      payoutStats
    ] = await Promise.all([
      // User Statistics
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalOrganizers: {
              $sum: { $cond: [{ $eq: ["$roleId", roleId.ORGANIZER] }, 1, 0] },
            },
            totalCustomers: {
              $sum: { $cond: [{ $eq: ["$roleId", roleId.CUSTOMER] }, 1, 0] },
            },
          },
        },
      ]),

      // Event Statistics
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

      // Course Statistics
      Course.aggregate([
        {
          $group: {
            _id: null,
            totalCourses: { $sum: 1 },
            featuredCourses: {
              $sum: { $cond: [{ $eq: ["$isFeatured", true] }, 1, 0] },
            },
          },
        },
      ]),

      // Transaction Statistics (Revenue + Course Enrollments)
      Transaction.aggregate([
        {
          $facet: {
            finance: [
              { $match: { status: "PAID" } },
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: "$totalAmount" },
                  totalEventRevenue: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "EVENT"] }, "$totalAmount", 0] },
                  },
                  totalCourseRevenue: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "COURSE"] }, "$totalAmount", 0] },
                  },
                  totalCommission: { $sum: "$commissionAmount" },
                  totalTicketsSold: { $sum: "$qty" },
                  totalEventTicketsSold: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "EVENT"] }, "$qty", 0] },
                  },
                  totalCourseTicketsSold: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "COURSE"] }, "$qty", 0] },
                  },
                },
              },
            ],
            courseEnrollments: [
              { $match: { status: "PAID", bookingType: "COURSE" } },
              {
                $group: {
                  _id: "$courseId",
                  enrollmentCount: { $sum: "$qty" },
                },
              },
              {
                $lookup: {
                  from: "courses",
                  localField: "_id",
                  foreignField: "_id",
                  as: "courseInfo",
                },
              },
              { $unwind: "$courseInfo" },
              {
                $project: {
                  courseId: "$_id",
                  courseTitle: "$courseInfo.title",
                  enrollmentCount: 1,
                },
              },
            ],
          },
        },
      ]),

      // Support Ticket Statistics
      SupportTicket.aggregate([
        {
          $group: {
            _id: null,
            totalTickets: { $sum: 1 },
            pendingTickets: {
              $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] },
            },
            openTickets: {
              $sum: { $cond: [{ $eq: ["$status", "Open"] }, 1, 0] },
            },
            resolvedTickets: {
              $sum: { $cond: [{ $eq: ["$status", "Resolved"] }, 1, 0] },
            },
          },
        },
      ]),

      // Verification Statistics (Pending Organizer Documents)
      User.aggregate([
        {
          $match: {
            roleId: roleId.ORGANIZER,
            "documents.0": { $exists: true },
          },
        },
        { $unwind: "$documents" },
        {
          $group: {
            _id: null,
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$documents.status", "pending"] }, 1, 0] },
            },
            rejectedCount: {
              $sum: { $cond: [{ $eq: ["$documents.status", "rejected"] }, 1, 0] },
            },
          },
        },
      ]),

      // Payout Statistics
      Payout.aggregate([
        {
          $match: { status: "PENDING" },
        },
        {
          $group: {
            _id: null,
            pendingCount: { $sum: 1 },
            pendingAmount: { $sum: "$amount" },
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
      courses: {
        ...(courseStats[0] || { totalCourses: 0, featuredCourses: 0 }),
        totalEnrollments: (transactionStats[0]?.courseEnrollments || []).reduce(
          (sum, c) => sum + (c.enrollmentCount || 0),
          0,
        ),
        perCourseEnrollments: transactionStats[0]?.courseEnrollments || [],
      },
      finance: transactionStats[0]?.finance[0] || {
        totalRevenue: 0,
        totalEventRevenue: 0,
        totalCourseRevenue: 0,
        totalCommission: 0,
        totalTicketsSold: 0,
        totalEventTicketsSold: 0,
        totalCourseTicketsSold: 0,
      },
      tickets: ticketStats[0] || {
        totalTickets: 0,
        pendingTickets: 0,
        openTickets: 0,
        resolvedTickets: 0,
      },
      verifications: verificationStats[0] || {
        pendingCount: 0,
        rejectedCount: 0,
      },
      payouts: payoutStats[0] || {
        pendingCount: 0,
        pendingAmount: 0,
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

    const [eventStats, courseStats, transactionStats] = await Promise.all([
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
            totalEventSeats: { $sum: "$totalTickets" },
          },
        },
      ]),
      Course.aggregate([
        { $match: { createdBy: organizerObjectId } },
        {
          $group: {
            _id: null,
            totalCourses: { $sum: 1 },
            featuredCourses: {
              $sum: { $cond: [{ $eq: ["$isFeatured", true] }, 1, 0] },
            },
            totalCourseSeats: { $sum: "$totalSeats" },
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
          $facet: {
            performance: [
              {
                $group: {
                  _id: null,
                  totalEarnings: { $sum: "$organizerEarning" },
                  totalEventEarnings: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "EVENT"] }, "$organizerEarning", 0] },
                  },
                  totalCourseEarnings: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "COURSE"] }, "$organizerEarning", 0] },
                  },
                  totalTicketsSold: { $sum: "$qty" },
                  totalEventTicketsSold: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "EVENT"] }, "$qty", 0] },
                  },
                  totalCourseTicketsSold: {
                    $sum: { $cond: [{ $eq: ["$bookingType", "COURSE"] }, "$qty", 0] },
                  },
                  totalBookings: { $sum: 1 },
                },
              },
            ],
            courseEnrollments: [
              { $match: { bookingType: "COURSE" } },
              {
                $group: {
                  _id: "$courseId",
                  enrollmentCount: { $sum: "$qty" },
                },
              },
              {
                $lookup: {
                  from: "courses",
                  localField: "_id",
                  foreignField: "_id",
                  as: "courseInfo",
                },
              },
              { $unwind: "$courseInfo" },
              {
                $project: {
                  courseId: "$_id",
                  courseTitle: "$courseInfo.title",
                  enrollmentCount: 1,
                },
              },
            ],
          },
        },
      ]),
    ]);

    const perf = transactionStats[0]?.performance[0] || {
      totalEarnings: 0,
      totalEventEarnings: 0,
      totalCourseEarnings: 0,
      totalTicketsSold: 0,
      totalEventTicketsSold: 0,
      totalCourseTicketsSold: 0,
      totalBookings: 0,
    };

    const stats = {
      events: {
        ...(eventStats[0] || {
          totalEvents: 0,
          upcomingEvents: 0,
          liveEvents: 0,
          pastEvents: 0,
          totalEventSeats: 0,
        }),
        totalTicketsSold: perf.totalEventTicketsSold,
        totalEarnings: perf.totalEventEarnings,
      },
      courses: {
        ...(courseStats[0] || {
          totalCourses: 0,
          featuredCourses: 0,
          totalCourseSeats: 0,
        }),
        totalEnrollments: (transactionStats[0]?.courseEnrollments || []).reduce(
          (sum, c) => sum + (c.enrollmentCount || 0),
          0,
        ),
        totalEarnings: perf.totalCourseEarnings,
        perCourseEnrollments: transactionStats[0]?.courseEnrollments || [],
      },
      performance: {
        totalEarnings: perf.totalEarnings,
        totalBookings: perf.totalBookings,
        totalTicketsSold: perf.totalTicketsSold,
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

    if (user.roleId === roleId.ORGANIZER) {
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
  getRevenueAnalytics,
};

/**
 * Get Revenue Analytics with Filters (for Charts)
 */
async function getRevenueAnalytics({ filter, startDate, endDate, organizerId = null }) {
  try {
    const now = new Date();
    let start = new Date();
    let groupFormat = "%Y-%m-%d"; // Default grouping by day

    // 1. Determine Date Range & Grouping
    if (filter === "7d") {
      start.setDate(now.getDate() - 7);
    } else if (filter === "14d") {
      start.setDate(now.getDate() - 14);
    } else if (filter === "1m") {
      start.setMonth(now.getMonth() - 1);
    } else if (filter === "6m") {
      start.setMonth(now.getMonth() - 6);
      groupFormat = "%Y-%m"; // Group by month
    } else if (filter === "1y") {
      start.setFullYear(now.getFullYear() - 1);
      groupFormat = "%Y-%m"; // Group by month
    } else if (filter === "custom" && startDate && endDate) {
      start = new Date(startDate);
      const end = new Date(endDate);
      const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (diffDays > 60) groupFormat = "%Y-%m"; // Group by month if range > 60 days
    } else {
      // Default to 7 days if invalid filter
      start.setDate(now.getDate() - 7);
    }

    // 2. Perform Aggregation
    const pipeline = [];

    // Initial match (status and date) - do this BEFORE lookups for optimization
    const baseMatch = {
      status: "PAID",
      createdAt: { $gte: start },
    };
    if (filter === "custom" && endDate) {
      baseMatch.createdAt.$lte = new Date(endDate);
    }
    pipeline.push({ $match: baseMatch });

    // If organizerId, we need lookups to filter by creator
    if (organizerId) {
      const orgObjectId = new mongoose.Types.ObjectId(organizerId);
      pipeline.push(
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
            $or: [
              { "eventInfo.createdBy": orgObjectId },
              { "courseInfo.createdBy": orgObjectId },
            ],
          },
        }
      );
    }

    pipeline.push(
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$createdAt" } },
          grossRevenue: { $sum: "$totalAmount" },
          netAdminRevenue: { $sum: "$commissionAmount" },
          netOrganizerRevenue: { $sum: "$organizerEarning" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } }
    );

    const aggResults = await Transaction.aggregate(pipeline);

    // 3. Post-Process to match requested Response Structure
    const labels = [];
    const grossRevenueArr = [];
    const netRevenueArr = [];
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    // Map aggregation results for easy lookup
    const resultMap = {};
    aggResults.forEach((item) => {
      resultMap[item._id] = item;
    });

    // Fill the timeline
    const current = new Date(start);
    const end = filter === "custom" && endDate ? new Date(endDate) : now;

    if (groupFormat === "%Y-%m") {
      // Monthly steps
      while (current <= end) {
        const key = current.toISOString().slice(0, 7); // YYYY-MM
        const label = monthNames[current.getMonth()];
        labels.push(label);

        const data = resultMap[key] || { grossRevenue: 0, netAdminRevenue: 0, netOrganizerRevenue: 0 };
        grossRevenueArr.push(data.grossRevenue);
        netRevenueArr.push(organizerId ? data.netOrganizerRevenue : data.netAdminRevenue);

        current.setMonth(current.getMonth() + 1);
      }
    } else {
      // Daily steps
      while (current <= end) {
        const key = current.toISOString().slice(0, 10); // YYYY-MM-DD
        // For 7d, use day name, otherwise use date string
        const label = filter === "7d" 
          ? current.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
          : key;
        labels.push(label);

        const data = resultMap[key] || { grossRevenue: 0, netAdminRevenue: 0, netOrganizerRevenue: 0 };
        grossRevenueArr.push(data.grossRevenue);
        netRevenueArr.push(organizerId ? data.netOrganizerRevenue : data.netAdminRevenue);

        current.setDate(current.getDate() + 1);
      }
    }

    const totalGross = grossRevenueArr.reduce((a, b) => a + b, 0);
    const totalNet = netRevenueArr.reduce((a, b) => a + b, 0);

    return resultDb(SUCCESS, {
      labels,
      grossRevenue: grossRevenueArr,
      netRevenue: netRevenueArr,
      summary: {
        totalGross,
        totalNet,
        currency: "₮", // Defaulting to ₮ as seen in current localization requirements
      },
    });
  } catch (error) {
    console.error("Error in getRevenueAnalytics service:", error);
    return resultDb(SERVER_ERROR, DATA_NULL);
  }
}
