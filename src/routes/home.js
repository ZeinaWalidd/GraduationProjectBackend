const express = require("express");
const router = express.Router();
const pool = require("../config"); 
const authenticateToken = require("../middleware/auth");

// Function to get the server URL
const getServerUrl = (req) => {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
};

// ✅ Home page route
router.get("/", authenticateToken, async (req, res) => {
    console.log("✅ GET /home route accessed!");
    console.log("🔹 Current Session Data:", req.session);

    try {
        const userId = req.session.userId || req.body.userId;
        if (!userId) {
            console.error("❌ User not authenticated.");
            return res.status(401).json({ error: "User not authenticated." });
        }

        // Fetch user details including profile picture
        const [user] = await pool.query("SELECT name, username, phone_number, email, profile_picture FROM user WHERE user_id = ?", [userId]);

        if (!user.length) {
            return res.status(404).json({ error: "User not found" });
        }

        // Create absolute URL for profile picture if it exists
        let absoluteProfilePicturePath = null;
        if (user[0].profile_picture) {
            absoluteProfilePicturePath = `${getServerUrl(req)}${user[0].profile_picture}`;
        }

        const response = {
            message: `Hi, ${user[0].username}`,
            user: {
                id: userId,
                name: user[0].name,
                username: user[0].username,
                phoneNo: user[0].phone_number,
                email: user[0].email,
                profilePicture: user[0].profile_picture,
                absoluteProfilePicturePath
            },
            features: [
                "Gather Evidence",
                "SOS Emergency",
                "Safe Routes",
                "Fake Call",
                "Incident Reporting",
                "Home",
                "Store",
                "SOS",
                "Tips",
                "Profile"
            ]
        };

        console.log("✅ Sending home page response:", response);
        res.status(200).json(response);
    } catch (error) {
        console.error("❌ Error fetching home page data:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
