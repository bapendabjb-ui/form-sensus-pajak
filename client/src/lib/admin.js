import { createContext, useContext } from "react";

/**
 * Status login admin, disebarkan dari App agar komponen dalam (mis. tombol
 * hapus dan penyusun tim petugas) tahu apakah aksi khusus admin boleh tampil.
 *
 * Ini hanya untuk tampilan. Server tetap memeriksa token pada setiap aksi
 * khusus admin, jadi menyembunyikan tombol bukan satu-satunya pengaman.
 */
export const AdminContext = createContext(false);

export const useAdmin = () => useContext(AdminContext);

/**
 * Pemakai yang sedang masuk: { role: "admin" | "petugas" | "pejabat", username, nama, petugasId? }
 * atau null. Dipakai untuk mengisi otomatis nama petugas (mis. tim kertas kerja
 * baru, pengaju hapus) - sama seperti AdminContext, hanya untuk tampilan.
 */
export const SesiContext = createContext(null);

export const useSesi = () => useContext(SesiContext);

/**
 * Akun pejabat: hanya melihat. Tombol yang mengubah data disembunyikan;
 * server tetap menolak setiap permintaan tulis dari akun ini.
 */
export const useHanyaLihat = () => useContext(SesiContext)?.role === "pejabat";
