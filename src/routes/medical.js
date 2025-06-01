const express = require("express");
const pool = require("../config");

const router = express.Router();

// ✅ GET all medical information for the authenticated user
router.get("/", async (req, res) => {
  const userId = req.session.userId || req.body.userId;

  if (!userId) {
    return res.status(401).json({ error: "User not authenticated." });
  }

  try {
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

    const [emergencyContacts] = await pool.query(
      "SELECT name, relativeness, phone_number FROM emergency_contacts WHERE user_id = ?",
      [userId]
    );

    res.status(200).json({
      message: "Medical info retrieved successfully.",
      medicalInfo,
      emergencyContacts,
    });
  } catch (err) {
    console.error("❌ Error fetching medical info:", err.message);
    res.status(500).json({ error: "Database error." });
  }
});

// ✅ POST medical information
router.post("/", async (req, res) => {
  console.log("✅ POST /medical route accessed!");
  console.log("🔹 Received request body:", req.body);

  const userId = req.session.userId || req.body.userId;
  if (!userId) {
    console.error("❌ User not authenticated.");
    return res.status(401).json({ error: "User not authenticated." });
  }

  const { blood_type, pregnancy, pills=[] , chronic_diseases, allergies=[] , emergencyContacts } = req.body;

  if (!blood_type || !pregnancy) {
    console.error("❌ Missing required fields:", { blood_type, pregnancy });
    return res.status(400).json({ error: "Blood type and pregnancy status are required." });
  }

  console.log("✅ User authenticated with ID:", userId);
  console.log("✅ Data parsed:", { blood_type, pregnancy, pills, chronic_diseases, allergies, emergencyContacts });

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    // ✅ Check if medical information exists
    const [existingInfo] = await connection.query(
      "SELECT med_id FROM medical_information WHERE user_id = ?",
      [userId]
    );

    let medId;
    if (existingInfo.length > 0) {
      medId = existingInfo[0].med_id;
      await connection.query(
        "UPDATE medical_information SET blood_type = ?, pregnancy = ? WHERE user_id = ?",
        [blood_type, pregnancy, userId]
      );
    } else {
      const [result] = await connection.query(
        "INSERT INTO medical_information (user_id, blood_type, pregnancy) VALUES (?, ?, ?)",
        [userId, blood_type, pregnancy]
      );
      medId = result.insertId;
    }
  
    // ✅ Handle sub-information (pills, chronic diseases, allergies)
    await handleSubInfo(connection, medId, pills, chronic_diseases, allergies);

    // ✅ Handle emergency contacts directly
    if (Array.isArray(emergencyContacts) && emergencyContacts.length >= 2) {
      console.log("✅ Handling emergency contacts...");
      
      await connection.query("DELETE FROM emergency_contacts WHERE user_id = ?", [userId]);
      console.log("✅ Deleted old emergency contacts for user:", userId);
      
      // 🔹 Dynamically build the query for any number of contacts
      const placeholders = emergencyContacts.map(() => "(?, ?, ?, ?)").join(", ");
      const insertQuery = `INSERT INTO emergency_contacts (user_id, name, relativeness, phone_number) VALUES ${placeholders}`;

      const contactValues = emergencyContacts.flatMap(contact => [
        userId,
        contact.name,
        contact.relativeness,
        contact.phone_number
      ]);

      await connection.query(insertQuery, contactValues);
      console.log("✅ Emergency contacts inserted successfully.");
    }

    await connection.commit();
    connection.release();

    console.log("✅ Medical info & emergency contacts updated successfully.");
    return res.status(200).json({ message: "Medical information updated successfully." });

  } catch (err) {
    console.error("❌ Error handling medical information:", err.message);
    return res.status(500).json({ error: "Database error." });
  }
});

// ✅ Function to handle sub-information (pills, chronic diseases, allergies)
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
      // Always update chronic diseases if array is provided (even if empty)
      await connection.query("DELETE FROM chronic_disease WHERE med_id = ?", [medId]);
      
      if (chronic_diseases.length > 0) {
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
      // Always update allergies if array is provided (even if empty)
      await connection.query("DELETE FROM allergy WHERE med_id = ?", [medId]);
      
      if (allergies.length > 0) {
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

module.exports = router;
