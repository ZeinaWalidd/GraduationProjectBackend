const multer = require("multer");
const path = require("path");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images/profiles/"); // Save files in the "public/images/profiles/" folder
  },
  filename: (req, file, cb) => {
    cb(null, `${req.user.id}_${Date.now()}${path.extname(file.originalname)}`);
  },
});

// File upload settings
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit: 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype);

    if (extName && mimeType) {
      return cb(null, true);
    } else {
      return cb(new Error("Only .jpg, .jpeg, or .png files are allowed!"));
    }
  },
});

module.exports = upload;
