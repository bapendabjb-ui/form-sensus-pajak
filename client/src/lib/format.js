/* Helper format & konstanta tampilan (Bahasa Indonesia). */

export const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export const TYPES = [
  { key: "text", label: "Teks singkat" },
  { key: "paragraph", label: "Paragraf" },
  { key: "number", label: "Angka" },
  { key: "range", label: "Rentang harga" },
  { key: "date", label: "Tanggal" },
  { key: "dropdown", label: "Dropdown" },
  { key: "radio", label: "Pilihan" },
  { key: "checkbox", label: "Kotak centang" },
  { key: "linetariff", label: "Rincian tarif" },
  { key: "foto", label: "Foto" },
  { key: "wilayah", label: "Kecamatan & Kelurahan" },
  { key: "rtrw", label: "RT & RW" },
  { key: "lokasi", label: "Lokasi (GPS / peta)" },
  { key: "nik", label: "NIK" },
  { key: "npwp", label: "NPWP" },
  { key: "niknpwp", label: "NIK / NPWP" },
  { key: "telepon", label: "Nomor telepon" },
  { key: "nop", label: "NOP PBB" },
];

export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

export const CHOICE_TYPES = ["dropdown", "radio", "checkbox"];
export const HAS_OPTIONS = ["dropdown", "radio", "checkbox", "linetariff"];

export const defaultOptions = (tipe) =>
  tipe === "linetariff" ? ["Satuan", "Paket"] : CHOICE_TYPES.includes(tipe) ? ["Opsi 1", "Opsi 2"] : [];

/* ---------- identitas (NIK, NPWP, RT & RW) ---------- */

/**
 * Panjang digit yang sah - harus sama dengan server/src/answers.js.
 *   NIK  : 16 digit (KTP-el)
 *   NPWP : 15 digit (format lama), 16 (NPWP baru = NIK), 17 (NITKU)
 *   NOP  : 18 digit (NOP PBB)
 *   RT/RW: masing-masing tepat 3 digit
 */
export const PANJANG_NIK = 16;
export const PANJANG_NPWP_MIN = 15;
export const PANJANG_NPWP_MAKS = 17;
export const PANJANG_NOP = 18;
export const PANJANG_RTRW = 3;

/** Nomor telepon: 8-15 digit, maksimal 10 nomor per pertanyaan - sama dengan server. */
export const PANJANG_TELEPON_MIN = 8;
export const PANJANG_TELEPON_MAKS = 15;
export const TELEPON_MAKS_BARIS = 10;

/** Angka saja, tanda + di depan dipertahankan: "+62 812-3456" -> "+628123456". */
export function nomorTelepon(raw) {
  const s = String(raw ?? "").trim();
  const d = s.replace(/\D/g, "").slice(0, PANJANG_TELEPON_MAKS);
  return s.startsWith("+") && d ? `+${d}` : d;
}

/** [{ keterangan, nomor }] -> "Pemilik - 081234567890" (+ jumlah nomor lain bila ringkas). */
export function formatTelepon(v, { ringkas = false } = {}) {
  const baris = (Array.isArray(v) ? v : []).filter((r) => r && r.nomor);
  const teks = baris.map((r) => (r.keterangan ? `${r.keterangan} - ${r.nomor}` : r.nomor));
  if (ringkas && teks.length > 1) return `${teks[0]} +${teks.length - 1}`;
  return teks.join(", ");
}

/** Sisakan hanya angka, lalu potong pada `maks` digit. */
export const hanyaDigit = (raw, maks) => String(raw ?? "").replace(/\D/g, "").slice(0, maks);

