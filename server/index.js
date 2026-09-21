"use strict";

/**
 * Sensus Pajak - server Express.
 *
 * Di produksi satu proses ini melayani dua hal:
 *   1. REST API dengan prefix /api
 *   2. hasil build frontend (client/dist) untuk semua route lain
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const compression = require("compression");
const cors = require("cors");

const config = require("./src/config");
const prisma = require("./src/prisma");
const { ApiError } = require("./src/http");
const { ensureAdminSeed } = require("./src/auth");
const { headerKeamanan, jagaAkses, aksesAktif } = require("./src/keamanan");
const { ensureCounter } = require("./src/nomor");
const { siapkanFolder, sapuFotoYatim } = require("./src/foto");
const seedDemo = require("./prisma/seed");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(headerKeamanan);
app.use(compression());
app.use(express.json({ limit: "2mb" }));

// CORS hanya diperlukan saat frontend dijalankan terpisah (vite dev server).
if (config.corsOrigin) {
  app.use(cors({ origin: config.corsOrigin.split(",").map((s) => s.trim()), credentials: false }));
} else if (!config.isProd) {
  app.use(cors());
}

/* ---------- API ---------- */

// Gerbang kode akses. Tidak berbuat apa-apa bila AKSES_KODE kosong.
app.use("/api", jagaAkses);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "sensus-pajak", env: config.nodeEnv, time: new Date().toISOString() });
});

app.use("/api/akses", require("./src/routes/akses"));
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/petugas", require("./src/routes/petugas"));
app.use("/api/formulir", require("./src/routes/formulir"));
app.use("/api/kertas-kerja", require("./src/routes/kertasKerja"));
app.use("/api/entri", require("./src/routes/entri"));
app.use("/api/foto", require("./src/routes/foto"));
app.use("/api/dashboard", require("./src/routes/dashboard"));
app.use("/api/peta", require("./src/routes/peta"));
app.use("/api/nop", require("./src/routes/nop"));

// Data referensi kecamatan & kelurahan untuk pertanyaan bertipe "wilayah".
app.get("/api/wilayah", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(require("./src/wilayah").KECAMATAN);
});

// Batas aplikasi yang juga dipakai klien - satu sumber angka untuk keduanya.
app.get("/api/konfigurasi", (_req, res) => {
  const batas = require("./src/batas");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    petugasMaks: batas.PETUGAS_MAKS,
    fotoMaksPerPertanyaan: batas.FOTO_MAKS_PER_PERTANYAAN,
    uploadMaksMb: config.uploadMaxMb,
    cekNop: require("./src/epbb").aktif(),
  });
});

// Route /api yang tidak dikenal -> JSON 404 (jangan jatuh ke index.html).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});

/* ---------- frontend (hasil build) ---------- */

const adaBuild = fs.existsSync(path.join(config.clientDist, "index.html"));

if (adaBuild) {
  // Asset ber-hash boleh di-cache lama; index.html tidak.
  app.use(
    express.static(config.clientDist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );

  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(config.clientDist, "index.html"));
  });
} else {
  app.get("*", (_req, res) => {
    res
      .status(503)
      .type("text/plain; charset=utf-8")
      .send(
        "Build frontend belum tersedia.\n\n" +
          "Pengembangan : jalankan `npm run dev` lalu buka http://localhost:5173\n" +
          "Produksi     : jalankan `npm run build` terlebih dahulu.\n"
      );
  });
}

/* ---------- error handler ---------- */

app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
  }

  // Error Prisma yang umum diterjemahkan ke pesan Indonesia.
  if (err && typeof err.code === "string" && err.code.startsWith("P")) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Data dengan nilai unik yang sama sudah ada." });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: "Data masih direferensikan data lain." });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Data tidak ditemukan." });
    }
  }

  console.error("[Sensus Pajak] error tak tertangani:", err);
  res.status(500).json({ error: "Terjadi kesalahan pada server." });
});

/* ---------- start ---------- */

async function start() {
  try {
    await prisma.$connect();
    console.log("[Sensus Pajak] terhubung ke database.");
  } catch (e) {
    console.error("[Sensus Pajak] gagal terhubung ke database. Periksa DATABASE_URL.");
    console.error(e.message);
    process.exit(1);
  }

  await ensureCounter();

  await siapkanFolder();
  console.log(`[Sensus Pajak] folder foto: ${config.uploadDir}`);

  // Bersihkan foto yatim saat start lalu setiap 6 jam (tidak menahan startup).
  const sapu = () =>
    sapuFotoYatim()
      .then((n) => n && console.log(`[Sensus Pajak] ${n} berkas foto yatim dibersihkan.`))
      .catch((e) => console.error("[Sensus Pajak] pembersihan foto gagal:", e.message));
  sapu();
  setInterval(sapu, 6 * 3600 * 1000).unref();

  const admin = await ensureAdminSeed();
  console.log(
    admin.created
      ? `[Sensus Pajak] akun admin "${admin.username}" dibuat dari ADMIN_USERNAME/ADMIN_PASSWORD.`
      : `[Sensus Pajak] akun admin "${admin.username}" sudah ada.`
  );

  if (config.seedDemo) {
    const hasil = await seedDemo();
    if (hasil.diisi) console.log("[Sensus Pajak] data contoh diisi (SEED_DEMO=true).");
  }

  console.log(
    aksesAktif()
      ? "[Sensus Pajak] gerbang kode akses AKTIF - seluruh /api butuh kode akses atau token admin."
      : "[Sensus Pajak] gerbang kode akses nonaktif (AKSES_KODE kosong) - /api terbuka untuk umum."
  );

  // Railway meng-inject PORT; wajib memakai nilai tersebut.
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`[Sensus Pajak] siap di http://localhost:${config.port} (${config.nodeEnv})`);
    if (!adaBuild) console.log("[Sensus Pajak] client/dist belum ada - hanya API yang dilayani.");
  });

  const shutdown = async (sinyal) => {
    console.log(`[Sensus Pajak] ${sinyal} diterima, menutup server...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch(async (e) => {
  console.error("[Sensus Pajak] gagal start:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
