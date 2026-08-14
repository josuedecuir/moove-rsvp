const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { nanoid } = require("nanoid");

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads"));
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `ine_${nanoid(16)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error("Formato de imagen no soportado. Usa JPG, PNG, WEBP o HEIC."));
    }
    cb(null, true);
  },
});

module.exports = { upload, UPLOADS_DIR };
