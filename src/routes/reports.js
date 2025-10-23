const express = require("express");
const router = express.Router();
const pool = require("../config");
const authenticateToken = require("../middleware/auth");
const multer = require("multer");
const path = require("path");

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../public/images/reports'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Create reports table if it doesn't exist
/*const createReportsTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reports (
                report_id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                media_type ENUM('photo', 'audio', 'video') NOT NULL,
                media_path VARCHAR(255) NOT NULL,
                description TEXT,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user(user_id)
            )
        `);
        console.log("✅ Reports table created or already exists");
    } catch (error) {
        console.error("❌ Error creating reports table:", error);
    }
}; 

createReportsTable(); */

// Submit a new report
router.post("/submit", authenticateToken, upload.single('media'), async (req, res) => {
    try {
        const userId = req.session.userId;
        const { mediaType, description, latitude, longitude } = req.body;
        const mediaPath = req.file ? `/images/reports/${req.file.filename}` : null;

        if (!mediaPath) {
            return res.status(400).json({ error: "No media file provided" });
        }

        const [result] = await pool.query(
            "INSERT INTO reports (user_id, media_type, media_path, description, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)",
            [userId, mediaType, mediaPath, description, latitude || null, longitude || null]
        );

        res.status(201).json({
            message: "Report submitted successfully",
            reportId: result.insertId
        });
    } catch (error) {
        console.error("❌ Error submitting report:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get all reports for a user
router.get("/", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [reports] = await pool.query(
            "SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC",
            [userId]
        );

        // Add full URLs to media paths
        const reportsWithUrls = reports.map(report => ({
            ...report,
            media_url: `${req.protocol}://${req.get('host')}${report.media_path}`
        }));

        res.status(200).json(reportsWithUrls);
    } catch (error) {
        console.error("❌ Error fetching reports:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get all reports with locations for Safe Routes
router.get("/locations", async (req, res) => {
    try {
        const [reports] = await pool.query(
            `SELECT 
                report_id,
                latitude,
                longitude,
                description,
                media_type,
                created_at
            FROM reports 
            WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
            ORDER BY created_at DESC`
        );

        res.status(200).json({
            success: true,
            data: reports
        });
    } catch (error) {
        console.error("Error fetching report locations:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});



module.exports = router; 