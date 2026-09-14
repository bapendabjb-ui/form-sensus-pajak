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
