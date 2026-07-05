// server.js
// A simple self-hosted login server.
// Run this on your PC. Other devices on the same network can log in
// through their web browser using the username/password you set below.

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const os = require("os");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// VIDEO STORAGE
// Real video files live on disk in /uploads. Metadata (title, views,
// likes, comments...) lives in videos.json. Because this all lives on
// the SERVER (your PC), every device that logs in sees and can play the
// exact same videos — that's what makes cross-device playback work.
// ---------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, "uploads");
const VIDEOS_FILE = path.join(__dirname, "videos.json");
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let videos = readJson(VIDEOS_FILE, []);
let accounts = readJson(ACCOUNTS_FILE, []);
function saveVideos() { writeJson(VIDEOS_FILE, videos); }
function saveAccounts() { writeJson(ACCOUNTS_FILE, accounts); }

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = genId();
    req._generatedId = id;
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, id + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 * 1024 } }); // 30GB cap — enough for full movies

// ---------------------------------------------------------------------
// 1) SET YOUR LOGIN CREDENTIALS HERE
//    - Change USERNAME to whatever you like.
//    - Generate a password hash by running:  node hash-password.js
//      (a helper script is included) and paste the result below.
// ---------------------------------------------------------------------
const USERS = {
  admin: {
    // This is a bcrypt hash for the password "changeme123"
    // Replace it with your own hash (see hash-password.js)
    passwordHash: "$2a$10$/b5BOiQfvbqjLLDn.lHVH.7v3gmKJZZhYNujJt/C4mI4q5hU37j3a"
  }
};

// ---------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "change-this-session-secret-to-something-random", // change this too
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8 // 8 hour login session
    }
  })
);

// Helper: require login for protected routes
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect("/login.html");
}

// ---------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------

// Login form submission
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  req.session.user = username;
  return res.json({ success: true, redirect: "/dashboard.html" });
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Check current login status (used by dashboard page)
app.get("/api/me", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, username: req.session.user });
  }
  return res.json({ loggedIn: false });
});

// Protect the dashboard page itself
app.get("/dashboard.html", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

// ---------------------------------------------------------------------
// Video API — shared across every device that logs in
// ---------------------------------------------------------------------

// List all videos (metadata only; file itself is streamed from /uploads)
app.get("/api/videos", requireLogin, (req, res) => {
  res.json(videos);
});

// Upload a new video file + its metadata
app.post("/api/videos", requireLogin, upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file received" });
  const id = req._generatedId;
  const v = {
    id,
    title: req.body.title || "Untitled",
    desc: req.body.desc || "",
    cat: req.body.cat || "Other",
    dur: req.body.dur || "0:00",
    quality: req.body.quality || "low",
    activeQuality: req.body.quality === "high" ? 1080 : 480,
    type: req.body.type === "short" ? "short" : "normal",
    uploaderEmail: req.body.uploaderEmail || "unknown",
    uploaderName: req.body.uploaderName || "Unknown",
    views: 0,
    likes: 0,
    comments: [],
    ts: Date.now(),
    thumb: null,
    url: "/uploads/" + req.file.filename
  };
  videos.unshift(v);
  saveVideos();
  res.json(v);
});

// Update a video's metadata (views, likes, comments, thumb...)
app.patch("/api/videos/:id", requireLogin, (req, res) => {
  const v = videos.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: "Not found" });
  Object.assign(v, req.body, { id: v.id, url: v.url }); // never let the client overwrite id/url
  saveVideos();
  res.json(v);
});

// Delete a video (metadata + file on disk) — only the uploading account
// may delete their own video. The client sends which account it's acting
// as; we check that against who actually uploaded the video.
app.delete("/api/videos/:id", requireLogin, (req, res) => {
  const v = videos.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: "Not found" });
  const requesterEmail = (req.body && req.body.requesterEmail) || (req.query && req.query.requesterEmail);
  if (!requesterEmail || requesterEmail !== v.uploaderEmail) {
    return res.status(403).json({ error: "Only the uploader can delete this video" });
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(v.url));
  fs.unlink(filePath, () => {});
  videos = videos.filter((x) => x.id !== req.params.id);
  saveVideos();
  res.json({ success: true });
});

// ---------------------------------------------------------------------
// Accounts API — so a "new account" made on one device shows up on all
// ---------------------------------------------------------------------
app.get("/api/accounts", requireLogin, (req, res) => {
  res.json(accounts);
});
app.post("/api/accounts", requireLogin, (req, res) => {
  const { name, email, color } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });
  let a = accounts.find((x) => x.email === email);
  if (!a) {
    a = { name: name || "User", email, color: color || "#00b4ff", custom: true };
    accounts.push(a);
    saveAccounts();
  }
  res.json(a);
});
// Only the person who can log into this server (the owner) can reach any
// API route at all, so requireLogin here is enough to make this an
// owner-only control — deletes the account/profile from accounts.json.
app.delete("/api/accounts/:email", requireLogin, (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const before = accounts.length;
  accounts = accounts.filter((x) => x.email !== email);
  if (accounts.length !== before) saveAccounts();
  res.json({ success: true });
});

// Video files themselves — express.static handles Range requests, which
// is what lets the <video> tag seek/scrub properly.
app.use("/uploads", requireLogin, express.static(UPLOAD_DIR));

// Root -> redirect to login or dashboard
app.get("/", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/dashboard.html");
  }
  return res.redirect("/login.html");
});

// ---------------------------------------------------------------------
// Start server — 0.0.0.0 so other devices on your network can reach it
// ---------------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIp();
  console.log("\nLogin server running!");
  console.log(`  On this PC:        http://localhost:${PORT}`);
  console.log(`  From other devices: http://${ip}:${PORT}`);
  console.log("\nMake sure other devices are on the same Wi-Fi/network.\n");
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}
