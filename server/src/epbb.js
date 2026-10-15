"use strict";

const config = require("./config");
const { ApiError, badRequest } = require("./http");
const { PANJANG_NIK } = require("./answers");
const { normalWilayah } = require("./wilayah");
const { cocokkanAlamat } = require("./wilayahIndonesia");

/**
 * Klien API cek NOP milik EPBB (SISMIOP Banjarbaru) - baca-saja.
 *
 *   GET {EPBB_API_URL}/{nop18}                       header X-Api-Key: EPBB_API_KEY
 *   GET {EPBB_API_URL tanpa /cek}/cari?nama&nik&letak  header yang sama
 *
 * Kunci API hanya ada di server; browser memanggil /api/nop/:nop dan /api/nop/cari.
 */

const aktif = () => Boolean(config.epbbApiUrl && config.epbbApiKey);

/** Alamat pencarian: EPBB_API_URL (.../api/nop/cek) dengan "cek" diganti "cari". */
const urlCari = () => `${config.epbbApiUrl.replace(/\/+$/, "").replace(/\/cek$/, "")}/cari`;

/** Samakan dengan CARI_MIN_HURUF di api/Nop.php EPBB. */
const CARI_MIN_HURUF = 3;
const CARI_MAKS_PANJANG = 60;

/**
 * Data EPBB yang bisa mengisi pertanyaan lain secara otomatis, beserta tipe
 * pertanyaan yang cocok. Daftar yang sama (dengan label) ada di client/src/lib/epbb.js.
 */
const SUMBER_EPBB = {
  nama_wp: ["text", "paragraph"],
  // objek pajak
  letak_op: ["text", "paragraph"],
  jalan_op: ["text", "paragraph"],
  rtrw_op: ["rtrw"],
  wilayah_op: ["wilayah"],
  // subjek pajak (wajib pajak)
  letak_sp: ["text", "paragraph"],
  jalan_sp: ["text", "paragraph"],
  rtrw_sp: ["rtrw"],
  wilayah_sp: ["wilayah"],
  kelurahan_sp: ["text", "paragraph"],
  luas_op: ["luas"],
  luas_tanah: ["number"],
  luas_bangunan: ["number"],
  status_bayar: ["text", "paragraph"],
};

const sumberEpbbSah = (tipe, sumber) =>
  Object.prototype.hasOwnProperty.call(SUMBER_EPBB, sumber) && SUMBER_EPBB[sumber].includes(tipe);

const bersihkan = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** "JL. MAWAR" + "NO. 5" -> "JL. MAWAR NO. 5". */
const gabungJalan = (l) => [bersihkan(l?.jalan), bersihkan(l?.blok_kav_no)].filter(Boolean).join(" ");

/**
 * Wilayah subjek pajak dari nama kelurahan & kota SISMIOP, dalam bentuk jawaban tersimpan
 * (kelurahan Banjarbaru lengkap dengan kode SISMIOP-nya). null bila cocoknya tidak tunggal.
 */
function wilayahSubjek(l) {
  const d = cocokkanAlamat(bersihkan(l?.kelurahan), bersihkan(l?.kota));
  return d ? normalWilayah({ kode_kemendagri: d.kode }) : null;
}

/** Gabungkan bagian alamat yang terisi, mis. "JL. MAWAR NO. 5, RT 001/RW 002, KEL. X". */
function susunAlamat(l = {}, penutup = []) {
  const bersih = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const jalan = [bersih(l.jalan), bersih(l.blok_kav_no)].filter(Boolean).join(" ");
  const rt = bersih(l.rt);
  const rw = bersih(l.rw);
  const rtrw = [rt && `RT ${rt}`, rw && `RW ${rw}`].filter(Boolean).join("/");
  return [jalan, rtrw, ...penutup.map(([awalan, nilai]) => bersih(nilai) && `${awalan}${bersih(nilai)}`)]
    .filter(Boolean)
    .join(", ");
}

