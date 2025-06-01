const express = require("express");
const router = express.Router();
const pool = require("../config");
const authenticateToken = require("../middleware/auth");
const https = require('https');

// Function to shorten URL using TinyURL
function shortenUrl(longUrl) {
    return new Promise((resolve, reject) => {
        const encodedUrl = encodeURIComponent(longUrl);
        https.get(`https://tinyurl.com/api-create.php?url=${encodedUrl}`, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            console.error("Error shortening URL:", err);
            // Return original URL if shortening fails
            resolve(longUrl);
        });
    });
}

// Emergency message templates
const emergencyMessages = {
    stalking: "🚨 EMERGENCY: I am being stalked. My current location is: ",
    harassment: "🚨 EMERGENCY: I am being harassed. My current location is: ",
    accident: "🚨 EMERGENCY: I have been in an accident. My current location is: ",
    violence: "🚨 EMERGENCY: I am experiencing violence. My current location is: ",
    homeinvasion: "🚨 EMERGENCY: There is a home invasion. My current location is: ",
    cabtrouble: "🚨 EMERGENCY: I am having trouble with my cab. My current location is: ",
    stranded: "🚨 EMERGENCY: I am stranded. My current location is: "
};

// Get emergency contacts
router.get("/contacts", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [contacts] = await pool.query(
            "SELECT * FROM emergency_contacts WHERE user_id = ?",
            [userId]
        );
        res.json(contacts);
    } catch (error) {
        console.error("Error fetching contacts:", error);
        res.status(500).json({ error: "Failed to fetch contacts" });
    }
});

// Add emergency contact
router.post("/contacts", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { name, phone_number, relationship } = req.body;

        const [result] = await pool.query(
            "INSERT INTO emergency_contacts (user_id, name, phone_number, relationship) VALUES (?, ?, ?, ?)",
            [userId, name, phone_number, relationship]
        );

        res.status(201).json({
            contact_id: result.insertId,
            message: "Contact added successfully"
        });
    } catch (error) {
        console.error("Error adding contact:", error);
        res.status(500).json({ error: "Failed to add contact" });
    }
});

