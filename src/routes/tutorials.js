const express = require("express");
const router = express.Router();
const pool = require("../config");
const authenticateToken = require("../middleware/auth");
const { spawn } = require('child_process');

router.get("/", authenticateToken, async (req, res) => {
    try {
        const [articles] = await pool.query(`SELECT * FROM tutorials ORDER BY created_at DESC`);
        res.status(200).json({ success: true, articles });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/bookmarks", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [bookmarks] = await pool.query(
            `SELECT 
                article_url AS article_id, 
                title, 
                description, 
                source, 
                published_at AS publishedAt 
            FROM article_bookmarks 
            WHERE user_id = ? 
            ORDER BY id DESC`,
            [userId]
        );
        res.status(200).json({ success: true, bookmarks });
    } catch (error) {
        console.error("Error fetching bookmarks:", error);
        res.status(500).json({ error: "Failed to fetch bookmarks" });
    }
});

// Save a bookmark
router.post("/bookmark", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { article_url, title, description, source, publishedAt } = req.body;
        await pool.query(
            `INSERT IGNORE INTO article_bookmarks (user_id, article_url, title, description, source, published_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, article_url, title, description, source, publishedAt]
        );
        res.status(200).json({ success: true, message: "Bookmarked!" });
    } catch (error) {
        console.error("Error bookmarking article:", error);
        res.status(500).json({ error: "Failed to bookmark article" });
    }
});

// Remove a bookmark
router.delete("/bookmark", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { article_url } = req.body;
        await pool.query(
            `DELETE FROM article_bookmarks WHERE user_id = ? AND article_url = ?`,
            [userId, article_url]
        );
        res.status(200).json({ success: true, message: "Bookmark removed!" });
    } catch (error) {
        console.error("Error removing bookmark:", error);
        res.status(500).json({ error: "Failed to remove bookmark" });
    }
});

router.post("/:id/view", authenticateToken, async (req, res) => {
    try {
        await pool.query(
            "INSERT INTO tutorial_views (user_id, tutorial_id, viewed_at) VALUES (?, ?, NOW())",
            [req.user.id, req.params.id]
        );
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/recommendations', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    
    try {
  const python = spawn('python', [
    'src/scripts/recommend_tutorials.py',
    userId.toString(),
    '5' // top_n, optional
  ]);

  let data = '';
        let error = '';

  python.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  python.stderr.on('data', (chunk) => {
    error += chunk.toString();
  });

  python.on('close', (code) => {
    console.log('PYTHON STDOUT:', data);
    console.log('PYTHON STDERR:', error);
    if (code !== 0) {
                return res.status(500).json({ error: error || 'Python script error' });
    }
    try {
      const recommendations = JSON.parse(data);
                
                // Ensure each recommendation has all required fields
                const processedRecommendations = recommendations.map(rec => ({
                    id: rec.id,
                    title: rec.title || 'Untitled',
                    description: rec.description || rec.content || '',
                    content: rec.content || rec.description || '',
                    category: rec.category || 'General',
                    tags: rec.tags || '',
                    image_url: rec.image_url || null,
                    created_at: rec.created_at || new Date().toISOString()
                }));
                
                res.json({ 
                    success: true, 
                    recommendations: processedRecommendations 
                });
    } catch (e) {
                res.status(500).json({ error: 'Failed to parse recommendations', details: e.message, raw: data });
    }
  });

        python.on('error', (err) => {
            console.error('Failed to start Python script:', err);
            res.status(500).json({ 
                error: 'Failed to start recommendation script',
                details: err.message 
            });
        });

    } catch (error) {
        console.error('Recommendation route error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

module.exports = router; 