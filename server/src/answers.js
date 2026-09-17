"use strict";

/**
 * Normalisasi & validasi nilai jawaban per tipe pertanyaan.
 *
 * Bentuk JSON yang disimpan di kolom jawaban.nilai:
 *   text/paragraph/number/date/dropdown/radio : string
 *   checkbox                                  : array string
 *   range                                     : { min: number|null, max: number|null }
 *   linetariff                                : array { layanan, jenis, harga_min, harga_max }
 *                                               (harga_max null = harga tunggal)
 *   rtrw                                      : { rt, rw } - dua string 3 digit
 *   nik / npwp / nop                          : string digit (16 / 15-17 / 18 digit)
 *   niknpwp                                   : { nik, npwp } - wajib = minimal salah satu
 *   telepon                                   : array { keterangan, nomor } - nomor 8-15 digit
 *   luas                                      : { tanah, bangunan } - m², number|null (0 boleh)
 */

const { normalWilayah } = require("./wilayah");

const TIPE = [
  "text",
  "paragraph",
  "number",
  "date",
  "dropdown",
  "radio",
  "checkbox",
  "range",
  "linetariff",
  "foto",
  "wilayah",
  "lokasi",
  "rtrw",
  "nik",
  "npwp",
  "nop",
  "niknpwp",
  "telepon",
  "luas",
];

/** Tipe yang menyimpan daftar opsi di tabel pertanyaan_opsi. */
const BERTIPE_OPSI = ["dropdown", "radio", "checkbox", "linetariff"];