// Send SOS alert with location
router.post("/alert", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { latitude, longitude, emergencyType } = req.body;

        console.log("🔹 Received SOS alert request:", {
            userId,
            latitude,
            longitude,
            emergencyType,
            session: req.session
        });

        // Validate emergency type
        const validTypes = ["Stalking", "Harassment", "Accident", "Violence", "Home Invasion", "Cab trouble", "Stranded"];
        if (!validTypes.includes(emergencyType)) {
            console.error("❌ Invalid emergency type:", emergencyType);
            return res.status(400).json({ error: "Invalid emergency type" });
        }

        // Get user details
        const [user] = await pool.query(
            "SELECT name, phone_number FROM user WHERE user_id = ?",
            [userId]
        );

        if (!user.length) {
            console.error("❌ User not found:", userId);
            return res.status(404).json({ error: "User not found" });
        }

        console.log("✅ Found user:", user[0]);

        // Check if there's an active alert
        const [activeAlert] = await pool.query(
            "SELECT alert_id FROM sos_alerts WHERE user_id = ? AND status = 'active'",
            [userId]
        );

        let alertId;
        if (activeAlert.length > 0) {
            // Update existing alert
            alertId = activeAlert[0].alert_id;
            console.log("✅ Updating existing alert:", alertId);
            await pool.query(
                "UPDATE sos_alerts SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP WHERE alert_id = ?",
                [latitude, longitude, alertId]
            );
        } else {
            // Create new alert
            console.log("✅ Creating new alert");
            const [alertResult] = await pool.query(
                "INSERT INTO sos_alerts (user_id, emergency_type, latitude, longitude, status) VALUES (?, ?, ?, ?, 'active')",
                [userId, emergencyType, latitude, longitude]
            );
            alertId = alertResult.insertId;
            console.log("✅ Created new alert with ID:", alertId);
        }

        // Get emergency contacts
        const [contacts] = await pool.query(
            "SELECT * FROM emergency_contacts WHERE user_id = ?",
            [userId]
        );

        console.log("✅ Raw contacts from database:", JSON.stringify(contacts, null, 2));
        console.log("✅ Number of contacts found:", contacts.length);

        // Validate contacts
        if (!contacts || contacts.length === 0) {
            console.error("❌ No emergency contacts found for user:", userId);
            return res.status(400).json({ error: "No emergency contacts found" });
        }

        // Create tracking URL and location URL
        const trackingUrl = `${req.protocol}://${req.get('host')}/track/${userId}`;
        const longLocationUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        
        // Shorten the location URL
        const locationUrl = await shortenUrl(longLocationUrl);
        console.log("🔹 Shortened location URL:", locationUrl);

        // Get emergency message for the type
        const normalizedType = emergencyType.toLowerCase().replace(/\s+/g, '');
        console.log("🔹 Normalized emergency type:", normalizedType);

        // Construct the message with shortened location URL
        let message;
        if (emergencyMessages[normalizedType]) {
            message = emergencyMessages[normalizedType] + locationUrl;
        } else {
            message = `🚨 EMERGENCY: I am facing ${emergencyType}. My current location is: ${locationUrl}`;
        }

        // Format the message to ensure it's properly sent
        const formattedMessage = message.replace(/\n/g, ' ').trim();
        console.log("🔹 Final formatted message:", formattedMessage);

        // Get phone numbers from contacts and validate
        const phoneNumbers = contacts
            .map(contact => {
                console.log("🔹 Processing contact:", {
                    name: contact.name,
                    phone: contact.phone_number
                });
                return contact.phone_number;
            })
            .filter(phone => {
                const isValid = phone && phone.trim() !== '';
                if (!isValid) {
                    console.log("❌ Invalid phone number found:", phone);
                }
                return isValid;
            });

        console.log("🔹 Valid phone numbers:", phoneNumbers);
        console.log("🔹 Number of valid phone numbers:", phoneNumbers.length);

        if (phoneNumbers.length === 0) {
            console.error("❌ No valid phone numbers found in contacts");
            return res.status(400).json({ error: "No valid phone numbers found in emergency contacts" });
        }

        // Prepare response with data needed for frontend SMS sending
        const response = {
            alert_id: alertId,
            user_id: userId,
            emergency_type: emergencyType,
            contacts: contacts.map(contact => ({
                name: contact.name,
                phone: contact.phone_number,
                relationship: contact.relationship
            })),
            tracking_url: trackingUrl,
            location_url: locationUrl,
            message: formattedMessage,
            sms_data: {
                message: formattedMessage,
                recipients: phoneNumbers,
                recipientsString: phoneNumbers.join(',')
            }
        };

        // Log the complete response for debugging
        console.log("🔹 Complete response data:", {
            alert_id: response.alert_id,
            user_id: response.user_id,
            emergency_type: response.emergency_type,
            message: response.message,
            recipients: response.sms_data.recipients,
            recipientsString: response.sms_data.recipientsString,
            location_url: response.location_url
        });

        console.log("✅ Sending response:", response);
        res.status(200).json(response);
    } catch (error) {
        console.error("❌ Error sending SOS alert:", error);
        res.status(500).json({ error: "Failed to send SOS alert" });
    }
});

// Stop SOS alert
router.post("/stop-sos", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;

        // Update all active alerts for this user
        await pool.query(
            "UPDATE sos_alerts SET status = 'resolved' WHERE user_id = ? AND status = 'active'",
            [userId]
        );

        res.json({ message: "SOS alert stopped successfully" });
    } catch (error) {
        console.error("Error stopping SOS alert:", error);
        res.status(500).json({ error: "Failed to stop SOS alert" });
    }
});

// Get location history for an alert
router.get("/location-history/:alertId", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { alertId } = req.params;

        // Verify the alert belongs to the user
        const [alerts] = await pool.query(
            "SELECT * FROM sos_alerts WHERE alert_id = ? AND user_id = ?",
            [alertId, userId]
        );

        if (alerts.length === 0) {
            return res.status(404).json({ error: "Alert not found" });
        }

        // Get location history
        const [locations] = await pool.query(
            "SELECT latitude, longitude, created_at, emergency_type FROM sos_alerts WHERE alert_id = ? ORDER BY created_at DESC LIMIT 100",
            [alertId]
        );

        res.json(locations.map(loc => ({
            ...loc,
            location_url: `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
        })));
    } catch (error) {
        console.error("Error fetching location history:", error);
        res.status(500).json({ error: "Failed to fetch location history" });
    }
});

module.exports = router; 