/**
 * Kode penyebab gagal fetch, mis. ENOTFOUND. Undici membungkusnya di e.cause (kadang dua lapis),
 * dan saat semua alamat IPv4/IPv6 gagal, di AggregateError.errors.
 */
function kodeGalat(e) {
  if (e && (e.name === "TimeoutError" || e.name === "AbortError")) return "TIMEOUT";
  let c = e;
  for (let i = 0; i < 4 && c; i += 1) {
    if (c.code) return c.code;
    c = c.cause || (Array.isArray(c.errors) ? c.errors[0] : null);
  }
  return (e && e.name) || "TIDAK_DIKETAHUI";
}

/** Pesan untuk petugas; kodenya ikut ditampilkan supaya admin tahu yang perlu diperbaiki. */
function pesanGalat(kode) {
  let pesan = "EPBB tidak dapat dihubungi.";
  if (kode === "TIMEOUT" || kode === "ETIMEDOUT" || kode === "UND_ERR_CONNECT_TIMEOUT") {
    pesan = "EPBB tidak merespons. Server EPBB mungkin tidak bisa diakses dari internet.";
  } else if (kode === "ENOTFOUND" || kode === "EAI_AGAIN") {
    pesan = "Alamat EPBB tidak ditemukan. Periksa EPBB_API_URL.";
  } else if (kode === "ECONNREFUSED") {
    pesan = "Server EPBB menolak koneksi. Port mungkin tertutup.";
  } else if (kode === "ECONNRESET" || kode === "UND_ERR_SOCKET") {
    pesan = "Koneksi ke EPBB terputus.";
  } else if (kode === "ERR_INVALID_URL") {
    pesan = "EPBB_API_URL tidak valid.";
  } else if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|SSL/i.test(kode)) {
    pesan = "Sertifikat SSL EPBB tidak valid.";
  }
  return `${pesan} (${kode})`;
}

/** URL tanpa NOP dan tanpa kata kunci pencarian (nama, NIK) untuk log. */
const alamatAman = (url) => url.replace(/\?.*$/, "?...").replace(/\/\d{18}$/, "/{nop}");

/**
 * GET ke API EPBB. body = balasan JSON, atau null bila balasannya bukan JSON.
 * EPBB yang tidak bisa dihubungi -> ApiError 502.
 * @returns {Promise<{res: Response, body: object|null, teks: string}>}
 */
async function minta(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "X-Api-Key": config.epbbApiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(config.epbbTimeoutMs),
    });
  } catch (e) {
    const kode = kodeGalat(e);
    console.error(`[Sensus Pajak] EPBB tidak dapat dihubungi (${kode}) - ${alamatAman(url)}:`, e.message);
    throw new ApiError(502, pesanGalat(kode));
  }

  const teks = await res.text().catch(() => "");
  let body = null;
  try {
    body = JSON.parse(teks);
  } catch {
    body = null;
  }
  return { res, body, teks };
}

/** Balasan bukan JSON = bukan dari api/Nop.php: URL salah (halaman lain) atau PHP/Oracle error. */
function galatBukanJson(res, teks, url) {
  const cuplikan = teks.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  console.error(`[Sensus Pajak] EPBB membalas ${res.status} bukan JSON - ${alamatAman(url)}:`, cuplikan);
  return new ApiError(
    502,
    res.ok
      ? `Alamat EPBB_API_URL bukan API cek NOP. (HTTP ${res.status})`
      : `EPBB error saat memproses NOP. Periksa log PHP/Oracle EPBB. (HTTP ${res.status})`
  );
}

