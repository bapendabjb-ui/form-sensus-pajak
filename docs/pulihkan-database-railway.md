# Tutorial: Memulihkan Aplikasi Setelah Database Railway Dihapus

Panduan untuk keadaan darurat berikut: **service MySQL di Railway terlanjur dihapus**, dan
sekarang aplikasi Sensus Pajak gagal start — di tab *Deployments* log-nya mengulang pesan
ini terus-menerus:

```
error: Error validating datasource `db`: the URL must start with the protocol `mysql://`.
  -->  server/prisma/schema.prisma:12
```

Ditulis untuk pemula. Ikuti urutannya, jangan lompat langkah.

> ⚠️ **Baca dulu bagian "Apa yang hilang" di bawah sebelum melanjutkan.** Menghapus
> database menghapus jauh lebih banyak daripada kertas kerja saja.

---

## Apa yang sebenarnya terjadi?

Di Railway, variabel `DATABASE_URL` pada service aplikasi **bukan berisi alamat database
secara langsung**. Isinya sebuah *rujukan* — semacam catatan kecil yang bunyinya
"tanyakan alamatnya ke service bernama MySQL":

```
mysql://${{MySQL.MYSQLUSER}}:${{MySQL.MYSQL_ROOT_PASSWORD}}@${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}
```

Bagian `${{MySQL.…}}` itulah rujukannya. Selama service MySQL masih ada, Railway
menggantinya dengan nilai sungguhan sesaat sebelum aplikasi dijalankan.

Begitu service MySQL dihapus, tidak ada lagi yang bisa ditanya. Railway menyerah dan
mengirim `DATABASE_URL` dalam keadaan **kosong**. Prisma menerima teks kosong, melihat
teks itu tidak diawali `mysql://`, lalu menolak jalan. Aplikasi mati, Railway mencoba
menghidupkannya lagi, mati lagi — begitu seterusnya sampai batas percobaan habis.

**Intinya: kodenya tidak rusak sama sekali.** Yang perlu diperbaiki cuma dua hal di
dashboard Railway — buat database baru, lalu arahkan `DATABASE_URL` ke database baru itu.

### Kenapa pesannya membingungkan?

Pesan *"the URL must start with the protocol `mysql://`"* terdengar seperti ada salah
ketik di `schema.prisma`. Padahal berkas itu baik-baik saja. Prisma tidak membedakan
antara "variabelnya salah isi" dan "variabelnya kosong" — keduanya menghasilkan pesan yang
sama persis.

Cara memastikan: kalau variabelnya benar-benar **tidak ada**, pesannya akan berbeda
(`Environment variable not found: DATABASE_URL`). Karena yang muncul bukan itu, berarti
variabelnya ada tetapi isinya kosong — persis seperti yang dijelaskan di atas.

---

## Apa yang hilang, apa yang masih ada

Database berisi **semua** data teks aplikasi, bukan cuma kertas kerja.

| Hilang bersama database                                 | Masih selamat                                 |
| ------------------------------------------------------- | --------------------------------------------- |
| Semua kertas kerja, entri, jawaban, rincian tarif        | Berkas foto di volume (`/app/uploads`)        |
| **Akun admin beserta passwordnya**                       | Kode aplikasi di GitHub                       |
| **Seluruh daftar petugas**                               | Variabel lain di Railway (`JWT_SECRET`, dll.) |
| **Seluruh bank formulir beserta pertanyaannya**          | Domain/URL publik aplikasi                    |
| Catatan foto di database (berkasnya sendiri masih ada)   |                                               |

Tiga baris yang dicetak tebal itulah yang paling terasa. Bank formulir khususnya —
menyusunnya kembali dari nol bisa memakan waktu berjam-jam.

**Bila Anda punya berkas ekspor bank formulir (`.json`)**, siapkan sekarang; dipakai di
Langkah 7. Berkas itu dihasilkan dari menu **Formulir → Ekspor**.

**Bila belum punya**, sebelum lanjut tengok dulu apakah masih ada jalan pulang: periksa
apakah ada *backup* MySQL yang sempat terbuat di Railway, dan cari juga berkas ekspor
Excel/CSV lama di komputer atau Google Drive Anda. Ekspor Excel tidak bisa mengembalikan
bank formulir, tetapi setidaknya isian datanya terarsip. Kalau memang tidak ada apa-apa,
lanjutkan saja — bank formulir harus disusun ulang lewat aplikasi.

---

## Yang perlu disiapkan

