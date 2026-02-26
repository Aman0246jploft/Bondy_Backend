const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSettingSchema = new Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true, // Typically one setting document per user
        },
        inAppNotification: {
            type: Boolean,
            default: true,
        },
        pushNotification: {
            type: Boolean,
            default: true,
        },
        emailNotification: {
            type: Boolean,
            default: true,
        },
        whatsappNotification: {
            type: Boolean,
            default: false,
        },
        smsNotification: {
            type: Boolean,
            default: false,
        },
        appTheme: {
            type: String,
            enum: ["light", "dark"],
            default: "dark",
        },
        language: {
            type: String,
            enum: ["English", "Mongolian"],
            default: "English",
        },
    },
    {
        timestamps: true,
    }
);

UserSettingSchema.options.toJSON = {
    transform: function (doc, ret, options) {
        delete ret.__v;
        return ret;
    },
};

module.exports = mongoose.model("UserSetting", UserSettingSchema, "UserSettings");