/** Balasan JSON yang bukan hasil: kunci API ditolak, API dimatikan, atau galat lain. */
function galatBalasan(res, body) {
  if (res.status === 401) {
    console.error("[Sensus Pajak] EPBB menolak kunci API (401).");
    return new ApiError(502, "Kunci API ditolak EPBB. Samakan EPBB_API_KEY dengan api_nop_key. (HTTP 401)");
  }
  if (res.status === 503) {
    return new ApiError(502, "API cek NOP di EPBB belum aktif (api_nop_enabled). (HTTP 503)");
  }
  console.error(`[Sensus Pajak] EPBB membalas ${res.status}:`, body.message);
  return new ApiError(502, `EPBB sedang bermasalah: ${body.message || "balasan tidak dikenal"} (HTTP ${res.status})`);
}

/** "JL. MAWAR NO. 5, RT 005/RW 002, KEL. GUNTUNG PAYUNG, KEC. LANDASAN ULIN". */
const letakObjek = (l) =>
  susunAlamat(l, [
    ["KEL. ", l?.kelurahan],
    ["KEC. ", l?.kecamatan],
  ]);

/**
 * Cek satu NOP 18 digit.
 * @returns {Promise<{nop, namaWp, letakSp, letakOp, rinciOp, rinciSp, luasTanah, luasBangunan, belumBayar: string[]}>}
 */
async function cekNop(nop) {
  if (!aktif()) throw new ApiError(503, "Cek NOP belum diaktifkan di server.");

  const url = `${config.epbbApiUrl.replace(/\/+$/, "")}/${nop}`;
  const { res, body, teks } = await minta(url);

  // EPBB versi lama membalas NOP tak terdaftar dengan HTTP 404, tetapi server web EPBB
  // mengganti setiap balasan 404 dari PHP dengan halaman login (bukan JSON). URL-nya sendiri
  // sudah terbukti benar bila kunci API diterima, jadi 404 di sini dibaca sebagai NOP tidak ada.
  if (!body && res.status === 404) {
    console.warn(
      `[Sensus Pajak] EPBB membalas 404 bukan JSON - ${alamatAman(url)}. Dianggap NOP tidak terdaftar; ` +
        "bila semua NOP begini, periksa EPBB_API_URL atau unggah ulang api/Nop.php terbaru."
    );
    throw new ApiError(404, "NOP tidak terdaftar di EPBB.");
  }

  if (!body) throw galatBukanJson(res, teks, url);

  // Api/Nop.php terbaru membalas keduanya dengan HTTP 200 + status; versi lama memakai 404/400.
  if (body.status === "not_found" || res.status === 404) throw new ApiError(404, "NOP tidak terdaftar di EPBB.");
  if (body.status === "invalid" || res.status === 400) throw new ApiError(400, "NOP harus 18 digit.");
  if (!res.ok || body.status !== "ok" || !body.data) throw galatBalasan(res, body);

  const d = body.data;
  return {
    nop: String(d.nop || nop),
    namaWp: String(d.nama_wp || "").trim(),
    letakSp: susunAlamat(d.letak_sp, [
      ["KEL. ", d.letak_sp?.kelurahan],
      ["", d.letak_sp?.kota],
    ]),
    letakOp: letakObjek(d.letak_op),
    // Bagian letak objek pajak untuk pengisian otomatis kolom jalan, RT/RW, dan wilayah.
    // Kode kecamatan & kelurahan diambil dari NOP (digit 5-7 dan 8-10).
    rinciOp: {
      jalan: gabungJalan(d.letak_op),
      rt: bersihkan(d.letak_op?.rt),
      rw: bersihkan(d.letak_op?.rw),
      kodeKecamatan: String(d.nop || nop).slice(4, 7),
      kodeKelurahan: String(d.nop || nop).slice(7, 10),
    },
    // Bagian letak subjek pajak. SISMIOP tidak menyimpan kecamatan wajib pajak, hanya
    // nama kelurahan & kota (teks bebas, bisa di luar Banjarbaru) - kecamatannya dicari
    // dari data wilayah se-Indonesia.
    rinciSp: {
      jalan: gabungJalan(d.letak_sp),
      rt: bersihkan(d.letak_sp?.rt),
      rw: bersihkan(d.letak_sp?.rw),
      kelurahan: bersihkan(d.letak_sp?.kelurahan),
      kota: bersihkan(d.letak_sp?.kota),
      wilayah: wilayahSubjek(d.letak_sp),
    },
    luasTanah: Number(d.luas_tanah) || 0,
    luasBangunan: Number(d.luas_bangunan) || 0,
    belumBayar: Array.isArray(d.belum_bayar) ? d.belum_bayar.map(String) : [],
  };
}

