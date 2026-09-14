import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Penyusunan ulang daftar dengan seret (drag & drop).
 *
 * Memakai Pointer Events, bukan HTML5 drag-and-drop, karena HTML5 DnD tidak
 * jalan di layar sentuh — padahal petugas memakai aplikasi ini dari HP.
 *
 * Cara pakai:
 *   const seret = useDragUrut(pindah);
 *   <div ref={seret.wadahRef}>
 *     {item.map((x, i) => (
 *       <div key={x.id} {...seret.itemProps(i)}>
 *         <button {...seret.gripProps(i, x.nama)}>⠿</button>
 *       </div>
 *     ))}
 *   </div>
 *
 * `pindah(dari, ke)` dipanggil sekali saat jari/tetikus dilepas, dan juga saat
 * pegangan difokuskan lalu ditekan panah atas/bawah (jalur papan ketik).
 *
 * Catatan kinerja: item yang sedang diseret digeser lewat style DOM langsung,
 * bukan lewat state, supaya isi daftar tidak dirender ulang tiap gerakan jari.
 * State hanya berubah saat posisi tujuan benar-benar berpindah.
 */

/** Jarak dari tepi layar yang memicu gulir otomatis saat menyeret (px). */
const ZONA_GULIR = 90;
/** Kecepatan gulir otomatis tercepat per bingkai (px), tepat di tepi layar. */
const LAJU_GULIR = 14;

/** Lebar zona gulir sesungguhnya — pada layar pendek tidak boleh memakan separuh layar. */
const zonaGulir = () => Math.min(ZONA_GULIR, window.innerHeight * 0.18);
/** Geser sekian px dulu sebelum dianggap menyeret, bukan sekadar menekan. */
const AMBANG_SERET = 4;

