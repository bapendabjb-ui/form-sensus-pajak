/*
 * Pemadanan NIB-NOP di layar (tab NOP Peta Sensus, kotak bidang formulir PBB):
 * pilihan petugas -> keputusan yang dikirim ke server (server/src/integrasi.js
 * bacaKirimanPadanan), petunjuk dari luas, dan ringkasan status bidang.
 */

/** Apa yang terjadi dengan NOP lain sesudah satu NOP dipilih untuk bidang ini. */
export const TINDAK_LAIN = [
  { kunci: "ganda", label: "Terdaftar dua kali" },
  { kunci: "gabung", label: "Digabung ke NOP ini" },
  { kunci: "salah_bidang", label: "Milik bidang lain" },
];

/** Beda luas PBB dengan BPN dianggap berarti bila lebih dari 10% luas BPN. */
export const AMBANG_LUAS = 0.1;

const angka = (n) => typeof n === "number" && Number.isFinite(n);
const mirip = (a, b) => Math.abs(a - b) / b <= AMBANG_LUAS;

/** Luas PBB jauh dari luas BPN? (false bila salah satunya tidak diketahui) */
export const luasBeda = (pbb, bpn) => angka(pbb) && angka(bpn) && bpn > 0 && !mirip(pbb, bpn);

/**
 * Satu kalimat petunjuk dari luas tanah tiap NOP (EPBB) dibanding luas bidang BPN, atau "".
 * Hanya bila semua luasnya diketahui.
 *
 * @param {number|null} luasBpn
 * @param {(number|null)[]} luasNop
 */
export function petunjukLuas(luasBpn, luasNop) {
  if (!angka(luasBpn) || luasBpn <= 0 || !luasNop.length) return "";
  if (!luasNop.every((n) => angka(n) && n > 0)) return "";
  if (luasNop.length === 1) return mirip(luasNop[0], luasBpn) ? "" : "Luas PBB beda dengan BPN. Mungkin luas PBB-nya belum diperbarui.";
  if (luasNop.filter((n) => mirip(n, luasBpn)).length >= 2) {
    return "Luasnya hampir sama semua dengan bidang ini. Kemungkinan NOP-nya terdaftar dua kali.";
  }
  if (mirip(luasNop.reduce((a, b) => a + b, 0), luasBpn)) {
    return "Kalau dijumlah, luasnya pas dengan bidang ini. Kemungkinan tanahnya sudah dibagi.";
  }
  return "Luasnya tidak cocok dengan bidang ini. Mungkin luas PBB belum diperbarui, atau ada NOP milik bidang lain.";
}

/**
 * Pilihan di layar -> rincian kiriman, atau null bila belum lengkap.
 *
 * @param {string[]} daftarNop  semua NOP di bidang ini (termasuk NOP formulir yang sedang diisi)
 * @param {object} p
 * @param {string} p.pilihan    NOP yang benar untuk bidang ini, "pecah" (semua sah), atau "tanpa" (bukan bidang ini)
 * @param {{ [nop]: string }} p.lain        tindak NOP lainnya (TINDAK_LAIN) bila satu NOP dipilih
 * @param {{ [nop]: number|null }} p.luas   luas tanah PBB tiap NOP (EPBB)
 * @param {{ [nop]: boolean }} p.sesuaikan  luas PBB NOP ini perlu disesuaikan ke BPN
 */
export function susunRincian(daftarNop, { pilihan = "", lain = {}, luas = {}, sesuaikan = {} } = {}) {
  if (!pilihan || !daftarNop.length) return null;
  const baris = (nop, tindak) => ({
    nop,
    tindak,
    luasPbb: angka(luas[nop]) ? luas[nop] : null,
    luasBeda: (tindak === "utama" || tindak === "sah") && sesuaikan[nop] === true,
  });
  if (pilihan === "pecah") return daftarNop.map((n) => baris(n, "sah"));
  if (pilihan === "tanpa") return daftarNop.map((n) => baris(n, "salah_bidang"));
  if (!daftarNop.includes(pilihan)) return null;
  const hasil = [];
  for (const n of daftarNop) {
    if (n === pilihan) hasil.push(baris(n, "utama"));
    else if (TINDAK_LAIN.some((t) => t.kunci === lain[n])) hasil.push(baris(n, lain[n]));
    else return null;
  }
  return hasil;
}

