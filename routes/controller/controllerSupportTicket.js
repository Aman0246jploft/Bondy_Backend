const express = require("express");
const router = express.Router();
const { SupportTicket, User } = require("../../db");
const constantsMessage = require("../../utils/constantsMessage");
const HTTP_STATUS = require("../../utils/statusCode");
const {
  apiErrorRes,
  apiSuccessRes,
  formatResponseUrl,
} = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const validateRequest = require("../../middlewares/validateRequest");
const perApiLimiter = require("../../middlewares/rateLimiter");
const { roleId } = require("../../utils/Role");
const {
  createTicketSchema,
  updateTicketStatusSchema,
  getTicketsSchema,
} = require("../services/validations/supportValidation");

// Helper to generate Ticket ID
const generateTicketId = () => {
  // Simple format: TKT-TIMESTAMP-RANDOM
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `TKT-${timestamp}-${random}`;
};

// Create Ticket
const createTicket = async (req, res) => {
  try {
    const { category, subject, description, images } = req.body;
    const userId = req.user.userId;

    const ticketId = generateTicketId();

    const newTicket = new SupportTicket({
      ticketId,
      user: userId,
      category,
      subject,
      description,
      images: images || [],
    });

    await newTicket.save();

    return apiSuccessRes(
      HTTP_STATUS.CREATED,
      res,
      "Support ticket created successfully",
      { ticket: newTicket },
    );
  } catch (error) {
    console.error("Error creating ticket:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get My Tickets
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, category, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const query = { user: userId };
    if (status) query.status = status;
    if (category) query.category = category;

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await SupportTicket.countDocuments(query);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Tickets fetched successfully", {
      tickets,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error getting my tickets:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin: Get All Tickets
const getAllTickets = async (req, res) => {
  try {
    const {
      status,
      category,
      ticketId,
      userId,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (ticketId) query.ticketId = { $regex: ticketId, $options: "i" };
    if (userId) query.user = userId;

    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { ticketId: { $regex: search, $options: "i" } },
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const tickets = await SupportTicket.find(query)
      .populate("user", "firstName lastName email profileImage contactNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Format images
    tickets.forEach((t) => {
      if (t.user && t.user.profileImage) {
        t.user.profileImage = formatResponseUrl(t.user.profileImage);
      }
    });

    const total = await SupportTicket.countDocuments(query);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Tickets fetched successfully", {
      tickets,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error getting all tickets:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Admin: Update Ticket Status
const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, adminComment } = req.body;
    const adminId = req.user.userId;

    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Ticket not found");
    }

    ticket.status = status;

    if (adminComment) {
      ticket.adminComments.push({
        comment: adminComment,
        adminId: adminId,
        createdAt: new Date(),
      });
    }

    await ticket.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Ticket status updated successfully",
      { ticket },
    );
  } catch (error) {
    console.error("Error updating ticket status:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Get Single Ticket Details
const getTicketDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.userId;
    const role = req.user.roleId;

    const query = { ticketId };

    // If not admin, user can only see their own ticket
    if (role !== roleId.SUPER_ADMIN) {
      query.user = userId;
    }

    const ticket = await SupportTicket.findOne(query)
      .populate("user", "firstName lastName email profileImage")
      .populate("adminComments.adminId", "firstName lastName")
      .lean();

    if (!ticket) {
      return apiErrorRes(
        HTTP_STATUS.NOT_FOUND,
        res,
        "Ticket not found or access denied",
      );
    }

    if (ticket.user && ticket.user.profileImage) {
      ticket.user.profileImage = formatResponseUrl(ticket.user.profileImage);
    }

    return apiSuccessRes(HTTP_STATUS.OK, res, "Ticket details fetched", {
      ticket,
    });
  } catch (error) {
    console.error("Error getting ticket details:", error);
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post(
  "/create",
  perApiLimiter(),
  checkRole([roleId.CUSTOMER, roleId.ORGANIZER]),
  validateRequest(createTicketSchema),
  createTicket,
);

router.get(
  "/my-tickets",
  perApiLimiter(),
  checkRole([roleId.CUSTOMER, roleId.ORGANIZER]),
  getMyTickets,
);

router.get(
  "/admin/list",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(getTicketsSchema),
  getAllTickets,
);

router.put(
  "/admin/update/:ticketId",
  perApiLimiter(),
  checkRole([roleId.SUPER_ADMIN]),
  validateRequest(updateTicketStatusSchema),
  updateTicketStatus,
);

router.get("/:ticketId", perApiLimiter(), getTicketDetails);

module.exports = router;
