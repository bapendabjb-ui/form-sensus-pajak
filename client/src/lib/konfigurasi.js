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
