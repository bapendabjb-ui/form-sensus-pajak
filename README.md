# Sensus Pajak

Sistem entry data & kertas kerja untuk administrasi pajak daerah (**PBJT** — Pajak Barang dan
Jasa Tertentu). Admin menyusun **bank formulir**; petugas membuat **kertas kerja** bernomor
otomatis bersama timnya, lalu mengisi **data per formulir** — satu formulir boleh diisi
berkali-kali (mis. beberapa objek) — lengkap dengan **foto**, dan mengekspornya ke CSV.

- **Frontend** — React 18 + Vite, CSS biasa (tanpa framework UI), ikon [Lucide](https://lucide.dev),
  seluruh antarmuka Bahasa Indonesia
- **Backend** — Node.js + Express + Prisma ORM
- **Database** — MySQL 8
- **Auth** — JWT + bcrypt (khusus admin)
- **Deploy** — Railway: 1 service Node (API + hasil build frontend) + 1 database MySQL + 1 volume foto

---

## Daftar isi

1. [Alur pemakaian](#alur-pemakaian) · [Pemakaian di HP](#pemakaian-di-hp)
2. [Struktur repo](#struktur-repo)
3. [Menjalankan secara lokal](#menjalankan-secara-lokal)
4. [Variabel environment](#variabel-environment)
5. [Skrip npm](#skrip-npm)
6. [Hak akses](#hak-akses)
7. [Skema database](#skema-database)
8. [Format JSON jawaban](#format-json-jawaban)
9. [Foto](#foto)
10. [Penomoran anti-duplikat](#penomoran-anti-duplikat)
11. [Lokasi (GPS)](#lokasi-gps)
12. [NIK, NPWP, NOP PBB, RT & RW](#nik-npwp-nop-pbb-rt--rw)
13. [Menyusun urutan formulir & pertanyaan](#menyusun-urutan-formulir--pertanyaan)
14. [Batas aplikasi](#batas-aplikasi)
15. [Referensi API](#referensi-api)
16. [Deploy ke Railway](#deploy-ke-railway)
17. [Pemecahan masalah](#pemecahan-masalah)

---

## Alur pemakaian

1. **Buat kertas kerja** — nomor 5 digit tampil otomatis; pilih **tim petugas 1–8 orang** dari
   data petugas (petugas nomor 1 = penanggung jawab). Petugas yang belum terdaftar bisa
   didaftarkan langsung dari layar ini. Tekan **Buat kertas kerja**.
2. **Isi data per formulir** — halaman kertas kerja menampilkan seluruh bank formulir.
   Pilih formulir → isi → **Simpan**, atau **Simpan & tambah lagi** untuk objek berikutnya
   dengan formulir yang sama. Hanya formulir yang benar-benar diisi yang tersimpan.
3. **Foto** — pertanyaan bertipe foto menyediakan **Ambil foto** (kamera belakang) dan
   **Dari galeri**. Foto diperkecil di browser lalu langsung diunggah.
4. **Susun bank formulir** (admin) — tambah pertanyaan dari bilah **Tambah pertanyaan**, lalu
   seret pegangan ⠿ untuk mengatur urutan formulir maupun urutan pertanyaan di dalamnya.
5. **Tandai selesai** (minimal satu data), atau **Ekspor CSV** kapan saja.
   **Ubah petugas** dan penghapusan memerlukan login admin. Data yang sudah tersimpan tetap
   bisa dibuka dan diubah.

---

## Pemakaian di HP

Aplikasi terutama dipakai petugas di lapangan lewat smartphone, jadi tampilannya disusun
untuk HP lebih dulu (desktop tetap memakai sidebar).

- **Navigasi seperti aplikasi** — bilah judul di atas dengan tombol kembali, bilah tab di bawah
  (Dashboard, Kertas Kerja, Petugas, Formulir). Layar pengisian menyembunyikan bilah tab supaya
  lega, dan bilah tab juga tersembunyi saat papan ketik terbuka.
- **Tombol Kembali HP berfungsi** — tombol/gestur kembali berpindah antar-layar, bukan menutup
  aplikasi. Setiap layar punya alamat sendiri (mis. `/kertas-kerja/12/isi/3`), jadi bisa dimuat
  ulang tanpa kehilangan posisi.
- **Dropdown & kalender sebagai lembar dari bawah layar**, dengan pilihan setinggi jari; daftar
  lebih dari 8 pilihan (mis. kelurahan) punya kotak cari. Tombol Kembali menutup lembarnya.
- **Nyaman disentuh** — teks input 16 px (iPhone tidak memperbesar layar saat mengetik), sasaran
  sentuh 44–48 px, keyboard angka untuk nominal & NIP, dan tombol **Simpan** menempel di dasar
  layar. Tombol Simpan terkunci selama foto masih diunggah.
- **Draf otomatis di perangkat** — isian disimpan ke penyimpanan browser setiap kali berubah. Bila
  halaman tertutup, HP kehabisan baterai, atau sinyal hilang, saat formulir dibuka lagi muncul
  tawaran **Lanjutkan isian**. Draf dihapus setelah data berhasil tersimpan. Foto pada draf yang
  lebih tua dari 20 jam perlu diambil ulang (unggahan yang tak pernah disimpan dibersihkan server
  setelah 24 jam).
- **Dialog milik aplikasi** — konfirmasi hapus dan peringatan "belum disimpan" memakai dialog
  sendiri, bukan `window.confirm` bawaan browser: bahasanya Indonesia, tombolnya setinggi jari
  dan menempel di dasar layar, serta bisa ditutup dengan tombol Kembali HP.
- **Pasang ke layar utama** — Chrome Android: menu ⋮ → *Instal aplikasi / Tambahkan ke layar
  utama*. Safari iPhone: *Bagikan* → *Tambah ke Layar Utama*. Aplikasi lalu terbuka tanpa bilah
  alamat, langsung ke daftar kertas kerja. Fitur ini membutuhkan HTTPS (sudah tersedia di Railway).

> Belum ada mode offline penuh: **menyimpan ke server tetap membutuhkan koneksi**. Tanpa koneksi,
> isian aman sebagai draf di perangkat dan bisa disimpan setelah sinyal kembali.

---

## Struktur repo

Monorepo dengan npm workspaces — satu `npm install` di root menyiapkan keduanya.

```
.
├── client/                         React (Vite)
│   ├── public/                     lambang.webp (sumber) + ikon turunannya, manifest
│   └── src/
│       ├── App.jsx                 sidebar, navigasi, status login
│       ├── api.js                  klien REST, token, unggah foto
│       ├── styles.css
│       ├── lib/
│       │   ├── format.js           format tanggal, ribuan, NIK/NPWP/NOP, daftar tipe pertanyaan
│       │   ├── answers.js          konversi nilai UI <-> JSON API, validasi wajib & panjang digit
│       │   ├── ringkas.js          judul & ringkasan data untuk daftar
│       │   ├── router.js           alamat per layar + tombol Kembali HP + konfirmasi keluar
│       │   ├── admin.js            status login admin untuk komponen dalam
│       │   ├── konfigurasi.js      batas aplikasi dari server (petugasMaks dll.)
│       │   ├── useDragUrut.js      seret (drag & drop) untuk menyusun ulang daftar
│       │   ├── useMobile.js        deteksi tata letak HP
│       │   └── useOutside.js
│       ├── components/
│       │   ├── Icons.jsx           semua ikon (Lucide) + lambang, satu tempat
│       │   ├── CustomSelect.jsx    dropdown kustom (BUKAN <select>)
│       │   ├── DatePicker.jsx      kalender kustom (BUKAN <input type="date">)
│       │   ├── MoneyInput.jsx      nominal berformat ribuan + awalan "Rp"
│       │   ├── FotoInput.jsx       kamera/galeri, perkecil, unggah, pratinjau
│       │   ├── PetugasTim.jsx      penyusun tim petugas 1–8 orang
│       │   ├── LoginAdmin.jsx      kartu login admin (dipakai /masuk & /formulir)
│       │   ├── Sheet.jsx           lembar pilihan dari bawah layar (HP)
│       │   ├── WilayahInput.jsx    kecamatan & kelurahan bertingkat
│       │   ├── LokasiInput.jsx     titik GPS + akurasi
│       │   ├── Dialog.jsx          dialog konfirmasi aplikasi (pengganti window.confirm)
│       │   ├── Fields.jsx          semua 16 tipe input pengisian (termasuk NIK, NPWP, NOP, RT & RW)
│       │   └── Toast.jsx, Ui.jsx
│       └── pages/
│           ├── Dashboard.jsx
│           ├── KertasKerjaPage.jsx daftar · buat · detail · isi data
│           ├── PetugasPage.jsx
│           └── FormulirPage.jsx    login admin + penyusun formulir
│
├── server/                         Express + Prisma
│   ├── index.js                    app, static client/dist, error handler, startup
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/             migrasi SQL siap `migrate deploy`
│   │   └── seed.js                 data contoh (formulir + petugas)
│   └── src/
│       ├── config.js               pembacaan .env + guard produksi
│       ├── batas.js                petugasMaks & fotoMaks - satu sumber untuk klien juga
│       ├── auth.js                 bcrypt, JWT, middleware admin, seed admin
│       ├── nomor.js                penomoran 5 digit dalam transaksi
│       ├── answers.js              normalisasi & validasi nilai per tipe
│       ├── entri.js                simpan data: jawaban, rincian tarif, tautan foto
│       ├── foto.js                 simpan/hapus berkas foto + pembersih foto yatim (per batch)
│       ├── wilayah.js              data kecamatan & kelurahan Kota Banjarbaru
│       ├── bentuk.js               bentuk keluaran JSON bersama
│       ├── format.js               format tanggal/uang + penyusun CSV
│       └── routes/                 auth, petugas, formulir, kertasKerja, entri, foto, dashboard
│
├── uploads/                        foto (lokal; di Railway pakai volume) — tidak di-commit
├── package.json                    workspaces + skrip + path schema Prisma
├── railway.json · nixpacks.toml
└── .env.example
```

---

## Menjalankan secara lokal

### Prasyarat

- Node.js **18.18+** (disarankan 20 LTS)
- MySQL **8**

### 1. Siapkan database MySQL

**Opsi A — MySQL yang terpasang di komputer**

```sql
CREATE DATABASE formkita CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'formkita'@'localhost' IDENTIFIED BY 'formkita';
GRANT ALL PRIVILEGES ON formkita.* TO 'formkita'@'localhost';
FLUSH PRIVILEGES;
```

**Opsi B — Docker (paling cepat)**

```bash
docker run -d --name formkita-mysql \
  -e MYSQL_ROOT_PASSWORD=formkita \
  -e MYSQL_DATABASE=formkita \
  -p 3306:3306 mysql:8.0
```

> Gunakan tag `mysql:8.0`. Tag `mysql:8` kini mengarah ke 8.4 yang sudah membuang
> beberapa opsi server lama.

### 2. Install, konfigurasi, migrasi

```bash
npm install                     # ikut menjalankan prisma generate
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
npx prisma migrate deploy
```

Sesuaikan `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD` di `.env`.

### 3. Jalankan

```bash
npm run dev
```

- Frontend (Vite) — <http://localhost:5173> ← **buka ini**
- Backend (Express) — <http://localhost:4000>

Foto tersimpan di folder `uploads/` di root repo (atau `UPLOAD_DIR`).

### Mode produksi di lokal

```bash
npm run build && npm start      # buka http://localhost:4000
```

### Data contoh

Dengan `SEED_DEMO=true`, saat start pertama pada database kosong aplikasi mengisi 3 formulir
contoh (termasuk pertanyaan foto dan kecamatan & kelurahan) dan 3 petugas. Manual: `npm run db:seed`.

---

## Variabel environment

| Variabel         | Wajib | Default         | Keterangan                                                              |
| ---------------- | :---: | --------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`   |  ✅   | —               | `mysql://user:pass@host:port/db`                                        |
| `JWT_SECRET`     |  ✅   | —               | Penanda tangan token admin. **Server menolak start di produksi tanpa ini.** |
| `JWT_EXPIRES_IN` |       | `12h`           | Masa berlaku token admin                                                |
| `ADMIN_USERNAME` |       | `admin`         | Akun admin yang di-seed saat start pertama                              |
| `ADMIN_PASSWORD` |       | `admin123`      | Password admin (disimpan sebagai hash bcrypt)                           |
| `PORT`           |       | `4000`          | Port HTTP. **Railway meng-inject ini** — jangan di-hardcode             |
| `UPLOAD_DIR`     |       | `./uploads`     | Folder foto. **Di Railway arahkan ke mount path volume.**               |
| `UPLOAD_MAX_MB`  |       | `8`             | Batas ukuran satu foto yang diterima server                             |
| `APP_TIMEZONE`   |       | `Asia/Makassar` | Zona waktu kolom "Waktu input" pada CSV                                 |
| `SEED_DEMO`      |       | `false`         | `true` = isi data contoh bila database kosong                           |
| `CORS_ORIGIN`    |       | —               | Asal frontend saat dev. Kosongkan di produksi (satu origin)             |
| `EPBB_API_URL`   |       | —               | Endpoint cek NOP EPBB, mis. `https://epbb.contoh.go.id/api/nop/cek`. Kosong = tombol **Lihat** tidak tampil |
| `EPBB_API_KEY`   |       | —               | Kunci API EPBB — sama dengan `api_nop_key` di EPBB                       |
| `EPBB_TIMEOUT_MS`|       | `10000`         | Batas tunggu respons EPBB                                               |

---

## Skrip npm

| Perintah                   | Fungsi                                                       |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev`              | Backend + frontend bersamaan (hot reload)                    |
| `npm run build`            | Build frontend ke `client/dist`                              |
| `npm start`                | Jalankan server produksi                                     |
| `npm run prisma:migrate`   | Buat migrasi baru saat skema berubah                         |
| `npm run prisma:deploy`    | Terapkan migrasi (dipakai di Railway)                        |
| `npm run prisma:studio`    | Lihat isi database                                           |
| `npm run db:seed`          | Isi data contoh                                              |

---

## Hak akses

Prinsipnya: **pekerjaan lapangan terbuka, pengelolaan dan penghapusan butuh admin.**
Petugas tidak perlu akun — mereka membuka aplikasi dan langsung bekerja.

| Aksi                                                                         | Perlu login admin |
| ---------------------------------------------------------------------------- | :---------------: |
| Melihat dashboard, kertas kerja, formulir, dan daftar petugas                 |        —          |
| Membuat kertas kerja beserta timnya, menandai selesai                         |        —          |
| Mengisi data, mengubah data, mengunggah & melihat foto, ekspor CSV            |        —          |
| **Mengubah tim petugas kertas kerja yang sudah dibuat**                       |       ✅          |
| **Menambah / mengubah / menghapus petugas**                                   |       ✅          |
| **Menghapus kertas kerja**                                                    |       ✅          |
| **Menghapus data (entri)**                                                    |       ✅          |
| **Membuat / mengubah / menghapus formulir**                                   |       ✅          |

Aksi khusus admin **tidak ditampilkan** selama belum login; di tempatnya muncul
pemberitahuan singkat beserta tombol **Masuk admin**. Menu **Formulir** di sidebar
dan bilah tab bertanda gembok. Login bisa dibuka kapan saja lewat `/masuk`
(tombol **Masuk admin** di kaki sidebar, atau **Masuk** di bilah atas pada HP).

Menyembunyikan tombol hanya untuk kenyamanan — **server memeriksa token pada setiap
aksi khusus admin** dan menjawab `401` bila tidak ada, jadi memanggil API langsung
pun tetap ditolak.

> **Belum tertutup:** `GET /api/foto/:id` masih terbuka dan id-nya berurutan, sehingga
> foto bisa dienumerasi oleh siapa pun yang tahu alamat aplikasinya. Menutupnya
> memerlukan sesi untuk petugas juga (mis. kode akses bersama), karena `<img src>`
> tidak bisa mengirim header `Authorization`.

### Mengubah pembagian ini

Semuanya ditentukan oleh ada-tidaknya middleware `requireAdmin` pada sebuah route.
Misalnya, agar petugas boleh menghapus datanya sendiri, hapus `requireAdmin` dari
`DELETE` di [`server/src/routes/entri.js`](server/src/routes/entri.js) lalu buang
`auth: true` pada `deleteEntri` di [`client/src/api.js`](client/src/api.js).

---

## Skema database

| Tabel                   | Isi                                                                         |
| ----------------------- | --------------------------------------------------------------------------- |
| `admin`                 | `username` unik + `password_hash`                                           |
| `petugas`               | Nama & NIP — sumber dropdown tim petugas                                    |
| `formulir`              | Bank formulir + `ikon` (nama ikon kartu, kosong = nomor) + `urutan` (susunan tampil, diatur admin lewat seret) |
| `pertanyaan`            | `tipe` (19 enum, termasuk `foto`, `wilayah`, `lokasi`, `rtrw`, `luas`, `nik`, `npwp`, `niknpwp`, `telepon` & `nop`), `label`, `keterangan`, `wajib`, `range_harga`, `isi_epbb`, `kolom` (`""`/`kiri`/`kanan`), `urutan` |
| `pertanyaan_opsi`       | Opsi dropdown/radio/checkbox & daftar "Jenis tarif"                         |
| `kertas_kerja`          | `nomor` CHAR(5) **UNIQUE**, `status` (kolom `judul` tidak dipakai lagi)     |
| `kertas_kerja_petugas`  | Tim petugas (1–8), `urutan` 0 = penanggung jawab                            |
| `entri`                 | Satu data: `kertas_kerja_id` + `formulir_id` (boleh berulang)               |
| `jawaban`               | `nilai` JSON, **UNIQUE(entri_id, pertanyaan_id)**                           |
| `rincian_tarif`         | Bentuk ternormalisasi jawaban "rincian tarif" per entri, untuk pelaporan    |
| `foto`                  | Berkas foto: `berkas` (path relatif), `entri_id`, `pertanyaan_id`, `mime`   |
| `nomor_counter`         | Tepat 1 baris (`id = 1`) untuk penomoran                                    |

Perilaku relasi:

- Menghapus **kertas kerja** → entri, jawaban, rincian tarif, dan foto ikut terhapus (termasuk berkasnya).
- Menghapus **entri** → jawaban & fotonya ikut terhapus.
- Menghapus **formulir** → ditolak **409** bila sudah diisi, kecuali `?force=true` (data ikut terhapus).
- Menghapus **petugas** yang masih ada di tim kertas kerja → ditolak **409**.
- Mengubah formulir memakai *update* untuk pertanyaan yang id-nya dikirim ulang, sehingga data
  yang sudah tersimpan tidak hilang saat admin menambah atau mengurutkan ulang pertanyaan.

### Migrasi dari versi sebelumnya

Migrasi `20260915120000_tipe_telepon` menambah satu nilai enum tipe pertanyaan: `telepon`
(satu atau lebih nomor telepon berketerangan, mis. `Pemilik - 081234567890`).

Migrasi `20260915110000_ikon_formulir` menambah kolom `formulir.ikon` (nama ikon Lucide, mis.
`store`; bawaan kosong). Formulir lama tetap menampilkan nomor urut sampai admin memilih ikon.
Daftar ikon yang bisa dipilih ada di `DAFTAR_IKON_FORMULIR` (`client/src/components/Icons.jsx`).

Migrasi `20260915100000_keterangan_pertanyaan` menambah kolom `pertanyaan.keterangan`
(maks. 500 karakter, bawaan kosong) — petunjuk pengisian yang tampil di bawah judul pertanyaan.

Migrasi `20260915090000_tipe_niknpwp` menambah satu nilai enum tipe pertanyaan: `niknpwp`
(NIK dan NPWP dalam satu pertanyaan).

Migrasi `20260914130000_tipe_nop` menambah satu nilai enum tipe pertanyaan: `nop`
(Nomor Objek Pajak PBB, 18 digit).

Migrasi `20260914120000_urutan_formulir_identitas` menambah kolom `formulir.urutan` —
formulir lama diberi nomor urut mengikuti urutan pembuatannya sehingga susunan yang
selama ini tampil tidak berubah — dan menambah tiga nilai enum tipe pertanyaan:
`rtrw`, `nik`, dan `npwp`.

Migrasi `20260914100000_judul_kertas_kerja` menambah kolom `judul` dan mengisinya untuk
kertas kerja lama dengan `"Kertas kerja <nomor>"`, sehingga tidak ada baris yang tampil
tanpa judul di daftar. Judul baru wajib diketik petugas saat membuat.

Migrasi `20260913120000_entri_tim_foto` memindahkan data lama, bukan membuangnya:
petugas tunggal menjadi anggota pertama tim, setiap formulir terpilih yang sudah punya
jawaban menjadi satu entri, dan jawaban serta rincian tarifnya ditautkan ke entri itu.
Kolom `kertas_kerja.nama_objek` dihapus — nama objek kini diisi lewat pertanyaan formulir.

---

## Format JSON jawaban

| Tipe pertanyaan                                           | Bentuk JSON                                       |
| --------------------------------------------------------- | ------------------------------------------------- |
| `text`, `paragraph`, `number`, `date`, `dropdown`, `radio` | string (`"2026-03-07"`, `"1250000"`)             |
| `checkbox`                                                | array string                                      |
| `range`                                                   | `{ "min": angka\|null, "max": angka\|null }`      |
| `linetariff`                                              | array `{ layanan, jenis, harga_min, harga_max }`  |
| `foto`                                                    | array `{ id, nama }`                              |
| `wilayah`                                                 | `{ kecamatan, kode_kecamatan, kelurahan, kode_kelurahan }` |
| `lokasi`                                                  | `{ lat, lon, akurasi, ketinggian, waktu, sumber }` — `sumber` = `"gps"` / `"peta"` |
| `rtrw`                                                    | `{ rt, rw }` — dua string tepat 3 digit (`"007"`) |
| `luas`                                                    | `{ tanah, bangunan }` — m², angka\|null (`0` sah untuk bangunan) |
| `nik`, `npwp`, `nop`                                      | string digit (`"3172010101010001"`)               |
| `niknpwp`                                                 | `{ nik, npwp }` — dua string digit, boleh salah satu kosong |
| `telepon`                                                 | array `{ keterangan, nomor }` — nomor 8–15 digit, boleh diawali `+`, maks. 10 baris |

`harga_max` **null** = harga tunggal; **terisi** = rentang (diatur per baris, hanya bila admin
menyalakan **"Izinkan harga rentang"**). Server selalu menormalkan nilai masuk: string di-`trim`,
nominal menjadi angka, tanggal non-`YYYY-MM-DD` ditolak, dan foto diperiksa kepemilikannya.

---

## Foto

**Alur dua tahap.** Foto diunggah begitu dipilih (`POST /api/foto`) dan belum tertaut ke data
mana pun. Saat data disimpan, id foto dikirim di jawaban lalu ditautkan ke entri tersebut.

- **Diperkecil di browser** — sisi terpanjang maks. 1600 px, JPEG 82%. Hemat kuota petugas.
- **Diperiksa di server** — jenis dikenali dari isi berkas (JPG/PNG/WEBP), bukan dari nama;
  batas `UPLOAD_MAX_MB`; nama berkas diacak; maks. 10 foto per pertanyaan.
- **Tidak bisa dicuri antar-data** — id foto yang sudah milik entri lain diabaikan.
- **Foto yang dilepas** saat mengubah data dihapus dari disk setelah penyimpanan berhasil.
- **Pembersih otomatis** (saat start & tiap 6 jam): menghapus unggahan yang tidak disimpan
  dalam 24 jam, serta berkas di disk yang tidak lagi tercatat di database. Keduanya
  diproses **500 berkas sekali jalan** — disk ditelusuri sambil jalan dan hanya berkas
  yang sudah cukup tua yang ditanyakan ke database, jadi pemakaian memorinya tetap sama
  baik ada seratus foto maupun ratusan ribu. Berkas berumur < 30 menit selalu dilewati
  agar unggahan yang sedang berjalan tidak ikut terhapus.

Berkas disajikan lewat `GET /api/foto/:id`, jadi hanya foto yang tercatat yang bisa diakses.

---

## Lokasi (GPS)

Tipe pertanyaan **Lokasi (GPS / peta)** menyimpan satu titik koordinat beserta akurasinya.

### Memilih titik lewat peta

Selain **Ambil lokasi**, petugas bisa menekan **Pilih di peta** (`PetaLokasi.jsx`, Leaflet) lalu
mengetuk titik atau menggeser penanda. Tersedia peta jalan (OpenStreetMap) dan citra **satelit**
(Esri World Imagery) — berguna untuk menunjuk bangunan yang sinyal GPS-nya buruk.

- Peta dimuat terpisah (`React.lazy`), jadi Leaflet hanya diunduh saat peta dibuka.
- Peta dibuka di titik yang sudah ada; bila masih kosong, di pusat Kota Banjarbaru.
- Titik dari peta tersimpan dengan `sumber: "peta"` dan `akurasi: null`; tampil berlencana
  **Dipilih di peta**, dan di CSV/Excel sebagai `-3.44, 114.84 (dipilih di peta)`.
- Petugas bisa mengambil GPS dulu lalu membetulkannya di peta — penanda ikut pindah ke titik GPS.
- Potongan peta diambil dari internet, jadi **peta butuh koneksi**; Ambil lokasi (GPS) tetap jalan tanpanya.

Akurasi diperoleh dengan **mengamati** posisi, bukan sekali ambil. Pembacaan pertama sebuah
perangkat biasanya berasal dari jaringan seluler/Wi-Fi dan bisa meleset ratusan meter; setelah
beberapa detik GPS mengunci lebih banyak satelit dan angkanya membaik. Karena itu petugas menekan
**Ambil lokasi** lalu:

1. `watchPosition` berjalan dengan `enableHighAccuracy` dan `maximumAge: 0` (tolak posisi cache),
2. tiap pembacaan dibandingkan — hanya yang **paling akurat** yang disimpan,
3. pengamatan berhenti sendiri begitu akurasi **≤ 10 m**, atau setelah **12 detik tanpa perbaikan
   sama sekali** — hitungannya disetel ulang tiap kali angkanya membaik, jadi perangkat yang masih
   menurunkan akurasinya tidak dipotong di tengah jalan (pengaman keras: 60 detik),
4. petugas boleh menekan **Tunggu lebih lama** untuk satu ronde tambahan tanpa kehilangan angka
   terbaik, berhenti lebih awal, atau mengambil ulang di tempat terbuka.

Hasilnya tampil sebagai **dua kartu** — Lintang dan Bujur — masing-masing dengan angka desimal
6 digit (untuk disalin ke aplikasi lain) dan bentuk derajat/menit/detik di bawahnya
(`3°26'21.1" LS`), bentuk yang lazim dibaca di peta cetak dan dokumen. Tombol **Salin koordinat**
menyalin `lat, lon` ke papan klip.

Akurasi ditampilkan sebagai lencana berwarna: hijau ≤ 10 m, kuning ≤ 30 m, merah di atas itu —
jadi petugas tahu kapan hasilnya layak disimpan. Tersedia juga tautan **Buka di peta**.

### Kalau akurasinya mentok kasar (puluhan–ratusan meter)

Sebabnya bisa dibaca dari pola pembacaan yang tampil selama pencarian
(`… terbaik sejauh ini ±87 m · 1 pembacaan`):

| Gejala | Artinya |
| ------ | -------- |
| Akurasi ≥ 50 m dan hanya **1–2 pembacaan** | Hampir pasti **bukan sinyal satelit**, melainkan posisi tebakan dari Wi-Fi / menara seluler. Posisinya tidak pernah berubah, jadi `watchPosition` tidak pernah berbunyi lagi. Inilah yang terjadi di **laptop/PC — perangkatnya memang tidak punya penerima GPS** |
| Akurasi kasar tetapi pembacaannya banyak | GPS sedang bekerja tetapi sinyal satelit tertutup — di dalam ruangan, di bawah atap seng, atau terhalang gedung |

Jadi angka seperti **±87 m dengan "1 pembacaan"** bukan kerusakan aplikasi: itu tanda perangkatnya
tidak sedang memakai satelit. Ujilah dari HP, lewat `https://`, dengan mode akurasi tinggi menyala,
di tempat terbuka — di sana angkanya biasanya turun ke 5–20 m.

Yang tersimpan: `lat` & `lon` (7 desimal ≈ 1 cm), `akurasi` dan `ketinggian` dalam meter,
`waktu` pengambilan, serta `sumber` (`gps` atau `peta`). Server menolak koordinat di luar jangkauan sah (lat ±90, lon ±180) dengan
menganggapnya kosong, sehingga pertanyaan wajib akan gagal validasi. Di CSV, sel berisi
`-3.4456123, 114.8412988 (±8 m)` — bisa langsung ditempel ke aplikasi peta mana pun.

> Geolocation hanya berjalan di **konteks aman**: HTTPS atau `localhost`. Di Railway sudah HTTPS.
> Petugas juga harus mengizinkan akses lokasi saat browser bertanya.

---

## Kecamatan & kelurahan

Tipe pertanyaan **Kecamatan & Kelurahan** memakai data wilayah Kota Banjarbaru di
`server/src/wilayah.js` (5 kecamatan, 20 kelurahan, lengkap dengan kode), disajikan lewat
`GET /api/wilayah`.

- Setelah kecamatan dipilih, daftar kelurahan otomatis hanya berisi kelurahan kecamatan itu.
- Memilih kelurahan lebih dulu langsung mengisi kecamatannya.
- Mengganti kecamatan mengosongkan kelurahan yang tidak lagi cocok.
- Server memvalidasi ulang pasangannya dan menyimpan kodenya (mis. `020` / `001`), jadi kombinasi
  yang tidak cocok tidak pernah tersimpan. Wajib diisi berarti kecamatan **dan** kelurahan terisi.

Untuk menambah atau mengubah wilayah, sunting `server/src/wilayah.js` lalu deploy ulang.

---

## NIK, NPWP, NOP PBB, RT & RW

Lima tipe pertanyaan khusus identitas. Semuanya hanya menerima angka — huruf dan tanda baca
dibuang saat diketik — dan panjang digitnya diperiksa **dua kali**: di browser sebelum kirim
(`client/src/lib/answers.js`) dan lagi di server sebelum simpan (`server/src/answers.js`),
supaya nilai yang salah panjang tidak pernah masuk database.

| Tipe            | Panjang            | Catatan                                                            |
| --------------- | ------------------ | ------------------------------------------------------------------ |
| **NIK**         | tepat **16** digit | Sesuai KTP-el. Ditampilkan berkelompok empat: `3172 0101 0101 0001` |
| **NPWP**        | **15–17** digit    | 15 = format lama, 16 = NPWP baru (memakai NIK), 17 = NITKU          |
| **NIK / NPWP**  | seperti di atas    | Dua kolom bersanding, disimpan sebagai `{ nik, npwp }`. Wajib = minimal salah satu |
| **NOP PBB**     | tepat **18** digit | Nomor Objek Pajak. Ditampilkan `63.72.010.001.002-0123.0`            |
| **RT & RW**     | masing-masing **3** digit | Dua kolom terpisah, disimpan sebagai `{ rt, rw }`            |
| **Luas Tanah & Bangunan** | angka m², desimal koma | Dua kolom bersanding, disimpan `{ tanah, bangunan }`. Wajib = keduanya diisi (bangunan boleh `0`). Di ekspor jadi dua kolom angka |

- Di bawah kolom NIK/NPWP/NOP ada penghitung `12/16 digit` yang berubah kuning selama belum cukup.
- RT/RW yang diketik pendek dilengkapi nol di depan saat kursor pindah kolom — `7` menjadi `007`.
- Mengisi salah satu dari RT atau RW saja ditolak; keduanya harus lengkap. Pertanyaan yang tidak
  ditandai **wajib** boleh dikosongkan sepenuhnya.
- **NIK / NPWP** untuk wajib pajak yang bisa berupa badan usaha (tanpa NIK) atau perorangan (belum
  tentu punya NPWP): bila wajib, cukup salah satu terisi. Kolom yang diisi tetap harus benar
  panjang digitnya. Di ekspor dipecah menjadi dua kolom, `… (NIK)` dan `… (NPWP)`.
- NPWP 15 digit ditampilkan bertanda titik (`09.123.456.7-890.123`) di isian, ringkasan data, dan
  CSV. Titik itu hanya hiasan — yang tersimpan tetap deret digitnya saja.
- NOP dikelompokkan sambil diketik mengikuti susunan resminya — provinsi 2, kabupaten/kota 2,
  kecamatan 3, kelurahan 3, blok 3, nomor urut objek 4, kode khusus 1.

### Cek NOP ke EPBB

Bila `EPBB_API_URL` dan `EPBB_API_KEY` diisi, kolom NOP mendapat tombol **Lihat** (aktif setelah
18 digit lengkap). Tombol itu membuka modal berisi data dari EPBB/SISMIOP: **NOP, Nama WP, Letak Subjek
Pajak, Letak Objek Pajak, Luas Tanah & Bangunan, Status Bayar**. Bila ada SPPT yang belum dibayar, tahun-tahunnya
ditampilkan; bila tidak ada, statusnya **Lunas**.

```
browser ──GET /api/nop/:nop──▶ server Sensus Pajak ──GET {EPBB_API_URL}/{nop} + X-Api-Key──▶ EPBB ──▶ Oracle
```

- Kunci API hanya ada di server; browser tidak pernah melihatnya.
- Endpoint EPBB (`application/controllers/api/Nop.php`) **hanya membaca**: `DAT_OBJEK_PAJAK`,
  `DAT_SUBJEK_PAJAK`, `REF_KECAMATAN`, `REF_KELURAHAN`, `SPPT`.
- "Belum bayar" = `STATUS_PEMBAYARAN_SPPT = 0`, nilai SPPT > 0, mulai tahun `api_nop_tahun_awal`
  (default 2014, sama dengan aturan tunggakan pembayaran bank). SPPT batal (status 2) diabaikan.
- **Isi otomatis ke formulir.** Di editor formulir, pertanyaan yang cocok mendapat pilihan
  **Isi otomatis dari EPBB** (hanya tampil bila formulir punya pertanyaan NOP PBB). Setelah cek NOP,
  modal menampilkan daftar kolom yang akan diisi; petugas menekan **Isi ke Formulir** untuk
  mengonfirmasi. Kolom yang sudah terisi ditandai *(diganti)*. Data yang tidak ada di EPBB
  (mis. RW kosong) tidak menghapus isian petugas.
- **Penanda "Data EPBB".** Kolom yang diisi dari EPBB mendapat label **Data EPBB** di samping
  judul pertanyaan. Penanda ikut tersimpan (`jawaban.dari_epbb`) sehingga tetap tampil saat data
  dibuka lagi, dan **dilepas otomatis begitu petugas mengubah isinya** — label itu berarti isinya
  masih sama persis dengan EPBB.

  | Sumber                                  | Tipe pertanyaan       | Contoh isi                                  |
  | --------------------------------------- | --------------------- | ------------------------------------------- |
  | Nama WP                                 | Teks / Paragraf       | `HJ. SITI AMINAH`                           |
  | Letak Objek Pajak (alamat lengkap)      | Teks / Paragraf       | `JL. MAWAR NO. 5, RT 005/RW 002, KEL. …, KEC. …` |
  | Alamat Objek Pajak (jalan & nomor)      | Teks / Paragraf       | `JL. MAWAR NO. 5`                           |
  | RT & RW Objek Pajak                     | RT & RW               | `005` / `002`                               |
  | Kecamatan & kelurahan Objek Pajak       | Kecamatan & Kelurahan | dari kode kecamatan/kelurahan di NOP        |
  | Letak Subjek Pajak (alamat lengkap)     | Teks / Paragraf       | `JL. A. YANI KM 33 NO. 12, RT 003/RW 001, KEL. …, BANJARBARU` |
  | Alamat Subjek Pajak (jalan & nomor)     | Teks / Paragraf       | `JL. A. YANI KM 33 NO. 12`                  |
  | RT & RW Subjek Pajak                    | RT & RW               | `003` / `001`                               |
  | Kecamatan & kelurahan Subjek Pajak      | Kecamatan & Kelurahan | dicocokkan dari nama kelurahan WP ¹         |
  | Kelurahan & kota Subjek Pajak           | Teks / Paragraf       | `KEL. LOKTABAT UTARA, BANJARBARU`           |
  | Luas tanah & bangunan                   | Luas Tanah & Bangunan | `250,5` / `72`                              |
  | Luas tanah / Luas bangunan              | Angka                 | `250,5`                                     |
  | Status bayar                            | Teks / Paragraf       | `Lunas` atau `Belum bayar: 2023, 2025`      |

  ¹ SISMIOP tidak menyimpan kecamatan wajib pajak, hanya nama kelurahan & kota. Kecamatannya dicari
  dari data wilayah Banjarbaru; wajib pajak yang beralamat di luar Banjarbaru dilewati — pakai
  sumber *Kelurahan & kota Subjek Pajak* pada pertanyaan teks untuk mereka.

- Formulir diisi tanpa login, jadi `/api/nop` dibatasi **60 pengecekan per IP per 10 menit**.
- Pemasangan di EPBB: salin `application/config/api_nop.sample.php` menjadi `api_nop.php`, isi
  `api_nop_key` dengan string acak panjang, set `api_nop_enabled = true`.

---

## Menyusun urutan formulir & pertanyaan

### Tata letak dua kolom

Setiap pertanyaan punya pilihan posisi **Penuh / Kolom kiri / Kolom kanan** (di kaki kartu
pertanyaan). Pertanyaan kiri dan kanan yang berurutan tampil **bersanding** di halaman isi data —
mis. formulir PBB-P2 dengan *Subjek Pajak* di kiri dan *Objek Pajak* di kanan — sedangkan
pertanyaan **Penuh** (NOP, lokasi, foto, catatan) memakai seluruh lebar dan memutus blok kolom.

- **Judul kolom kiri / kanan** diatur per formulir (muncul setelah ada pertanyaan berkolom) dan
  tampil di atas masing-masing kolom. Boleh dikosongkan.
- Di desktop halaman isi data melebar supaya kedua kolom lega. Di HP kolom ditumpuk: kiri dulu,
  lalu kanan.
- Urutan tetap mengikuti susunan pertanyaan; posisi hanya mengatur tampilan, tidak mengubah data
  maupun ekspor.


Urutan diatur admin di halaman **Bank Formulir**, dengan menyeret pegangan ⠿ (`useDragUrut.js`).
Karena memakai *Pointer Events*, bukan HTML5 drag-and-drop, cara ini jalan sama baiknya dengan
tetikus maupun sentuhan layar HP. Halaman ikut tergulir sendiri saat seretan menyentuh tepi layar.

| Yang diurutkan       | Cara simpan                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| **Urutan formulir**  | Langsung dikirim ke server saat dilepas (`PUT /formulir/urutan`); bila gagal, susunan kembali seperti semula |
| **Urutan pertanyaan** | Ikut tersimpan bersama formulir saat menekan **Simpan formulir**         |

Untuk papan ketik dan pembaca layar, pegangan ⠿ bisa difokuskan lalu digeser dengan **panah
atas/bawah**. Daftar pertanyaan juga masih punya tombol ▲ ▼ seperti sebelumnya.

Urutan formulir dipakai konsisten di seluruh aplikasi: daftar bank formulir, daftar formulir di
halaman kertas kerja, pengelompokan data terkumpul, dan urutan kolom pada ekspor CSV.

---

## Penomoran anti-duplikat

Nomor digenerate **di server, dalam satu transaksi** bersama pembuatan barisnya:

```sql
UPDATE nomor_counter SET last_nomor = last_nomor + 1 WHERE id = 1;
SELECT last_nomor FROM nomor_counter WHERE id = 1;   -- -> LPAD 5 digit
```

`UPDATE` mengunci baris counter sampai transaksi selesai, sehingga pembuatan bersamaan tetap
mendapat nomor berbeda. `kertas_kerja.nomor` juga `UNIQUE` sebagai pengaman terakhir. Nomor
di layar "Buat kertas kerja" hanya pratinjau.

---

## Batas aplikasi

Angka batas hanya ditulis sekali, di [`server/src/batas.js`](server/src/batas.js):
`PETUGAS_MAKS` (8) dan `FOTO_MAKS_PER_PERTANYAAN` (10). Klien membacanya lewat
`GET /api/konfigurasi` (dimuat sekali per sesi) sehingga tampilan dan validasi server
tidak pernah berbeda. Untuk mengubahnya, sunting `batas.js` lalu deploy ulang — tidak
ada angka kembar yang perlu ikut diubah.

`client/src/lib/konfigurasi.js` menyimpan nilai sementara yang dipakai hanya selama
jawaban server belum tiba, supaya layar tidak berkedip saat pertama kali dibuka.

---

## Referensi API

Semua endpoint berawalan `/api`. Tanda 🔒 = perlu header `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint      | Keterangan                                             |
| ------ | ------------- | ------------------------------------------------------ |
| `POST` | `/auth/login` | `{ username, password }` → `{ token, username }`       |
| `GET`  | `/auth/me`    | 🔒 Verifikasi token                                    |
| `PUT`  | `/auth/password` | 🔒 `{ passwordLama, passwordBaru }` — ganti password (min. 8 karakter); password lama salah → **400** |

### Petugas

| Method   | Endpoint       | Keterangan                                   |
| -------- | -------------- | -------------------------------------------- |
| `GET`    | `/petugas`     | Daftar petugas                               |
| `POST`   | `/petugas`     | 🔒 `{ nama, nip }`                           |
| `PUT`    | `/petugas/:id` | 🔒 Ubah nama / NIP                           |
| `DELETE` | `/petugas/:id` | 🔒 **409** bila masih ada di tim kertas kerja |

### Formulir

| Method   | Endpoint        | Keterangan                                                   |
| -------- | --------------- | ------------------------------------------------------------ |
| `GET`    | `/formulir`     | Daftar ringkas + `jumlahPertanyaan`, `jumlahData`            |
| `GET`    | `/formulir/:id` | Formulir lengkap (pertanyaan + opsi)                         |
| `POST`   | `/formulir`     | 🔒 Simpan formulir beserta pertanyaan & opsinya              |
| `PUT`    | `/formulir/:id` | 🔒 Idem, mempertahankan id pertanyaan yang dikirim ulang     |
| `PUT`    | `/formulir/urutan` | 🔒 `{ ids: [...] }` — susun ulang urutan tampil bank formulir |
| `DELETE` | `/formulir/:id` | 🔒 **409** bila sudah diisi; `?force=true` tetap menghapus   |
| `GET`    | `/formulir/:id/export`      | Unduh CSV seluruh data formulir ini dari semua kertas kerja |
| `GET`    | `/formulir/:id/export/xlsx` | Idem, format Excel (.xlsx)                                  |

### Kertas kerja

| Method   | Endpoint                          | Keterangan                                                |
| -------- | --------------------------------- | --------------------------------------------------------- |
| `GET`    | `/kertas-kerja`                   | Daftar + tim petugas + `jumlahData`                       |
| `GET`    | `/kertas-kerja/nomor-berikutnya`  | Pratinjau nomor + `petugasMaks` (8)                       |
| `POST`   | `/kertas-kerja`                   | `{ petugasIds: [1..8 id] }` → nomor otomatis              |
| `GET`    | `/kertas-kerja/:id`               | Tim petugas, seluruh entri, definisi formulir yang diisi  |
| `PUT`    | `/kertas-kerja/:id/petugas`       | 🔒 `{ petugasIds }` — ganti tim                           |
| `PUT`    | `/kertas-kerja/:id/status`        | `{ status }` — `selesai` butuh minimal 1 data (**422**)   |
| `POST`   | `/kertas-kerja/:id/entri`         | `{ formulirId, jawaban }` — tambah satu data              |
| `DELETE` | `/kertas-kerja/:id`               | 🔒 Hapus beserta seluruh data & foto                      |
| `GET`    | `/kertas-kerja/:id/export`        | Unduh CSV; `?formulir=<id>` = hanya satu formulir         |
| `GET`    | `/kertas-kerja/:id/export/xlsx`   | Unduh Excel (.xlsx), isi sama dengan CSV; `?formulir=<id>` idem |

### Data (entri)

| Method   | Endpoint     | Keterangan                                    |
| -------- | ------------ | --------------------------------------------- |
| `GET`    | `/entri/:id` | Satu data + formulirnya + nomor kertas kerja  |
| `PUT`    | `/entri/:id` | `{ jawaban }` — ubah data                     |
| `DELETE` | `/entri/:id` | 🔒 Hapus data beserta fotonya                 |

Body `jawaban` berbentuk `{ "<pertanyaanId>": nilai }` (lihat format di atas). Kolom wajib
**selalu** divalidasi saat menyimpan data; bila ada yang kosong server menjawab **422**
`{ "error": "...", "errors": { "<pertanyaanId>": "Kolom ini wajib diisi." } }` tanpa menyimpan apa pun.

### Foto

| Method | Endpoint     | Keterangan                                                       |
| ------ | ------------ | ---------------------------------------------------------------- |
| `POST` | `/foto`      | multipart, field `berkas` → `{ id, nama, url, ukuran }`          |
| `GET`  | `/foto/:id`  | Berkas gambar                                                    |

### Dashboard

| Method | Endpoint           | Keterangan                                                                        |
| ------ | ------------------ | --------------------------------------------------------------------------------- |
| `GET`  | `/dashboard/stats` | Kertas kerja, selesai, data, foto, formulir, petugas + 5 kertas kerja terbaru     |
| `GET`  | `/health`          | Health check (dipakai Railway)                                                    |
| `GET`  | `/konfigurasi`     | Batas aplikasi: `petugasMaks`, `fotoMaksPerPertanyaan`, `uploadMaksMb`, `cekNop`  |
| `GET`  | `/wilayah`         | Kecamatan & kelurahan Kota Banjarbaru                                             |

### Cek NOP

| Method | Endpoint     | Keterangan                                                                                          |
| ------ | ------------ | --------------------------------------------------------------------------------------------------- |
| `GET`  | `/nop/:nop`  | `{ nop, namaWp, letakSp, letakOp, rinciOp, luasTanah, luasBangunan, belumBayar: ["2023"] }` · `404` tidak terdaftar · `429` terlalu sering · `502` EPBB bermasalah · `503` belum dikonfigurasi |

### Bentuk error

Semua error berupa JSON `{ "error": "pesan" }` plus detail bila ada (`errors` pada 422,
`terpakai` pada 409). Status: `400` input tidak valid · `401` perlu login admin · `404` tidak
ditemukan · `409` data masih dipakai · `422` validasi gagal.

### Ekspor CSV & Excel

Keduanya disusun di `server/src/ekspor.js` dengan isi yang sama. Tersedia tiga cakupan:

| Cakupan | Tombol | Nama berkas |
| --- | --- | --- |
| Satu kertas kerja, semua formulir | **Ekspor Excel / CSV** di halaman kertas kerja (atau daftar kertas kerja) | `kertas-kerja-00012.xlsx` |
| Satu kertas kerja, satu formulir | **Excel / CSV** di judul grup formulir pada *Data terkumpul* | `kertas-kerja-00012-identitas-wajib-pajak.xlsx` |
| Satu formulir, semua kertas kerja | **Excel / CSV** di baris formulir pada Bank Formulir (bila sudah ada data) | `formulir-identitas-wajib-pajak.xlsx` |

Ketiga cakupan juga tersedia di halaman **Ekspor** (`/ekspor`, `EksporPage.jsx`, menu tersendiri
di sidebar & bilah tab HP): pilih kertas kerja lalu *Semua formulir* atau satu formulir, atau pilih
formulir untuk seluruh kertas kerja, kemudian **Unduh Excel** / **Unduh CSV**.

Ekspor per formulir diurutkan menurut nomor kertas kerja; kolom `Nomor`, `Status`, `Petugas`, dan
`NIP` mengikuti kertas kerja masing-masing baris. **Satu baris per data.** Kolom:
`Nomor`, `Status`, `Petugas` (nama tim digabung `; `), `NIP`, `Formulir`, `No. data`, `Waktu input`,
lalu satu kolom per pertanyaan berjudul `Judul formulir - Label` (pertanyaan NIK / NPWP menjadi dua
kolom). Sel milik formulir lain dibiarkan kosong; pertanyaan foto berisi tautan lengkap ke fotonya.

- **CSV** diawali **BOM UTF-8** agar rapi saat dibuka di Excel.
- **Excel (.xlsx)** memakai `exceljs`: baris judul tebal dan dibekukan, filter otomatis, lebar kolom
  menyesuaikan isi. Jawaban angka tersimpan sebagai angka (bisa dijumlah); NIK, NPWP, dan NOP tetap
  teks supaya tidak berubah menjadi `3,17E+15`.

---

## Deploy ke Railway

### 1. Project, database, service

1. Buat project di [Railway](https://railway.app) → **+ New → Database → MySQL**.
2. **+ New → GitHub Repo**, pilih repo ini. Railway memakai `railway.json` + `nixpacks.toml`:
   build `npm run build`, start `npx prisma migrate deploy && node server/index.js`,
   healthcheck `/api/health`.

### 2. Volume untuk foto (wajib)

Service aplikasi → **Settings → Volumes → New Volume**, mount path **`/app/uploads`**.

> Tanpa volume, **seluruh foto hilang setiap deploy ulang atau restart**, karena filesystem
> container bersifat sementara. Data teks tetap aman di MySQL. Karena volume menempel pada satu
> instance, **jangan menaikkan replica di atas 1**.

### 3. Environment variables pada service aplikasi

```
DATABASE_URL   = mysql://${{MySQL.MYSQLUSER}}:${{MySQL.MYSQL_ROOT_PASSWORD}}@${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}
JWT_SECRET     = <string acak panjang>
ADMIN_USERNAME = admin
ADMIN_PASSWORD = <password kuat>
UPLOAD_DIR     = /app/uploads
NODE_ENV       = production
```

- Ganti `MySQL` pada `${{MySQL.…}}` bila nama service database berbeda.
- **Jangan** set `PORT` — Railway meng-inject sendiri.
- Biarkan `CORS_ORIGIN` kosong.

### 4. Deploy

Saat start: migrasi dijalankan, akun admin di-seed (bila belum ada), counter nomor disiapkan,
folder foto dibuat, dan pembersih foto yatim berjalan. Buat URL publik lewat
**Settings → Networking → Generate Domain**. HTTPS dari Railway juga membuat tombol
**Ambil foto** membuka kamera dengan lancar di HP.

`ADMIN_PASSWORD` hanya dipakai saat akun admin **belum ada**. Setelah itu:

- **Ganti password** — login admin → tombol **Akun** (kaki sidebar, atau bilah atas di HP) →
  isi password lama & baru. Kolom password punya tombol mata untuk menampilkan isian.
- **Lupa password** — reset langsung di container aplikasi (password acak dicetak sekali):

  ```
  railway ssh --service <nama-service-aplikasi> node server/scripts/reset-admin.js
  ```

  Tambahkan `[username] [passwordBaru]` untuk menentukan sendiri. Secara lokal:
  `node server/scripts/reset-admin.js`.

### Backup

Cadangkan **database** (tab *Data* pada service MySQL, atau `mysqldump` dengan
`MYSQL_PUBLIC_URL`) **dan isi volume foto**.

---

## Pemecahan masalah

**`Environment variable not found: DATABASE_URL`** — `.env` belum ada, atau perintah Prisma
tidak dijalankan dari root repo.

**`Can't reach database server`** — MySQL belum berjalan atau kredensial salah.

**`Build frontend belum tersedia` di port 4000** — jalankan `npm run build`, atau pakai
`npm run dev` dan buka port 5173.

**`JWT_SECRET wajib diisi di produksi`** — set variabelnya.

**Foto hilang setelah deploy** — volume belum dipasang, atau `UPLOAD_DIR` tidak menunjuk ke
mount path volume.

**"Format foto tidak didukung"** — foto HEIC dari iPhone hanya bisa dikonversi otomatis di
Safari. Di browser lain, atur kamera iPhone ke *Most Compatible* (JPEG).

**Tombol "Tandai selesai" nonaktif** — kertas kerja belum berisi satu data pun.

**Nomor kertas kerja melompat** — wajar bila ada pembuatan yang gagal setelah nomor diambil;
counter tidak pernah dimundurkan demi menjaga keunikan.
