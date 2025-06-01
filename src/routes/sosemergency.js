const express = require("express");
const router = express.Router();
//const authenticateToken = require("../middleware/auth"); // Import authentication middleware
const pool = require("../config"); 

// Route to fetch emergency contact numbers (requires authentication)
router.get("/", (req, res) => {
    res.json({
        message: "Select an emergency service to call:",
        options: [
            { service: "Police", number: 122 },
            { service: "Ambulance", number: 123 },
            //{ service: "Fire Station", number: 180 }
        ]
    });
});

module.exports = router;
