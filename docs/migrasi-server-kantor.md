# Tutorial: Memindahkan Sensus Pajak dari Railway ke Server Kantor

Panduan memindahkan aplikasi Sensus Pajak dari Railway ke server kantor, yaitu server aaPanel
yang juga menjalankan SIP dan EPBB. Ditulis untuk pemula. Ikuti urutannya dan jangan lompat
langkah.

**Database di server kantor dimulai dari nol.** Kertas kerja, isian, dan foto di Railway
**tidak** disalin. Yang dibawa hanya **susunan kerja**, lewat fitur ekspor/impor aplikasi:

| Dibawa ke server kantor                        | Tidak dibawa (tetap di Railway sebagai arsip)       |
| ---------------------------------------------- | --------------------------------------------------- |
| Bank formulir beserta pertanyaannya (Langkah 6) | Kertas kerja, isian data, foto                      |
| Daftar petugas (Langkah 6)                      | Password admin lama. Admin dibuat baru (Langkah 5)  |
| *Opsional:* nomor kertas kerja terakhir         | Draf yang belum disimpan di HP petugas              |

Bila data lama ternyata perlu disimpan utuh sebagai arsip, lihat
[Lampiran: arsip data Railway](#lampiran-arsip-data-railway) **sebelum** Railway ditutup.

Railway **tidak dihapus** sampai server baru terbukti lancar, jadi selalu ada jalan kembali.

---

## Gambaran sebelum dan sesudah

|                    | Railway (sekarang)                         | Server kantor (tujuan)                                  |
| ------------------ | ------------------------------------------ | ------------------------------------------------------- |
| Proses aplikasi    | Dijalankan Railway                         | Dijalankan **PM2**                                      |
| Alamat             | `https://….up.railway.app`                 | `https://sensuspajak.banjarbarukota.go.id` *(contoh)*    |
| HTTPS              | Otomatis dari Railway                      | Let's Encrypt lewat aaPanel                             |
| Database           | Service MySQL Railway                      | MariaDB aaPanel di server yang sama                     |
| Foto               | Volume Railway `/app/uploads`              | Folder `uploads/` di dalam folder aplikasi              |
| Deploy kode baru   | Otomatis setiap push ke GitHub             | Jalankan `bash deploy/perbarui.sh` di server            |
| Backup             | Manual                                     | Jadwal backup aaPanel (Langkah 9)                        |

---

## Kenapa memakai subdomain sendiri, bukan `/sensus` seperti `/sip`?

SIP dan EPBB dibuka lewat `http://36.91.46.42/sip` dan `http://36.91.46.42/epbb`. Sensus Pajak
**tidak bisa** ditaruh dengan cara yang sama, karena dua alasan:

1. **GPS hanya berjalan di HTTPS.** Browser menolak memberi lokasi ke halaman `http://`.
   Sertifikat HTTPS dikeluarkan untuk **nama domain**, bukan untuk alamat IP. Tanpa domain,
   tombol ambil lokasi di HP petugas tidak akan berfungsi.
2. Aplikasi ini dibangun untuk berjalan di **akar alamat** (`/`). Memindahkannya ke `/sensus`
   butuh perubahan kode di banyak tempat.

Karena itu, mintalah subdomain `.go.id` ke **Diskominfo Banjarbaru** dengan **record A** yang
mengarah ke IP publik server kantor (IP yang sama dengan SIP/EPBB). Proses ini bisa makan waktu,
jadi **ajukan sekarang**. Langkah 1–6 tidak perlu menunggu subdomain.

---

## Yang perlu disiapkan

- [ ] Akses **aaPanel** server kantor (alamat panel, username, password).
- [ ] Akses **SSH / Terminal** ke server. Terminal di dalam aaPanel juga bisa dipakai.
- [ ] **Password root MySQL** server: aaPanel → **Databases** → **Root password**.
- [ ] Akses aplikasi Sensus Pajak di Railway sebagai admin, untuk mengekspor bank formulir dan
      daftar petugas.
- [ ] Akses dashboard **Railway**, untuk menyalin `EPBB_API_URL` dan `EPBB_API_KEY`.
- [ ] Akses repo GitHub `bapendabjb-ui/form-sensus-pajak`. Bila repo privat, siapkan
      *Personal Access Token* (GitHub → Settings → Developer settings → Tokens) dengan izin baca.
- [ ] Surat permohonan subdomain ke Diskominfo (lihat bagian di atas).

> Nama menu aaPanel bisa sedikit berbeda antarversi dan antarbahasa (Inggris/Mandarin).
> Yang dipakai di panduan ini adalah nama berbahasa Inggris.

---

## Langkah 1 — Periksa server ✅

Sudah diperiksa pada 25 September 2026:

| Pemeriksaan    | Hasil                  | Keterangan                                   |
| -------------- | ---------------------- | -------------------------------------------- |
| Sistem operasi | Ubuntu 24.04.3 LTS     | Didukung                                     |
| glibc          | 2.39                   | Node.js 20 bisa berjalan                     |
| Database       | MariaDB 10.11.10       | Didukung; semua migrasi aplikasi sudah diuji di MariaDB |
| Port 4000      | Kosong                 | Dipakai aplikasi ini (`PORT=4000`)           |
| Disk `/www`    | Sisa 149 GB            | Cukup                                        |

Server menampilkan pesan *System restart required*. Restart juga mematikan SIP dan EPBB
sebentar, jadi lakukan di luar jam kerja, **bukan** di tengah langkah-langkah ini.

Untuk memeriksa ulang (misalnya di server lain):

```bash
cat /etc/os-release | head -3; ldd --version | head -1; mysql --version
ss -ltnp | grep -E ':(4000|4100) '; df -h /www
```

---

## Langkah 2 — Pasang Node.js 20 dan PM2

Node.js dipasang lewat Terminal dari repositori resmi NodeSource. Jangan pakai App Store
aaPanel, karena di server kantor cara itu gagal. Pasang versi **20**, sama dengan Railway:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v          # harus v20.x

npm install -g pm2
pm2 -v
pm2 startup      # ikuti perintah yang dicetaknya, agar PM2 ikut hidup setelah server reboot
```

**Bila perintah di atas gagal**, pasang dari berkas biner resmi. Cara ini tidak bergantung pada
repositori paket:

```bash
cd /opt
curl -fsSLO https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz
tar -xJf node-v20.18.1-linux-x64.tar.xz
for b in node npm npx; do ln -sf /opt/node-v20.18.1-linux-x64/bin/$b /usr/local/bin/$b; done
node -v

npm install -g pm2
ln -sf /opt/node-v20.18.1-linux-x64/bin/pm2 /usr/local/bin/pm2
pm2 startup
```

---

## Langkah 3 — Ambil kode dan isi `.env`

```bash
cd /www/wwwroot
git clone https://github.com/bapendabjb-ui/form-sensus-pajak.git sensus-pajak
cd sensus-pajak
cp .env.example .env
```

Buat dua nilai rahasia baru, lalu **catat** hasilnya:

```bash
openssl rand -hex 48     # untuk JWT_SECRET
openssl rand -base64 18  # usulan password admin (atau buat sendiri, minimal 8 karakter)
```

Buka `.env` dengan `nano .env`, lalu isi seperti ini. Ganti semua yang bertanda `<…>`, dan
**biarkan `DATABASE_URL` apa adanya**, karena baris itu ditulis otomatis di Langkah 4:

```ini
NODE_ENV=production

# Rahasia penanda tangan login. Hasil openssl rand -hex 48 di atas.
JWT_SECRET="<hasil-openssl-hex-48>"
JWT_EXPIRES_IN="12h"

# Akun admin dibuat dari dua nilai ini saat aplikasi pertama kali jalan (Langkah 5).
# Aplikasi MENOLAK start bila password kosong, kurang dari 8 karakter, atau nilai
# contoh seperti "admin123".
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="<password-admin-baru>"

HOST=127.0.0.1
PORT=4000

# Kosong = folder uploads/ di dalam folder aplikasi.
UPLOAD_DIR=
UPLOAD_MAX_MB=8
APP_TIMEZONE="Asia/Makassar"

# Isi setelah subdomain aktif (Langkah 7).
APP_URL=

# Salin dari Railway → service aplikasi → Variables.
EPBB_API_URL=<salin-dari-railway>
EPBB_API_KEY=<salin-dari-railway>
EPBB_TIMEOUT_MS=10000

SEED_DEMO=false
CORS_ORIGIN=
```

Catatan:

- **`HOST=127.0.0.1`** membuat aplikasi hanya bisa dicapai dari dalam server, lewat reverse
  proxy aaPanel. Jangan buka port 4000 di firewall aaPanel.
- **`CORS_ORIGIN` wajib dikosongkan.** Nilai bawaan `.env.example` hanya untuk pengembangan.
- **`SEED_DEMO=false`**, supaya database baru tidak terisi data contoh.

Lalu install dan build:

```bash
npm ci --include=dev
npm run build
```

---

## Langkah 4 — Buat database dari nol

Masih di folder `/www/wwwroot/sensus-pajak`:

```bash
bash deploy/buat-database.sh
```

Skrip meminta **password root MySQL** (aaPanel → Databases → Root password), lalu mengerjakan
semuanya sendiri:

1. membuat database `sensus_pajak` (utf8mb4);
2. membuat user `sensus_pajak` dengan password acak, yang hanya bisa masuk dari server ini;
3. menulis `DATABASE_URL` ke `.env` (password user itu **hanya** tersimpan di sini);
4. membuat seluruh tabel.

Hasil yang benar diakhiri dengan:

```
All migrations have been successfully applied.
...
Database schema is up to date!
Selesai. Database 'sensus_pajak' siap dipakai.
```

Skrip ini **tidak pernah menimpa data**. Bila database atau user `sensus_pajak` sudah ada,
skrip berhenti tanpa mengubah apa pun. Bila gagal di tengah, apa pun yang sempat terbuat
dihapus lagi, jadi skrip aman dijalankan ulang setelah penyebabnya diperbaiki.

**Daftarkan database ke aaPanel** supaya bisa dipilih di jadwal backup (Langkah 9): aaPanel →
**Databases** → **Get DB from server** (kadang bernama *Sync from server*). `sensus_pajak`
akan muncul di daftar.

---

## Langkah 5 — Jalankan aplikasi pertama kali

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 logs sensus-pajak --lines 20
```

Log yang sehat berisi:

```
[Sensus Pajak] terhubung ke database.
[Sensus Pajak] akun admin "admin" dibuat dari ADMIN_USERNAME/ADMIN_PASSWORD.
[Sensus Pajak] siap di http://localhost:4000 (production)
```

Tekan `Ctrl+C` untuk keluar dari tampilan log. Aplikasinya tetap berjalan.

### Uji dari laptop (sebelum subdomain aktif)

Karena aplikasi hanya mendengarkan `127.0.0.1`, uji lewat *SSH tunnel*. Jalankan di laptop:

```bash
ssh -L 4000:127.0.0.1:4000 <user>@<ip-server>
```

Selama jendela SSH itu terbuka, buka `http://localhost:4000` di browser laptop, lalu **login
admin** dengan password dari `.env`.

Setelah berhasil login, sebaiknya ganti password lewat halaman **Akun**, lalu kosongkan
`ADMIN_PASSWORD` di `.env`. Nilai itu tidak dipakai lagi setelah akun admin ada.

---

## Langkah 6 — Bawa bank formulir dan daftar petugas

**Di aplikasi Railway** (login sebagai admin):

1. **Bank Formulir** → panel **Impor & Ekspor** → **Unduh bank formulir**. Hasilnya berkas
   `bank-formulir-TANGGAL.json`.
2. **Petugas** → panel **Impor & Ekspor** → **Unduh Excel**. Hasilnya berkas
   `daftar-petugas-TANGGAL.xlsx`.

**Di aplikasi server kantor** (lewat SSH tunnel Langkah 5):

1. **Bank Formulir** → **Impor dari berkas** → pilih berkas `.json` tadi.
2. **Petugas** → **Impor dari berkas** → pilih berkas `.xlsx` tadi. Kolom *Kertas Kerja* dan
   *Data* di berkas itu diabaikan.

Periksa hasilnya: jumlah formulir, pertanyaan, dan petugas harus sama dengan di Railway. Kedua
impor aman diulang, karena formulir yang judulnya sudah ada dan petugas yang namanya sudah ada
dilewati.

### Opsional: lanjutkan nomor kertas kerja

Database baru mulai menomori kertas kerja dari **00001**, sama dengan nomor-nomor lama di
Railway. Bila nomor lama dan baru tidak boleh kembar, lanjutkan penomoran dari nomor terakhir
di Railway. Contohnya, bila kertas kerja terakhir di Railway bernomor `00137`:

```bash
mysql -u root -p sensus_pajak -e "UPDATE nomor_counter SET last_nomor = 137 WHERE id = 1"
```

Kertas kerja pertama di server kantor akan bernomor `00138`. Kerjakan ini **sebelum** ada
kertas kerja yang dibuat di server kantor.

---

## Langkah 7 — Pasang subdomain dan HTTPS

Kerjakan setelah Diskominfo mengabarkan subdomain sudah diarahkan ke server. Cek dari laptop
dengan `nslookup sensuspajak.banjarbarukota.go.id`: hasilnya harus IP server kantor.

1. aaPanel → **Website** → **Add site**.
   - Domain: `sensuspajak.banjarbarukota.go.id`
   - Root directory: biarkan bawaan aaPanel. **Jangan** arahkan ke folder aplikasi, supaya
     `.env` tidak mungkin tersaji ke luar.
   - PHP: *Static* / tanpa PHP. Database: jangan buat.
2. Tab **SSL** → **Let's Encrypt** → **File verification** → centang domainnya → **Apply**,
   lalu aktifkan **Force HTTPS**. Sertifikat diminta **sebelum** reverse proxy dipasang, agar
   berkas verifikasi Let's Encrypt tidak ikut diteruskan ke aplikasi. Panduan lengkap dan
   pemecahan masalahnya: [https-lets-encrypt.md](https-lets-encrypt.md).
3. Buka pengaturan situs itu → **Reverse proxy** → **Add reverse proxy**:
   - Name: `sensus-pajak`
   - Target URL: `http://127.0.0.1:4000`
   - Send domain: `$host`
4. Isi `APP_URL=https://sensuspajak.banjarbarukota.go.id` di `.env`, lalu
   `pm2 reload sensus-pajak`.
5. Buka alamat baru itu dari HP, lalu periksa:
   - [ ] Login admin berhasil.
   - [ ] Buat satu kertas kerja uji. Isi satu data **dengan foto** dan **lokasi GPS**, lalu
         simpan.
   - [ ] Buka lagi data itu. Fotonya tampil dan titik lokasinya benar.
   - [ ] Tombol **Lihat** pada NOP menampilkan data EPBB.
   - [ ] Ekspor Excel formulir itu berhasil diunduh, dan tautan fotonya memakai alamat baru.
   - [ ] Hapus kertas kerja uji itu.

> Unggahan foto dibatasi 8 MB. Bila unggahan foto atau impor petugas gagal dengan pesan
> *413 Request Entity Too Large*, naikkan batas unggah di pengaturan Nginx/Apache aaPanel
> (Nginx: `client_max_body_size`) menjadi minimal `20m`.

Bila tombol **Lihat** NOP gagal (*timeout*), coba ganti `EPBB_API_URL` di `.env` ke alamat EPBB
yang dicapai dari dalam server (tanyakan ke admin server), lalu `pm2 reload sensus-pajak`.

---

## Langkah 8 — Hari pindah

Karena data tidak disalin, hari pindah cukup berupa **pengumuman dan penguncian Railway**.
Tidak ada jeda aplikasi mati.

**H-1: umumkan ke petugas**

> Mulai besok pukul 08.00, Sensus Pajak memakai alamat baru:
> https://sensuspajak.banjarbarukota.go.id
>
> Data yang sudah diisi di alamat lama tetap tersimpan sebagai arsip, tetapi **tidak muncul**
> di alamat baru. Draf yang belum disimpan di alamat lama juga tidak ikut pindah.
> **Selesaikan dan simpan isian Anda di alamat lama hari ini.** Kertas kerja baru dibuat di
> alamat baru.

**Pada hari pindah:**

1. **Ekspor data terakhir dari Railway** untuk arsip: setiap formulir → ekspor **Excel**. Simpan
   berkasnya di tempat yang aman.
2. **Kunci Railway** supaya tidak ada yang tanpa sengaja mengisi data di sana: Railway →
   service aplikasi → **Settings → Networking** → hapus domain publiknya. Bisa juga dengan
   menghentikan *deployment*-nya. **Jangan hapus service MySQL dan volume dulu.**
3. Kabari petugas bahwa alamat baru sudah bisa dipakai.

> Tautan foto di berkas Excel ekspor Railway menunjuk ke alamat Railway. Tautan itu **mati**
> begitu Railway dikunci atau dihapus. Bila foto lama perlu tetap bisa dibuka, kerjakan
> [Lampiran: arsip data Railway](#lampiran-arsip-data-railway) sebelum langkah 2.

### Bila ada masalah besar: kembali ke Railway

Pasang lagi domain publik Railway (atau jalankan ulang *deployment*-nya), lalu kabari petugas
agar kembali ke alamat lama. Data di Railway masih utuh seperti saat ditinggalkan.

---

## Langkah 9 — Setelah pindah

### Backup terjadwal (wajib)

Di server kantor tidak ada yang membackup otomatis sampai Anda mengaturnya.

aaPanel → **Cron** → **Add task**:

| Task type          | Isian                                                | Jadwal            |
| ------------------ | ---------------------------------------------------- | ----------------- |
| Backup database    | Database `sensus_pajak`, simpan 14 salinan           | Setiap hari 23.00 |
| Backup directory   | `/www/wwwroot/sensus-pajak/uploads`, simpan 7 salinan | Setiap hari 23.30 |

Bila `sensus_pajak` tidak muncul di pilihan database, ulangi **Get DB from server** di
Langkah 4.

Sesekali salin hasil backup ke tempat lain, misalnya harddisk kantor. Backup yang hanya ada di
server yang sama ikut hilang bila server rusak.

### Memperbarui aplikasi

Railway dulu deploy otomatis setiap ada push ke GitHub. Sekarang pembaruan dijalankan manual:

```bash
cd /www/wwwroot/sensus-pajak
bash deploy/perbarui.sh
```

Skrip ini mengambil kode terbaru, memasang dependensi, build, menjalankan migrasi database,
lalu me-*reload* aplikasi. Bila satu langkah gagal, skrip berhenti dan aplikasi lama tetap
berjalan.

### Menutup Railway

Tunggu **1–2 minggu** sampai server kantor terbukti lancar dan backup pertama sudah jadi.
Pastikan arsip Excel (Langkah 8) sudah disimpan, dan bila perlu arsip lengkap juga sudah dibuat
(Lampiran). Setelah itu hapus project Railway. Tagihan Railway berhenti setelah project dihapus.

### Perintah sehari-hari

| Keperluan                   | Perintah                              |
| --------------------------- | ------------------------------------- |
| Lihat status                | `pm2 status`                          |
| Lihat log                   | `pm2 logs sensus-pajak --lines 100`   |
| Restart setelah ubah `.env` | `pm2 reload sensus-pajak`             |
| Cek kesehatan               | `curl http://127.0.0.1:4000/api/health` |

---

## Pemecahan masalah

| Gejala                                                        | Penyebab & jalan keluar                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `buat-database.sh`: *Gagal masuk ke MySQL sebagai root*       | Password root salah. Lihat atau reset di aaPanel → Databases → Root password.                             |
| `buat-database.sh`: *Database/User … sudah ada*               | Pernah dibuat sebelumnya. Bila memang ingin mulai ulang dan database itu **belum berisi data penting**, hapus database dan user `sensus_pajak` lewat aaPanel → Databases, lalu jalankan ulang. |
| `buat-database.sh`: *Dependensi belum terpasang*               | Jalankan `npm ci --include=dev` dulu (Langkah 3).                                                         |
| Log: `ADMIN_PASSWORD wajib diisi di produksi…`                | Password admin di `.env` kosong, terlalu pendek, atau nilai contoh. Ganti, lalu `pm2 restart sensus-pajak`. |
| Log: `JWT_SECRET wajib diisi di produksi`                     | `JWT_SECRET` di `.env` kosong.                                                                            |
| Log: `gagal terhubung ke database`                            | `DATABASE_URL` di `.env` berubah atau rusak. Jangan ubah baris itu secara manual.                         |
| `502 Bad Gateway` di alamat baru                              | Aplikasi mati atau port reverse proxy salah. Cek `pm2 status` dan pastikan port sama dengan `PORT` di `.env`. |
| Tombol GPS tidak meminta izin lokasi di HP                    | Halaman dibuka lewat `http://` atau IP. Pastikan memakai `https://` + subdomain (Langkah 7).               |
| Petugas mencari data lamanya                                  | Data lama ada di arsip Excel Railway (Langkah 8), tidak di server kantor.                                  |

---

## Lampiran: arsip data Railway

Kerjakan ini **hanya bila** data lama perlu disimpan utuh, termasuk foto yang bisa dibuka,
bukan hanya berkas Excel. Arsip dibuat sebagai database **terpisah** (`sensus_arsip`) dan
folder foto terpisah, sehingga tidak tercampur dengan database kerja `sensus_pajak`. Railway
harus **masih hidup** saat mengerjakannya.

### A1. Buat dump dari Railway

Railway → service **MySQL** → **Variables** → salin **`MYSQL_PUBLIC_URL`**, bentuknya
`mysql://root:PASSWORD@xxxxx.proxy.rlwy.net:PORT/railway`. Lalu di Terminal server kantor:

```bash
mkdir -p ~/arsip
mysqldump -h xxxxx.proxy.rlwy.net -P PORT -u root -p \
  --single-transaction --no-tablespaces railway > ~/arsip/railway.sql

# MariaDB 10.11 tidak mengenal collation bawaan MySQL 8; samakan dulu.
sed -i 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' ~/arsip/railway.sql
```

Bila muncul `Authentication plugin 'caching_sha2_password' cannot be loaded`, jalankan
`apt install libmariadb3` lalu ulangi.

### A2. Impor ke database arsip

```bash
mysql -u root -p -e "CREATE DATABASE sensus_arsip CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root -p sensus_arsip < ~/arsip/railway.sql
```

### A3. Tarik fotonya

```bash
cd /www/wwwroot/sensus-pajak
DATABASE_URL="mysql://root:<password-root>@127.0.0.1:3306/sensus_arsip" \
UPLOAD_DIR=/www/wwwroot/sensus-arsip-foto \
  node server/scripts/tarik-foto.js --dari=https://<alamat-railway>.up.railway.app
```

Hasil yang benar berakhir dengan `Gagal : 0`. Bila ada yang gagal, jalankan ulang perintah yang
sama. Foto yang sudah terunduh dilewati. Bila *Tidak ada di sumber* lebih dari 0, berkas itu
memang sudah hilang di Railway.

Setelah selesai, simpan `~/arsip/railway.sql` dan folder `/www/wwwroot/sensus-arsip-foto` di
tempat yang aman, misalnya harddisk kantor. Database `sensus_arsip` boleh dihapus kembali
setelah dump dan foto tersimpan.
