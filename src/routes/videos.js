const express = require("express");
const router = express.Router();
const pool = require("../config");

router.get("/", async (req, res) => {
  try {
    const [videos] = await pool.query("SELECT * FROM videos ORDER BY uploaded_at DESC");
    res.json({ success: true, videos });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

module.exports = router;