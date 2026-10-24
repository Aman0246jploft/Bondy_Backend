require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../db/index"); // adjust path if needed
const { roleId } = require("../utils/Role");

const adminCreate = async () => {
  try {
    const data = {
      firstName: "Super",
      lastName: "Admin",
      email: "adminbondy@gmail.com",
      password: "Bondy@123",
      roleId: roleId.SUPER_ADMIN,

      location: {
        type: "Point",
        coordinates: [77.209, 28.6139], // [lng, lat] (Delhi example)
        city: "Delhi",
        country: "India",
      },

      language: "en",
      isDisable: false,
      isDeleted: false,
    };

    let admin = await User.findOne({ email: data.email });
    if (admin) {
      admin.password = data.password;
      const res = await admin.save();
      console.log("Admin password updated successfully for:", res.email);
      process.exit(0);
    }

    admin = new User(data);
    const res = await admin.save();

    console.log("Admin created successfully:", res);
    process.exit(0);
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
};

(async () => {
  await adminCreate();
})();
