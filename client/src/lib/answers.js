/**
 * Jembatan antara state form di UI dan bentuk JSON yang dipakai API.
 *
 * Di UI semua nominal disimpan sebagai string digit ("100000") supaya bisa
 * ditampilkan berformat ribuan tanpa kehilangan apa yang sedang diketik.
 * Saat dikirim ke server, string itu diubah menjadi angka (atau null).
 *
 * Nilai foto di UI berupa array item. Item yang sudah terunggah punya `id`;
 * item yang masih diunggah / gagal punya `status` ("unggah" | "gagal") dan
 * tidak ikut dikirim.
 */

import {
  hanyaDigit,
  unformatNumber,
  PANJANG_NIK,
  PANJANG_NPWP_MIN,
  PANJANG_NPWP_MAKS,
  PANJANG_NOP,
  PANJANG_RTRW,
} from "./format.js";

const asString = (v) => (v === null || v === undefined ? "" : String(v));

const toNumberOrNull = (v) => {
  const s = unformatNumber(asString(v));
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const numToInput = (v) => (v === null || v === undefined || v === "" ? "" : String(v));

const fotoTerunggah = (v) => (Array.isArray(v) ? v.filter((f) => f && f.id) : []);

/** Nilai awal kosong untuk sebuah tipe pertanyaan. */
export function emptyValue(tipe) {
  switch (tipe) {
    case "checkbox":
    case "linetariff":
    case "foto":
      return [];
    case "range":
      return { min: "", max: "" };
    case "wilayah":
      return { kecamatan: "", kelurahan: "" };
    case "rtrw":
      return { rt: "", rw: "" };
    case "lokasi":
      return { lat: null, lon: null, akurasi: null, ketinggian: null, waktu: "" };
    default:
      return "";
  }
}

/** Bentuk nilai lokasi yang konsisten; apa pun yang bukan angka jadi null. */
const lokasiDari = (v) => {
  const o = v && typeof v === "object" ? v : {};
  const angka = (x) => {
    if (x === null || x === undefined || x === "") return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  return {
    lat: angka(o.lat),
    lon: angka(o.lon),
    akurasi: angka(o.akurasi),
    ketinggian: angka(o.ketinggian),
    waktu: asString(o.waktu),
  };
};

const wilayahDari = (v) => {
  const o = v && typeof v === "object" ? v : {};
  return { kecamatan: asString(o.kecamatan).trim(), kelurahan: asString(o.kelurahan).trim() };
};

/** { rt, rw } dengan angka saja, maksimal 3 digit masing-masing. */
const rtRwDari = (v) => {
  const o = v && typeof v === "object" ? v : {};
  return { rt: hanyaDigit(o.rt, PANJANG_RTRW), rw: hanyaDigit(o.rw, PANJANG_RTRW) };
};

/** Lengkapi nol di depan supaya RT/RW yang terisi selalu 3 digit ("7" -> "007"). */
const rtRwLengkap = (v) => {
  const o = rtRwDari(v);
  const isi = (d) => (d === "" ? "" : d.padStart(PANJANG_RTRW, "0"));
  return { rt: isi(o.rt), rw: isi(o.rw) };
};

/** JSON dari server -> nilai untuk state UI. */
export function fromApi(tipe, nilai) {
  if (nilai === null || nilai === undefined) return emptyValue(tipe);

  switch (tipe) {
    case "checkbox":
      return Array.isArray(nilai) ? nilai.map(asString) : [];

    case "foto":
      return fotoTerunggah(nilai).map((f) => ({ id: Number(f.id), nama: asString(f.nama) }));

    case "wilayah":
      return wilayahDari(nilai);

    case "rtrw":
      return rtRwDari(nilai);

    case "nik":
      return hanyaDigit(nilai, PANJANG_NIK);

    case "npwp":
      return hanyaDigit(nilai, PANJANG_NPWP_MAKS);

    case "nop":
      return hanyaDigit(nilai, PANJANG_NOP);

    case "lokasi":
      return lokasiDari(nilai);

    case "range": {
      const o = typeof nilai === "object" ? nilai : {};
      return { min: numToInput(o.min), max: numToInput(o.max) };
    }

    case "linetariff":
      return (Array.isArray(nilai) ? nilai : []).map((r) => ({
        layanan: asString(r?.layanan),
        jenis: asString(r?.jenis),
        harga_min: numToInput(r?.harga_min),
        harga_max: numToInput(r?.harga_max),
        // Baris yang punya harga_max tersimpan berarti memakai mode rentang.
        isRange: r?.harga_max !== null && r?.harga_max !== undefined && r?.harga_max !== "",
      }));

    default:
      return asString(nilai);
  }
}

/** Nilai state UI -> JSON untuk dikirim ke server. */
export function toApi(tipe, v) {
  switch (tipe) {
    case "checkbox":
      return Array.isArray(v) ? v.map(asString) : [];

    case "foto":
      return fotoTerunggah(v).map((f) => ({ id: f.id, nama: asString(f.nama) }));

    case "wilayah":
      return wilayahDari(v);

    case "rtrw":
      return rtRwLengkap(v);

    case "nik":
      return hanyaDigit(v, PANJANG_NIK);

    case "npwp":
      return hanyaDigit(v, PANJANG_NPWP_MAKS);

    case "nop":
      return hanyaDigit(v, PANJANG_NOP);

    case "lokasi":
      return lokasiDari(v);

    case "number": {
      const n = toNumberOrNull(v);
      return n === null ? "" : String(n);
    }

    case "range": {
      const o = v && typeof v === "object" ? v : {};
      return { min: toNumberOrNull(o.min), max: toNumberOrNull(o.max) };
    }

    case "linetariff":
      return (Array.isArray(v) ? v : []).map((r) => ({
        layanan: asString(r?.layanan).trim(),
        jenis: asString(r?.jenis),
        harga_min: toNumberOrNull(r?.harga_min),
        // Mode harga tunggal: harga_max selalu null.
        harga_max: r?.isRange ? toNumberOrNull(r?.harga_max) : null,
      }));

    default:
      return asString(v).trim();
  }
}

/** Validasi "wajib diisi" di sisi klien (server tetap memvalidasi ulang). */
export function isFilled(tipe, v) {
  switch (tipe) {
    case "checkbox":
      return Array.isArray(v) && v.length > 0;
    case "foto":
      return fotoTerunggah(v).length > 0;
    case "wilayah": {
      const w = wilayahDari(v);
      return w.kecamatan !== "" && w.kelurahan !== "";
    }
    case "lokasi": {
      const l = lokasiDari(v);
      return l.lat !== null && l.lon !== null;
    }
    case "rtrw": {
      const r = rtRwDari(v);
      return r.rt !== "" && r.rw !== "";
    }
    case "range":
      return !!v && asString(v.min).trim() !== "" && asString(v.max).trim() !== "";
    case "linetariff":
      return Array.isArray(v) && v.some((r) => asString(r?.layanan).trim() !== "");
    default:
      return asString(v).trim() !== "";
  }
}

/** Bangun payload { [pertanyaanId]: nilai } dari seluruh pertanyaan formulir. */
export function buildPayload(pertanyaan, answers) {
  const out = {};
  for (const q of pertanyaan) {
    out[q.id] = toApi(q.tipe, answers[q.id] !== undefined ? answers[q.id] : emptyValue(q.tipe));
  }
  return out;
}

/**
 * Periksa panjang digit kolom identitas (NIK / NPWP / NOP / RT & RW).
 *
 * Hanya untuk nilai yang sudah mulai diisi — kolom kosong diurus validasi
 * "wajib diisi" supaya pertanyaan opsional tidak ikut ditolak.
 * Aturannya disamakan dengan pesanFormat() di server/src/answers.js.
 *
 * @returns {string} pesan galat, atau "" bila tidak ada masalah
 */
export function pesanFormat(tipe, v) {
  switch (tipe) {
    case "nik": {
      const d = hanyaDigit(v, PANJANG_NIK);
      if (d === "" || d.length === PANJANG_NIK) return "";
      return `NIK harus ${PANJANG_NIK} digit (baru ${d.length} digit).`;
    }

    case "npwp": {
      const d = hanyaDigit(v, PANJANG_NPWP_MAKS);
      if (d === "" || (d.length >= PANJANG_NPWP_MIN && d.length <= PANJANG_NPWP_MAKS)) return "";
      return `NPWP harus ${PANJANG_NPWP_MIN}-${PANJANG_NPWP_MAKS} digit (baru ${d.length} digit).`;
    }

    case "nop": {
      const d = hanyaDigit(v, PANJANG_NOP);
      if (d === "" || d.length === PANJANG_NOP) return "";
      return `NOP PBB harus ${PANJANG_NOP} digit (baru ${d.length} digit).`;
    }

    case "rtrw": {
      const r = rtRwDari(v);
      // Salah satu terisi berarti keduanya harus lengkap.
      if (r.rt === "" && r.rw === "") return "";
      if (r.rt === "" || r.rw === "") return "RT dan RW harus diisi keduanya.";
      return "";
    }

    default:
      return "";
  }
}

/**
 * Validasi sebelum kirim: kolom wajib yang kosong dan kolom identitas yang
 * belum lengkap digitnya -> { [pertanyaanId]: pesan }.
 * Server tetap memvalidasi ulang.
 */
export function validateRequired(pertanyaan, answers) {
  const errors = {};
  const salahSatu = idSalahSatuWajib(pertanyaan);
  let salahSatuTerisi = false;
  for (const q of pertanyaan) {
    const v = answers[q.id] !== undefined ? answers[q.id] : emptyValue(q.tipe);
    if (salahSatu.has(q.id) && isFilled(q.tipe, v)) salahSatuTerisi = true;
    if (q.wajib && !salahSatu.has(q.id) && !isFilled(q.tipe, v)) {
      errors[q.id] = q.tipe === "foto" ? "Tambahkan minimal satu foto." : "Kolom ini wajib diisi.";
      continue;
    }
    const galat = pesanFormat(q.tipe, v);
    if (galat) errors[q.id] = galat;
  }
  if (salahSatu.size && !salahSatuTerisi) {
    for (const id of salahSatu) errors[id] = PESAN_SALAH_SATU;
  }
  return errors;
}

/**
 * NIK & NPWP yang sama-sama ditandai wajib cukup diisi salah satunya:
 * badan usaha tidak punya NIK, perorangan belum tentu punya NPWP.
 * Aturannya disamakan dengan idSalahSatuWajib() di server/src/entri.js.
 *
 * @returns {Set<number>} id pertanyaan "salah satu wajib" (kosong bila tidak berlaku)
 */
export function idSalahSatuWajib(pertanyaan) {
  const q = pertanyaan.filter((x) => x.wajib && (x.tipe === "nik" || x.tipe === "npwp"));
  const berlaku = q.some((x) => x.tipe === "nik") && q.some((x) => x.tipe === "npwp");
  return new Set(berlaku ? q.map((x) => x.id) : []);
}

export const PESAN_SALAH_SATU = "Isi NIK atau NPWP, cukup salah satu.";

/** Hitung foto yang masih diunggah / gagal diunggah di seluruh jawaban. */
export function statusFoto(pertanyaan, answers) {
  let unggah = 0;
  let gagal = 0;
  for (const q of pertanyaan) {
    if (q.tipe !== "foto" || !Array.isArray(answers[q.id])) continue;
    for (const f of answers[q.id]) {
      if (f?.status === "unggah") unggah++;
      if (f?.status === "gagal") gagal++;
    }
  }
  return { unggah, gagal };
}
