import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api.js";

/*
 * Lapisan peta dari GIS (QGIS / ArcGIS) di Peta Sensus: daftar dari server,
 * mana yang menyala bagi pemakai ini, dan isinya yang diunduh hanya saat
 * dinyalakan. Menggambarnya diserahkan ke mesin peta (SebaranGoogle /
 * SebaranLeaflet); pengelolaannya di components/KelolaLapisan.jsx.
 */

/**
 * Warna pilihan lapisan: terbaca di atas peta jalan maupun satelit, dan tidak
 * menyerupai hijau / jingga titik sensus (WARNA_STATUS di peta/bersama.jsx).
 */
export const PALET_LAPISAN = ["#2563EB", "#DC2626", "#9333EA", "#EA580C", "#FACC15", "#06B6D4"];

/** Warna palet pertama yang belum dipakai lapisan mana pun. */
export function warnaBerikutnya(daftar = []) {
  const dipakai = new Set(daftar.map((l) => l.warna.toUpperCase()));
  return PALET_LAPISAN.find((w) => !dipakai.has(w)) || PALET_LAPISAN[daftar.length % PALET_LAPISAN.length];
}

/** 1234567 -> "1,2 MB". */
export function formatUkuran(byte) {
  const satuan = [
    [1e6, "MB"],
    [1e3, "KB"],
  ].find(([n]) => byte >= n) || [1, "B"];
  return `${(byte / satuan[0]).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${satuan[1]}`;
}

/*
 * Pilihan nyala / mati tiap lapisan milik pemakai ini, disimpan di browser:
 * { [id]: true | false }. Lapisan yang belum pernah diubah mengikuti
 * "tampil saat peta dibuka" dari admin.
 */
const KUNCI_SIMPAN = "sensus.lapisanNyala";

function bacaPilihan() {
  try {
    const p = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || "{}");
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function simpanPilihan(p) {
  try {
    localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(p));
  } catch {
    // Penyimpanan browser ditutup (mis. jendela privat): pilihannya berlaku sampai halaman ditutup.
  }
}

/**
 * @returns {{
 *   daftar: object[],                 semua lapisan (tanpa isi), urut unggahan
 *   menyala: (l) => boolean,
 *   ubahNyala: (l, nyala: boolean) => void,
 *   aktif: { id, versi, nama, warna, data }[],  lapisan menyala yang isinya sudah ada - untuk mesin peta
 *   status: (l) => "" | "memuat" | string,      string lain = pesan galat
 *   muatUlang: () => Promise<void>,
 * }}
 */
export function useLapisanPeta() {
  const [daftar, setDaftar] = useState([]);
  const [pilihan, setPilihan] = useState(bacaPilihan);
  const [isi, setIsi] = useState({}); // versi -> FeatureCollection
  const [proses, setProses] = useState({}); // versi -> "memuat" | pesan galat

  const muatUlang = useCallback(
    () =>
      api
        .listLapisan()
        .then(setDaftar)
        // Lapisan hanya pelengkap: peta tetap dipakai walau daftarnya gagal dimuat.
        .catch((e) => console.warn("[Sensus Pajak] daftar lapisan peta gagal dimuat:", e.message)),
    []
  );

  useEffect(() => {
    muatUlang();
  }, [muatUlang]);

  const menyala = useCallback((l) => pilihan[l.id] ?? l.tampil, [pilihan]);

  // Unduh isi lapisan yang menyala dan belum ada. Yang gagal tidak dicoba
  // ulang terus-menerus; mematikan lalu menyalakannya lagi mencoba ulang.
  useEffect(() => {
    for (const l of daftar) {
      if (!menyala(l) || isi[l.versi] || proses[l.versi]) continue;
      setProses((p) => ({ ...p, [l.versi]: "memuat" }));
      api
        .isiLapisan(l)
        .then((data) => {
          setIsi((s) => ({ ...s, [l.versi]: data }));
          setProses((p) => {
            const n = { ...p };
            delete n[l.versi];
            return n;
          });
        })
        .catch((e) => setProses((p) => ({ ...p, [l.versi]: e.message || "Gagal dimuat." })));
    }
  }, [daftar, menyala, isi, proses]);

  const ubahNyala = useCallback((l, nyala) => {
    setPilihan((p) => {
      const n = { ...p, [l.id]: nyala };
      simpanPilihan(n);
      return n;
    });
    if (nyala) {
      setProses((p) => {
        if (p[l.versi] === "memuat" || !p[l.versi]) return p;
        const n = { ...p };
        delete n[l.versi];
        return n;
      });
    }
  }, []);

  // Identitas stabil selama tidak ada yang berubah: mesin peta menggambar
  // ulang lapisan setiap larik ini berganti.
  const aktif = useMemo(
    () =>
      daftar
        .filter((l) => menyala(l) && isi[l.versi])
        .map((l) => ({ id: l.id, versi: l.versi, nama: l.nama, warna: l.warna, data: isi[l.versi] })),
    [daftar, menyala, isi]
  );

  const status = useCallback((l) => (menyala(l) ? proses[l.versi] || "" : ""), [menyala, proses]);

  return { daftar, menyala, ubahNyala, aktif, status, muatUlang };
}
