const express = require("express");
const router = express.Router();
const Contact = require("../../db/models/Contact");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");
// const perApiLimiter = require("../../middlewares/rateLimiter"); // Optional, but good practice

const createContact = async (req, res) => {
  try {
    const { fullName, email, phone, topic, message } = req.body;

    if (!fullName || !email || !message) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Name, Email and Message are required",
      );
    }

    const newContact = new Contact({
      fullName,
      email,
      phone,
      topic,
      message,
    });

    await newContact.save();

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Message sent successfully",
      newContact,
    );
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const listContacts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { fullName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { topic: { $regex: search, $options: "i" } },
        ],
      };
    }

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Contact.countDocuments(query);

    return apiSuccessRes(HTTP_STATUS.OK, res, "Contacts fetched successfully", {
      contacts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const deleteContact = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Contact ID is required",
      );
    }

    await Contact.findByIdAndDelete(id);
    return apiSuccessRes(HTTP_STATUS.OK, res, "Contact deleted successfully");
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

const updateContact = async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return apiErrorRes(
        HTTP_STATUS.BAD_REQUEST,
        res,
        "Contact ID and Status are required",
      );
    }

    const validStatuses = ["New", "Read", "Replied"];
    if (!validStatuses.includes(status)) {
      return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, "Invalid status");
    }

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );

    if (!contact) {
      return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Contact not found");
    }

    return apiSuccessRes(
      HTTP_STATUS.OK,
      res,
      "Contact status updated successfully",
      contact,
    );
  } catch (error) {
    return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
  }
};

// Routes
router.post("/createContact", createContact);
router.get("/listContacts", checkRole([roleId.SUPER_ADMIN]), listContacts);
router.post("/deleteContact", checkRole([roleId.SUPER_ADMIN]), deleteContact);
router.post("/updateContact", checkRole([roleId.SUPER_ADMIN]), updateContact);

module.exports = router;