export default function useDragUrut(pindah) {
  const wadahRef = useRef(null);
  const sesi = useRef(null);
  const rafRef = useRef(0);
  const [tarik, setTarik] = useState(null); // { dari, ke, langkah }

  const berhenti = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const s = sesi.current;
    sesi.current = null;
    // Geseran item yang ditarik ditulis langsung ke DOM, jadi dibersihkan manual.
    if (s?.el) s.el.style.transform = "";
    setTarik(null);
    document.body.classList.remove("fk-sedang-seret");
    return s;
  }, []);

  // Bersihkan bila komponen dilepas di tengah seretan.
  useEffect(() => () => berhenti(), [berhenti]);

  /** Hitung posisi tujuan dari posisi penunjuk saat ini. */
  const hitung = useCallback(() => {
    const s = sesi.current;
    if (!s) return;

    const geser = s.yLayar + window.scrollY - s.yAwal;
    if (!s.aktif) {
      if (Math.abs(geser) < AMBANG_SERET) return;
      s.aktif = true;
      document.body.classList.add("fk-sedang-seret");
      setTarik({ dari: s.dari, ke: s.dari, langkah: s.langkah });
    }

    s.el.style.transform = `translateY(${geser}px)`;

    // Titik tengah item yang diseret setelah digeser sejauh ini, lalu
    // dibandingkan dengan titik tengah tetangganya.
    const asal = s.kotak[s.dari];
    const tengah = asal.atas + asal.tinggi / 2 + geser;

    let ke = s.dari;
    while (ke < s.kotak.length - 1 && tengah > s.kotak[ke + 1].atas + s.kotak[ke + 1].tinggi / 2) ke++;
    while (ke > 0 && tengah < s.kotak[ke - 1].atas + s.kotak[ke - 1].tinggi / 2) ke--;

    if (ke !== s.ke) {
      s.ke = ke;
      setTarik({ dari: s.dari, ke, langkah: s.langkah });
    }
  }, []);

  /** Gulir halaman saat penunjuk menempel di tepi atas / bawah layar. */
  const gulirOtomatis = useCallback(() => {
    const s = sesi.current;
    if (!s) return;

    const zona = zonaGulir();
    const keAtas = s.yLayar < zona;
    const keBawah = s.yLayar > window.innerHeight - zona;

    if (s.aktif && (keAtas || keBawah)) {
      // Kecepatan mengikuti KUADRAT kedalaman: baru menyentuh zona = merayap,
      // menempel di tepi layar = cepat.
      //
      // Dengan laju tetap, kartu yang pegangannya kebetulan sudah berada di
      // dekat tepi layar langsung melesat beberapa posisi begitu diseret
      // sedikit — halaman menggulir, `geser` ikut membesar, dan kartu menyalip
      // tujuannya sendiri. Itulah yang membuat seret terasa rusak.
      const dalam = keAtas ? zona - s.yLayar : s.yLayar - (window.innerHeight - zona);
      const rasio = Math.min(1, dalam / zona);
      const laju = Math.max(1, Math.round(rasio * rasio * LAJU_GULIR));

      const sebelum = window.scrollY;
      window.scrollBy(0, keAtas ? -laju : laju);
      // Halaman sudah mentok: tidak ada yang berubah, tak perlu hitung ulang.
      if (window.scrollY !== sebelum) hitung();
    }

    rafRef.current = requestAnimationFrame(gulirOtomatis);
  }, [hitung]);

  const mulai = useCallback(
    (dari) => (e) => {
      if (e.button !== undefined && e.button > 0) return; // hanya tombol kiri
      const wadah = wadahRef.current;
      if (!wadah) return;

      // Ukur posisi tiap item dalam koordinat dokumen supaya tetap benar
      // meski halaman ikut tergulir selama menyeret.
      const el = [...wadah.querySelectorAll("[data-seret-item]")];
      if (el.length < 2 || !el[dari]) return;
      const atasHalaman = window.scrollY;
      const kotak = el.map((n) => {
        const r = n.getBoundingClientRect();
        return { atas: r.top + atasHalaman, tinggi: r.height };
      });

      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* penunjuk sudah lepas — seretan berikutnya tetap bisa dimulai */
      }

      // Item yang dilewati bergeser sejauh tinggi item yang diseret + jarak antar item.
      const jarak = Math.max(0, kotak[1].atas - (kotak[0].atas + kotak[0].tinggi));

      sesi.current = {
        dari,
        ke: dari,
        aktif: false,
        el: el[dari],
        kotak,
        langkah: kotak[dari].tinggi + jarak,
        yAwal: e.clientY + atasHalaman,
        yLayar: e.clientY,
        pointerId: e.pointerId,
      };
      rafRef.current = requestAnimationFrame(gulirOtomatis);
    },
    [gulirOtomatis]
  );

  const bergerak = useCallback(
    (e) => {
      const s = sesi.current;
      if (!s || s.pointerId !== e.pointerId) return;
      s.yLayar = e.clientY;
      hitung();
    },
    [hitung]
  );

  const lepas = useCallback(
    (e) => {
      const s = sesi.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const { dari, ke, aktif } = s;
      berhenti();
      if (aktif && ke !== dari) pindah(dari, ke);
    },
    [berhenti, pindah]
  );

  const batal = useCallback(
    (e) => {
      const s = sesi.current;
      if (s && s.pointerId === e.pointerId) berhenti();
    },
    [berhenti]
  );

  /** Properti untuk pegangan seret. `nama` dipakai di label aksesibilitas. */
  const gripProps = (i, nama) => ({
    type: "button",
    className: "fk-grip",
    "aria-label": nama ? `Geser urutan ${nama}` : "Geser urutan",
    title: "Seret untuk memindahkan — atau tekan panah atas/bawah",
    onPointerDown: mulai(i),
    onPointerMove: bergerak,
    onPointerUp: lepas,
    onPointerCancel: batal,
    onKeyDown: (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      e.stopPropagation();
      pindah(i, i + (e.key === "ArrowUp" ? -1 : 1));
    },
  });

  /** Properti untuk pembungkus satu item daftar (penanda + animasi geser). */
  const itemProps = (i) => {
    const dasar = { "data-seret-item": i };
    if (!tarik) return { ...dasar, className: "fk-seret-item" };

    // Geseran item yang ditarik diurus langsung di DOM oleh hitung().
    if (i === tarik.dari) return { ...dasar, className: "fk-seret-item is-seret" };

    let geser = 0;
    if (tarik.ke > tarik.dari && i > tarik.dari && i <= tarik.ke) geser = -tarik.langkah;
    else if (tarik.ke < tarik.dari && i >= tarik.ke && i < tarik.dari) geser = tarik.langkah;

    return {
      ...dasar,
      className: "fk-seret-item",
      style: geser ? { transform: `translateY(${geser}px)` } : undefined,
    };
  };

  return { wadahRef, gripProps, itemProps, sedangSeret: Boolean(tarik) };
}

/** Pindahkan satu elemen array dari indeks `dari` ke `ke`. */
export function pindahkan(arr, dari, ke) {
  if (dari === ke || dari < 0 || ke < 0 || dari >= arr.length || ke >= arr.length) return arr;
  const hasil = [...arr];
  const [item] = hasil.splice(dari, 1);
  hasil.splice(ke, 0, item);
  return hasil;
}