/** Ubah apa pun menjadi angka, atau null bila kosong / bukan angka. */
function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  let s = v;
  if (typeof s === "string") {
    // Terima "1.250.000" maupun "1250000,50" (format Indonesia).
    s = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Angka desimal apa adanya, titik sebagai pemisah desimal.
 *
 * Koordinat TIDAK boleh lewat toNumberOrNull(): fungsi itu membuang titik
 * karena memperlakukannya sebagai pemisah ribuan, sehingga -3.4521234 akan
 * berubah menjadi -34521234.
 */
function toDesimal(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

const toTrimmedString = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** Sisakan hanya angka, lalu potong pada `maks` digit. */
const hanyaDigit = (v, maks) => toTrimmedString(v).replace(/\D/g, "").slice(0, maks);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Panjang digit yang sah per tipe identitas.
 *   nik  : 16 digit (sesuai KTP-el)
 *   npwp : 15 digit (format lama), 16 digit (NPWP baru = NIK), 17 digit (NITKU)
 *   nop  : 18 digit (NOP PBB: provinsi 2, kab/kota 2, kecamatan 3, kelurahan 3,
 *          blok 3, nomor urut objek 4, kode khusus 1)
 *   rtrw : masing-masing tepat 3 digit
 */
const PANJANG_NIK = 16;
const PANJANG_NPWP_MIN = 15;
const PANJANG_NPWP_MAKS = 17;
const PANJANG_NOP = 18;
const PANJANG_RTRW = 3;

/** Nomor telepon: 8-15 digit (tanpa tanda +), maksimal 10 nomor per pertanyaan. */
const PANJANG_TELEPON_MIN = 8;
const PANJANG_TELEPON_MAKS = 15;
const TELEPON_MAKS_BARIS = 10;

/** Angka saja, tanda + di depan dipertahankan: "+62 812-3456" -> "+628123456". */
function nomorTelepon(raw) {
  const s = toTrimmedString(raw);
  const d = s.replace(/\D/g, "").slice(0, PANJANG_SIMPAN_MAKS);
  return s.startsWith("+") && d ? `+${d}` : d;
}

/**
 * Batas aman penyimpanan digit identitas. Sengaja lebih longgar dari panjang
 * yang sah supaya nilai kepanjangan tetap utuh saat diperiksa pesanFormat()
 * dan ditolak dengan jelas, bukan dipotong diam-diam menjadi "kelihatan benar".
 */
const PANJANG_SIMPAN_MAKS = 40;

/** Bulatkan ke `desimal` angka di belakang koma. */
const bulat = (n, desimal) => {
  const f = 10 ** desimal;
  return Math.round(n * f) / f;
};

const LOKASI_KOSONG = { lat: null, lon: null, akurasi: null, ketinggian: null, waktu: "", sumber: "" };

/** Bentuk nilai kosong per tipe, dipakai sebagai fallback. */
function nilaiKosong(tipe) {
  if (tipe === "checkbox" || tipe === "linetariff" || tipe === "foto" || tipe === "telepon") return [];
  if (tipe === "range") return { min: null, max: null };
  if (tipe === "lokasi") return { ...LOKASI_KOSONG };
  if (tipe === "wilayah") return normalWilayah("", "");
  if (tipe === "rtrw") return { rt: "", rw: "" };
  if (tipe === "niknpwp") return { nik: "", npwp: "" };
  if (tipe === "luas") return { tanah: null, bangunan: null };
  return "";
}

/** Normalisasi nilai mentah dari klien menjadi bentuk kanonik untuk disimpan. */
function normalizeNilai(tipe, raw) {
  switch (tipe) {
    case "text":
    case "paragraph":
    case "dropdown":
    case "radio":
      return toTrimmedString(raw);

    case "number": {
      const n = toNumberOrNull(raw);
      return n === null ? "" : String(n);
    }

    case "date": {
      const s = toTrimmedString(raw);
      return ISO_DATE.test(s) ? s : "";
    }

    case "checkbox": {
      if (!Array.isArray(raw)) return [];
      return raw.map(toTrimmedString).filter((s) => s !== "");
    }

    case "range": {
      const obj = raw && typeof raw === "object" ? raw : {};
      return { min: toNumberOrNull(obj.min), max: toNumberOrNull(obj.max) };
    }

    case "luas": {
      // { tanah, bangunan } dalam m². Luas negatif tidak masuk akal, jadi dianggap kosong.
      const obj = raw && typeof raw === "object" ? raw : {};
      const luas = (v) => {
        const n = toNumberOrNull(v);
        return n === null || n < 0 ? null : bulat(n, 2);
      };
      return { tanah: luas(obj.tanah), bangunan: luas(obj.bangunan) };
    }

    case "linetariff": {
      if (!Array.isArray(raw)) return [];
      return raw
        .map((row) => {
          const r = row && typeof row === "object" ? row : {};
          return {
            layanan: toTrimmedString(r.layanan),
            jenis: toTrimmedString(r.jenis),
            harga_min: toNumberOrNull(r.harga_min !== undefined ? r.harga_min : r.hargaMin),
            harga_max: toNumberOrNull(r.harga_max !== undefined ? r.harga_max : r.hargaMax),
          };
        })
        .filter(
          (r) => r.layanan !== "" || r.jenis !== "" || r.harga_min !== null || r.harga_max !== null
        );
    }

    case "wilayah": {
      // { kecamatan, kode_kecamatan, kelurahan, kode_kelurahan } — dicocokkan ke data wilayah.
      const obj = raw && typeof raw === "object" ? raw : {};
      return normalWilayah(toTrimmedString(obj.kecamatan), toTrimmedString(obj.kelurahan));
    }

    case "lokasi": {
      // { lat, lon, akurasi, ketinggian, waktu, sumber } dari GPS perangkat petugas atau dipilih di peta.
      const obj = raw && typeof raw === "object" ? raw : {};
      const lat = toDesimal(obj.lat);
      const lon = toDesimal(obj.lon);

      // Koordinat di luar jangkauan yang sah dianggap tidak terisi sama sekali.
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return { ...LOKASI_KOSONG };
      }

      const akurasi = toDesimal(obj.akurasi);
      const ketinggian = toDesimal(obj.ketinggian);
      const waktu = toTrimmedString(obj.waktu);
      const stempel = waktu && !Number.isNaN(Date.parse(waktu)) ? new Date(waktu).toISOString() : "";

      return {
        // 7 desimal ~ 1 cm; selebihnya hanya derau GPS.
        lat: bulat(lat, 7),
        lon: bulat(lon, 7),
        akurasi: akurasi === null || akurasi < 0 ? null : bulat(akurasi, 1),
        ketinggian: ketinggian === null ? null : bulat(ketinggian, 1),
        waktu: stempel,
        sumber: obj.sumber === "gps" || obj.sumber === "peta" ? obj.sumber : "",
      };
    }

    case "nik":
    case "npwp":
    case "nop":
      return hanyaDigit(raw, PANJANG_SIMPAN_MAKS);

    case "telepon": {
      if (!Array.isArray(raw)) return [];
      return raw
        .map((row) => {
          const r = row && typeof row === "object" ? row : {};
          return { keterangan: toTrimmedString(r.keterangan).slice(0, 100), nomor: nomorTelepon(r.nomor) };
        })
        .filter((r) => r.keterangan !== "" || r.nomor !== "")
        .slice(0, TELEPON_MAKS_BARIS);
    }

    case "niknpwp": {
      const obj = raw && typeof raw === "object" ? raw : {};
      return { nik: hanyaDigit(obj.nik, PANJANG_SIMPAN_MAKS), npwp: hanyaDigit(obj.npwp, PANJANG_SIMPAN_MAKS) };
    }

    case "rtrw": {
      // { rt, rw } - dilengkapi nol di depan supaya selalu 3 digit ("7" -> "007").
      const obj = raw && typeof raw === "object" ? raw : {};
      const rapikan = (v) => {
        const d = hanyaDigit(v, PANJANG_RTRW);
        return d === "" ? "" : d.padStart(PANJANG_RTRW, "0");
      };
      return { rt: rapikan(obj.rt), rw: rapikan(obj.rw) };
    }

    case "foto": {
      // Array { id, nama }. Keberadaan & kepemilikan foto diperiksa di src/entri.js.
      if (!Array.isArray(raw)) return [];
      const dilihat = new Set();
      const hasil = [];
      for (const item of raw) {
        const obj = item && typeof item === "object" ? item : { id: item };
        const id = Number(obj.id);
        if (!Number.isInteger(id) || id <= 0 || dilihat.has(id)) continue;
        dilihat.add(id);
        hasil.push({ id, nama: toTrimmedString(obj.nama).slice(0, 200) });
      }
      return hasil;
    }

    default:
      return toTrimmedString(raw);
  }
}

/** true bila nilai dianggap terisi (dipakai validasi "wajib diisi"). */
function nilaiTerisi(tipe, nilai) {
  switch (tipe) {
    case "checkbox":
    case "foto":
      return Array.isArray(nilai) && nilai.length > 0;
    case "range":
      return !!nilai && typeof nilai === "object" && nilai.min !== null && nilai.max !== null;
    case "luas":
      // Bangunan boleh 0 (tanah kosong), tetapi harus diisi.
      return !!nilai && typeof nilai === "object" && nilai.tanah !== null && nilai.bangunan !== null;
    case "wilayah":
      return !!nilai && typeof nilai === "object" && !!nilai.kecamatan && !!nilai.kelurahan;
    case "lokasi":
      return !!nilai && typeof nilai === "object" && nilai.lat !== null && nilai.lon !== null;
    case "linetariff":
      return Array.isArray(nilai) && nilai.some((r) => toTrimmedString(r.layanan) !== "");
    case "rtrw":
      return !!nilai && typeof nilai === "object" && !!nilai.rt && !!nilai.rw;
    case "telepon":
      return Array.isArray(nilai) && nilai.some((r) => toTrimmedString(r?.nomor) !== "");
    case "niknpwp":
      // Badan usaha tidak punya NIK, perorangan belum tentu punya NPWP: cukup salah satu.
      return !!nilai && typeof nilai === "object" && (!!nilai.nik || !!nilai.npwp);
    default:
      return toTrimmedString(nilai) !== "";
  }
}

/**
 * Periksa panjang digit tipe identitas (nik / npwp / nop / rtrw).
 *
 * Hanya berlaku untuk nilai yang SUDAH terisi - kolom kosong diurus validasi
 * "wajib diisi" supaya pertanyaan opsional tidak ikut ditolak.
 *
 * @returns {string} pesan galat, atau "" bila tidak ada masalah
 */
function pesanFormat(tipe, nilai) {
  switch (tipe) {
    case "nik": {
      const s = toTrimmedString(nilai);
      if (s === "" || s.length === PANJANG_NIK) return "";
      return `NIK harus ${PANJANG_NIK} digit (baru ${s.length} digit).`;
    }

    case "npwp": {
      const s = toTrimmedString(nilai);
      if (s === "" || (s.length >= PANJANG_NPWP_MIN && s.length <= PANJANG_NPWP_MAKS)) return "";
      return `NPWP harus ${PANJANG_NPWP_MIN}-${PANJANG_NPWP_MAKS} digit (baru ${s.length} digit).`;
    }

    case "nop": {
      const s = toTrimmedString(nilai);
      if (s === "" || s.length === PANJANG_NOP) return "";
      return `NOP PBB harus ${PANJANG_NOP} digit (baru ${s.length} digit).`;
    }

    case "niknpwp": {
      const o = nilai && typeof nilai === "object" ? nilai : {};
      return [pesanFormat("nik", o.nik), pesanFormat("npwp", o.npwp)].filter(Boolean).join(" ");
    }

    case "telepon": {
      for (const r of Array.isArray(nilai) ? nilai : []) {
        const nomor = toTrimmedString(r?.nomor);
        const ket = toTrimmedString(r?.keterangan);
        const digit = nomor.replace(/\D/g, "").length;
        if (digit === 0 && ket) return `Nomor telepon "${ket}" belum diisi.`;
        if (digit > 0 && (digit < PANJANG_TELEPON_MIN || digit > PANJANG_TELEPON_MAKS)) {
          return `Nomor telepon ${nomor} harus ${PANJANG_TELEPON_MIN}-${PANJANG_TELEPON_MAKS} digit.`;
        }
      }
      return "";
    }

    case "rtrw": {
      const o = nilai && typeof nilai === "object" ? nilai : {};
      const rt = toTrimmedString(o.rt);
      const rw = toTrimmedString(o.rw);
      // Salah satu terisi berarti keduanya harus lengkap.
      if (rt === "" && rw === "") return "";
      if (rt === "" || rw === "") return "RT dan RW harus diisi keduanya.";
      if (rt.length !== PANJANG_RTRW || rw.length !== PANJANG_RTRW) {
        return `RT dan RW masing-masing ${PANJANG_RTRW} digit.`;
      }
      return "";
    }

    default:
      return "";
  }
}

/** Baris untuk tabel ternormalisasi rincian_tarif dari sebuah nilai linetariff. */
function barisRincianTarif(nilai) {
  if (!Array.isArray(nilai)) return [];
  return nilai
    .filter((r) => toTrimmedString(r.layanan) !== "" || r.harga_min !== null || r.harga_max !== null)
    .map((r, i) => ({
      layanan: r.layanan || "",
      jenis: r.jenis || "",
      hargaMin: r.harga_min,
      hargaMax: r.harga_max,
      urutan: i,
    }));
}

module.exports = {
  TIPE,
  BERTIPE_OPSI,
  toNumberOrNull,
  toTrimmedString,
  nilaiKosong,
  normalizeNilai,
  nilaiTerisi,
  pesanFormat,
  barisRincianTarif,
  PANJANG_NIK,
  PANJANG_NPWP_MIN,
  PANJANG_NPWP_MAKS,
  PANJANG_NOP,
  PANJANG_RTRW,
};