/** "091234567890123" -> "09.123.456.7-890.123" (hanya untuk NPWP 15 digit). */
export function formatNpwp(digit) {
  const d = hanyaDigit(digit, PANJANG_NPWP_MAKS);
  if (d.length !== 15) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12)}`;
}

/** "3172010101010001" -> "3172 0101 0101 0001" (kelompok 4 digit, mudah dibaca). */
export function formatNik(digit) {
  const d = hanyaDigit(digit, PANJANG_NIK);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * NOP PBB -> "63.72.010.001.002-0123.0".
 *
 * Kelompoknya mengikuti susunan resmi NOP: provinsi 2, kabupaten/kota 2,
 * kecamatan 3, kelurahan 3, blok 3, nomor urut objek 4, kode khusus 1.
 * Dipakai juga sambil diketik, jadi potongan yang belum penuh ikut dikelompokkan.
 */
export function formatNop(digit) {
  const d = hanyaDigit(digit, PANJANG_NOP);
  const batas = [2, 4, 7, 10, 13, 17];
  const pemisah = { 2: ".", 4: ".", 7: ".", 10: ".", 13: "-", 17: "." };
  let hasil = "";
  for (let i = 0; i < d.length; i++) {
    if (batas.includes(i)) hasil += pemisah[i];
    hasil += d[i];
  }
  return hasil;
}

/** { nik, npwp } -> "NIK 3172 0101 0101 0001 / NPWP 09.123.456.7-890.123". */
export function formatNikNpwp(v) {
  if (!v || typeof v !== "object") return "";
  return [v.nik && `NIK ${formatNik(v.nik)}`, v.npwp && `NPWP ${formatNpwp(v.npwp)}`].filter(Boolean).join(" / ");
}

/** { rt, rw } -> "RT 003 / RW 005". */
export function formatRtRw(v) {
  if (!v || typeof v !== "object") return "";
  const rt = String(v.rt || "").trim();
  const rw = String(v.rw || "").trim();
  if (rt && rw) return `RT ${rt} / RW ${rw}`;
  if (rt) return `RT ${rt}`;
  return rw ? `RW ${rw}` : "";
}

/* ---------- tanggal ---------- */

const pad = (n) => String(n).padStart(2, "0");

export const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export const todayISO = () => {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
};

/** "2026-03-07" -> "7 Maret 2026" */
export function formatDateID(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Tanggal ISO lengkap dari server -> "7 Maret 2026" */
export function formatTimestamp(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- angka & uang ---------- */

/** Sisakan hanya digit (dan satu koma desimal) dari input pengguna. */
export function digitsOnly(raw) {
  const s = String(raw ?? "").replace(/[^\d,]/g, "");
  const [utuh, ...sisa] = s.split(",");
  return sisa.length ? `${utuh},${sisa.join("").slice(0, 2)}` : utuh;
}

/** "100000" -> "100.000" (pemisah ribuan Indonesia, koma sebagai desimal). */
export function groupDigits(raw) {
  const s = digitsOnly(raw);
  if (s === "") return "";
  const [utuh, desimal] = s.split(",");
  const berkelompok = utuh.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return desimal === undefined ? berkelompok : `${berkelompok},${desimal}`;
}

/** Nilai tampilan ("1.250.000") -> string angka untuk disimpan ("1250000"). */
export function unformatNumber(display) {
  const s = digitsOnly(display);
  if (s === "") return "";
  return s.replace(",", ".");
}

/** Angka apa pun -> "1.250.000" untuk teks/ringkasan. */
export function groupNum(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export const rupiah = (v) => {
  const s = groupNum(v);
  return s === "" ? "" : `Rp ${s}`;
};

/** { min, max } -> "Rp 10.000 – Rp 25.000" */
export function formatRange(r) {
  if (!r) return "";
  const a = rupiah(r.min);
  const b = rupiah(r.max);
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}

/** Satu baris rincian tarif -> harga tunggal atau rentang. */
export function formatHargaBaris(row) {
  const a = rupiah(row?.harga_min);
  const b = rupiah(row?.harga_max);
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}

/* ---------- lokasi (GPS) ---------- */

/**
 * { lat, lon, akurasi } -> "-3.452123, 114.841235 (±9 m)".
 * `ringkas` memakai 5 desimal (~1 m) untuk daftar; `tanpaAkurasi` menyembunyikan
 * lencana akurasinya karena ditampilkan terpisah.
 */
export function formatLokasi(v, { ringkas = false, tanpaAkurasi = false } = {}) {
  if (!v || typeof v !== "object" || v.lat === null || v.lat === undefined) return "";
  const desimal = ringkas ? 5 : 6;
  const titik = `${Number(v.lat).toFixed(desimal)}, ${Number(v.lon).toFixed(desimal)}`;
  if (tanpaAkurasi || v.akurasi === null || v.akurasi === undefined) return titik;
  return `${titik} (±${Math.round(v.akurasi)} m)`;
}

/**
 * Derajat desimal -> derajat/menit/detik, mis. -3.439208 lintang
 * menjadi { angka: "3°26'21.1\"", arah: "LS" }.
 *
 * Dipakai berdampingan dengan angka desimal: desimal untuk disalin ke aplikasi
 * lain, DMS karena itu bentuk yang lazim dibaca di peta cetak dan dokumen.
 */
export function keDMS(nilai, sumbu) {
  if (nilai === null || nilai === undefined || !Number.isFinite(Number(nilai))) return null;
  const n = Number(nilai);
  const arah = sumbu === "lat" ? (n < 0 ? "LS" : "LU") : n < 0 ? "BB" : "BT";

  // Dibulatkan dulu ke sepersepuluh detik, BARU dipecah jadi derajat/menit/detik.
  // Kalau dibulatkan belakangan, 59,98 detik menjadi "60,0" dan keluar hasil
  // mustahil seperti 106°48'60,0" — seharusnya 106°49'00,0".
  const sepersepuluhDetik = Math.round(Math.abs(n) * 36000);
  const derajat = Math.floor(sepersepuluhDetik / 36000);
  const menit = Math.floor(sepersepuluhDetik / 600) % 60;
  const detik = ((sepersepuluhDetik % 600) / 10).toFixed(1);

  return { angka: `${derajat}°${String(menit).padStart(2, "0")}'${detik.padStart(4, "0")}\"`, arah };
}

/** Tautan ke aplikasi peta untuk sebuah titik. */
export function urlPeta(v) {
  if (!v || typeof v !== "object" || v.lat === null || v.lat === undefined) return "";
  return `https://www.google.com/maps?q=${v.lat},${v.lon}`;
}
