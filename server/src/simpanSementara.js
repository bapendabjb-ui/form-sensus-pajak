"use strict";

/**
 * Simpanan sementara untuk jawaban GET yang mahal disusun (dipakai GET /api/peta).
 *
 * Isinya tidak dipakai lagi begitu ada data yang mungkin berubah: setiap
 * permintaan API selain GET/HEAD yang selesai menaikkan `versi` (catatPerubahan,
 * dipasang di server/index.js). Penandanya sesudah respons, bukan saat query
 * tulis, supaya transaksi sudah di-commit ketika simpanan dianggap usang.
 * Umur maksimum tetap ada untuk perubahan yang tidak lewat API - skrip di
 * server/scripts, suntingan langsung ke database, atau koneksi yang putus
 * sebelum respons selesai.
 *
 * Seperti pembatas laju (src/laju.js), isinya di memori satu proses; tepat
 * selama aplikasi berjalan pada satu instance.
 */

let versi = 0;

/** Middleware: tandai data berubah setiap kali permintaan tulis selesai. */
function catatPerubahan(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  res.on("finish", () => {
    // Kiriman yang ditolak (4xx) tidak mengubah apa pun. Tidak dihitung supaya
    // simpanan tidak bisa dikosongkan terus-menerus dengan kiriman asal-asalan.
    // 5xx tetap dihitung: bisa jadi sebagian data sudah tertulis.
    if (res.statusCode < 400 || res.statusCode >= 500) versi += 1;
  });
  return next();
}

/**
 * @param {object} opsi
 * @param {number} opsi.umurMs              umur maksimum satu isi
 * @param {() => Promise<any>} opsi.susun   penyusun isi baru
 * @returns {() => Promise<any>} pembaca: isi yang masih berlaku, atau hasil susunan
 *   baru. Pembaca yang datang selagi isi sedang disusun menunggu susunan yang sama,
 *   jadi banyak pembuka peta sekaligus tetap hanya satu kali query.
 */
function simpanSementara({ umurMs, susun }) {
  let isi = null; // { versi, sejak, nilai }
  let berjalan = null; // { versi, janji }

  function baca() {
    if (isi && isi.versi === versi && Date.now() - isi.sejak < umurMs) return Promise.resolve(isi.nilai);
    if (berjalan && berjalan.versi === versi) return berjalan.janji;

    // Umur dihitung dari awal penyusunan: data yang terbaca bisa setua itu.
    const v = versi;
    const sejak = Date.now();
    const janji = Promise.resolve()
      .then(susun)
      .then((nilai) => {
        // Data berubah selagi menyusun -> hasil ini sudah usang, jangan disimpan.
        if (v === versi) isi = { versi: v, sejak, nilai };
        return nilai;
      })
      .finally(() => {
        if (berjalan && berjalan.janji === janji) berjalan = null;
      });
    berjalan = { versi: v, janji };
    return janji;
  }

  /** Buang isi - dipakai pengujian. */
  baca.kosongkan = () => {
    isi = null;
    berjalan = null;
  };

  return baca;
}

module.exports = { catatPerubahan, simpanSementara };
