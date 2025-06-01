const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config");


const router = express.Router();

// Helper function to promisify pool.query
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// Function to get the server URL
const getServerUrl = (req) => {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
};

// Signup route
router.post("/signup", async (req, res) => {
  console.log("Signup route accessed");
  try {
    const { name, username, email, phoneNo, password, confirmPassword } = req.body;
    const errors = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/;

    // Validation logic...
    if (!/^[a-zA-Z ]+$/.test(name)) errors.push("Name must only contain letters and spaces.");
    if (name.length > 50) errors.push("Name must not exceed 50 characters.");
    if (username.length < 4 || username.length > 25) errors.push("Username must be between 4 and 25 characters.");
    if (!emailRegex.test(email)) errors.push("Invalid email format.");
    if (!passwordRegex.test(password)) {
      errors.push("Weak password. Must be at least 12 characters long, contain an uppercase letter, a number, and a special character.");
    }
    if (!/^\d{11}$/.test(phoneNo)) errors.push("Phone number must be exactly 11 digits.");
    if (password !== confirmPassword) errors.push("Passwords do not match.");

    if (errors.length > 0) return res.status(400).json({ errors });

    // Check if email is already registered
    const [rows] = await pool.query("SELECT * FROM user WHERE email = ?", [email]);
    console.log("Rows fetched:", rows); // Log the rows fetched

    if (rows.length > 0) {
      return res.status(400).json({ errors: ["Email already registered."] });
    }

    // Hash the password and insert user
    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
      // Insert the user into the database
      const [result] = await pool.query(
        "INSERT INTO user (name,username,phone_number,email, password) VALUES (?, ?, ?, ?, ?)",
        [name,username,phoneNo, email,hashedPassword]
      );

      console.log("Insert result:", result); // Log the insert result

      // Capture the new user ID (newly created user)
    const userId = result.insertId;
    req.session.userId = userId;  // 🚀 Store user ID in session
    console.log("✅ User ID stored in session:", req.session.userId);
    console.log("🔹 Session after signup:", req.session);

    res.status(201).json({ message: "Signup successful!", userId });

    } catch (error) {
      console.error("Error inserting user:", error);
      return res.status(500).json({ error: "Error creating user" });
    }

  } catch (err) {
    console.error("Signup Error: ", err.message);
    res.status(500).json({ error: "Signup" });
  }
});

// Login route
const JWT_SECRET = process.env.JWT_SECRET || "zjhj2025";
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log("🔹 Received Login Request:", { username, password });

    const [user] = await pool.query("SELECT * FROM user WHERE username = ?", [username]);

    // ✅ Check if user exists (Fixing "User not found" case)
    if (!user || user.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const isPasswordValid = await bcrypt.compare(password, user[0].password);
    if (!isPasswordValid) return res.status(401).json({ error: "Incorrect password." });
    
    console.log("✅ User Found:", user[0]); // Log the fetched user

    // ✅ Store userId in session
    console.log("🔹 Before setting session:", req.session);
    req.session.userId = user[0].user_id;
    console.log("✅ User ID stored in session after login:", req.session.userId);
    console.log("🔹 Session after login:", req.session);
    req.session.save((err) => {
      if (err) {
        console.error("❌ Error saving session:", err);
        return res.status(500).json({ error: "Session save failed." });
      }
      console.log("✅ Session saved successfully:", req.session);
    });
    console.log("✅ Session saved successfully:", req.session);

    // Convert relative profile picture path to absolute URL if it exists
    let absoluteProfilePicturePath = null;
    if (user[0].profile_picture) {
      absoluteProfilePicturePath = `${getServerUrl(req)}${user[0].profile_picture}`;
    }

    const token = jwt.sign(
      { id: user[0].user_id, username: user[0].username, email: user[0].email },
      process.env.JWT_SECRET || "zjhj2025",
      { expiresIn: "24h" }
    );

    res.status(200).json({ 
      message: "Login successful!", 
      token,
      user: {
        id: user[0].user_id,
        name: user[0].name,
        username: user[0].username,
        email: user[0].email,
        phoneNo: user[0].phone_number,
        profilePicture: user[0].profile_picture,
        absoluteProfilePicturePath
      }
    });
  } catch (err) {
    console.error("Login Error: ", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


module.exports = router;
