# FormKita

Sistem entry data & kertas kerja untuk administrasi pajak daerah (**PBJT** — Pajak Barang dan
Jasa Tertentu). Admin menyusun **bank formulir**; petugas membuat **kertas kerja** bernomor
otomatis bersama timnya, lalu mengisi **data per formulir** — satu formulir boleh diisi
berkali-kali (mis. beberapa objek) — lengkap dengan **foto**, dan mengekspornya ke CSV.

- **Frontend** — React 18 + Vite, CSS biasa (tanpa framework UI), seluruh antarmuka Bahasa Indonesia
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
11. [Referensi API](#referensi-api)
12. [Deploy ke Railway](#deploy-ke-railway)
13. [Pemecahan masalah](#pemecahan-masalah)

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
4. **Tandai selesai** (minimal satu data), **Ekspor CSV**, atau **Ubah petugas** kapan saja.
   Data yang sudah tersimpan tetap bisa dibuka, diubah, atau dihapus.

---

## Pemakaian di HP

Aplikasi terutama dipakai petugas di lapangan lewat smartphone, jadi tampilannya disusun
untuk HP lebih dulu (desktop tetap memakai sidebar).

- **Navigasi seperti aplikasi** — bilah judul di atas dengan tombol kembali, bilah tab di bawah
  (Beranda, Kertas Kerja, Petugas, Formulir). Layar pengisian menyembunyikan bilah tab supaya
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
- **Konfirmasi** muncul bila meninggalkan isian yang belum disimpan.
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
│   └── src/
│       ├── App.jsx                 sidebar, navigasi, status login
│       ├── api.js                  klien REST, token, unggah foto
│       ├── styles.css
│       ├── lib/
│       │   ├── format.js           format tanggal & ribuan, daftar tipe pertanyaan
│       │   ├── answers.js          konversi nilai UI <-> JSON API, validasi wajib
│       │   ├── ringkas.js          judul & ringkasan data untuk daftar
│       │   ├── router.js           alamat per layar + tombol Kembali HP + konfirmasi keluar
│       │   ├── useMobile.js        deteksi tata letak HP
│       │   └── useOutside.js
│       ├── components/
│       │   ├── CustomSelect.jsx    dropdown kustom (BUKAN <select>)
│       │   ├── DatePicker.jsx      kalender kustom (BUKAN <input type="date">)
│       │   ├── MoneyInput.jsx      nominal berformat ribuan + awalan "Rp"
│       │   ├── FotoInput.jsx       kamera/galeri, perkecil, unggah, pratinjau
│       │   ├── PetugasTim.jsx      penyusun tim petugas 1–8 orang
│       │   ├── Sheet.jsx           lembar pilihan dari bawah layar (HP)
│       │   ├── WilayahInput.jsx    kecamatan & kelurahan bertingkat
│       │   ├── Fields.jsx          semua 11 tipe input pengisian
│       │   └── Icons.jsx, Toast.jsx, Ui.jsx
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
│       ├── auth.js                 bcrypt, JWT, middleware admin, seed admin
│       ├── nomor.js                penomoran 5 digit dalam transaksi
│       ├── answers.js              normalisasi & validasi nilai per tipe
│       ├── entri.js                simpan data: jawaban, rincian tarif, tautan foto
│       ├── foto.js                 simpan/hapus berkas foto + pembersih foto yatim
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

| Aksi                                                   | Perlu login admin |
| ------------------------------------------------------ | :---------------: |
| Dashboard, kertas kerja, isi data, foto, petugas        |        —          |
| **Membuat/mengubah/menghapus formulir**                |       ✅          |

Menu **Formulir** di sidebar bertanda gembok selama belum login.

---

## Skema database

| Tabel                   | Isi                                                                         |
| ----------------------- | --------------------------------------------------------------------------- |
| `admin`                 | `username` unik + `password_hash`                                           |
| `petugas`               | Nama & NIP — sumber dropdown tim petugas                                    |
| `formulir`              | Bank formulir                                                               |
| `pertanyaan`            | `tipe` (11 enum, termasuk `foto` & `wilayah`), `label`, `wajib`, `range_harga`, `urutan` |
| `pertanyaan_opsi`       | Opsi dropdown/radio/checkbox & daftar "Jenis tarif"                         |
| `kertas_kerja`          | `nomor` CHAR(5) **UNIQUE**, `status`                                        |
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
  dalam 24 jam, serta berkas di disk yang tidak lagi tercatat di database.

Berkas disajikan lewat `GET /api/foto/:id`, jadi hanya foto yang tercatat yang bisa diakses.

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

## Referensi API

Semua endpoint berawalan `/api`. Tanda 🔒 = perlu header `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint      | Keterangan                                             |
| ------ | ------------- | ------------------------------------------------------ |
| `POST` | `/auth/login` | `{ username, password }` → `{ token, username }`       |
| `GET`  | `/auth/me`    | 🔒 Verifikasi token                                    |

### Petugas

| Method   | Endpoint       | Keterangan                                   |
| -------- | -------------- | -------------------------------------------- |
| `GET`    | `/petugas`     | Daftar petugas                               |
| `POST`   | `/petugas`     | `{ nama, nip }`                              |
| `PUT`    | `/petugas/:id` | Ubah nama / NIP                              |
| `DELETE` | `/petugas/:id` | **409** bila masih ada di tim kertas kerja   |

### Formulir

| Method   | Endpoint        | Keterangan                                                   |
| -------- | --------------- | ------------------------------------------------------------ |
| `GET`    | `/formulir`     | Daftar ringkas + `jumlahPertanyaan`, `jumlahData`            |
| `GET`    | `/formulir/:id` | Formulir lengkap (pertanyaan + opsi)                         |
| `POST`   | `/formulir`     | 🔒 Simpan formulir beserta pertanyaan & opsinya              |
| `PUT`    | `/formulir/:id` | 🔒 Idem, mempertahankan id pertanyaan yang dikirim ulang     |
| `DELETE` | `/formulir/:id` | 🔒 **409** bila sudah diisi; `?force=true` tetap menghapus   |

### Kertas kerja

| Method   | Endpoint                          | Keterangan                                                |
| -------- | --------------------------------- | --------------------------------------------------------- |
| `GET`    | `/kertas-kerja`                   | Daftar + tim petugas + `jumlahData`                       |
| `GET`    | `/kertas-kerja/nomor-berikutnya`  | Pratinjau nomor + `petugasMaks` (8)                       |
| `POST`   | `/kertas-kerja`                   | `{ petugasIds: [1..8 id] }` → nomor otomatis              |
| `GET`    | `/kertas-kerja/:id`               | Tim petugas, seluruh entri, definisi formulir yang diisi  |
| `PUT`    | `/kertas-kerja/:id/petugas`       | `{ petugasIds }` — ganti tim                              |
| `PUT`    | `/kertas-kerja/:id/status`        | `{ status }` — `selesai` butuh minimal 1 data (**422**)   |
| `POST`   | `/kertas-kerja/:id/entri`         | `{ formulirId, jawaban }` — tambah satu data              |
| `DELETE` | `/kertas-kerja/:id`               | Hapus beserta seluruh data & foto                         |
| `GET`    | `/kertas-kerja/:id/export`        | Unduh CSV                                                 |

### Data (entri)

| Method   | Endpoint     | Keterangan                                    |
| -------- | ------------ | --------------------------------------------- |
| `GET`    | `/entri/:id` | Satu data + formulirnya + nomor kertas kerja  |
| `PUT`    | `/entri/:id` | `{ jawaban }` — ubah data                     |
| `DELETE` | `/entri/:id` | Hapus data beserta fotonya                    |

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

### Bentuk error

Semua error berupa JSON `{ "error": "pesan" }` plus detail bila ada (`errors` pada 422,
`terpakai` pada 409). Status: `400` input tidak valid · `401` perlu login admin · `404` tidak
ditemukan · `409` data masih dipakai · `422` validasi gagal.

### Ekspor CSV

Diawali **BOM UTF-8** agar rapi di Excel. **Satu baris per data.** Kolom: `Nomor`, `Status`,
`Petugas` (nama tim digabung `; `), `NIP`, `Formulir`, `No. data`, `Waktu input`, lalu satu kolom
per pertanyaan berjudul `Judul formulir - Label`. Sel milik formulir lain dibiarkan kosong;
pertanyaan foto berisi tautan lengkap ke fotonya.

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

Untuk mengganti password admin: ubah `ADMIN_PASSWORD` **lalu hapus baris admin lama** di tabel
`admin` (seed hanya berjalan bila username tersebut belum ada).

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
