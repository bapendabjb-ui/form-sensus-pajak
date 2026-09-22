# Tutorial: Reset Kertas Kerja di Produksi

Panduan langkah demi langkah untuk mengosongkan seluruh kertas kerja di server produksi
(Railway), sehingga penomoran mulai lagi dari **00001**. Ditulis untuk pemula — ikuti
urutannya, jangan lompat langkah.

> ⚠️ **Reset tidak bisa dibatalkan.** Setelah dijalankan, data yang terhapus hanya bisa
> kembali dari cadangan (backup). Jangan lewati Langkah 3.

---

## Apa yang terjadi saat reset?

| Dihapus                                                      | Tetap ada                         |
| ------------------------------------------------------------ | --------------------------------- |
| Semua kertas kerja beserta tim petugasnya                    | Akun admin (dan password-nya)     |
| Semua data yang diisi (jawaban pertanyaan, rincian tarif)    | Daftar petugas                    |
| Semua foto — catatannya di database **dan** berkasnya        | Bank formulir beserta pertanyaan  |
| Counter nomor → kertas kerja berikutnya bernomor **00001**   |                                   |
| Draf isian yang tertinggal di HP/laptop petugas *(lihat catatan di bawah)* |                     |

**Tentang draf di HP petugas.** Isian yang belum disimpan tersimpan di browser perangkat
masing-masing petugas, bukan di server. Setelah reset, draf itu otomatis dibuang **saat
petugas membuka atau me-reload aplikasi**. Petugas tidak perlu melakukan apa pun selain
membuka ulang aplikasinya.

---

## Yang perlu disiapkan

- Laptop/PC Windows dengan **Node.js** dan **Git** (sudah terpasang bila Anda biasa
  menjalankan proyek ini).
- Akses login ke akun **Railway** yang memegang project Sensus Pajak.
- Akun **admin** aplikasi Sensus Pajak.
- Waktu ±30 menit, **saat tidak ada petugas yang sedang mengisi data** (mis. malam hari).

Semua perintah di bawah diketik di **terminal** — di VS Code: menu **Terminal → New
Terminal**. Ketik perintahnya, lalu tekan **Enter**.

---

## Langkah 1 — Kirim pembaruan kode ke produksi

Fitur reset ini baru ada di kode lokal Anda. Server produksi harus diperbarui dulu.

1. Buka terminal di folder proyek, lalu kirim kode ke GitHub:

   ```
   git push origin main
   ```

2. Railway otomatis membangun ulang aplikasi. Buka <https://railway.app> → project Sensus
   Pajak → klik service **aplikasi** (bukan MySQL) → tab **Deployments**.
3. Tunggu sampai deployment paling atas berstatus **Active / Success** (hijau). Biasanya
   2–5 menit.

   Bila statusnya **Failed** (merah): klik deployment itu → **View Logs**, lalu jangan
   lanjutkan. Aplikasi versi lama tetap berjalan, tidak ada data yang hilang.

4. Buka aplikasinya di browser dan pastikan masih bisa dipakai seperti biasa.

---

## Langkah 2 — Pasang & hubungkan Railway CLI (sekali saja)

Railway CLI adalah alat untuk menjalankan perintah langsung di server Railway dari terminal.

1. Pasang:

   ```
   npm install -g @railway/cli
   ```

2. Login — browser akan terbuka, klik **Authorize**:

   ```
   railway login
   ```

3. Hubungkan folder proyek ke project Railway:

   ```
   railway link
   ```

   Pilih dengan tombol panah lalu **Enter**: *workspace* Anda → project **Sensus Pajak** →
   environment **production** → service **aplikasi** (bukan MySQL).

4. Cek sudah benar:

   ```
   railway status
   ```

   Pastikan nama project, environment, dan service yang tampil sesuai.

---

## Langkah 3 — Buat cadangan (backup)

Lakukan **minimal cara A**. Cara B dan C sangat disarankan bila tersedia.

**A. Ekspor data dari aplikasi (paling mudah).**
Login sebagai admin → menu **Ekspor** → unduh **Excel** (dan/atau CSV). Simpan berkasnya di
tempat aman, mis. Google Drive. Ini arsip isian yang bisa dibaca manusia.

> Tautan foto di dalam berkas ekspor **tidak akan bisa dibuka lagi** setelah reset, karena
> fotonya ikut terhapus. Bila fotonya perlu disimpan, lakukan cara B.

**B. Backup volume di Railway (database + foto).**
Di dashboard Railway, buka service **MySQL** → cari tab/bagian **Backups** → **Create
Backup**. Ulangi pada service **aplikasi** (volume fotonya ada di `/app/uploads`). Tunggu
sampai backup tercatat di daftar. Bila menu *Backups* tidak ada di paket Railway Anda,
lanjut ke cara C.

**C. Salinan database dengan `mysqldump`** (bila MySQL terpasang di laptop).
Di Railway, service **MySQL** → tab **Variables** → salin nilai `MYSQL_PUBLIC_URL`, bentuknya
`mysql://USER:PASSWORD@HOST:PORT/DATABASE`. Lalu jalankan (ganti huruf besar dengan bagian
dari URL tadi):

