require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/user");

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    const admin = new User({
      email: "admin@gmail.com",
      password: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE"
    });

    await admin.save();

    console.log("✅ Admin created successfully");
    process.exit();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

createAdmin();