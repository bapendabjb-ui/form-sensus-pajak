"use strict";

/**
 * Pembatas laju sederhana berbasis memori proses.
 *
 * Dipakai di dua tempat dengan watak berbeda: cek NOP (mencegah data WP ditarik
 * massal lewat endpoint terbuka) dan login admin (mencegah password ditebak
 * berulang). Keduanya memakai penghitung yang sama, hanya angkanya yang beda.
 *
 * CATATAN PENYEBARAN: hitungannya ada di memori satu proses. Selama aplikasi
 * berjalan pada satu instance - sebagaimana di Railway sekarang - ini tepat.
 * Bila nanti di-scale ke beberapa instance, batasnya berlipat sebanyak instance
 * dan perlu dipindah ke penyimpanan bersama (mis. Redis).
 */

const { ApiError } = require("./http");

/**
 * @param {object} opsi
 * @param {number} opsi.jendelaMs   panjang jendela pengamatan
 * @param {number} opsi.maks        percobaan yang diizinkan dalam satu jendela
 * @param {string} opsi.pesan       pesan yang dikirim saat batas terlampaui
 * @param {(req: object) => string} [opsi.kunci]  penentu identitas pemanggil (default: IP)
 * @param {boolean} [opsi.hanyaGagal] bila true, hanya respons 4xx/5xx yang dihitung -
 *        dipakai untuk login supaya pemakaian yang wajar tidak pernah terkena batas
 */
function pembatas({ jendelaMs, maks, pesan, kunci = (req) => req.ip || "anon", hanyaGagal = false }) {
  const hitungan = new Map();

  // Buang catatan kedaluwarsa secara berkala supaya Map tidak tumbuh tanpa batas.
  setInterval(() => {
    const batas = Date.now() - jendelaMs;
    for (const [k, c] of hitungan) if (c.mulai < batas) hitungan.delete(k);
  }, jendelaMs).unref();

  function middleware(req, res, next) {
    const k = kunci(req);
    const kini = Date.now();
    const catatan = hitungan.get(k);
    const segar = !catatan || kini - catatan.mulai > jendelaMs;

    if (!segar && catatan.jumlah >= maks) {
      const sisaDetik = Math.ceil((catatan.mulai + jendelaMs - kini) / 1000);
      res.setHeader("Retry-After", String(sisaDetik));
      return next(new ApiError(429, pesan));
    }

    const tambah = () => {
      const c = hitungan.get(k);
      if (!c || kini - c.mulai > jendelaMs) hitungan.set(k, { mulai: kini, jumlah: 1 });
      else c.jumlah += 1;
    };

    if (!hanyaGagal) {
      tambah();
      return next();
    }

    // Hitung setelah respons diketahui: percobaan yang berhasil tidak dihitung,
    // sehingga admin yang memang tahu passwordnya tidak pernah terkunci.
    res.on("finish", () => {
      if (res.statusCode >= 400) tambah();
    });
    return next();
  }

  /** Bersihkan catatan satu kunci - dipakai pengujian. */
  middleware.reset = () => hitungan.clear();

  return middleware;
}

module.exports = { pembatas };
