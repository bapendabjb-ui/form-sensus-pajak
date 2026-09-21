/**
 * Klien REST untuk API Sensus Pajak.
 * Token admin disimpan di localStorage agar login tetap bertahan saat reload.
 */

const BASE = "/api";
const TOKEN_KEY = "sensus_pajak_token";

let token = "";
try {
  token = localStorage.getItem(TOKEN_KEY) || "";
} catch {
  token = "";
}

const pendengar = new Set();

/** Daftarkan callback yang dipanggil saat status login berubah. */
export function onAuthChange(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

function umumkan() {
  for (const fn of pendengar) fn(Boolean(token));
}

export const getToken = () => token;
export const isLoggedIn = () => Boolean(token);

export function setToken(nilai) {
  token = nilai || "";
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage tidak tersedia (mode privat) - token tetap berlaku di sesi ini */
  }
  umumkan();
}

export const clearToken = () => setToken("");

/** Error API dengan status & detail dari server. */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }

  if (res.status === 401 && auth) clearToken();

  if (res.status === 204) return null;

  const tipe = res.headers.get("content-type") || "";
  const data = tipe.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const pesan = (data && data.error) || `Permintaan gagal (${res.status}).`;
    throw new ApiError(res.status, pesan, data);
  }
  return data;
}

/* ---------- auth ---------- */

export async function login(username, password) {
  const data = await request("/auth/login", { method: "POST", body: { username, password } });
  setToken(data.token);
  return data;
}

export const gantiPassword = (passwordLama, passwordBaru) =>
  request("/auth/password", { method: "PUT", body: { passwordLama, passwordBaru }, auth: true });

/** Verifikasi token yang tersimpan; token kedaluwarsa otomatis dibuang. */
export async function cekSesi() {
  if (!token) return false;
  try {
    await request("/auth/me", { auth: true });
    return true;
  } catch {
    clearToken();
    return false;
  }
}

/* ---------- petugas ---------- */

export const listPetugas = () => request("/petugas");
export const createPetugas = (nama, nip) => request("/petugas", { method: "POST", body: { nama, nip }, auth: true });
export const updatePetugas = (id, nama, nip) =>
  request(`/petugas/${id}`, { method: "PUT", body: { nama, nip }, auth: true });
export const deletePetugas = (id) => request(`/petugas/${id}`, { method: "DELETE", auth: true });

/** Unduh daftar petugas. jenis: "xlsx" | "csv". Khusus admin. */
export const unduhPetugas = (jenis = "xlsx") =>
  unduhBerkas(`/petugas/export${jenis === "xlsx" ? "/xlsx" : ""}`, `daftar-petugas.${jenis === "xlsx" ? "xlsx" : "csv"}`);

/**
 * Impor daftar petugas dari .xlsx / .csv. Khusus admin.
 * Mengembalikan { dibaca, ditambahkan, dilewati[], ditolak[] }.
 */