```
mysqldump -h HOST -P PORT -u USER -p DATABASE > backup-sebelum-reset.sql
```

Masukkan PASSWORD saat diminta. Pastikan berkas `backup-sebelum-reset.sql` terbentuk dan
ukurannya tidak 0 KB.

---

## Langkah 4 — Beri tahu petugas

Kirim pesan ke grup petugas, contoh:

> Mulai pukul 20.00 aplikasi Sensus Pajak akan dikosongkan untuk periode baru. Mohon simpan
> semua isian sebelum pukul 20.00 dan jangan mengisi data sampai ada kabar berikutnya.
> Setelah itu, buka ulang aplikasinya (tutup lalu buka lagi / reload).

Ini penting: foto yang diunggah petugas **selama** reset berjalan bisa ikut terhapus.

---

## Langkah 5 — Uji coba (tidak menghapus apa pun)

1. Masuk ke server aplikasi:

   ```
   railway ssh
   ```

   Tampilan terminal berubah (muncul tanda seperti `root@...:/app#`). Artinya perintah
   berikutnya berjalan **di server produksi**, bukan di laptop.

2. Jalankan mode uji:

   ```
   node server/scripts/reset-kertas-kerja.js
   ```

3. Contoh hasil:

   ```
   Database : mysql://***@mysql.railway.internal:3306/railway
   Foto     : /app/uploads
   Akan dihapus: 128 kertas kerja, 1540 entri, 23100 jawaban, 3021 foto.
   Mode uji - tidak ada yang dihapus. Tambahkan --yakin untuk menjalankan.
   ```

   Periksa:
   - Jumlahnya masuk akal (kira-kira sama dengan yang terlihat di Dashboard aplikasi).
   - Baris **Foto** menunjuk ke `/app/uploads` (folder volume). Bila berbeda, **berhenti**
     dan periksa variabel `UPLOAD_DIR` di service aplikasi.

---

## Langkah 6 — Jalankan reset

Masih di dalam `railway ssh`, jalankan:

```
node server/scripts/reset-kertas-kerja.js --yakin
```

Hasil yang benar:

```
Akan dihapus: 128 kertas kerja, 1540 entri, 23100 jawaban, 3021 foto.
Data kertas kerja dihapus, counter nomor kembali ke 0, draf di perangkat petugas akan dibuang.
Folder foto dikosongkan (1 item teratas).
```

Keluar dari server:

```
exit
```

---

## Langkah 7 — Periksa hasilnya

1. Buka aplikasi di browser, lalu **reload** (Ctrl+F5 di laptop, tarik ke bawah di HP).
2. **Dashboard** menunjukkan 0 kertas kerja; menu **Kertas Kerja** kosong.
3. Menu **Petugas** dan **Formulir** (admin) masih lengkap.
4. Buka **Buat kertas kerja** — nomor yang tampil adalah **00001**. Tidak perlu benar-benar
   membuatnya bila belum dibutuhkan.
5. Kabari petugas bahwa aplikasi siap dipakai dan minta mereka membuka ulang aplikasinya.

Selesai. 🎉

---

## Bila ada masalah

**`railway: command not found` / `'railway' is not recognized`** — Railway CLI belum
terpasang atau terminal perlu dibuka ulang. Ulangi Langkah 2, lalu tutup dan buka lagi
terminalnya.

**`Cannot find module '.../reset-kertas-kerja.js'`** — kode baru belum ter-deploy. Kembali
ke Langkah 1 dan pastikan deployment terbaru berstatus *Active*.

**`Unknown column 'periode'` / `The column periode does not exist`** — migrasi database
belum berjalan. Biasanya karena deployment gagal; periksa log di tab *Deployments*.

**`Reset gagal: ...` dengan pesan lain** — bila pesan ini muncul **sebelum** baris *"Data
kertas kerja dihapus"*, database tidak berubah sama sekali: penghapusannya berjalan sebagai
satu transaksi (semua atau tidak sama sekali). Salin pesannya dan periksa sebelum mencoba
lagi. Menjalankan ulang skrip setelah reset berhasil juga aman — hanya menghapus yang masih
tersisa. Bila pesannya muncul **sesudah** baris itu, database sudah bersih dan yang gagal
hanya pengosongan folder foto; berkas yang tersisa dibersihkan otomatis oleh aplikasi saat
server start dan setiap 6 jam.

**`railway ssh` masuk ke service yang salah** — keluar dengan `exit`, lalu jalankan
`railway ssh --service <nama-service-aplikasi>`.

**Petugas masih melihat draf lama** — minta petugas menutup lalu membuka ulang aplikasi
(atau reload). Draf dibuang saat aplikasi dimuat ulang, bukan saat sedang terbuka.

**Perlu mengembalikan data** — pulihkan dari backup Langkah 3 (cara B lewat menu *Backups*
Railway → **Restore**, atau cara C dengan `mysql ... < backup-sebelum-reset.sql`). Setelah
database dipulihkan, restart service aplikasi; counter nomor otomatis menyesuaikan ke
nomor tertinggi yang ada.
