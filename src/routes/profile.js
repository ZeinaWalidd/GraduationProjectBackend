const express = require("express");
const router = express.Router();
const pool = require("../config"); // MySQL Database Connection
const authenticateToken = require("../middleware/auth"); // JWT Authentication Middleware
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Multer setup for profile picture upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../public/images/profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + ext);
  }
});
const fileFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
    req.fileValidationError = 'Only image files are allowed!';
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('profile_picture');

function getServerUrl(req) {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

// ✅ GET User Profile (Username, Email, Medical Info, Emergency Contacts)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.session.userId || req.body.userId;

    // Fetch user info
    const [user] = await pool.query(
      "SELECT name, username, phone_number, email, profile_picture FROM user WHERE user_id = ?",
      [userId]
    );

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    // Fetch medical info
    const medicalQuery = `
      SELECT 
        mi.blood_type, 
        mi.pregnancy, 
        GROUP_CONCAT(DISTINCT CONCAT_WS(':', p.name, p.dosage)) AS pills,
        GROUP_CONCAT(DISTINCT cd.name) AS chronic_diseases,
        GROUP_CONCAT(DISTINCT CONCAT_WS(':', a.type, a.name)) AS allergies
      FROM medical_information mi
      LEFT JOIN pills p ON p.med_id = mi.med_id
      LEFT JOIN chronic_disease cd ON cd.med_id = mi.med_id
      LEFT JOIN allergy a ON a.med_id = mi.med_id
      WHERE mi.user_id = ?
      GROUP BY mi.med_id`;

    const [medicalInfo] = await pool.query(medicalQuery, [userId]);

    // Fetch emergency contacts
    const [emergencyContacts] = await pool.query(
      "SELECT name, relativeness, phone_number FROM emergency_contacts WHERE user_id = ?",
      [userId]
    );
    
    // Process medical info to convert pills from string to array
    const updatedMedicalInfo = medicalInfo.map(info => {
      // Convert pills from string to array of objects
      if (info.pills) {
        info.pills = info.pills.split(',').map(pill => {
          const [name, dosage] = pill.split(':');
          return { name, dosage };
        });
      } else {
        info.pills = [];
      }
      
      delete info.pills_string; // Remove the string version
      
      // Set 'none' if chronic diseases or allergies are empty
      if (!info.chronic_diseases) info.chronic_diseases = 'none';
      if (!info.allergies) info.allergies = 'none';
      
      return info;
    });

    let absoluteProfilePicturePath;
    if (user[0].profile_picture) {
      absoluteProfilePicturePath = `${getServerUrl(req)}${user[0].profile_picture}`;
    } else {
      absoluteProfilePicturePath = `${getServerUrl(req)}/images/profiles/profile.jpg`;
    }

    res.status(200).json({
      message: "Profile retrieved successfully",
      user: { ...user[0], absoluteProfilePicturePath },
      medicalInfo: medicalInfo.length > 0 ? updatedMedicalInfo[0] : null,
      emergencyContacts,
    });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Change Password
router.post("/change-password", authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.session.userId || req.body.userId;
  
    try {
      // Fetch the current password from the database
      const [user] = await pool.query("SELECT password FROM user WHERE user_id = ?", [userId]);
  
      if (user.length === 0) {
        return res.status(404).json({ error: "User not found." });
      }
  
      // Check if the old password is correct
      const isPasswordValid = await bcrypt.compare(oldPassword, user[0].password);
      if (!isPasswordValid) {
        return res.status(400).json({ error: "Incorrect old password." });
      }
  
      // Validate new password format
      const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{12,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: "Weak password. Must be at least 12 characters long, contain an uppercase letter, a number, and a special character.",
        });
      }
  
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE user SET password = ? WHERE user_id = ?", [hashedPassword, userId]);
  
      res.status(200).json({ message: "Password changed successfully!" });
    } catch (error) {
      console.error("❌ Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  

// ✅ Update Emergency Contacts
router.post("/update-emergency-contacts", authenticateToken, async (req, res) => {
  console.log("✅ POST /profile/update-emergency-contacts route accessed!");
  console.log("🔹 Received request body:", req.body);

  const userId = req.session.userId || req.body.userId;
  if (!userId) {
    console.error("❌ User not authenticated.");
    return res.status(401).json({ error: "User not authenticated." });
  }

  let emergencyContacts;
  try {
    // Handle both direct JSON and stringified JSON
    if (typeof req.body.emergencyContacts === 'string') {
      emergencyContacts = JSON.parse(req.body.emergencyContacts);
    } else {
      emergencyContacts = req.body.emergencyContacts;
    }
  } catch (err) {
    console.error("❌ Error parsing emergency contacts:", err.message);
    return res.status(400).json({ error: "Invalid emergency contacts data format." });
  }

  if (!Array.isArray(emergencyContacts) || emergencyContacts.length < 2) {
    console.error("❌ Invalid emergency contacts data:", emergencyContacts);
    return res.status(400).json({ error: "At least two emergency contacts are required." });
  }

  console.log("✅ User authenticated with ID:", userId);
  console.log("✅ Emergency contacts data:", emergencyContacts);

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Delete existing emergency contacts
    await connection.query("DELETE FROM emergency_contacts WHERE user_id = ?", [userId]);
    console.log("✅ Deleted existing emergency contacts for user:", userId);

    // Insert emergency contacts dynamically
    const placeholders = emergencyContacts.map(() => "(?, ?, ?, ?)").join(", ");
    const insertQuery = `INSERT INTO emergency_contacts (user_id, name, relativeness, phone_number) VALUES ${placeholders}`;
    const contactValues = emergencyContacts.flatMap(contact => [
      userId, 
      contact.name, 
      contact.relativeness, 
      contact.phone_number
    ]);

    await connection.query(insertQuery, contactValues);
    console.log("✅ Inserted new emergency contacts for user:", userId);

    await connection.commit();
    console.log("✅ Transaction committed successfully");

    return res.status(200).json({ message: "Emergency contacts updated successfully." });
  } catch (err) {
    console.error("❌ Error updating emergency contacts:", err.message);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("❌ Error rolling back transaction:", rollbackErr.message);
      }
    }
    return res.status(500).json({ error: "Database error: " + err.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ✅ Update User Profile with multipart/form-data
router.put("/", authenticateToken, (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `Unknown error: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  console.log("✅ PUT /profile route accessed!");
  console.log("🔹 Received form data:", req.body);

  const userId = req.session.userId || req.body.userId;
  if (!userId) {
    console.error("❌ User not authenticated.");
    return res.status(401).json({ error: "User not authenticated." });
  }

  const { name, username, email, phone_number } = req.body;
  let medicalInfo = null;
  let emergencyContacts = null;
  let profilePicturePath = null;

  try {
    // Parse JSON strings from form data
    if (req.body.medicalInfo) {
      try {
        medicalInfo = JSON.parse(req.body.medicalInfo);
        console.log("✅ Parsed medicalInfo:", medicalInfo);
        if (medicalInfo.chronic_diseases && !Array.isArray(medicalInfo.chronic_diseases)) {
          medicalInfo.chronic_diseases = [medicalInfo.chronic_diseases];
        }
        if (medicalInfo.allergies && !Array.isArray(medicalInfo.allergies)) {
          medicalInfo.allergies = [medicalInfo.allergies];
        }
      } catch (parseErr) {
        console.error("❌ Error parsing medicalInfo:", parseErr.message);
        return res.status(400).json({ error: "Invalid medicalInfo JSON format." });
      }
    }
    if (req.body.emergencyContacts) {
      try {
        emergencyContacts = JSON.parse(req.body.emergencyContacts);
      } catch (parseErr) {
        console.error("❌ Error parsing emergencyContacts:", parseErr.message);
        return res.status(400).json({ error: "Invalid emergencyContacts JSON format." });
      }
    }
    if (req.file) {
      profilePicturePath = `/images/profiles/${req.file.filename}`;
    }
  } catch (err) {
    console.error("❌ Error parsing JSON data:", err.message);
    return res.status(400).json({ error: "Invalid JSON data in form fields." });
  }

  if (!name || !email) {
    console.error("❌ Missing required fields:", { name, email });
    return res.status(400).json({ error: "Name and email are required." });
  }

  console.log("✅ User authenticated with ID:", userId);
  console.log("✅ Data parsed:", { name, username, email, phone_number, medicalInfo, emergencyContacts });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check if email is already taken by another user
    const [existingUser] = await connection.query(
      "SELECT user_id FROM user WHERE email = ? AND user_id != ?",
      [email, userId]
    );

    if (existingUser.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ error: "Email is already in use by another account." });
    }

    // Update user information (no profile picture)
    let updateQuery;
    let updateParams;
    if (profilePicturePath) {
      updateQuery = "UPDATE user SET name = ?, username = ?, email = ?, phone_number = ?, profile_picture = ? WHERE user_id = ?";
      updateParams = [name, username, email, phone_number || null, profilePicturePath, userId];
    } else {
      updateQuery = "UPDATE user SET name = ?, username = ?, email = ?, phone_number = ? WHERE user_id = ?";
      updateParams = [name, username, email, phone_number || null, userId];
    }
    const [updateResult] = await connection.query(updateQuery, updateParams);
    console.log("✅ Updated user information:", updateResult);

    // Update medical information if provided
    if (medicalInfo) {
      const { blood_type, pregnancy, pills = [], chronic_diseases = [], allergies = [] } = medicalInfo;
      const [existingInfo] = await connection.query(
        "SELECT med_id FROM medical_information WHERE user_id = ?",
        [userId]
      );
      let medId;
      if (existingInfo.length > 0) {
        medId = existingInfo[0].med_id;
        await connection.query(
          "UPDATE medical_information SET blood_type = ?, pregnancy = ? WHERE user_id = ?",
          [blood_type || null, pregnancy !== undefined ? pregnancy : null, userId]
        );
        console.log("✅ Updated existing medical information");
      } else {
        const [result] = await connection.query(
          "INSERT INTO medical_information (user_id, blood_type, pregnancy) VALUES (?, ?, ?)",
          [userId, blood_type || null, pregnancy !== undefined ? pregnancy : null]
        );
        medId = result.insertId;
        console.log("✅ Created new medical information with ID:", medId);
      }
      await handleSubInfo(connection, medId, pills, chronic_diseases, allergies);
      console.log("✅ Updated medical sub-information");
    }

    // Update emergency contacts if provided
    if (emergencyContacts && Array.isArray(emergencyContacts) && emergencyContacts.length >= 2) {
      await connection.query("DELETE FROM emergency_contacts WHERE user_id = ?", [userId]);
      const placeholders = emergencyContacts.map(() => "(?, ?, ?, ?)").join(", ");
      const insertQuery = `INSERT INTO emergency_contacts (user_id, name, relativeness, phone_number) VALUES ${placeholders}`;
      const contactValues = emergencyContacts.flatMap(contact => [
        userId, 
        contact.name, 
        contact.relativeness, 
        contact.phone_number
      ]);
      await connection.query(insertQuery, contactValues);
      console.log("✅ Updated emergency contacts");
    }

    await connection.commit();
    console.log("✅ Transaction committed successfully");

    let absoluteProfilePicturePath = profilePicturePath
      ? `${getServerUrl(req)}${profilePicturePath}`
      : null;
    return res.status(200).json({
      message: "Profile updated successfully.",
      profilePicturePath: profilePicturePath || "No new profile picture uploaded",
      absoluteProfilePicturePath
    });
  } catch (err) {
    console.error("❌ Error updating profile:", err.message);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("❌ Error rolling back transaction:", rollbackErr.message);
      }
    }
    return res.status(500).json({ error: "Database error: " + err.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ✅ Logout
router.post("/logout", authenticateToken, (req, res) => {
  console.log("✅ POST /profile/logout route accessed!");
  
  try {
    // Clear the session
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Error destroying session:", err.message);
        return res.status(500).json({ error: "Failed to logout" });
      }
      
      // Clear the authentication cookie
      res.clearCookie('connect.sid');
      
      // Send success response to match frontend expectations
      console.log("✅ User logged out successfully");
      return res.status(200).json({ 
        message: "Logged out successfully",
        success: true,
        token: null // Explicitly set token to null to match frontend expectations
      });
    });
  } catch (err) {
    console.error("❌ Error during logout:", err.message);
    return res.status(500).json({ error: "Server error during logout" });
  }
});

// ✅ Function to Handle Pills, Chronic Diseases, and Allergies
async function handleSubInfo(connection, medId, pills, chronic_diseases, allergies) {
  try {
    // Check if we're updating or creating new records
    const [existingPills] = await connection.query("SELECT * FROM pills WHERE med_id = ?", [medId]);
    const [existingDiseases] = await connection.query("SELECT * FROM chronic_disease WHERE med_id = ?", [medId]);
    const [existingAllergies] = await connection.query("SELECT * FROM allergy WHERE med_id = ?", [medId]);
    
    const isNewRecord = existingPills.length === 0 && existingDiseases.length === 0 && existingAllergies.length === 0;
    
    // Handle pills
    if (Array.isArray(pills) && pills.length > 0) {
      // User provided pills, so update them
      await connection.query("DELETE FROM pills WHERE med_id = ?", [medId]);
      
      // Handle both string array and object array formats
      const pillValues = pills.map(pill => {
        if (typeof pill === 'string') {
          // If it's a string, assume it's just the name with no dosage
          return [medId, pill, "N/A"];
        } else if (pill && typeof pill === 'object') {
          // If it's an object, extract name and dosage
          return [medId, pill.name || "unknown", pill.dosage || "N/A"];
        } else {
          return [medId, "unknown", "N/A"];
        }
      });
      
      await connection.query("INSERT INTO pills (med_id, name, dosage) VALUES ?", [pillValues]);
      console.log("✅ Updated pills:", pillValues);
    } else if (isNewRecord) {
      // This is a new record with no pills provided, insert default
      await connection.query("INSERT INTO pills (med_id, name, dosage) VALUES (?, ?, ?)", 
        [medId, "none", "none"]);
      console.log("✅ Inserted default pill record for new user");
    } else {
      // Existing record with no pills provided, keep existing pills
      console.log("✅ Keeping existing pills:", existingPills);
    }

    // Handle chronic diseases
    if (Array.isArray(chronic_diseases)) {
      // Only update chronic diseases if array is provided and not empty
      if (chronic_diseases.length > 0) {
        await connection.query("DELETE FROM chronic_disease WHERE med_id = ?", [medId]);
        
        // Handle both string array and object array formats
        const diseaseValues = chronic_diseases.map(disease => {
          if (typeof disease === 'string') {
            return [medId, disease.trim()];
          } else if (disease && typeof disease === 'object') {
            return [medId, (disease.name || disease).trim()];
          } else {
            return [medId, "unknown"];
          }
        });
        
        await connection.query("INSERT INTO chronic_disease (med_id, name) VALUES ?", [diseaseValues]);
        console.log("✅ Updated chronic diseases:", diseaseValues);
      } else if (isNewRecord) {
        // This is a new record with empty chronic diseases array, insert default
        await connection.query("INSERT INTO chronic_disease (med_id, name) VALUES (?, ?)", 
          [medId, "none"]);
        console.log("✅ Inserted default chronic disease record for new user");
      } else {
        // Existing record with empty chronic diseases array, keep existing diseases
        console.log("✅ Keeping existing chronic diseases:", existingDiseases);
      }
    } else if (isNewRecord) {
      // This is a new record with no chronic diseases provided, insert default
      await connection.query("INSERT INTO chronic_disease (med_id, name) VALUES (?, ?)", 
        [medId, "none"]);
      console.log("✅ Inserted default chronic disease record for new user");
    } else {
      // Existing record with no chronic diseases provided, keep existing diseases
      console.log("✅ Keeping existing chronic diseases:", existingDiseases);
    }

    // Handle allergies
    if (Array.isArray(allergies)) {
      // Only update allergies if array is provided and not empty
      if (allergies.length > 0) {
        await connection.query("DELETE FROM allergy WHERE med_id = ?", [medId]);
        
        const allergyValues = allergies.map(allergy => {
          if (typeof allergy === 'string') {
            return [medId, "food", allergy.trim()];
          } else if (allergy && typeof allergy === 'object') {
            return [medId, allergy.type || "food", (allergy.name || allergy).trim()];
          } else {
            return [medId, "food", "unknown"];
          }
        });
        
        await connection.query("INSERT INTO allergy (med_id, type, name) VALUES ?", [allergyValues]);
        console.log("✅ Updated allergies:", allergyValues);
      } else if (isNewRecord) {
        // This is a new record with empty allergies array, insert default
        await connection.query("INSERT INTO allergy (med_id, type, name) VALUES (?, ?, ?)", 
          [medId, "none", "none"]);
        console.log("✅ Inserted default allergy record for new user");
      } else {
        // Existing record with empty allergies array, keep existing allergies
        console.log("✅ Keeping existing allergies:", existingAllergies);
      }
    } else if (isNewRecord) {
      // This is a new record with no allergies provided, insert default
      await connection.query("INSERT INTO allergy (med_id, type, name) VALUES (?, ?, ?)", 
        [medId, "none", "none"]);
      console.log("✅ Inserted default allergy record for new user");
    } else {
      // Existing record with no allergies provided, keep existing allergies
      console.log("✅ Keeping existing allergies:", existingAllergies);
    }

  } catch (err) {
    console.error("❌ Error handling sub-information:", err.message);
    throw err;
  }
}

// ✅ Delete Emergency Contact (refactored for consistent logic)
router.delete("/emergency-contact/:id", authenticateToken, async (req, res) => {
  console.log("✅ DELETE /profile/emergency-contact/:id route accessed!");
  const userId = req.session.userId || req.body.userId;
  const contactId = req.params.id;

  if (!userId) {
    console.error("❌ User not authenticated.");
    return res.status(401).json({ error: "User not authenticated." });
  }

  try {
    // Only delete if the contact belongs to the user
    const [result] = await pool.query(
      "DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?",
      [contactId, userId]
    );
    if (result.affectedRows === 0) {
      console.error("❌ Contact not found or not authorized.");
      return res.status(404).json({ error: "Contact not found or not authorized." });
    }
    console.log(`✅ Emergency contact with id ${contactId} deleted for user ${userId}`);
    res.status(200).json({ message: "Emergency contact deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting emergency contact:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;