- Akses login ke akun **Railway** yang memegang project Sensus Pajak.
- Password admin baru yang kuat (minimal 8 karakter) — siapkan dan catat di tempat aman.
- Berkas ekspor bank formulir `.json`, bila ada.
- Waktu ±20 menit.

Semua langkah di bawah dikerjakan **di browser**, lewat dashboard Railway. Tidak ada
perintah terminal, tidak ada perubahan kode, tidak perlu `git push`.

---

## Langkah 1 — Buat database MySQL yang baru

1. Buka <https://railway.app> → masuk ke project **Sensus Pajak**.
2. Klik tombol **+ New** (pojok kanan atas) → **Database** → **Add MySQL**.
3. Tunggu sampai kotak service database yang baru muncul di kanvas project dan statusnya
   hijau/**Active**. Biasanya kurang dari satu menit.

Sekarang di project Anda ada dua kotak: service **aplikasi** (yang tersambung ke GitHub)
dan service **database** yang baru saja dibuat.

---

## Langkah 2 — Catat nama persis service database

Ini langkah yang paling sering bikin gagal, jadi jangan dilewati.

Klik kotak database yang baru. Lihat namanya di bagian atas. Biasanya **`MySQL`**, tetapi
Railway kadang memberi nama lain seperti `MySQL-7Xk2` bila di project yang sama pernah ada
service bernama `MySQL` sebelumnya.

Tulis nama itu apa adanya — **huruf besar-kecilnya ikut dihitung**. Rujukan
`${{mysql.…}}` tidak akan bekerja bila nama servicenya `MySQL`.

---

## Langkah 3 — Perbaiki `DATABASE_URL` di service aplikasi

1. Kembali ke kanvas project, klik kotak service **aplikasi** (bukan database).
2. Buka tab **Variables**.
3. Cari baris `DATABASE_URL`, klik untuk mengeditnya, lalu **hapus seluruh isi lamanya**.
4. Ketik dua kurung kurawal pembuka: `${{`

   Railway akan memunculkan daftar pilihan otomatis. **Gunakan daftar itu, jangan mengetik
   manual** — dengan memilih dari daftar, nama servicenya dijamin persis benar.

5. Pilih service database Anda, lalu pilih variabel bernama **`MYSQL_URL`**. Hasil akhirnya
   terlihat seperti ini:

   ```
   ${{MySQL.MYSQL_URL}}
   ```

   `MYSQL_URL` adalah alamat sambungan lengkap yang sudah disiapkan Railway — satu
   variabel saja, jadi tidak perlu lagi merangkai username, password, host, dan port satu
   per satu seperti bentuk lama.

6. Klik **Add**/**Update**, lalu klik tombol **Deploy** / **Apply changes** yang muncul di
   atas daftar untuk menyimpan perubahan.

