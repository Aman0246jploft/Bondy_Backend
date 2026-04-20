const express = require("express");
const router = express.Router();
const { UserSetting } = require("../../db");
const HTTP_STATUS = require("../../utils/statusCode");
const { apiErrorRes, apiSuccessRes } = require("../../utils/globalFunction");
const constantsMessage = require("../../utils/constantsMessage");

// 1. Get User Setting
const getUserSetting = async (req, res) => {
    try {
        const userId = req.user.userId;

        let setting = await UserSetting.findOne({ userId })
            .populate("userId", "firstName lastName email profileImage");


        // If no setting found, create default one
        if (!setting) {
            setting = await UserSetting.create({ userId });

            // Populate after creation
            setting = await setting.populate("userId", "firstName lastName email profileImage");
        }

        return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            constantsMessage.USER_SETTING_FETCHED,
            setting
        );
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// 2. Update User Setting
const updateUserSetting = async (req, res) => {
    try {
        const userId = req.user.userId;

        const {
            inAppNotification,
            pushNotification,
            emailNotification,
            whatsappNotification,
            smsNotification,
            appTheme,
            language
        } = req.body;

        // Validate enum values
        if (appTheme && !["light", "dark"].includes(appTheme)) {
            return apiErrorRes(
                HTTP_STATUS.BAD_REQUEST,
                res,
                "Invalid appTheme value. Allowed values: 'light', 'dark'."
            );
        }

        if (language && !["English", "Mongolian"].includes(language)) {
            return apiErrorRes(
                HTTP_STATUS.BAD_REQUEST,
                res,
                "Invalid language value. Allowed values: 'English', 'Mongolian'."
            );
        }

        const payload = {};
        if (inAppNotification !== undefined) payload.inAppNotification = inAppNotification;
        if (pushNotification !== undefined) payload.pushNotification = pushNotification;
        if (emailNotification !== undefined) payload.emailNotification = emailNotification;
        if (whatsappNotification !== undefined) payload.whatsappNotification = whatsappNotification;
        if (smsNotification !== undefined) payload.smsNotification = smsNotification;
        if (appTheme !== undefined) payload.appTheme = appTheme;
        if (language !== undefined) payload.language = language;

        const setting = await UserSetting.findOneAndUpdate(
            { userId },
            { $set: payload },
            { upsert: true, new: true }
        ).populate("userId", "firstName lastName email profileImage");

        return apiSuccessRes(
            HTTP_STATUS.OK,
            res,
            constantsMessage.USER_SETTING_UPDATED,
            setting
        );
    } catch (error) {
        return apiErrorRes(HTTP_STATUS.SERVER_ERROR, res, error.message);
    }
};

// --- Routes ---
router.get("/", getUserSetting);
// router.put("/", updateUserSetting);
router.post("/", updateUserSetting);

module.exports = router;
