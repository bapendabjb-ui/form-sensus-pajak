import { useEffect, useState } from "react";
import * as api from "../api.js";

/**
 * Batas aplikasi dari server (GET /api/konfigurasi).
 *
 * Nilai di bawah hanya dipakai selama jawaban server belum tiba; begitu tiba,
 * nilai itu disimpan di modul sehingga layar berikutnya langsung memakai angka
 * server tanpa berkedip. Angka sebenarnya tetap satu, yaitu milik server
 * (server/src/batas.js).
 */
const SEMENTARA = { petugasMaks: 8, fotoMaksPerPertanyaan: 10, uploadMaksMb: 8 };

let terakhir = SEMENTARA;

const KUNCI_PERIODE = "sensus-pajak:periode";
const AWALAN_DRAF = "sensus-pajak:draf:";

let pembersihan = null;

/**
 * Buang semua draf isian di perangkat bila admin sudah me-reset kertas kerja
 * (periodeData dari server berbeda dari yang tersimpan). Perangkat yang belum
 * pernah mencatat periode dianggap berada di periode 0, yaitu periode sebelum
 * reset pertama - sehingga draf lama tetap terbuang walau baru dibuka setelah
 * reset. Dijalankan sekali per sesi; gagal memuat = draf dibiarkan.
 * @returns {Promise<void>}
 */
export function bersihkanDrafLama() {
  if (!pembersihan) {
    pembersihan = api
      .getKonfigurasi()
      .then(({ periodeData = 0 }) => {
        const tersimpan = Number(localStorage.getItem(KUNCI_PERIODE) || 0);
        if (tersimpan === periodeData) return;
        const buang = [];
        for (let i = 0; i < localStorage.length; i++) {
          const kunci = localStorage.key(i);
          if (kunci && kunci.startsWith(AWALAN_DRAF)) buang.push(kunci);
        }
        buang.forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(KUNCI_PERIODE, String(periodeData));
      })
      .catch(() => {
        /* server tak terjangkau atau penyimpanan tidak tersedia - coba lagi sesi berikutnya */
        pembersihan = null;
      });
  }
  return pembersihan;
}

export function useKonfigurasi() {
  const [konfigurasi, setKonfigurasi] = useState(terakhir);

  useEffect(() => {
    let batal = false;
    api
      .getKonfigurasi()
      .then((k) => {
        terakhir = { ...SEMENTARA, ...k };
        if (!batal) setKonfigurasi(terakhir);
      })
      .catch(() => {
        /* gagal memuat - tetap pakai nilai sementara */
      });
    return () => {
      batal = true;
    };
  }, []);

  return konfigurasi;
}
