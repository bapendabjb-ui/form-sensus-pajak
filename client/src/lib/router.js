import { useEffect, useState } from "react";

/**
 * Router ringan berbasis History API.
 *
 * Tujuannya terutama untuk HP: tombol Kembali (tombol sistem Android / gestur
 * iOS) berpindah antar-layar aplikasi, bukan menutup aplikasi. Setiap layar
 * juga punya alamat sendiri sehingga bisa dimuat ulang tanpa kehilangan posisi.
 */

const pendengar = new Set();
let lokasi = window.location.pathname;
let penjaga = null;

// Saat lembar pilihan ditutup, entri riwayatnya dibuang lewat history.back() yang
// berjalan asinkron. Navigasi yang diminta sebelum pembuangan itu selesai
// ditunda, supaya tidak tertimpa popstate yang datang belakangan.
let menungguBuang = false;
let antrean = null;

// Nomor urut entri riwayat milik aplikasi, supaya kembali() tahu apakah masih
// ada layar sebelumnya di dalam aplikasi atau harus ke halaman cadangan.
if (!window.history.state || typeof window.history.state.fkIdx !== "number") {
  window.history.replaceState({ ...(window.history.state || {}), fkIdx: 0 }, "");
}

const idxSekarang = () => (window.history.state && window.history.state.fkIdx) || 0;
const umumkan = () => pendengar.forEach((fn) => fn(lokasi));

/** Tanya pengguna bila layar aktif punya perubahan yang belum disimpan. */
function bolehPergi() {
  const pesan = penjaga ? penjaga() : null;
  if (!pesan) return true;
  if (!window.confirm(pesan)) return false;
  penjaga = null;
  return true;
}

/** Pindah ke alamat lain di dalam aplikasi. */
export function navigate(path, { replace = false } = {}) {
  if (menungguBuang) {
    antrean = () => navigate(path, { replace });
    return;
  }
  if (path === lokasi) return;
  if (!bolehPergi()) return;
  if (replace) window.history.replaceState({ fkIdx: idxSekarang() }, "", path);
  else window.history.pushState({ fkIdx: idxSekarang() + 1 }, "", path);
  lokasi = path;
  umumkan();
}

/** Kembali ke layar sebelumnya; bila tidak ada (dibuka langsung dari tautan), ke `cadangan`. */
export function kembali(cadangan = "/") {
  if (menungguBuang) {
    antrean = () => kembali(cadangan);
    return;
  }
  if (idxSekarang() > 0) window.history.back();
  else navigate(cadangan, { replace: true });
}

/**
 * Pasang penjaga perubahan belum disimpan. `fn` mengembalikan pesan konfirmasi
 * atau null. Mengembalikan fungsi pelepas (cocok sebagai cleanup useEffect).
 */
export function pasangPenjaga(fn) {
  penjaga = fn;
  return () => {
    if (penjaga === fn) penjaga = null;
  };
}

/**
 * Buang entri riwayat sementara (milik lembar pilihan) yang sedang aktif.
 * Navigasi yang diminta sebelum selesai akan dijalankan setelahnya.
 */
export function buangEntriSementara() {
  if (!window.history.state || !window.history.state.fkSheet) return;
  menungguBuang = true;
  window.history.back();
}

window.addEventListener("popstate", () => {
  if (menungguBuang) {
    menungguBuang = false;
    const lanjut = antrean;
    antrean = null;
    if (lanjut) lanjut();
    return;
  }
  const tujuan = window.location.pathname;
  // Alamat sama = entri riwayat milik lembar pilihan (bottom sheet) yang ditutup.
  if (tujuan === lokasi) return;
  if (!bolehPergi()) {
    window.history.pushState({ fkIdx: idxSekarang() + 1 }, "", lokasi);
    return;
  }
  lokasi = tujuan;
  umumkan();
});

window.addEventListener("beforeunload", (e) => {
  if (penjaga && penjaga()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/** Alamat aktif; komponen dirender ulang setiap kali berpindah layar. */
export function useLokasi() {
  const [path, setPath] = useState(lokasi);
  useEffect(() => {
    pendengar.add(setPath);
    setPath(lokasi);
    return () => pendengar.delete(setPath);
  }, []);
  return path;
}

const angka = (s) => (/^\d+$/.test(s || "") ? Number(s) : null);

/**
 * Terjemahkan alamat menjadi rute.
 *   tab     : menu yang disorot di bilah tab / sidebar
 *   judul   : judul di bilah atas (HP) dan <title>
 *   kembali : alamat cadangan tombol kembali di bilah atas
 *   fokus   : layar pengisian — bilah tab disembunyikan agar layar lega
 */
export function cocokkanRute(pathname) {
  const b = pathname.split("/").filter(Boolean);

  if (b.length === 0) return { nama: "dashboard", tab: "dashboard", judul: "Dashboard" };

  if (b[0] === "kertas-kerja") {
    if (b.length === 1) return { nama: "kk-list", tab: "kk", judul: "Kertas Kerja" };
    if (b[1] === "baru" && b.length === 2) {
      return { nama: "kk-baru", tab: "kk", judul: "Buat Kertas Kerja", kembali: "/kertas-kerja", fokus: true };
    }
    const id = angka(b[1]);
    if (id && b.length === 2) {
      return { nama: "kk-detail", tab: "kk", id, judul: "Kertas Kerja", kembali: "/kertas-kerja" };
    }
    if (id && b.length === 4 && b[2] === "isi" && angka(b[3])) {
      return { nama: "isi", tab: "kk", kkId: id, formulirId: angka(b[3]), judul: "Isi Data", kembali: `/kertas-kerja/${id}`, fokus: true };
    }
    if (id && b.length === 4 && b[2] === "data" && angka(b[3])) {
      return { nama: "ubah", tab: "kk", kkId: id, entriId: angka(b[3]), judul: "Ubah Data", kembali: `/kertas-kerja/${id}`, fokus: true };
    }
  }

  if (b.length === 1 && b[0] === "petugas") return { nama: "petugas", tab: "petugas", judul: "Petugas" };
  if (b.length === 1 && b[0] === "formulir") return { nama: "formulir", tab: "formulir", judul: "Formulir" };

  return { nama: "tidak-ada", tab: null, judul: "Tidak Ditemukan", kembali: "/" };
}
