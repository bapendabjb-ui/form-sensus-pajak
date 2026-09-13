import { useEffect, useRef } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";

const MAKS_FOTO = 10;
const SISI_MAKS = 1600;

/** Muat gambar lewat <img> bila createImageBitmap tidak tersedia. */
function muatGambar(file) {
  return new Promise((selesai, gagal) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => selesai(Object.assign(img, { close: () => URL.revokeObjectURL(url) }));
    img.onerror = () => {
      URL.revokeObjectURL(url);
      gagal(new Error("Gambar tidak dapat dibaca."));
    };
    img.src = url;
  });
}

/**
 * Perkecil foto di browser sebelum diunggah: sisi terpanjang maks. 1600px,
 * JPEG kualitas 82%. Menghemat kuota petugas dan ruang penyimpanan.
 * Bila gagal dibaca (mis. HEIC di browser non-Safari), berkas asli dikirim
 * dan server yang menilai formatnya.
 */
async function perkecil(file) {
  let sumber;
  try {
    sumber =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(file, { imageOrientation: "from-image" })
        : await muatGambar(file);
  } catch {
    return file;
  }

  const formatDiterima = /^image\/(jpeg|png|webp)$/.test(file.type);
  const skala = Math.min(1, SISI_MAKS / Math.max(sumber.width, sumber.height));
  if (skala === 1 && formatDiterima && file.size <= 1.5 * 1024 * 1024) {
    sumber.close?.();
    return file;
  }

  const kanvas = document.createElement("canvas");
  kanvas.width = Math.max(1, Math.round(sumber.width * skala));
  kanvas.height = Math.max(1, Math.round(sumber.height * skala));
  const ctx = kanvas.getContext("2d");
  ctx.fillStyle = "#fff"; // latar putih untuk PNG transparan
  ctx.fillRect(0, 0, kanvas.width, kanvas.height);
  ctx.drawImage(sumber, 0, 0, kanvas.width, kanvas.height);
  sumber.close?.();

  const blob = await new Promise((r) => kanvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob || (formatDiterima && blob.size >= file.size)) return file;

  const nama = (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], nama, { type: "image/jpeg" });
}

const IkonKamera = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4a2 2 0 0 1 1.76 1.05l.49.9A2 2 0 0 0 18 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2a2 2 0 0 0 1.76-1.05l.49-.9A2 2 0 0 1 10 4z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const IkonGaleri = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </svg>
);

/**
 * Pertanyaan bertipe foto: ambil dari kamera atau pilih dari galeri,
 * unggah langsung, tampilkan pratinjau, bisa dihapus / diulang bila gagal.
 *
 * value    : array item { id, nama } (terunggah) atau { kunci, status, pratinjau, file }
 * onChange : menerima nilai baru ATAU fungsi (nilaiLama) => nilaiBaru, karena
 *            unggahan selesai belakangan dan harus memperbarui nilai terbaru.
 */
export default function FotoInput({ value, onChange, invalid }) {
  const toast = useToast();
  const items = Array.isArray(value) ? value : [];
  const kamera = useRef(null);
  const galeri = useRef(null);
  const pratinjau = useRef(new Set());

  useEffect(() => {
    const daftar = pratinjau.current;
    return () => daftar.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const perbarui = (fn) => onChange((lama) => fn(Array.isArray(lama) ? lama : []));

  async function unggah(kunci, file) {
    try {
      const kecil = await perkecil(file);
      const hasil = await api.uploadFoto(kecil);
      perbarui((list) =>
        list.map((it) =>
          it.kunci === kunci ? { id: hasil.id, nama: hasil.nama, pratinjau: it.pratinjau } : it
        )
      );
    } catch (e) {
      perbarui((list) =>
        list.map((it) => (it.kunci === kunci ? { ...it, status: "gagal", pesan: e.message } : it))
      );
    }
  }

  function tambah(fileList) {
    const files = Array.from(fileList || []).filter((f) => !f.type || f.type.startsWith("image/"));
    if (!files.length) return;

    const sisa = MAKS_FOTO - items.length;
    if (sisa <= 0) {
      toast(`Maksimal ${MAKS_FOTO} foto per pertanyaan.`, true);
      return;
    }
    if (files.length > sisa) toast(`Hanya ${sisa} foto lagi yang bisa ditambahkan.`, true);

    const baru = files.slice(0, sisa).map((file) => {
      const url = URL.createObjectURL(file);
      pratinjau.current.add(url);
      return {
        kunci: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: "unggah",
        nama: file.name,
        pratinjau: url,
        file,
      };
    });

    perbarui((list) => [...list, ...baru]);
    baru.forEach((it) => unggah(it.kunci, it.file));
  }

  function ulang(it) {
    perbarui((list) => list.map((x) => (x.kunci === it.kunci ? { ...x, status: "unggah" } : x)));
    unggah(it.kunci, it.file);
  }

  function hapus(it) {
    perbarui((list) => list.filter((x) => (it.id ? x.id !== it.id : x.kunci !== it.kunci)));
  }

  const penuh = items.length >= MAKS_FOTO;
  const pilihBerkas = (e) => {
    tambah(e.target.files);
    e.target.value = ""; // agar foto yang sama bisa dipilih lagi
  };

  return (
    <div className={"fk-foto" + (invalid ? " is-invalid" : "")}>
      {items.length > 0 && (
        <div className="fk-foto-grid">
          {items.map((it) => {
            const src = it.pratinjau || (it.id ? api.fotoUrl(it.id) : "");
            return (
              <div
                className={"fk-foto-item" + (it.status ? ` is-${it.status}` : "")}
                key={it.id ? `f${it.id}` : it.kunci}
                title={it.status === "gagal" ? it.pesan : it.nama}
              >
                {src && (
                  <a href={it.id ? api.fotoUrl(it.id) : undefined} target="_blank" rel="noreferrer">
                    <img src={src} alt={it.nama || "Foto"} loading="lazy" />
                  </a>
                )}
                {it.status === "unggah" && <span className="fk-foto-status">Mengunggah…</span>}
                {it.status === "gagal" && (
                  <span className="fk-foto-status is-err">
                    Gagal
                    <button type="button" onClick={() => ulang(it)}>
                      coba lagi
                    </button>
                  </span>
                )}
                <button type="button" className="fk-foto-hapus" onClick={() => hapus(it)} aria-label="Hapus foto">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="fk-foto-pilih">
        <button type="button" className="fk-foto-btn is-utama" onClick={() => kamera.current?.click()} disabled={penuh}>
          <IkonKamera /> Ambil foto
        </button>
        <button type="button" className="fk-foto-btn" onClick={() => galeri.current?.click()} disabled={penuh}>
          <IkonGaleri /> Dari galeri
        </button>
      </div>

      {/* capture dipisah dari multiple: sebagian browser HP mengabaikan salah satunya bila digabung. */}
      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={pilihBerkas} />
      <input ref={galeri} type="file" accept="image/*" multiple hidden onChange={pilihBerkas} />

      <span className="fk-hint-kecil">
        {items.length} dari {MAKS_FOTO} foto · diperkecil otomatis sebelum diunggah
      </span>
    </div>
  );
}
