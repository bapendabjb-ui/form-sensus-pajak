import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast.jsx";
import { pantauPosisi } from "./rekamPosisi.js";

/**
 * Tombol "Lokasi saya" pada peta pemilih (PetaLokasi, PetaBidang): memusatkan
 * peta ke posisi perangkat dan menampilkan titik biru, seperti di Google Maps.
 * GPS dipantau terus selama peta terbuka supaya titik birunya makin tepat.
 *
 * @returns {{
 *   saya: { status: "mati" | "mencari" | ..., posisi: { lat, lon, akurasi } | null },
 *   pusatkan: number,          naik setiap kali peta perlu dipusatkan ke posisi saya
 *   keLokasiSaya: () => void,  dipanggil tombolnya
 * }}
 */
export function useLokasiSaya() {
  const toast = useToast();
  const [saya, setSaya] = useState({ status: "mati", posisi: null });
  const [pusatkan, setPusatkan] = useState(0);
  const henti = useRef(null);
  // Tombol sudah ditekan, tetapi posisinya belum didapat.
  const tunggu = useRef(false);

  useEffect(() => () => henti.current && henti.current(), []);

  const keLokasiSaya = () => {
    if (saya.posisi) {
      setPusatkan((n) => n + 1);
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
    const stop = pantauPosisi(({ status, posisi, galat }) => {
      if (status === "gagal" && !posisi) {
        if (henti.current) berhenti(galat);
        else galatAwal = galat;
        return;
      }
      setSaya({ status, posisi });
      if (posisi && tunggu.current) {
        tunggu.current = false;
        setPusatkan((n) => n + 1);
      }
    });
    henti.current = stop;
    if (galatAwal) berhenti(galatAwal);
  };

  return { saya, pusatkan, keLokasiSaya };
}
