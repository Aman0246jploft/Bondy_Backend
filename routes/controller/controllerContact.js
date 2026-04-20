const express = require("express");
const router = express.Router();
const Contact = require("../../db/models/Contact");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiSuccessRes, apiErrorRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");
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
                constantsMessage.CONTACT_REQUIRED_FIELDS,
            );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_EMAIL);
        }

        const newContact = new Contact({
            fullName,
            email,
            phone,
            topic: topic || "General",
            message,
        });

        await newContact.save();

        return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            constantsMessage.MESSAGE_SENT,
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

        return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.CONTACTS_FETCHED, {
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
                constantsMessage.CONTACT_ID_REQUIRED,
            );
        }

        await Contact.findByIdAndDelete(id);
        return apiSuccessRes(HTTP_STATUS.OK, res, constantsMessage.CONTACT_DELETED);
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
                constantsMessage.CONTACT_UPDATE_REQUIRED_FIELDS,
            );
        }

        const validStatuses = ["New", "Read", "Replied"];
        if (!validStatuses.includes(status)) {
            return apiErrorRes(HTTP_STATUS.BAD_REQUEST, res, constantsMessage.INVALID_STATUS);
        }

        const contact = await Contact.findByIdAndUpdate(
            id,
            { status },
            { new: true },
        );

        if (!contact) {
            return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, constantsMessage.CONTACT_NOT_FOUND);
        }

        return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            constantsMessage.CONTACT_STATUS_UPDATED,
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
