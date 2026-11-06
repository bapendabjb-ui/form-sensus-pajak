import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast.jsx";
import { pantauPosisi, perluPusatkanUlang } from "./rekamPosisi.js";

/**
 * Selama ini sejak tombol ditekan, peta ikut dipusatkan ulang setiap posisi
 * membaik nyata: pembacaan pertama biasanya dari jaringan dan meleset, GPS
 * baru mengunci beberapa detik kemudian. Menggeser peta menghentikannya.
 */
const IKUTI_MS = 30000;

/**
 * Tombol "Lokasi saya" pada peta pemilih (PetaLokasi, PetaBidang): memusatkan
 * peta ke posisi perangkat dan menampilkan titik biru, seperti di Google Maps.
 * GPS dipantau terus selama peta terbuka, dengan pembacaan terbaru (bukan
 * hasil cache browser), supaya titik birunya mengikuti perangkat.
 *
 * @returns {{
 *   saya: { status: "mati" | "mencari" | ..., posisi: { lat, lon, akurasi } | null },
 *   pusatkan: number,          naik setiap kali peta perlu dipusatkan ke posisi saya
 *   keLokasiSaya: () => void,  dipanggil tombolnya
 *   berhentiIkuti: () => void, dipanggil mesin peta saat petugas menggeser peta
 * }}
 */
export function useLokasiSaya() {
  const toast = useToast();
  const [saya, setSaya] = useState({ status: "mati", posisi: null });
  const [pusatkan, setPusatkan] = useState(0);
  const henti = useRef(null);
  // Tombol sudah ditekan, tetapi posisinya belum didapat.
  const tunggu = useRef(false);
  // Pusat terakhir dan batas waktu mengikuti posisi.
  const ikuti = useRef({ sampai: 0, pusat: null });

  useEffect(() => () => henti.current && henti.current(), []);

  const pusatkanKe = (posisi) => {
    ikuti.current.pusat = posisi;
    setPusatkan((n) => n + 1);
  };

  const berhentiIkuti = useCallback(() => {
    ikuti.current.sampai = 0;
    tunggu.current = false;
  }, []);

  const keLokasiSaya = () => {
    ikuti.current = { sampai: Date.now() + IKUTI_MS, pusat: null };
    if (saya.posisi) {
      pusatkanKe(saya.posisi);
      return;
    }
    tunggu.current = true;
    if (henti.current) return; // masih mencari; peta dipusatkan begitu posisi didapat

    const berhenti = (pesan) => {
      if (henti.current) henti.current();
      henti.current = null;
      tunggu.current = false;
      setSaya({ status: "mati", posisi: null });
      toast(pesan, true);
    };
    // pantauPosisi bisa melapor gagal sebelum penghentinya dikembalikan.
    let galatAwal = "";
    const stop = pantauPosisi(
      ({ status, posisi, galat }) => {
        if (status === "gagal" && !posisi) {
          if (henti.current) berhenti(galat);
          else galatAwal = galat;
          return;
        }
        setSaya({ status, posisi });
        if (!posisi) return;
        if (tunggu.current) {
          tunggu.current = false;
          pusatkanKe(posisi);
        } else if (Date.now() < ikuti.current.sampai && perluPusatkanUlang(ikuti.current.pusat, posisi)) {
          pusatkanKe(posisi);
        }
      },
      { ikuti: true }
    );
    henti.current = stop;
    if (galatAwal) berhenti(galatAwal);
  };

  return { saya, pusatkan, keLokasiSaya, berhentiIkuti };
}