/** Keputusan tersimpan -> pilihan di layar, untuk mengubahnya. */
export function pilihanDari(keputusan) {
  const kosong = { pilihan: "", lain: {}, sesuaikan: {}, catatan: "" };
  if (!keputusan) return kosong;
  const lain = {};
  const sesuaikan = {};
  for (const r of keputusan.rincian || []) {
    if (TINDAK_LAIN.some((t) => t.kunci === r.tindak)) lain[r.nop] = r.tindak;
    if (r.luasBeda) sesuaikan[r.nop] = true;
  }
  const pilihan = keputusan.hasil === "padan" ? keputusan.nopUtama : keputusan.hasil === "pecah" ? "pecah" : "tanpa";
  return { pilihan, lain, sesuaikan, catatan: keputusan.catatan || "" };
}

/**
 * Keputusan tersimpan masih menyebut semua NOP yang tampil sekarang (termasuk NOP
 * formulir yang belum tersimpan)? Sama dengan server keputusanBerlaku.
 */
export function keputusanMencakup(keputusan, daftarNop) {
  if (!keputusan || !daftarNop.length) return false;
  const disebut = new Set((keputusan.rincian || []).map((r) => r.nop));
  if (!daftarNop.every((n) => disebut.has(n))) return false;
  if (keputusan.hasil === "padan") return daftarNop.includes(keputusan.nopUtama);
  if (keputusan.hasil === "pecah") return keputusan.rincian.some((r) => r.tindak === "sah" && daftarNop.includes(r.nop));
  return keputusan.hasil === "tanpa";
}

/**
 * Ringkasan padanan satu bidang untuk baris status di atas daftar NOP-nya:
 *   { status, judul, sub, aksi: "padankan" | "ubah" | "" } atau null bila tidak perlu tampil.
 *
 * @param {object} p
 * @param {string[]} p.daftarNop  NOP yang tampil (termasuk NOP formulir ini)
 * @param {boolean} p.bidangLain  ada NOP yang juga tercatat di bidang lain
 * @param {object|null} p.padan   isi tab NOP dari server (status, alasan, keputusan)
 * @param {boolean} p.formulir    di formulir: bidang yang padan dengan sendirinya tidak perlu disebut
 */
export function ringkasPadanan({ daftarNop, bidangLain = false, padan = null, formulir = false }) {
  if (!daftarNop.length) return null;
  const kep = padan?.keputusan || null;
  if (keputusanMencakup(kep, daftarNop)) {
    if (padan?.status === "tinjau" && padan.alasan === "bentrok") {
      return { status: "tinjau", judul: "Perlu dipadankan", sub: "NOP ini juga dipadankan ke bidang lain", aksi: "ubah" };
    }
    const oleh = kep.oleh ? ` · ${kep.oleh}` : "";
    if (kep.hasil === "pecah") return { status: "pecah", judul: "Perlu dipecah", sub: `Semua NOP-nya benar${oleh}`, aksi: "ubah" };
    if (kep.hasil === "tanpa") return { status: "tanpa_nop", judul: "Belum ber-NOP", sub: `NOP-nya milik bidang lain${oleh}`, aksi: "ubah" };
    return { status: "padan", judul: "Sudah dipadankan", sub: `NOP bidang ini dipilih${oleh}`, aksi: "ubah", nop: kep.nopUtama };
  }
  // Di formulir NOP "baru" itu biasanya NOP formulir ini sendiri: cukup disebut jumlahnya.
  if (kep && !formulir) return { status: "tinjau", judul: "Perlu dipadankan lagi", sub: "Ada NOP baru sejak dipadankan", aksi: "padankan" };
  if (daftarNop.length > 1) return { status: "tinjau", judul: "Perlu dipadankan", sub: `Ada ${daftarNop.length} NOP di bidang ini`, aksi: "padankan" };
  if (padan?.alasan === "sudah_dipadankan") {
    return { status: "tinjau", judul: "Perlu dipadankan", sub: "NOP ini sudah dipadankan ke bidang lain", aksi: "padankan" };
  }
  if (bidangLain) return { status: "tinjau", judul: "Perlu dipadankan", sub: "NOP ini juga ada di bidang lain", aksi: "padankan" };
  return formulir ? null : { status: "padan", judul: "Padan", sub: "1 NIB = 1 NOP", aksi: "" };
}