/**
 * Kata kunci pencarian NOP dari query string, dirapikan. Aturannya sama dengan api/Nop.php
 * di EPBB, supaya ketikan yang pasti ditolak tidak perlu dikirim ke sana.
 * @returns {{ nama: string, nik: string, letak: string }}
 */
function kunciCariNop(q = {}) {
  const teks = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, CARI_MAKS_PANJANG) : "");
  const nama = teks(q.nama);
  const letak = teks(q.letak);
  const nik = typeof q.nik === "string" ? q.nik.replace(/\D/g, "") : "";
  const huruf = (s) => s.replace(/[^a-z0-9]/gi, "").length;

  if (nik && nik.length !== PANJANG_NIK) throw badRequest(`NIK harus ${PANJANG_NIK} digit.`);
  if ((nama && huruf(nama) < CARI_MIN_HURUF) || (letak && huruf(letak) < CARI_MIN_HURUF)) {
    throw badRequest(`Nama dan letak objek minimal ${CARI_MIN_HURUF} huruf.`);
  }
  if (!nama && !nik && !letak) throw badRequest("Isi nama, NIK, atau letak objek.");
  return { nama, nik, letak };
}

/**
 * Cari objek pajak menurut nama WP, NIK, dan/atau letak objek. Semua kata kunci yang
 * diisi harus cocok; hasilnya paling banyak 20 baris (api_nop_cari_maks di EPBB).
 * @param {{ nama: string, nik: string, letak: string }} kunci hasil kunciCariNop()
 * @returns {Promise<{ hasil: {nop, namaWp, letakOp}[], lebih: boolean }>} lebih = hasilnya terpotong
 */
async function cariNop(kunci) {
  if (!aktif()) throw new ApiError(503, "Cek NOP belum diaktifkan di server.");

  const q = new URLSearchParams();
  for (const k of ["nama", "nik", "letak"]) if (kunci[k]) q.set(k, kunci[k]);
  const url = `${urlCari()}?${q}`;
  const { res, body, teks } = await minta(url);

  // api/Nop.php lama belum punya pencarian: CodeIgniter membalas 404, lalu server web
  // EPBB menggantinya dengan halaman login.
  if (!body && res.status === 404) {
    console.warn(`[Sensus Pajak] EPBB membalas 404 bukan JSON - ${alamatAman(url)}. api/Nop.php belum diperbarui?`);
    throw new ApiError(
      502,
      "Pencarian NOP belum tersedia di EPBB. Unggah api/Nop.php dan M_api_nop.php terbaru ke server EPBB."
    );
  }
  if (!body) throw galatBukanJson(res, teks, url);
  if (body.status === "invalid") throw badRequest(body.message || "Kata kunci pencarian tidak valid.");
  if (!res.ok || body.status !== "ok" || !body.data) throw galatBalasan(res, body);

  const hasil = Array.isArray(body.data.hasil) ? body.data.hasil : [];
  return {
    hasil: hasil.map((d) => ({
      nop: String(d.nop || ""),
      namaWp: bersihkan(d.nama_wp),
      letakOp: letakObjek(d.letak_op),
    })),
    lebih: Boolean(body.data.lebih),
  };
}

module.exports = {
  aktif,
  cekNop,
  cariNop,
  kunciCariNop,
  susunAlamat,
  wilayahSubjek,
  SUMBER_EPBB,
  sumberEpbbSah,
};
