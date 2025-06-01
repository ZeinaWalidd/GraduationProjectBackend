const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "zjhj2025";

const authenticateToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  console.log('Auth header:', authHeader);

  if (!authHeader) {
    return res.status(401).json({ error: "Access Denied. No token provided." });
  }

  const token = authHeader.split(" ")[1]; // Get token from "Bearer <token>"
  console.log('Extracted token:', token);

  if (!token) {
    return res.status(401).json({ error: "Access Denied. Invalid token format." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Decoded token:', decoded);
    req.user = {
      id: decoded.id,
      username: decoded.username
    };
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: "Invalid token" });
  }
};

module.exports = authenticateToken;
