const express = require("express");
const router = express.Router();
const pool = require("../config");
const authenticateToken = require("../middleware/auth");

// Get all tutorials and tips
router.get("/", authenticateToken, async (req, res) => {
    try {
        const [articles] = await pool.query(`
            SELECT * FROM tutorials_tips 
            ORDER BY created_at DESC
        `);
        
        res.status(200).json({
            success: true,
            data: articles
        });
    } catch (error) {
        console.error("Error fetching tutorials:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get recommended tutorials based on user preferences
router.get("/recommended", authenticateToken, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // Get user's preferences and recent activities
        const [userPreferences] = await pool.query(`
            SELECT * FROM user_preferences WHERE user_id = ?
        `, [userId]);

        // For now, return top 5 most recent articles
        // TODO: Implement AI-based recommendation system
        const [recommendedArticles] = await pool.query(`
            SELECT * FROM tutorials_tips 
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        res.status(200).json({
            success: true,
            data: recommendedArticles
        });
    } catch (error) {
        console.error("Error fetching recommended tutorials:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Get tutorial by ID
router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const [article] = await pool.query(`
            SELECT * FROM tutorials_tips 
            WHERE id = ?
        `, [req.params.id]);

        if (!article.length) {
            return res.status(404).json({ error: "Article not found" });
        }

        res.status(200).json({
            success: true,
            data: article[0]
        });
    } catch (error) {
        console.error("Error fetching tutorial:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router; 