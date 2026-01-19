const express = require("express");
const router = express.Router();
const { GlobalSetting } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const checkRole = require("../../middlewares/checkRole");
const { roleId } = require("../../utils/Role");

// 1. Get Setting by Key
const getSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await GlobalSetting.findOne({ key });
        if (!setting) {
            return apiErrorRes(HTTP_STATUS.NOT_FOUND, res, "Setting not found");
        }
        return apiSuccessRes(HTTP_STATUS.OK, res, "Setting fetched", setting);
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// 2. Create or Update Setting
const upsertSetting = async (req, res) => {
    try {
        const { key, value, description } = req.body;
        const setting = await GlobalSetting.findOneAndUpdate(
            { key },
            { $set: { value, description } },
            { upsert: true, new: true }
        );
        return apiSuccessRes(HTTP_STATUS.OK, res, "Setting updated", setting);
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// 3. Get All Settings
const getAllSettings = async (req, res) => {
    try {
        const settings = await GlobalSetting.find().sort({ key: 1 });
        return apiSuccessRes(HTTP_STATUS.OK, res, "All settings fetched", { settings });
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// --- Routes ---
router.get("/all", checkRole([roleId.SUPER_ADMIN]), getAllSettings);
router.get("/:key", checkRole([roleId.SUPER_ADMIN]), getSetting);
router.post("/upsert", checkRole([roleId.SUPER_ADMIN]), upsertSetting);

module.exports = router;
