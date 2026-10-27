/**
 * Klien REST untuk API Sensus Pajak.
 *
 * Token login (admin atau petugas) disimpan di localStorage agar sesi bertahan
 * saat aplikasi ditutup: HP petugas diingat 30 hari sejak terakhir dipakai,
 * admin 12 jam. Token dikirim pada setiap permintaan - saat admin mewajibkan
 * login, semua API menolak permintaan tanpa sesi.
 */

const BASE = "/api";
const TOKEN_KEY = "sensus_pajak_token";
const PROFIL_KEY = "sensus_pajak_profil";

const bacaSimpanan = (kunci) => {
  try {
    return localStorage.getItem(kunci) || "";
  } catch {
    return "";
  }
};

const tulisSimpanan = (kunci, nilai) => {
  try {
    if (nilai) localStorage.setItem(kunci, nilai);
    else localStorage.removeItem(kunci);
  } catch {
    /* localStorage tidak tersedia (mode privat) - sesi tetap berlaku selama halaman terbuka */
  }
};

let token = bacaSimpanan(TOKEN_KEY);
/** { role, username, nama, petugasId? } dari server, supaya nama tetap tampil tanpa sinyal. */
let profil = null;
try {
  profil = JSON.parse(bacaSimpanan(PROFIL_KEY) || "null");
} catch {
  profil = null;
}

/** Peran dari isi token. Hanya untuk tampilan; keabsahannya tetap diperiksa server. */
function peranToken(t) {
  try {
    const isi = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return isi.role || "";
  } catch {
    return "";
  }
}

const pendengar = new Set();

