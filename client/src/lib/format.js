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
];

export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

export const CHOICE_TYPES = ["dropdown", "radio", "checkbox"];
export const HAS_OPTIONS = ["dropdown", "radio", "checkbox", "linetariff"];

export const defaultOptions = (tipe) =>
  tipe === "linetariff" ? ["Satuan", "Paket"] : CHOICE_TYPES.includes(tipe) ? ["Opsi 1", "Opsi 2"] : [];

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
