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
  BedDouble,
  Bird,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  ClipboardList,
  Coffee,
  Coins,
  Droplets,
  Eye,
  EyeOff,
  Factory,
  FileText,
  Fuel,
  GripVertical,
  Hotel,
  House,
  IdCard,
  Images,
  Landmark,
  LayoutGrid,
  Lock,
  MapPin,
  Megaphone,
  Mountain,
  Music,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  SquareParking,
  Store,
  Tag,
  Ticket,
  User,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
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

/* ---------- ikon formulir ---------- */

/**
 * Ikon yang bisa dipilih admin untuk tiap formulir. `key` disimpan di
 * kolom formulir.ikon, jadi JANGAN diganti setelah dipakai; menambah baru boleh.
 */
export const DAFTAR_IKON_FORMULIR = [
  { key: "store", label: "Toko / usaha", Ikon: Store },
  { key: "utensils-crossed", label: "Makan & minum", Ikon: UtensilsCrossed },
  { key: "coffee", label: "Kafe", Ikon: Coffee },
  { key: "hotel", label: "Hotel", Ikon: Hotel },
  { key: "bed-double", label: "Penginapan", Ikon: BedDouble },
  { key: "square-parking", label: "Parkir", Ikon: SquareParking },
  { key: "music", label: "Hiburan", Ikon: Music },
  { key: "clapperboard", label: "Pertunjukan / bioskop", Ikon: Clapperboard },
  { key: "ticket", label: "Tiket", Ikon: Ticket },
  { key: "zap", label: "Tenaga listrik", Ikon: Zap },
  { key: "droplets", label: "Air tanah", Ikon: Droplets },
  { key: "megaphone", label: "Reklame", Ikon: Megaphone },
  { key: "bird", label: "Sarang burung walet", Ikon: Bird },
  { key: "mountain", label: "Mineral bukan logam", Ikon: Mountain },
  { key: "fuel", label: "Bahan bakar", Ikon: Fuel },
  { key: "shopping-bag", label: "Perdagangan", Ikon: ShoppingBag },
  { key: "factory", label: "Industri", Ikon: Factory },
  { key: "briefcase", label: "Badan usaha", Ikon: Briefcase },
  { key: "building-2", label: "Gedung", Ikon: Building2 },
  { key: "house", label: "Rumah / bangunan", Ikon: House },
  { key: "landmark", label: "Instansi", Ikon: Landmark },
  { key: "user", label: "Perorangan", Ikon: User },
  { key: "id-card", label: "Identitas", Ikon: IdCard },
  { key: "map-pin", label: "Lokasi", Ikon: MapPin },
  { key: "camera", label: "Foto", Ikon: Camera },
  { key: "file-text", label: "Dokumen", Ikon: FileText },
  { key: "clipboard-list", label: "Daftar isian", Ikon: ClipboardList },
  { key: "receipt", label: "Tagihan", Ikon: Receipt },
  { key: "coins", label: "Omzet", Ikon: Coins },
  { key: "wallet", label: "Pembayaran", Ikon: Wallet },
  { key: "calculator", label: "Perhitungan", Ikon: Calculator },
  { key: "tag", label: "Tarif", Ikon: Tag },
  { key: "shield-check", label: "Verifikasi", Ikon: ShieldCheck },
];

const PETA_IKON_FORMULIR = Object.fromEntries(DAFTAR_IKON_FORMULIR.map((i) => [i.key, i]));

/** Label ikon formulir, "" bila tidak dikenal. */
export const labelIkonFormulir = (ikon) => PETA_IKON_FORMULIR[ikon]?.label || "";

/** Ikon sebuah formulir; `cadangan` (mis. nomor urut) dipakai bila ikon kosong / tidak dikenal. */
export function IkonFormulir({ ikon, cadangan = null, size = 18 }) {
  const Ikon = PETA_IKON_FORMULIR[ikon]?.Ikon;
  return Ikon ? <Ikon size={size} strokeWidth={GARIS} aria-hidden="true" /> : cadangan;
}

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
