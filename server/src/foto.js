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
const FOTO_MAKS_PER_PERTANYAAN = 10;

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

/** Hapus berkas-berkas di disk (baris database-nya sudah dihapus pemanggil). */
async function hapusBerkas(daftar) {
  await Promise.all(
    (daftar || []).map((berkas) => fsp.unlink(pathBerkas(berkas)).catch(() => {}))
  );
}

/**
 * Bersihkan foto yatim:
 *   1. foto yang diunggah tetapi tidak pernah ditautkan ke entri dalam 24 jam,
 *   2. berkas di disk yang tidak lagi tercatat (mis. terhapus lewat cascade saat
 *      pertanyaan atau formulir dihapus).
 * Berkas yang baru berumur < 30 menit dilewati agar unggahan yang sedang
 * berjalan tidak ikut terhapus.
 */
async function sapuFotoYatim() {
  const batasTautan = new Date(Date.now() - 24 * 3600 * 1000);
  const yatim = await prisma.foto.findMany({
    where: { entriId: null, createdAt: { lt: batasTautan } },
    select: { id: true },
  });
  if (yatim.length) {
    await prisma.foto.deleteMany({ where: { id: { in: yatim.map((f) => f.id) } } });
  }

  const tercatat = new Set((await prisma.foto.findMany({ select: { berkas: true } })).map((f) => f.berkas));
  const batasUmur = Date.now() - 30 * 60 * 1000;
  let dihapus = 0;

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
      if (tercatat.has(relatif)) continue;
      const info = await fsp.stat(full).catch(() => null);
      if (!info || info.mtimeMs > batasUmur) continue;
      await fsp.unlink(full).catch(() => {});
      dihapus++;
    }
  }

  await jelajah(config.uploadDir, "");
  return dihapus;
}

const bentukFoto = (f) => ({ id: f.id, nama: f.namaAsli, url: `/api/foto/${f.id}`, ukuran: f.ukuran });

module.exports = {
  FOTO_MAKS_PER_PERTANYAAN,
  kenaliMime,
  pathBerkas,
  siapkanFolder,
  simpanFoto,
  hapusBerkas,
  sapuFotoYatim,
  bentukFoto,
};
