"use strict";

/**
 * Penyimpanan foto di disk (UPLOAD_DIR).
 *
 * Alurnya dua tahap: foto diunggah lebih dulu (entri_id masih NULL), lalu
 * ditautkan ke entri ketika entri disimpan. Foto yang tidak pernah ditautkan,
 * serta berkas di disk yang tidak lagi tercatat di database, dibersihkan oleh
 * sapuFotoYatim().
 */

const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const config = require("./config");
const prisma = require("./prisma");

const EKSTENSI = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Jumlah berkas yang diperiksa ke database sekali jalan saat penyapuan. */
const SAPU_BATCH = 500;

/** Kenali jenis gambar dari byte awalnya, bukan dari nama atau header kiriman. */
function kenaliMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Path absolut sebuah berkas, dijamin tetap di dalam UPLOAD_DIR. */
function pathBerkas(berkas) {
  const akar = path.resolve(config.uploadDir);
  const full = path.resolve(akar, berkas);
  if (!full.startsWith(akar + path.sep)) throw new Error("Path foto tidak valid.");
  return full;
}

const siapkanFolder = () => fsp.mkdir(config.uploadDir, { recursive: true });

/**
 * Simpan satu foto ke disk lalu catat di database.
 * @returns {Promise<{foto?: object, galat?: string}>}
 */
async function simpanFoto(buffer, namaAsli) {
  const mime = kenaliMime(buffer);
  if (!mime) return { galat: "Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP." };

  const kini = new Date();
  const folder = `${kini.getFullYear()}/${String(kini.getMonth() + 1).padStart(2, "0")}`;
  const berkas = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${EKSTENSI[mime]}`;

  await fsp.mkdir(path.join(config.uploadDir, folder), { recursive: true });
  await fsp.writeFile(pathBerkas(berkas), buffer);

  const foto = await prisma.foto.create({
    data: { berkas, namaAsli: String(namaAsli || "").slice(0, 200), mime, ukuran: buffer.length },
  });
  return { foto };
}

/**
 * Hapus berkas-berkas di disk (baris database-nya sudah dihapus pemanggil).
 * Satu path yang bermasalah tidak boleh menggagalkan penghapusan sisanya.
 */
async function hapusBerkas(daftar) {
  await Promise.all(
    (daftar || []).map(async (berkas) => {
      try {
        await fsp.unlink(pathBerkas(berkas));
      } catch {
        /* berkas sudah tidak ada atau path tidak valid - abaikan */
      }
    })
  );
}

/**
 * Hapus baris foto yang diunggah tetapi tidak pernah ditautkan ke entri dalam
 * 24 jam, berikut berkasnya. Diproses per batch agar tidak menarik seluruh
 * tabel ke memori.
 * @returns {Promise<number>} jumlah foto yang dibersihkan
 */
async function sapuUnggahanTerlantar() {
  const batasTautan = new Date(Date.now() - 24 * 3600 * 1000);
  let total = 0;

  for (;;) {
    const yatim = await prisma.foto.findMany({
      where: { entriId: null, createdAt: { lt: batasTautan } },
      select: { id: true, berkas: true },
      take: SAPU_BATCH,
    });
    if (yatim.length === 0) break;

    await prisma.foto.deleteMany({ where: { id: { in: yatim.map((f) => f.id) } } });
    await hapusBerkas(yatim.map((f) => f.berkas));
    total += yatim.length;

    if (yatim.length < SAPU_BATCH) break;
  }

  return total;
}

/**
 * Hapus berkas di disk yang tidak lagi tercatat di database - misalnya sisa
 * cascade ketika pertanyaan atau formulir dihapus.
 *
 * Disk ditelusuri sambil jalan dan hanya berkas yang sudah cukup tua yang
 * ditanyakan ke database, sekali tanya per SAPU_BATCH berkas. Pemakaian memori
 * karena itu tetap datar berapa pun banyaknya foto. Berkas berumur < 30 menit
 * dilewati agar unggahan yang sedang berjalan tidak ikut terhapus.
 * @returns {Promise<number>} jumlah berkas yang dihapus
 */
async function sapuBerkasTakTercatat() {
  const batasUmur = Date.now() - 30 * 60 * 1000;
  let total = 0;
  let batch = [];

  // Tanyakan satu batch ke database, hapus yang tidak tercatat.
  async function bilas() {
    if (batch.length === 0) return;
    const daftar = batch;
    batch = [];

    const rows = await prisma.foto.findMany({
      where: { berkas: { in: daftar } },
      select: { berkas: true },
    });
    const tercatat = new Set(rows.map((r) => r.berkas));

    const buang = daftar.filter((b) => !tercatat.has(b));
    if (buang.length) {
      await hapusBerkas(buang);
      total += buang.length;
    }
  }

  async function jelajah(dir, rel) {
    let isi;
    try {
      isi = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of isi) {
      const relatif = rel ? `${rel}/${d.name}` : d.name;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        await jelajah(full, relatif);
        continue;
      }
      const info = await fsp.stat(full).catch(() => null);
      if (!info || info.mtimeMs > batasUmur) continue;

      batch.push(relatif);
      if (batch.length >= SAPU_BATCH) await bilas();
    }
  }

  await jelajah(config.uploadDir, "");
  await bilas();
  return total;
}

/**
 * Bersihkan foto yatim:
 *   1. unggahan yang tidak pernah ditautkan ke entri dalam 24 jam,
 *   2. berkas di disk yang tidak lagi tercatat di database.
 * @returns {Promise<number>} total berkas yang dibersihkan
 */
async function sapuFotoYatim() {
  const terlantar = await sapuUnggahanTerlantar();
  const takTercatat = await sapuBerkasTakTercatat();
  return terlantar + takTercatat;
}

const bentukFoto = (f) => ({ id: f.id, nama: f.namaAsli, url: `/api/foto/${f.id}`, ukuran: f.ukuran });

module.exports = {
  kenaliMime,
  pathBerkas,
  siapkanFolder,
  simpanFoto,
  hapusBerkas,
  sapuFotoYatim,
  bentukFoto,
};