> **Bila `MYSQL_URL` tidak ada di daftar pilihan**, pakai bentuk panjangnya seperti pada
> [README.md](../README.md#3-environment-variables-pada-service-aplikasi) — tetap dengan
> cara memilih dari daftar otomatis untuk setiap bagian `${{…}}`:
>
> ```
> mysql://${{MySQL.MYSQLUSER}}:${{MySQL.MYSQL_ROOT_PASSWORD}}@${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}
> ```

**Jangan** memakai `MYSQL_PUBLIC_URL` di sini. Itu alamat lewat jalur internet publik —
lebih lambat, dan di Railway ikut terhitung sebagai pemakaian jaringan. `MYSQL_URL`
memakai jaringan internal antar-service, yang memang untuk keperluan ini.

---

## Langkah 4 — Periksa variabel lain yang ikut rusak

Masih di tab **Variables** service aplikasi, telusuri daftarnya dari atas ke bawah. Cari
apakah ada variabel **lain** yang isinya masih memuat `${{` dengan nama service database
yang lama. Kalau ada, perbaiki dengan cara yang sama seperti Langkah 3. Pada pemasangan
standar biasanya hanya `DATABASE_URL` yang begini.

Sekalian pastikan variabel-variabel berikut masih terisi:

| Variabel         | Harus berisi                                                          |
| ---------------- | --------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | Password kuat, **minimal 8 karakter**, bukan contoh seperti `admin123` |
| `ADMIN_USERNAME` | Mis. `admin`                                                          |
| `JWT_SECRET`     | String acak panjang                                                   |
| `UPLOAD_DIR`     | `/app/uploads`                                                        |
| `NODE_ENV`       | `production`                                                          |

`ADMIN_PASSWORD` penting sekali di situasi ini. Karena tabel admin ikut terhapus, aplikasi
akan membuat akun admin baru dari variabel ini saat start. Bila isinya kosong atau lemah,
server **sengaja menolak start** dan Anda akan terjebak di kegagalan berikutnya. Isi
dengan password sungguhan sekarang juga, dan catat.

> Ini sekaligus jawaban untuk "nanti login pakai password apa?" — password admin yang baru
> adalah apa pun yang Anda isikan di `ADMIN_PASSWORD` ini.

---

## Langkah 5 — Pastikan migrasi database akan dijalankan

Database yang baru **benar-benar kosong** — belum ada satu tabel pun di dalamnya. Tabel
baru terbentuk kalau perintah `prisma migrate deploy` ikut dijalankan saat start.

1. Service aplikasi → **Settings** → gulir ke bagian **Deploy**.
2. Lihat kolom **Custom Start Command**.

Yang benar adalah salah satu dari dua ini:

- **Kosong** — Railway akan memakai pengaturan dari berkas [railway.json](../railway.json)
  di repo, yang sudah berisi perintah migrasi; atau
- diisi **`npm run railway:start`**.

Kalau isinya `npm start` saja, ganti — perintah itu melewatkan migrasi, dan aplikasi akan
berhasil menyambung ke database lalu mati sedetik kemudian karena tabelnya tidak ada.

---

## Langkah 6 — Deploy ulang dan baca log

1. Service aplikasi → tab **Deployments** → deployment paling atas → menu titik tiga →
   **Redeploy**. (Bila perubahan variabel tadi sudah memicu deployment baru dengan
   sendirinya, cukup tunggu yang itu.)
2. Klik deployment yang sedang berjalan → **View Logs**.

**Tampilan log yang benar** kira-kira begini:

```
> sensus-pajak@1.0.0 railway:start
> prisma migrate deploy && node server/index.js

Prisma schema loaded from server/prisma/schema.prisma
Datasource "db": MySQL database

19 migrations found in prisma/migrations
Applying migration `20260101000000_init`
Applying migration `20260913120000_entri_tim_foto`
...
All migrations have been successfully applied.

[Sensus Pajak] terhubung ke database.
[Sensus Pajak] folder foto: /app/uploads
[Sensus Pajak] akun admin "admin" dibuat dari ADMIN_USERNAME/ADMIN_PASSWORD.
[Sensus Pajak] siap di http://localhost:8080 (production)
```

Tiga hal yang wajib terlihat sebelum Anda menganggapnya beres:

1. Deretan **`Applying migration …`** — inilah tabel-tabel yang sedang dibuat. Ini hanya
   muncul sekali, di deployment pertama setelah database baru dibuat.
2. Baris **`terhubung ke database`**.
3. Baris **`akun admin "…" dibuat`**. Kalau yang tertulis justru *"sudah ada"* padahal
   databasenya baru, berarti `DATABASE_URL` masih menunjuk ke database lain — berhenti dan
   ulangi Langkah 3.

Terakhir, pastikan status deployment berubah menjadi **Active** (hijau).

---

## Langkah 7 — Isi ulang data yang hilang

Aplikasi sudah hidup, tetapi isinya masih kosong melompong. Urutannya:

1. **Login sebagai admin.** Buka alamat publik aplikasi, masuk dengan `ADMIN_USERNAME` dan
   `ADMIN_PASSWORD` dari Langkah 4.

2. **Ganti password lewat aplikasi.** Klik tombol **Akun** (kaki sidebar, atau bilah atas
   di HP) dan pasang password yang Anda kehendaki. Setelah akunnya ada, nilai
   `ADMIN_PASSWORD` di Railway tidak dipakai lagi — tetapi biarkan variabelnya tetap terisi.

3. **Impor bank formulir.** Menu **Formulir** → tombol **Impor** → pilih berkas `.json`
   ekspor Anda. Periksa jumlah formulir dan pertanyaannya sesudah impor.

   Tidak punya berkasnya? Formulir harus disusun ulang manual lewat menu yang sama. Begitu
   selesai, **langsung ekspor ke `.json` dan simpan di Google Drive** supaya kejadian ini
   tidak terulang.

4. **Isi ulang daftar petugas.** Menu **Petugas** → tambahkan satu per satu (nama dan NIP).

5. **Cek nomor kertas kerja.** Buka **Buat kertas kerja** — nomor yang tampil harus
   **00001**. Tidak perlu benar-benar disimpan.

6. **Minta petugas membuka ulang aplikasinya** (tutup lalu buka lagi, atau reload). Draf
   isian lama yang tertinggal di HP mereka akan dibuang otomatis saat itu.

---

## Langkah 8 — Soal foto lama

Berkas foto dari periode sebelumnya masih ada di volume, karena yang Anda hapus adalah
database, bukan volume. Tetapi catatan yang menautkan foto-foto itu ke entri sudah hilang
bersama database, jadi foto-foto tersebut kini **yatim** — tidak ada lagi yang menunjuk
kepadanya dan tidak bisa dibuka dari aplikasi.

Aplikasi membersihkannya sendiri: penyapu foto yatim berjalan saat server start lalu
berulang setiap 6 jam. Di log akan muncul baris seperti:

```
[Sensus Pajak] 3021 berkas foto yatim dibersihkan.
```

Untuk keperluan reset periode baru, ini memang yang diinginkan — tidak ada yang perlu Anda
lakukan. Tetapi bila foto-foto lama itu ternyata masih dibutuhkan, **unduh dulu isi volume
sebelum server sempat menyapunya**. Sadari juga bahwa tautan foto di berkas ekspor lama
tetap tidak akan bisa dibuka, karena catatannya di database sudah hilang.

---

## Bila ada masalah

**Pesan galat `must start with the protocol mysql://` masih muncul persis sama.**
`DATABASE_URL` masih kosong. Penyebab tersering, berurut dari yang paling sering: nama
service di dalam `${{…}}` tidak sama persis dengan nama service database (periksa huruf
besar-kecilnya); perubahan variabel belum di-*apply* (tombol **Deploy** di atas daftar
variabel belum diklik); atau nilainya terlanjur diketik memakai tanda kutip
(`"${{MySQL.MYSQL_URL}}"` — tanda kutipnya harus dibuang). Kembali ke Langkah 3 dan isi
ulang dengan cara memilih dari daftar otomatis.

**`Environment variable not found: DATABASE_URL`.**
Kebalikannya: variabelnya justru terhapus seluruhnya. Buat lagi dari awal di Langkah 3.

**`P1001: Can't reach database server at …`.**
Bentuk `DATABASE_URL` sudah benar, tetapi databasenya tidak bisa dihubungi. Pastikan
service database sudah **Active** (bukan sedang *deploying* atau *crashed*), dan pastikan
Anda memakai `MYSQL_URL` — bukan alamat yang diketik manual dari catatan lama, karena
alamat database yang lama sudah tidak berlaku.

**`Table 'railway.nomor_counter' doesn't exist` atau `The table … does not exist`.**
Sambungan database berhasil, tetapi migrasi belum jalan sehingga tabelnya belum terbentuk.
Kembali ke Langkah 5, betulkan start command-nya, lalu **Redeploy**.

**`ADMIN_PASSWORD wajib diisi di produksi …` dan server berhenti.**
Isi `ADMIN_PASSWORD` di Railway dengan password minimal 8 karakter yang bukan contoh
bawaan, lalu deploy ulang. Lihat Langkah 4.

**Deployment hijau tetapi aplikasi menampilkan halaman error di browser.**
Tekan Ctrl+F5 untuk memuat ulang tanpa cache. Bila masih, periksa **View Logs** — biasanya
ada galat yang tercetak di sana sesaat setelah permintaan masuk.

**Healthcheck gagal / `1/1 replicas never became healthy`.**
Lihat log deployment-nya; hampir selalu ada salah satu galat di atas sebagai penyebab
sesungguhnya. Healthcheck hanya melaporkan akibatnya.

---

## Supaya tidak terulang

Menghapus database **bukan** cara mereset kertas kerja. Proyek ini sudah punya cara yang
benar, yang mengosongkan kertas kerja beserta fotonya tetapi **membiarkan akun admin,
daftar petugas, dan bank formulir tetap utuh**:

```
railway ssh --service <nama-service-aplikasi> node server/scripts/reset-kertas-kerja.js --yakin
```

Panduan lengkapnya: [Tutorial Reset Kertas Kerja](reset-kertas-kerja.md). Tanpa `--yakin`,
skripnya hanya menghitung dan tidak menghapus apa pun — aman untuk dicoba lebih dulu.

Dua kebiasaan kecil yang menyelamatkan banyak waktu:

- **Ekspor bank formulir ke `.json` setiap kali selesai mengubahnya**, lalu simpan di
  Google Drive. Berkasnya kecil, dan justru memulihkan bagian yang paling mahal untuk
  disusun ulang.
- **Buat backup database sebelum tindakan apa pun yang terasa besar**, lewat menu
  *Backups* pada service MySQL di Railway.
