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
            bookingNotification,
            reminderNotification,
            organizerUpdateNotification,
            messageNotification,
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

        // Fetch current settings
        let currentSetting = await UserSetting.findOne({ userId });
        if (!currentSetting) {
            currentSetting = await UserSetting.create({ userId });
        }

        const payload = {};
        if (inAppNotification !== undefined) payload.inAppNotification = inAppNotification;
        if (emailNotification !== undefined) payload.emailNotification = emailNotification;
        if (whatsappNotification !== undefined) payload.whatsappNotification = whatsappNotification;
        if (smsNotification !== undefined) payload.smsNotification = smsNotification;
        if (appTheme !== undefined) payload.appTheme = appTheme;
        if (language !== undefined) payload.language = language;

        // Toggle logic:
        if (pushNotification !== undefined) {
            payload.pushNotification = pushNotification;

            // "when main is toggle then all will toggle"
            if (currentSetting.pushNotification !== pushNotification) {
                payload.bookingNotification = pushNotification;
                payload.reminderNotification = pushNotification;
                payload.organizerUpdateNotification = pushNotification;
                payload.messageNotification = pushNotification;
            }
        }

        const isMainToggled = (pushNotification !== undefined && currentSetting.pushNotification !== pushNotification);

        if (!isMainToggled) {
            const activePush = pushNotification !== undefined ? pushNotification : currentSetting.pushNotification;

            if (bookingNotification !== undefined) {
                payload.bookingNotification = bookingNotification;
            }
            if (reminderNotification !== undefined) {
                payload.reminderNotification = reminderNotification;
            }
            if (organizerUpdateNotification !== undefined) {
                payload.organizerUpdateNotification = organizerUpdateNotification;
            }
            if (messageNotification !== undefined) {
                payload.messageNotification = messageNotification;
            }

            const newBooking = bookingNotification !== undefined ? bookingNotification : currentSetting.bookingNotification;
            const newReminder = reminderNotification !== undefined ? reminderNotification : currentSetting.reminderNotification;
            const newOrganizer = organizerUpdateNotification !== undefined ? organizerUpdateNotification : currentSetting.organizerUpdateNotification;
            const newMessage = messageNotification !== undefined ? messageNotification : currentSetting.messageNotification;

            const hasAnyActiveSub = newBooking || newReminder || newOrganizer || newMessage;

            if (hasAnyActiveSub && !activePush) {
                // Auto-enable main push toggle if user turns on any sub-preference
                payload.pushNotification = true;
            } else if (!hasAnyActiveSub && activePush) {
                // Auto-disable main push toggle if all sub-preferences are turned off
                payload.pushNotification = false;
            }
        }

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
