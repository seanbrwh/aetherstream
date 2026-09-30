import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "../../uploads");

// Ensure upload destination directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration with unique naming and extension preservation
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    let ext = path.extname(file.originalname).toLowerCase();

    // Fallback extension mapping if original filename lacks an extension
    if (!ext) {
      if (file.mimetype.includes("m4a") || file.mimetype === "audio/x-m4a") ext = ".m4a";
      else if (file.mimetype === "audio/mpeg" || file.mimetype === "audio/mp3") ext = ".mp3";
      else if (file.mimetype === "audio/wav" || file.mimetype === "audio/x-wav") ext = ".wav";
      else if (file.mimetype === "audio/webm") ext = ".webm";
      else if (file.mimetype === "image/jpeg") ext = ".jpg";
      else if (file.mimetype === "image/png") ext = ".png";
      else if (file.mimetype === "image/webp") ext = ".webp";
    }

    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// Comprehensive MIME whitelist covering mobile and desktop media
const allowedMimeTypes = new Set([
  // Photographic Evidence
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",

  // Acoustic & EVP Evidence
  "audio/x-m4a",
  "audio/m4a",
  "audio/mp4",
  "audio/aac",
  "audio/x-aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
]);

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const mime = file.mimetype.toLowerCase();

  if (allowedMimeTypes.has(mime)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB ceiling for high-resolution field captures and uncompressed audio
  },
});

export const uploadMedia = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);