export async function imporPetugas(file) {
  const data = new FormData();
  data.append("berkas", file, file.name || "petugas.xlsx");

  let res;
  try {
    res = await fetch(`${BASE}/petugas/impor`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: data,
    });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }

  if (res.status === 401) {
    clearToken();
    throw new ApiError(401, "Sesi admin sudah berakhir. Silakan login kembali.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || `Impor gagal (${res.status}).`, body);
  return body;
}

/* ---------- formulir ---------- */

export const listFormulir = () => request("/formulir");
export const getFormulir = (id) => request(`/formulir/${id}`);
export const createFormulir = (payload) => request("/formulir", { method: "POST", body: payload, auth: true });
export const updateFormulir = (id, payload) =>
  request(`/formulir/${id}`, { method: "PUT", body: payload, auth: true });
/** Susun ulang bank formulir. `ids` = daftar id sesuai urutan tampil baru. */
export const urutkanFormulir = (ids) =>
  request("/formulir/urutan", { method: "PUT", body: { ids }, auth: true });
export const deleteFormulir = (id, force = false) =>
  request(`/formulir/${id}${force ? "?force=true" : ""}`, { method: "DELETE", auth: true });

/* ---------- kertas kerja ---------- */

export const listKertasKerja = () => request("/kertas-kerja");
export const nomorBerikutnya = () => request("/kertas-kerja/nomor-berikutnya");
export const getKertasKerja = (id) => request(`/kertas-kerja/${id}`);
export const createKertasKerja = (petugasIds) =>
  request("/kertas-kerja", { method: "POST", body: { petugasIds } });
export const updateTimKertasKerja = (id, petugasIds) =>
  request(`/kertas-kerja/${id}/petugas`, { method: "PUT", body: { petugasIds }, auth: true });
export const setStatusKertasKerja = (id, status) =>
  request(`/kertas-kerja/${id}/status`, { method: "PUT", body: { status } });
export const deleteKertasKerja = (id) => request(`/kertas-kerja/${id}`, { method: "DELETE", auth: true });

/* ---------- entri: satu data yang diisi lewat formulir ---------- */

export const getEntri = (id) => request(`/entri/${id}`);
/**
 * `dariEpbb` = id pertanyaan yang isinya masih asli dari data EPBB (penanda "Data EPBB").
 * `berkas`   = { berkasLengkap, catatanBerkas } - penanda berkas tidak lengkap.
 */
export const createEntri = (kertasKerjaId, formulirId, jawaban, dariEpbb = [], berkas = {}, rekamKoordinat = null) =>
  request(`/kertas-kerja/${kertasKerjaId}/entri`, {
    method: "POST",
    body: { formulirId, jawaban, dariEpbb, ...berkas, rekamKoordinat },
  });
export const updateEntri = (id, jawaban, dariEpbb = [], berkas = {}, rekamKoordinat = null) =>
  request(`/entri/${id}`, { method: "PUT", body: { jawaban, dariEpbb, ...berkas, rekamKoordinat } });
export const deleteEntri = (id) => request(`/entri/${id}`, { method: "DELETE", auth: true });

/* ---------- foto ---------- */

export const fotoUrl = (id) => `${BASE}/foto/${id}`;

/** Unggah satu foto (multipart). Mengembalikan { id, nama, url, ukuran }. */
export async function uploadFoto(file) {
  const data = new FormData();
  data.append("berkas", file, file.name || "foto.jpg");

  let res;
  try {
    res = await fetch(`${BASE}/foto`, { method: "POST", body: data });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || `Unggah foto gagal (${res.status}).`, body);
  return body;
}

/**
 * Unduh berkas ekspor.
 *
 * Endpoint ekspor khusus admin, sehingga permintaannya harus membawa token.
 * Navigasi browser biasa (window.location.href) tidak bisa memasang header
 * Authorization, jadi berkasnya diambil lewat fetch lalu disimpan sebagai blob.
 *
 * Melempar ApiError; pemanggil menampilkan pesannya lewat toast.
 */
async function unduhBerkas(path, namaCadangan) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }

  if (res.status === 401) {
    clearToken();
    throw new ApiError(401, "Sesi admin sudah berakhir. Silakan login kembali.");
  }
  if (!res.ok) {
    // Galat dikirim sebagai JSON, bukan berkas.
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || `Unduhan gagal (${res.status}).`, data);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaDariHeader(res.headers.get("content-disposition")) || namaCadangan;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Beri browser waktu memulai penyimpanan sebelum blob dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Ambil nama berkas dari header Content-Disposition: attachment; filename="x.xlsx". */
function namaDariHeader(disposition) {
  const cocok = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition || "");
  return cocok ? decodeURIComponent(cocok[1].trim()) : "";
}

/** Unduh CSV satu kertas kerja. `formulirId` membatasi ke satu formulir. */
export const unduhCsv = (id, formulirId) =>
  unduhBerkas(`/kertas-kerja/${id}/export${formulirId ? `?formulir=${formulirId}` : ""}`, "kertas-kerja.csv");

/** Unduh Excel (.xlsx) satu kertas kerja. */
export const unduhExcel = (id, formulirId) =>
  unduhBerkas(
    `/kertas-kerja/${id}/export/xlsx${formulirId ? `?formulir=${formulirId}` : ""}`,
    "kertas-kerja.xlsx"
  );

/** Unduh seluruh data satu formulir dari semua kertas kerja. jenis: "xlsx" | "csv". */
export const unduhFormulir = (id, jenis = "xlsx") =>
  unduhBerkas(
    `/formulir/${id}/export${jenis === "xlsx" ? "/xlsx" : ""}`,
    `formulir.${jenis === "xlsx" ? "xlsx" : "csv"}`
  );

/* ---------- dashboard ---------- */

export const getStats = () => request("/dashboard/stats");

/* ---------- peta sensus ---------- */

/** Semua titik hasil sensus, satu titik per data. */
export const listPeta = () => request("/peta");

/* ---------- cek NOP ke EPBB ---------- */

/** Data objek pajak dari EPBB: { nop, namaWp, letakSp, letakOp, luasTanah, luasBangunan, belumBayar }. */
export const cekNop = (nop) => request(`/nop/${nop}`);

/* ---------- data wilayah (kecamatan & kelurahan) ---------- */

let wilayahCache = null;

/** Data wilayah jarang berubah, jadi cukup dimuat sekali per sesi. */
export function getWilayah() {
  if (!wilayahCache) {
    wilayahCache = request("/wilayah").catch((e) => {
      wilayahCache = null;
      throw e;
    });
  }
  return wilayahCache;
}

/* ---------- konfigurasi aplikasi (batas-batas dari server) ---------- */

let konfigurasiCache = null;

/**
 * Batas aplikasi (petugasMaks, fotoMaksPerPertanyaan, uploadMaksMb).
 * Server adalah sumber angkanya; cukup dimuat sekali per sesi.
 */
export function getKonfigurasi() {
  if (!konfigurasiCache) {
    konfigurasiCache = request("/konfigurasi").catch((e) => {
      konfigurasiCache = null;
      throw e;
    });
  }
  return konfigurasiCache;
}