/** Daftarkan callback yang dipanggil saat status login berubah; menerima getSesi(). */
export function onAuthChange(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

function umumkan() {
  const sesi = getSesi();
  for (const fn of pendengar) fn(sesi);
}

/**
 * Pemakai yang sedang masuk: { role: "admin" | "petugas" | "pejabat", username, nama, petugasId? },
 * atau null. Token admin dari sebelum ada login petugas belum punya profil
 * tersimpan; perannya dibaca dari token sampai cekSesi() melengkapinya.
 */
export function getSesi() {
  if (!token) return null;
  const role = (profil && profil.role) || peranToken(token) || "admin";
  return {
    role,
    username: profil?.username || "",
    nama: profil?.nama || (role === "admin" ? "Admin" : ""),
    petugasId: profil?.petugasId ?? null,
  };
}

export const getToken = () => token;
export const isLoggedIn = () => Boolean(token);

function simpanSesi(tokenBaru, profilBaru) {
  token = tokenBaru || "";
  profil = token ? profilBaru || null : null;
  tulisSimpanan(TOKEN_KEY, token);
  tulisSimpanan(PROFIL_KEY, profil ? JSON.stringify(profil) : "");
  umumkan();
}

/** Ganti token tanpa mengubah siapa yang masuk (perpanjangan sesi, ganti password). */
function gantiToken(baru) {
  if (!baru || !token) return;
  token = baru;
  tulisSimpanan(TOKEN_KEY, token);
}

export const clearToken = () => simpanSesi("", null);

/* ---- "perlu masuk": admin mewajibkan login, dan server menolak permintaan tanpa sesi ---- */

let perluMasuk = false;
const pendengarMasuk = new Set();

export const isPerluMasuk = () => perluMasuk;

/** Daftarkan callback yang dipanggil saat server meminta login. */
export function onPerluMasuk(fn) {
  pendengarMasuk.add(fn);
  return () => pendengarMasuk.delete(fn);
}

function tandaiPerluMasuk() {
  if (perluMasuk) return;
  perluMasuk = true;
  for (const fn of pendengarMasuk) fn(true);
}

/** Header Authorization, bila ada sesi. */
const kepalaToken = () => (token ? { Authorization: `Bearer ${token}` } : {});

/**
 * Pemeriksaan bersama untuk setiap jawaban server:
 *  - X-Token-Baru: server memperpanjang sesi petugas; simpan token penggantinya.
 *  - 401 untuk token yang terkirim = sesinya sudah tidak berlaku; buang.
 *  - 401 dengan perluMasuk = login diwajibkan; aplikasi menampilkan layar masuk.
 */
function periksaJawaban(res, data, tokenTerkirim) {
  gantiToken(res.headers.get("X-Token-Baru"));
  if (res.status !== 401) return;
  if (tokenTerkirim) clearToken();
  if (data && data.perluMasuk) tandaiPerluMasuk();
}

/** Error API dengan status & detail dari server. */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

/**
 * `tanpaToken`: hanya untuk login, supaya password yang salah (401) tidak
 * mengeluarkan sesi yang sedang berjalan. Opsi `auth` lama tidak lagi berpengaruh:
 * token selalu dikirim bila ada.
 */
async function request(path, { method = "GET", body, tanpaToken = false } = {}) {
  const headers = tanpaToken ? {} : kepalaToken();
  const tokenTerkirim = Boolean(headers.Authorization);
  if (body !== undefined) headers["Content-Type"] = "application/json";

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

  if (res.status === 204) {
    periksaJawaban(res, null, tokenTerkirim);
    return null;
  }

  const tipe = res.headers.get("content-type") || "";
  const data = tipe.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();

  periksaJawaban(res, data, tokenTerkirim);

  if (!res.ok) {
    const pesan = (data && data.error) || `Permintaan gagal (${res.status}).`;
    throw new ApiError(res.status, pesan, data);
  }
  return data;
}

/* ---------- auth ---------- */

const profilDari = (d) => ({
  role: d.role,
  username: d.username,
  nama: d.nama,
  ...(d.role === "petugas" ? { petugasId: d.petugasId } : {}),
});

/** Masuk sebagai admin atau petugas (server yang menentukan). Mengembalikan getSesi(). */
export async function login(username, password) {
  const data = await request("/auth/login", { method: "POST", body: { username, password }, tanpaToken: true });
  perluMasuk = false;
  simpanSesi(data.token, profilDari(data));
  return getSesi();
}

/**
 * Ganti password sendiri (admin maupun petugas). Server mencabut semua token
 * lama, jadi token baru yang ikut dikirim balik harus langsung dipakai - kalau
 * tidak, sesi yang sedang berjalan ini ikut terlempar keluar.
 */
export async function gantiPassword(passwordLama, passwordBaru) {
  const data = await request("/auth/password", { method: "PUT", body: { passwordLama, passwordBaru } });
  if (data && data.token) gantiToken(data.token);
  return data;
}

/**
 * Verifikasi sesi tersimpan saat aplikasi dibuka dan perbarui profilnya.
 * Sesi petugas sekalian diperpanjang lewat header X-Token-Baru.
 *
 * Hanya 401 yang berarti sesi berakhir, dan request() sudah membuang tokennya.
 * Sinyal yang hilang di lapangan atau server yang sebentar tidak terjangkau
 * bukan alasan mengeluarkan pemakai - tokennya disimpan dan dicoba lagi nanti.
 * @returns {Promise<object|null>} getSesi()
 */
export async function cekSesi() {
  if (!token) return null;
  try {
    const data = await request("/auth/me");
    if (data && data.role) simpanSesi(token, profilDari(data));
  } catch {
    /* 401 sudah ditangani request(); galat lain dibiarkan */
  }
  return getSesi();
}

/** Keluar di perangkat ini. Cookie foto dibuang server; kegagalannya tidak menahan keluar. */
export function keluar() {
  clearToken();
  fetch(`${BASE}/auth/keluar`, { method: "POST" }).catch(() => {});
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

  const headers = kepalaToken();
  let res;
  try {
    res = await fetch(`${BASE}/petugas/impor`, { method: "POST", headers, body: data });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }

  const body = await res.json().catch(() => ({}));
  periksaJawaban(res, body, Boolean(headers.Authorization));
  if (res.status === 401) throw new ApiError(401, "Sesi sudah berakhir. Silakan login kembali.", body);
  if (!res.ok) throw new ApiError(res.status, body.error || `Impor gagal (${res.status}).`, body);
  return body;
}

/* ---------- akun login petugas (khusus admin) ---------- */

/** Buat atau ubah akun. `password` boleh kosong untuk akun yang sudah ada (ganti username saja). */
export const aturAkunPetugas = (id, username, password) =>
  request(`/petugas/${id}/akun`, { method: "PUT", body: { username, password } });
export const hapusAkunPetugas = (id) => request(`/petugas/${id}/akun`, { method: "DELETE" });
/** Cabut semua sesi petugas ini (mis. HP hilang); akunnya tetap. */
export const keluarkanPetugas = (id) => request(`/petugas/${id}/keluarkan`, { method: "POST" });

/**
 * Buat akun untuk petugas yang belum punya, lalu unduh Excel berisi username
 * dan password-nya. Mengembalikan { jumlah, sisa } - sisa > 0 berarti masih
 * ada yang menunggu klik berikutnya.
 */
export async function buatAkunMassal() {
  const kepala = await unduhBerkas("/petugas/akun-massal", "akun-petugas.xlsx", { method: "POST" });
  return { jumlah: Number(kepala.get("X-Jumlah-Akun") || 0), sisa: Number(kepala.get("X-Sisa-Akun") || 0) };
}

/** Nyalakan / matikan kewajiban login. Mengembalikan { wajib }. */
export async function aturWajibLogin(wajib) {
  const hasil = await request("/petugas/wajib-login", { method: "PUT", body: { wajib } });
  if (konfigurasiCache) konfigurasiCache = konfigurasiCache.then((k) => ({ ...k, wajibLogin: hasil.wajib }));
  return hasil;
}

/* ---------- akun pejabat: hanya melihat (dikelola admin) ---------- */

export const listPejabat = () => request("/pejabat");
/** `data` = { nama, username, password }. */
export const buatPejabat = (data) => request("/pejabat", { method: "POST", body: data });
/** `data` = { nama, username, password? } - password kosong = tidak diganti. */
export const ubahPejabat = (id, data) => request(`/pejabat/${id}`, { method: "PUT", body: data });
/** Cabut semua sesi akun pejabat ini (mis. HP hilang); akunnya tetap. */
export const keluarkanPejabat = (id) => request(`/pejabat/${id}/keluarkan`, { method: "POST" });
export const hapusPejabat = (id) => request(`/pejabat/${id}`, { method: "DELETE" });

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

/** Unduh seluruh bank formulir (susunan saja, tanpa data) sebagai JSON. Khusus admin. */
export const unduhBankFormulir = () => unduhBerkas("/formulir/ekspor-bank", "bank-formulir.json");

/**
 * Impor bank formulir dari berkas JSON hasil unduhBankFormulir. Khusus admin.
 * Mengembalikan { dibaca, ditambahkan, dilewati[], ditolak[] }.
 */
export async function imporBankFormulir(file) {
  let isi;
  try {
    isi = JSON.parse(await file.text());
  } catch {
    throw new ApiError(400, "Berkas tidak bisa dibaca. Pilih berkas .json hasil unduhan bank formulir.");
  }
  return request("/formulir/impor", { method: "POST", body: isi, auth: true });
}

/* ---------- kertas kerja ---------- */

/**
 * Daftar kertas kerja, dipaginasi di server.
 *
 * Pencarian & penyaringan ikut dikirim ke server: daftar ini tumbuh terus, dan
 * menyaring di klien hanya akan menyaring halaman yang kebetulan sudah dimuat.
 *
 * @returns {Promise<{ baris, hal, per, total, adaLagi, jumlah }>}
 *   `jumlah` = angka untuk tiap tombol saringan, dihitung atas hasil pencarian.
 */
export function listKertasKerja({ hal = 1, per = 20, cari = "", saring = "semua", timKurang = false } = {}) {
  const q = new URLSearchParams({ hal: String(hal), per: String(per), saring });
  if (cari) q.set("cari", cari);
  if (timKurang) q.set("timKurang", "1");
  return request(`/kertas-kerja?${q}`);
}

/** Daftar ringkas untuk dropdown halaman Ekspor (tanpa paginasi). Khusus admin. */
export const pilihanKertasKerja = () => request("/kertas-kerja/pilihan", { auth: true });
export const nomorBerikutnya = () => request("/kertas-kerja/nomor-berikutnya");
export const getKertasKerja = (id) => request(`/kertas-kerja/${id}`);
export const createKertasKerja = (petugasIds) =>
  request("/kertas-kerja", { method: "POST", body: { petugasIds } });
export const updateTimKertasKerja = (id, petugasIds) =>
  request(`/kertas-kerja/${id}/petugas`, { method: "PUT", body: { petugasIds }, auth: true });
/** Tambahkan petugas ke tim banyak kertas kerja sekaligus. Khusus admin. */
export const tambahPetugasMassal = (kertasKerjaIds, petugasIds) =>
  request("/kertas-kerja/tambah-petugas", { method: "POST", body: { kertasKerjaIds, petugasIds }, auth: true });
export const setStatusKertasKerja = (id, status) =>
  request(`/kertas-kerja/${id}/status`, { method: "PUT", body: { status } });
export const deleteKertasKerja = (id) => request(`/kertas-kerja/${id}`, { method: "DELETE", auth: true });

/**
 * Titik objek kertas kerja (satu kertas kerja = satu rumah / bidang). Terbuka
 * untuk petugas; token admin ikut dikirim bila ada supaya namanya tercatat.
 * Ketiganya mengembalikan detail kertas kerja terbaru.
 */
export const tetapkanTitikKk = (id, lat, lon) =>
  request(`/kertas-kerja/${id}/titik`, { method: "PUT", body: { lat, lon }, auth: true });
export const hapusTitikKk = (id) =>
  request(`/kertas-kerja/${id}/titik`, { method: "PUT", body: { hapus: true }, auth: true });
/** Titik dari GPS saat berada di lokasi. `posisi` = { lat, lon, akurasi }. */
export const rekamTitikKk = (id, posisi) =>
  request(`/kertas-kerja/${id}/rekam`, { method: "PUT", body: posisi, auth: true });

/** Tandai lokasi sensus sudah dicek (terkunci untuk petugas). Khusus admin. Mengembalikan detail kertas kerja. */
export const setLokasiDicek = (id, dicek) =>
  request(`/kertas-kerja/${id}/lokasi-dicek`, { method: "PUT", body: { dicek }, auth: true });
/** Tandai koordinat objek sebuah data sudah dicek (terkunci untuk petugas). Khusus admin. Mengembalikan data. */
export const setKoordinatDicek = (entriId, dicek) =>
  request(`/entri/${entriId}/koordinat-dicek`, { method: "PUT", body: { dicek }, auth: true });

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
/**
 * Mengubah data tidak merekam posisi; titik objek ditetapkan di tingkat kertas kerja.
 * Token admin ikut dikirim bila ada: koordinat objek yang sudah dicek hanya bisa diubah admin.
 */
export const updateEntri = (id, jawaban, dariEpbb = [], berkas = {}) =>
  request(`/entri/${id}`, { method: "PUT", body: { jawaban, dariEpbb, ...berkas }, auth: true });
export const deleteEntri = (id) => request(`/entri/${id}`, { method: "DELETE", auth: true });

/** Koordinat dari teks / tautan Google Maps, termasuk tautan pendek maps.app.goo.gl. */
export const bacaTautanPeta = (teks) => request("/tautan-peta", { method: "POST", body: { teks } });

/* ---------- pengajuan hapus ---------- */

/**
 * Petugas meminta admin menghapus kertas kerja atau satu data.
 * `jenis` = "kertas_kerja" | "entri"; `petugasId` = anggota tim yang mengajukan.
 */
export const ajukanHapus = (jenis, sasaranId, petugasId, alasan) =>
  request("/pengajuan-hapus", { method: "POST", body: { jenis, sasaranId, petugasId, alasan } });
export const batalkanPengajuan = (id) => request(`/pengajuan-hapus/${id}`, { method: "DELETE" });
/** Khusus admin. `status` = "menunggu" | "riwayat". Mengembalikan { baris, menunggu }. */
export const listPengajuan = (status = "menunggu") =>
  request(`/pengajuan-hapus?status=${status}`, { auth: true });
export const setujuiPengajuan = (id) => request(`/pengajuan-hapus/${id}/setujui`, { method: "POST", auth: true });
export const tolakPengajuan = (id) => request(`/pengajuan-hapus/${id}/tolak`, { method: "POST", auth: true });

/* ---------- foto ---------- */

export const fotoUrl = (id) => `${BASE}/foto/${id}`;

/** Unggah satu foto (multipart). Mengembalikan { id, nama, url, ukuran }. */
export async function uploadFoto(file) {
  const data = new FormData();
  data.append("berkas", file, file.name || "foto.jpg");

  const headers = kepalaToken();
  let res;
  try {
    res = await fetch(`${BASE}/foto`, { method: "POST", headers, body: data });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }
  const body = await res.json().catch(() => ({}));
  periksaJawaban(res, body, Boolean(headers.Authorization));
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
 * Melempar ApiError; pemanggil menampilkan pesannya lewat toast. Mengembalikan
 * header jawaban, untuk unduhan yang membawa keterangan tambahan.
 */
async function unduhBerkas(path, namaCadangan, { method = "GET" } = {}) {
  const headers = kepalaToken();
  let res;
  try {
    res = await fetch(BASE + path, { method, headers });
  } catch {
    throw new ApiError(0, "Tidak dapat menghubungi server. Periksa koneksi Anda.");
  }

  if (!res.ok) {
    // Galat dikirim sebagai JSON, bukan berkas.
    const data = await res.json().catch(() => ({}));
    periksaJawaban(res, data, Boolean(headers.Authorization));
    if (res.status === 401) throw new ApiError(401, "Sesi sudah berakhir. Silakan login kembali.", data);
    throw new ApiError(res.status, data.error || `Unduhan gagal (${res.status}).`, data);
  }
  periksaJawaban(res, null, Boolean(headers.Authorization));

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
  return res.headers;
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

/** ?kecamatan=&kelurahan=&formulir= - kode SISMIOP; kelurahan & formulir boleh kosong. */
const queryWilayah = ({ kecamatan, kelurahan, formulir }) => {
  const q = new URLSearchParams({ kecamatan });
  if (kelurahan) q.set("kelurahan", kelurahan);
  if (formulir) q.set("formulir", String(formulir));
  return q;
};

/**
 * Sebelum ekspor per wilayah objek: { kertasKerja, data, formulir: [{ id, judul, jumlah }], tanpaWilayah }.
 * Khusus admin.
 */
export const ringkasEksporWilayah = (kecamatan, kelurahan) =>
  request(`/ekspor/wilayah/ringkas?${queryWilayah({ kecamatan, kelurahan })}`);

/** Unduh data per kecamatan / kelurahan objek pajak. jenis: "xlsx" | "csv". */
export const unduhWilayah = (pilihan, jenis = "xlsx") =>
  unduhBerkas(
    `/ekspor/wilayah${jenis === "xlsx" ? "/xlsx" : ""}?${queryWilayah(pilihan)}`,
    `wilayah.${jenis === "xlsx" ? "xlsx" : "csv"}`
  );

/* ---------- cadangan manual ---------- */

/** { database: { tersedia, ukuran }, foto: [{ bulan: "2026-10", jumlah, ukuran }] }. Khusus admin. */
export const ringkasCadangan = () => request("/cadangan");

/**
 * Unduh cadangan: { jenis: "database" } atau { jenis: "foto", bulan: "2026-10" }.
 * Berkasnya bisa berukuran GB, jadi tidak diambil lewat fetch (akan ditampung di
 * memori halaman) melainkan dibuka sebagai tautan biasa yang langsung tersimpan
 * ke disk. Tautan biasa tidak membawa token, maka tiket sekali pakai diminta dulu.
 */
export async function unduhCadangan(isi) {
  const { tiket } = await request("/cadangan/tiket", { method: "POST", body: isi });
  const a = document.createElement("a");
  a.href = `${BASE}/cadangan/unduh?tiket=${encodeURIComponent(tiket)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * ?petugas=3,1&formulir= - satu atau beberapa id petugas (array atau "3,1");
 * formulir boleh kosong (= semua formulir).
 */
const queryPetugas = ({ petugas, formulir }) => {
  const q = new URLSearchParams({ petugas: [].concat(petugas).join(",") });
  if (formulir) q.set("formulir", String(formulir));
  return q;
};

/**
 * Sebelum ekspor per petugas (semua data di kertas kerja yang timnya memuat salah satu
 * petugas itu): { kertasKerja, kertasKerjaBerdata, data, formulir: [{ id, judul, jumlah }] }.
 * Khusus admin.
 */
export const ringkasEksporPetugas = (petugas) => request(`/ekspor/petugas/ringkas?${queryPetugas({ petugas })}`);

/** Unduh data per petugas. jenis: "xlsx" | "csv". */
export const unduhPetugasData = (pilihan, jenis = "xlsx") =>
  unduhBerkas(
    `/ekspor/petugas${jenis === "xlsx" ? "/xlsx" : ""}?${queryPetugas(pilihan)}`,
    `petugas.${jenis === "xlsx" ? "xlsx" : "csv"}`
  );

/* ---------- dashboard ---------- */

export const getStats = () => request("/dashboard/stats");

/* ---------- peta sensus ---------- */

/** Semua titik hasil sensus, satu titik per data. */
export const listPeta = () => request("/peta");

/* ---------- cek NOP ke EPBB ---------- */

/** Data objek pajak dari EPBB: { nop, namaWp, letakSp, letakOp, luasTanah, luasBangunan, belumBayar }. */
export const cekNop = (nop) => request(`/nop/${nop}`);

/**
 * Satu halaman (maks. 50) objek pajak di EPBB menurut nama WP, NIK, dan/atau letak objek.
 * mulai = jumlah hasil yang sudah tampil. Balasan: { hasil: [{ nop, namaWp, jalanOp, rt, rw,
 * kelurahan, kecamatan, luasTanah, luasBangunan }], lebih, dibatasi }.
 */
export function cariNop({ nama = "", nik = "", letak = "", mulai = 0 }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ nama, nik, letak })) if (v.trim()) q.set(k, v.trim());
  if (mulai > 0) q.set("mulai", String(mulai));
  return request(`/nop/cari?${q}`);
}

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

/** Kelurahan/desa se-Indonesia yang cocok dengan ketikan: { hasil: [{ kode, kelurahan, kecamatan, kabupaten, provinsi }], total }. */
export const cariWilayah = (q) => request(`/wilayah/cari?q=${encodeURIComponent(q)}`);

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
