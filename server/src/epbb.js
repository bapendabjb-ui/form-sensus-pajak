"use strict";

const config = require("./config");
const { ApiError } = require("./http");

/**
 * Klien API cek NOP milik EPBB (SISMIOP Banjarbaru) - baca-saja.
 *
 *   GET {EPBB_API_URL}/{nop18}   header X-Api-Key: EPBB_API_KEY
 *
 * Kunci API hanya ada di server; browser memanggil /api/nop/:nop.
 */

const aktif = () => Boolean(config.epbbApiUrl && config.epbbApiKey);

/**
 * Data EPBB yang bisa mengisi pertanyaan lain secara otomatis, beserta tipe
 * pertanyaan yang cocok. Daftar yang sama (dengan label) ada di client/src/lib/epbb.js.
 */
const SUMBER_EPBB = {
  nama_wp: ["text", "paragraph"],
  letak_op: ["text", "paragraph"],
  jalan_op: ["text", "paragraph"],
  letak_sp: ["text", "paragraph"],
  wilayah_op: ["wilayah"],
  rtrw_op: ["rtrw"],
  luas_tanah: ["number"],
  luas_bangunan: ["number"],
  status_bayar: ["text", "paragraph"],
};

const sumberEpbbSah = (tipe, sumber) =>
  Object.prototype.hasOwnProperty.call(SUMBER_EPBB, sumber) && SUMBER_EPBB[sumber].includes(tipe);

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

/** URL tanpa NOP untuk log. */
const alamatAman = (url) => url.replace(/\/\d{18}$/, "/{nop}");

/**
 * Cek satu NOP 18 digit.
 * @returns {Promise<{nop, namaWp, letakSp, letakOp, luasTanah, luasBangunan, belumBayar: string[]}>}
 */
async function cekNop(nop) {
  if (!aktif()) throw new ApiError(503, "Cek NOP belum diaktifkan di server.");

  const url = `${config.epbbApiUrl.replace(/\/+$/, "")}/${nop}`;
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

  // Balasan bukan JSON = bukan dari api/Nop.php: URL salah (halaman lain) atau PHP/Oracle error.
  if (!body) {
    const cuplikan = teks.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    console.error(`[Sensus Pajak] EPBB membalas ${res.status} bukan JSON - ${alamatAman(url)}:`, cuplikan);
    throw new ApiError(
      502,
      res.ok || res.status === 404
        ? `Alamat EPBB_API_URL bukan API cek NOP. (HTTP ${res.status})`
        : `EPBB error saat memproses NOP. Periksa log PHP/Oracle EPBB. (HTTP ${res.status})`
    );
  }

  if (res.status === 404) throw new ApiError(404, "NOP tidak terdaftar di EPBB.");
  if (res.status === 400) throw new ApiError(400, "NOP harus 18 digit.");
  if (res.status === 401) {
    console.error("[Sensus Pajak] EPBB menolak kunci API (401).");
    throw new ApiError(502, "Kunci API ditolak EPBB. Samakan EPBB_API_KEY dengan api_nop_key. (HTTP 401)");
  }
  if (res.status === 503) {
    throw new ApiError(502, "API cek NOP di EPBB belum aktif (api_nop_enabled). (HTTP 503)");
  }
  if (!res.ok || body.status !== "ok" || !body.data) {
    console.error(`[Sensus Pajak] EPBB membalas ${res.status}:`, body.message);
    throw new ApiError(502, `EPBB sedang bermasalah: ${body.message || "balasan tidak dikenal"} (HTTP ${res.status})`);
  }

  const d = body.data;
  return {
    nop: String(d.nop || nop),
    namaWp: String(d.nama_wp || "").trim(),
    letakSp: susunAlamat(d.letak_sp, [
      ["KEL. ", d.letak_sp?.kelurahan],
      ["", d.letak_sp?.kota],
    ]),
    letakOp: susunAlamat(d.letak_op, [
      ["KEL. ", d.letak_op?.kelurahan],
      ["KEC. ", d.letak_op?.kecamatan],
    ]),
    // Bagian letak OP untuk pengisian otomatis kolom jalan, RT/RW, dan wilayah.
    // Kode kecamatan & kelurahan diambil dari NOP (digit 5-7 dan 8-10).
    rinciOp: {
      jalan: [d.letak_op?.jalan, d.letak_op?.blok_kav_no].map((s) => String(s ?? "").trim()).filter(Boolean).join(" "),
      rt: String(d.letak_op?.rt ?? "").trim(),
      rw: String(d.letak_op?.rw ?? "").trim(),
      kodeKecamatan: String(d.nop || nop).slice(4, 7),
      kodeKelurahan: String(d.nop || nop).slice(7, 10),
    },
    luasTanah: Number(d.luas_tanah) || 0,
    luasBangunan: Number(d.luas_bangunan) || 0,
    belumBayar: Array.isArray(d.belum_bayar) ? d.belum_bayar.map(String) : [],
  };
}

module.exports = { aktif, cekNop, susunAlamat, SUMBER_EPBB, sumberEpbbSah };
