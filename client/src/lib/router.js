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

/**
 * Penanya konfirmasi keluar, dipasang oleh DialogProvider agar memakai dialog
 * aplikasi, bukan window.confirm bawaan browser. Jawabannya asinkron, jadi
 * perpindahan layar ditunda sampai pengguna menjawab.
 */
let tanyaKeluar = null;

export function pasangTanyaKeluar(fn) {
  tanyaKeluar = fn;
  return () => {
    if (tanyaKeluar === fn) tanyaKeluar = null;
  };
}

/** Dipakai hanya bila dialog aplikasi belum terpasang. */
const PESAN_CADANGAN = "Tinggalkan halaman ini? Perubahan yang belum disimpan akan hilang.";

/**
 * Jalankan `lanjut` bila layar aktif boleh ditinggalkan.
 * Tanpa perubahan tertunda, `lanjut` berjalan langsung (tetap sinkron).
 */
function bilaBolehPergi(lanjut) {
  const tertahan = penjaga ? penjaga() : false;
  if (!tertahan) {
    lanjut();
    return;
  }
  // Cadangan: dialog belum terpasang (mis. modul router dipakai sebelum render).
  if (!tanyaKeluar) {
    if (window.confirm(PESAN_CADANGAN)) {
      penjaga = null;
      lanjut();
    }
    return;
  }
  tanyaKeluar().then((ya) => {
    if (!ya) return;
    penjaga = null;
    lanjut();
  });
}

/** Tulis alamat baru ke riwayat lalu beri tahu komponen. */
function pindah(path, replace) {
  if (replace) window.history.replaceState({ fkIdx: idxSekarang() }, "", path);
  else window.history.pushState({ fkIdx: idxSekarang() + 1 }, "", path);
  lokasi = path;
  umumkan();
}

/** Pindah ke alamat lain di dalam aplikasi. */
export function navigate(path, { replace = false } = {}) {
  if (menungguBuang) {
    antrean = () => navigate(path, { replace });
    return;
  }
  if (path === lokasi) return;
  bilaBolehPergi(() => pindah(path, replace));
}

/** Kembali ke layar sebelumnya; bila tidak ada (dibuka langsung dari tautan), ke `cadangan`. */
export function kembali(cadangan = "/") {
  if (menungguBuang) {
    antrean = () => kembali(cadangan);
    return;
  }
  bilaBolehPergi(() => {
    if (idxSekarang() > 0) window.history.back();
    else pindah(cadangan, true);
  });
}

/**
 * Pasang penjaga perubahan belum disimpan. `fn` mengembalikan true bila layar
 * masih punya perubahan yang belum tersimpan.
 * Mengembalikan fungsi pelepas (cocok sebagai cleanup useEffect).
 */
export function pasangPenjaga(fn) {
  penjaga = fn;
  return () => {
    if (penjaga === fn) penjaga = null;
  };
}

/**
 * Buang entri riwayat sementara (milik lembar pilihan atau dialog) yang sedang
 * aktif. `lanjut` dijalankan setelah pembuangan itu selesai — pembuangan lewat
 * history.back() berjalan asinkron, jadi apa pun yang menyentuh riwayat harus
 * menunggu giliran.
 */
export function buangEntriSementara(lanjut) {
  if (!window.history.state || !window.history.state.fkSheet) {
    if (lanjut) lanjut();
    return;
  }
  menungguBuang = true;
  antrean = lanjut || null;
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
  // Alamat sama = entri riwayat milik lembar pilihan / dialog yang ditutup.
  if (tujuan === lokasi) return;

  if (penjaga && penjaga()) {
    // Kembalikan dulu ke alamat semula supaya layar tidak terlanjur berpindah
    // selagi pengguna menjawab, lalu ulangi perpindahannya bila disetujui.
    window.history.pushState({ fkIdx: idxSekarang() + 1 }, "", lokasi);
    bilaBolehPergi(() => pindah(tujuan, true));
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

  if (b.length === 1 && b[0] === "masuk") {
    return { nama: "masuk", tab: null, judul: "Masuk Admin", kembali: "/", fokus: true };
  }
  if (b.length === 1 && b[0] === "akun") return { nama: "akun", tab: null, judul: "Akun Admin", kembali: "/" };
  if (b.length === 1 && b[0] === "petugas") return { nama: "petugas", tab: "petugas", judul: "Petugas" };
  if (b.length === 1 && b[0] === "formulir") return { nama: "formulir", tab: "formulir", judul: "Formulir" };

  return { nama: "tidak-ada", tab: null, judul: "Tidak Ditemukan", kembali: "/" };
}
