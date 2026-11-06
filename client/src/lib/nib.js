/*
 * Bidang tanah BPN (NIB) pada formulir PBB: bentuk jawaban, tampilan, dan
 * pembacaan NIB yang diketik dari sertifikat. Disamakan dengan
 * server/src/answers.js (normalNib) dan server/src/format.js (nibLengkap).
 *
 * Jawaban: { bidang: [{ kode, nib, sumber, diPeta, tipeHak, luas, kelurahan, kecamatan }], status }
 *   kode / nib : kode wilayah BPN 8 digit + nomor bidang 5 digit (NIB lengkap 13 digit)
 *   sumber     : "peta" (diketuk di peta) | "sertifikat" (diketik dari sertifikat)
 *   status     : alasan tanpa NIB (STATUS_TANAH), hanya bila belum ada bidang
 */

/** Bidang paling banyak per pertanyaan - sama dengan server NIB_MAKS_BIDANG. */
export const NIB_MAKS_BIDANG = 20;

/** Alasan bila objek tidak punya NIB - sama dengan server STATUS_TANAH. */
export const STATUS_TANAH = {
  belum_sertifikat: "Tanah belum bersertifikat",
  belum_diketahui: "Bersertifikat, NIB belum diketahui",
};

/** Kunci bidang di seluruh aplikasi: "17117402|03612". */
export const kunciBidang = (kode, nib) => `${kode || ""}|${nib || ""}`;

/** "17117402" + "03612" -> "17.11.74.02.03612"; bentuk lain digabung titik. */
export function nibLengkap(kode, nib) {
  if (/^\d{8}$/.test(kode || "") && /^\d{5}$/.test(nib || "")) {
    return `${kode.replace(/(\d{2})(?=\d)/g, "$1.")}.${nib}`;
  }
  return kode && nib ? `${kode}.${nib}` : nib || "";
}

/** Nilai kosong. */
export const nibKosong = () => ({ bidang: [], status: "" });

const teks = (v) => (v === null || v === undefined ? "" : String(v));

/** Jawaban apa pun -> bentuk yang rapi (bidang tanpa NIB dibuang, kembar sekali). */
export function nibDari(v) {
  const o = v && typeof v === "object" ? v : {};
  const dilihat = new Set();
  const bidang = [];
  for (const b of Array.isArray(o.bidang) ? o.bidang : []) {
    if (!b || !b.nib) continue;
    const k = kunciBidang(b.kode, b.nib);
    if (dilihat.has(k)) continue;
    dilihat.add(k);
    const luas = b.luas === null || b.luas === undefined || b.luas === "" ? null : Number(b.luas);
    bidang.push({
      kode: teks(b.kode),
      nib: teks(b.nib),
      sumber: b.sumber === "sertifikat" ? "sertifikat" : "peta",
      diPeta: b.diPeta !== false,
      tipeHak: teks(b.tipeHak),
      luas: Number.isFinite(luas) ? luas : null,
      kelurahan: teks(b.kelurahan),
      kecamatan: teks(b.kecamatan),
    });
  }
  return { bidang, status: bidang.length === 0 && STATUS_TANAH[o.status] ? o.status : "" };
}

/** Bidang dari hasil server (persil di titik / cari NIB, server/src/persil.js bentukInfo). */
export const bidangDariPersil = (p, sumber = "peta") => ({
  kode: p.kodeWilayah || "",
  nib: p.nib,
  sumber,
  diPeta: true,
  tipeHak: p.tipeHak || "",
  luas: Number.isFinite(p.luasPeta) ? p.luasPeta : null,
  kelurahan: p.kelurahan || "",
  kecamatan: p.kecamatan || "",
});

/** Jumlah luas peta bidang-bidang yang luasnya diketahui, atau null. */
export function totalLuas(bidang) {
  const ada = bidang.filter((b) => Number.isFinite(b.luas));
  if (!ada.length) return null;
  return Math.round(ada.reduce((n, b) => n + b.luas, 0) * 100) / 100;
}

/** Ringkasan untuk daftar data: "NIB 17.11.74.02.03612 +1", atau alasannya. */
export function formatNib(v) {
  const { bidang, status } = nibDari(v);
  if (!bidang.length) return STATUS_TANAH[status] || "";
  const lain = bidang.length - 1;
  return `NIB ${nibLengkap(bidang[0].kode, bidang[0].nib)}${lain > 0 ? ` +${lain} bidang` : ""}`;
}

/**
 * NIB yang diketik dari sertifikat -> { kode, nib } bila lengkap 13 digit
 * (kode wilayah 8 + nomor bidang 5), atau null. Titik dan spasi diabaikan.
 */
export function bacaNibLengkap(ketikan) {
  const d = String(ketikan || "").replace(/\D/g, "");
  return d.length === 13 ? { kode: d.slice(0, 8), nib: d.slice(8) } : null;
}

/** Deret digit NIB berkelompok sambil diketik: "1711740203612" -> "17.11.74.02.03612". */
export function formatKetikanNib(ketikan) {
  const d = String(ketikan || "").replace(/\D/g, "").slice(0, 13);
  const bagian = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8)].filter(Boolean);
  return bagian.join(".");
}
