const express = require("express");
const dotenv = require("dotenv");
const userRoutes = require("./routes/user");
const medicalRoutes = require("./routes/medical");
const homeRoutes = require("./routes/home");
const profileRoutes = require("./routes/profile"); 
const soseRoutes = require("./routes/sosemergency");
const sosRoutes = require("./routes/sos");
const storeRoutes = require("./routes/store");
const tutorialsRoutes = require("./routes/tutorials");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const http = require('http');

dotenv.config();
const app = express();
const server = http.createServer(app);

app.use(cookieParser());

// Ensure images directories exist
const imagesDir = path.join(__dirname, "../public/images");
const productsDir = path.join(imagesDir, "products");
const profilesDir = path.join(imagesDir, "profiles");
[imagesDir, productsDir, profilesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Directory created successfully!`);
  }
});

// Middleware
const corsOptions = {
  origin: "http://172.20.10.2", // Correct React Native dev server URL
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};
app.use(cors(corsOptions));

app.use(
  session({
    secret: "ziziii3", // Keep this secret key strong
    resave: false,
    saveUninitialized: false, // Prevents empty sessions
    cookie: {
      secure: false, // ⚠️ Set to true in production (with HTTPS)
      httpOnly: true, // Prevents client-side access to cookies
      sameSite: "lax", // ✅ Helps with session persistence
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Logging middleware
app.use((req, res, next) => {
  console.log(`Request received: ${req.method} ${req.originalUrl}`);
  console.log("Session Data:", req.session);
  next();
});

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static routes for rendering pages
app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));

// Serve static files from the public directory
app.use('/images', express.static(path.join(__dirname, '../public/images')));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use("/user", userRoutes);
app.use("/medical", medicalRoutes);
app.use("/home", homeRoutes);
app.use("/profile", profileRoutes);
app.use("/sosemergency", soseRoutes);
app.use("/sos", sosRoutes);
app.use("/store", storeRoutes); // Keep this for backward compatibility
app.use("/", storeRoutes); // Add root-level mount for store routes
app.use("/tutorials", tutorialsRoutes);
app.use((req, res, next) => {
  console.log('Session Data:', req.session);
  next();
});

// Error handling for unmatched routes
app.use((req, res) => {
  console.error(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Route not found" });
});

// General error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// Update the server startup
const port = process.env.PORT || 5001;
server.listen(port, () => console.log(`Server running at http://localhost:${port}`));
