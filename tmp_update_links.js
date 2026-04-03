require("dotenv").config();
const mongoose = require("mongoose");
const { DB_STRING } = process.env;

const globalSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String, default: null }
});

const GlobalSetting = mongoose.model("GlobalSetting", globalSettingSchema);

async function update() {
    try {
        await mongoose.connect(DB_STRING);
        console.log("Connected to DB...");

        const setting = await GlobalSetting.findOne({ key: "SOCIAL_LINKS" });
        if (setting) {
            const newValue = {
                facebook: setting.value.facebook || "#",
                linkedin: setting.value.linkedin || "#",
                instagram: setting.value.instagram || "#",
                youtube: setting.value.youtube || "#",
                apple_store: setting.value.apple_store || "#",
                google_play: setting.value.google_play || "#"
            };
            setting.value = newValue;
            await setting.save();
            console.log("Updated SOCIAL_LINKS with app store links.");
        } else {
            console.log("SOCIAL_LINKS not found, it will be seeded by the next server start.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Update failed:", err.message);
        process.exit(1);
    }
}

update();
