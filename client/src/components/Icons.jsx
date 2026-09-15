/**
 * Ikon aplikasi - seluruhnya dari Lucide (lucide-react).
 *
 * Semua ikon dikumpulkan di sini, bukan ditulis inline di komponen, supaya
 * bentuk dan ketebalan garisnya seragam. Nama ekspor sengaja dipertahankan
 * seperti sebelumnya agar pemakainya tidak perlu ikut berubah.
 *
 * Ketebalan 1.8 dipilih supaya seimbang dengan teks antarmuka; bawaan Lucide
 * (2) terasa terlalu tebal pada ukuran kecil.
 */

import {
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Images,
  LayoutGrid,
  Lock,
  Users,
} from "lucide-react";

const GARIS = 1.8;

/* ---------- navigasi (sidebar & bilah tab) ---------- */

export const IconGrid = () => <LayoutGrid size={18} strokeWidth={GARIS} aria-hidden="true" />;
export const IconDoc = () => <FileText size={18} strokeWidth={GARIS} aria-hidden="true" />;
export const IconUser = () => <Users size={18} strokeWidth={GARIS} aria-hidden="true" />;
export const IconList = () => <ClipboardList size={18} strokeWidth={GARIS} aria-hidden="true" />;

/** Tombol kembali di bilah atas (HP). */
export const IconKembali = () => <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />;

/* ---------- status & kontrol ---------- */

export const IconLock = () => <Lock size={13} strokeWidth={GARIS} aria-hidden="true" />;

export const CheckIcon = () => <Check size={15} strokeWidth={2} aria-hidden="true" />;

/** Tombol mata pada kolom password: tampilkan / sembunyikan isian. */
export const IkonMata = () => <Eye size={18} strokeWidth={GARIS} aria-hidden="true" />;
export const IkonMataTutup = () => <EyeOff size={18} strokeWidth={GARIS} aria-hidden="true" />;

export const CalIcon =() => <Calendar size={16} strokeWidth={1.5} aria-hidden="true" />;

/** Panah dropdown; CSS memutarnya lewat kelas is-open. */
export const Chevron = ({ open }) => (
  <ChevronDown
    size={16}
    strokeWidth={GARIS}
    className={"fk-chev" + (open ? " is-open" : "")}
    aria-hidden="true"
  />
);

/* ---------- pertanyaan bertipe foto ---------- */

/** Pegangan seret (drag & drop) untuk menyusun ulang daftar. */
export const IkonSeret = () => <GripVertical size={18} strokeWidth={GARIS} aria-hidden="true" />;

export const IkonKamera = () => <Camera size={20} strokeWidth={GARIS} aria-hidden="true" />;
export const IkonGaleri = () => <Images size={20} strokeWidth={GARIS} aria-hidden="true" />;

/* ---------- lambang ---------- */

/**
 * Lambang Kota Banjarbaru sebagai logo aplikasi.
 * Memakai berkas kecil (logo.webp, ~3,6 KB) - bukan lambang.webp beresolusi
 * penuh - supaya tidak memakan kuota petugas di lapangan.
 */
export const Lambang = ({ className = "" }) => (
  <img
    src="/logo.webp"
    alt=""
    width="77"
    height="96"
    className={("fk-lambang " + className).trim()}
    aria-hidden="true"
  />
);
