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

/* ---------- titik di dalam bidang (koordinat otomatis) ---------- */

/** Luas bertanda satu cincin [[lon, lat], ...] (rumus tali sepatu, satuan derajat²). */
function luasCincin(c) {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j][0] + c[i][0]) * (c[j][1] - c[i][1]);
  return a / 2;
}

/** Titik di dalam cincin? (sinar mendatar) */
function dalamCincin([x, y], c) {
  let dalam = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i];
    const [xj, yj] = c[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

/** Di dalam poligon (cincin luar, di luar semua lubangnya)? */
const dalamPoligon = (t, p) => dalamCincin(t, p[0]) && !p.slice(1).some((lubang) => dalamCincin(t, lubang));

/** Titik berat cincin luar; rata-rata sudutnya bila luasnya nol. */
function titikBerat(c) {
  const a = luasCincin(c);
  if (Math.abs(a) < 1e-14) return [c.reduce((n, v) => n + v[0], 0) / c.length, c.reduce((n, v) => n + v[1], 0) / c.length];
  let x = 0;
  let y = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const f = c[j][0] * c[i][1] - c[i][0] * c[j][1];
    x += (c[j][0] + c[i][0]) * f;
    y += (c[j][1] + c[i][1]) * f;
  }
  // luasCincin memakai arah sebaliknya dari rumus titik berat: tanda dibalik.
  return [-x / (6 * a), -y / (6 * a)];
}

const bulat7 = (n) => Math.round(n * 1e7) / 1e7;

/**
 * Satu titik yang pasti di dalam bidang (GeoJSON Polygon / MultiPolygon, [lon, lat]) -
 * untuk koordinat objek yang diisi otomatis dari bidang NIB. Titik berat poligon
 * terbesar bila jatuh di dalamnya; bila tidak (bidang berbentuk L / U, berlubang),
 * tengah potongan mendatar terlebar yang melewati titik berat itu.
 *
 * @returns {{ lat: number, lon: number } | null}
 */
export function titikDalamBidang(geometri) {
  const g = geometri && typeof geometri === "object" ? geometri : null;
  const daftar = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  let p = null;
  let luasMaks = -1;
  for (const calon of daftar || []) {
    const luar = Array.isArray(calon) ? calon[0] : null;
    if (!Array.isArray(luar) || luar.length < 3) continue;
    const a = Math.abs(luasCincin(luar));
    if (a > luasMaks) {
      luasMaks = a;
      p = calon;
    }
  }
  if (!p) return null;
  // Dihitung relatif terhadap sudut pertamanya: koordinat sebesar 114,8° untuk bidang selebar
  // 0,0002° kehilangan ketelitian di rumus titik berat.
  const [ox, oy] = p[0][0];
  const hasil = (x, y) => ({ lat: bulat7(y + oy), lon: bulat7(x + ox) });
  p = p.map((cincin) => cincin.map(([x, y]) => [x - ox, y - oy]));
  const c = titikBerat(p[0]);
  if (dalamPoligon(c, p)) return hasil(c[0], c[1]);

  // Potongan mendatar pada lintang titik berat: pasangan perpotongan = ruas di dalam bidang.
  const y = c[1];
  const xs = [];
  for (const cincin of p) {
    for (let i = 0, j = cincin.length - 1; i < cincin.length; j = i++) {
      const [x1, y1] = cincin[j];
      const [x2, y2] = cincin[i];
      if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  xs.sort((a, b) => a - b);
  let tengah = null;
  let lebar = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > lebar) {
      lebar = xs[i + 1] - xs[i];
      tengah = (xs[i] + xs[i + 1]) / 2;
    }
  }
  if (tengah === null) return hasil(p[0][0][0], p[0][0][1]);
  return hasil(tengah, y);
}

/** Deret digit NIB berkelompok sambil diketik: "1711740203612" -> "17.11.74.02.03612". */
export function formatKetikanNib(ketikan) {
  const d = String(ketikan || "").replace(/\D/g, "").slice(0, 13);
  const bagian = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8)].filter(Boolean);
  return bagian.join(".");
}
