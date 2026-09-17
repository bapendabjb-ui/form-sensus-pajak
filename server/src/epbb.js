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
    const habis = e && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error("[Sensus Pajak] EPBB tidak dapat dihubungi:", e.message);
    throw new ApiError(502, habis ? "EPBB terlalu lama merespons. Coba lagi." : "EPBB tidak dapat dihubungi.");
  }

  const body = await res.json().catch(() => null);

  if (res.status === 404) throw new ApiError(404, "NOP tidak terdaftar di EPBB.");
  if (res.status === 400) throw new ApiError(400, "NOP harus 18 digit.");
  if (!res.ok || !body || body.status !== "ok" || !body.data) {
    console.error(`[Sensus Pajak] EPBB membalas ${res.status}:`, body && body.message);
    throw new ApiError(502, "EPBB sedang bermasalah. Coba lagi nanti.");
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
    luasTanah: Number(d.luas_tanah) || 0,
    luasBangunan: Number(d.luas_bangunan) || 0,
    belumBayar: Array.isArray(d.belum_bayar) ? d.belum_bayar.map(String) : [],
  };
}

module.exports = { aktif, cekNop, susunAlamat };
