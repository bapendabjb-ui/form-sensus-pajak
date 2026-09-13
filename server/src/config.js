"use strict";

const path = require("path");
const dotenv = require("dotenv");

// .env dibaca dari root repo, lalu dari folder server (bila ada).
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  adminUsername: (process.env.ADMIN_USERNAME || "admin").trim(),
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  seedDemo: String(process.env.SEED_DEMO || "").toLowerCase() === "true",
  corsOrigin: process.env.CORS_ORIGIN || "",
  clientDist: path.join(__dirname, "..", "..", "client", "dist"),
  // Folder foto. Di Railway arahkan ke volume (mis. /app/uploads) agar foto
  // tidak hilang saat deploy ulang.
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads")),
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB) || 8,
  timezone: process.env.APP_TIMEZONE || "Asia/Makassar",
};

config.isProd = config.nodeEnv === "production";

if (!config.jwtSecret) {
  if (config.isProd) {
    console.error("[FormKita] JWT_SECRET wajib diisi di produksi. Hentikan proses.");
    process.exit(1);
  }
  config.jwtSecret = "formkita-dev-secret-jangan-dipakai-di-produksi";
  console.warn("[FormKita] JWT_SECRET belum diset - memakai secret pengembangan.");
}

module.exports = config;
