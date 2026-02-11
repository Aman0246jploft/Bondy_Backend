require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../db/index"); // adjust path if needed
const { roleId } = require("../utils/Role");
const jwt = require("jsonwebtoken");

const createGuestUser = async () => {
    try {
        const data = {
            firstName: "Guest",
            lastName: "User",
            email: "guest@bondy.com",
            password: "guestpassword123", // Strong password, though likely won't be used for login
            roleId: roleId.GUEST,
            isDisable: false,
            isDeleted: false,
        };

        // Check if guest user already exists
        let guestUser = await User.findOne({ email: data.email });

        if (!guestUser) {
            guestUser = new User(data);
            await guestUser.save();
            console.log("Guest User created successfully.");
        } else {
            console.log("Guest User already exists. Updating token...");
        }

        // Generate Long-Lived Token (100 years)
        const tokenPayload = {
            userId: guestUser._id,
            roleId: guestUser.roleId,
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET_KEY, {
            expiresIn: "36500d", // ~100 years
        });

        console.log("\n==================================================");
        console.log("GUEST USER DETAILS");
        console.log("==================================================");
        console.log(`User ID: ${guestUser._id}`);
        console.log(`Email: ${guestUser.email}`);
        console.log(`Role ID: ${guestUser.roleId}`);
        console.log("\nPERMANENT JWT TOKEN (Expires in 100 years):");
        console.log(token);
        console.log("==================================================\n");

        process.exit(0);
    } catch (error) {
        console.error("Error creating guest user:", error);
        process.exit(1);
    }
};

(async () => {
    await createGuestUser();
})();
