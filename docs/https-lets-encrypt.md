# Tutorial: Memasang HTTPS (Let's Encrypt) di Server Kantor

Panduan memasang sertifikat HTTPS gratis dari **Let's Encrypt** untuk Sensus Pajak di server
kantor (aaPanel). Ditulis untuk pemula. Ikuti urutannya dan jangan lompat langkah.

> **Masih di Railway?** Lewati panduan ini. Railway memasang dan memperpanjang HTTPS sendiri,
> termasuk untuk subdomain `.go.id` yang diarahkan ke sana.

---

## Kenapa HTTPS wajib?

| Tanpa HTTPS (`http://`)                                    | Dengan HTTPS (`https://`)                         |
| ---------------------------------------------------------- | ------------------------------------------------- |
| **GPS tidak jalan.** Browser HP menolak memberi lokasi.     | GPS jalan.                                        |
| Password admin, NIK, dan NPWP terkirim tanpa enkripsi.     | Semua data terenkripsi dalam perjalanan.          |
| Browser menampilkan peringatan *Tidak aman*.                | Ikon gembok di address bar.                       |

Let's Encrypt **gratis**. Sertifikatnya berlaku 90 hari, dan aaPanel memperpanjangnya otomatis.

---

## Cara kerjanya (singkat)

Sebelum memberi sertifikat, Let's Encrypt perlu bukti bahwa domain itu benar milik server
Anda. Caranya:

1. aaPanel menaruh sebuah berkas kecil di situs, di alamat
   `http://sensuspajak.banjarbarukota.go.id/.well-known/acme-challenge/…`.
2. Server Let's Encrypt di internet membuka alamat itu lewat **port 80**.
3. Kalau berkasnya bisa dibuka, sertifikat diterbitkan.

Jadi ada tiga syarat: **domain mengarah ke server ini**, **port 80 bisa dibuka dari internet**,
dan **berkas verifikasi tidak ikut diteruskan ke aplikasi**. Langkah-langkah di bawah memastikan
ketiganya.

---

## Yang perlu disiapkan

- [ ] Subdomain dari Diskominfo sudah aktif, dengan **record A** ke IP publik server kantor.
- [ ] Akses aaPanel dan Terminal server.
- [ ] Kontak admin jaringan kantor, untuk urusan port 80/443 di router/firewall.

Di panduan ini subdomainnya ditulis `sensuspajak.banjarbarukota.go.id`. Ganti dengan nama yang
diberikan Diskominfo.

---

## Langkah 1 — Pastikan domain sudah mengarah ke server

Dari laptop mana saja, jalankan:

```bash
nslookup sensuspajak.banjarbarukota.go.id
```

Hasilnya harus berisi **IP publik server kantor**, yaitu IP yang sama dengan yang dipakai membuka
SIP/EPBB dari luar kantor.

| Hasil                               | Artinya                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| IP server kantor                    | Lanjut.                                                                  |
| `Non-existent domain` / tidak ada   | Record belum dipasang atau belum menyebar. Tunggu 1–24 jam, lalu cek lagi. |
| IP lain                             | Record salah. Minta Diskominfo memperbaikinya.                           |

---

## Langkah 2 — Pastikan port 80 dan 443 terbuka

**Di aaPanel:** menu **Security** (atau *Firewall*). Pastikan port **80** dan **443** ada di
daftar dan berstatus terbuka (*Accept*). Biasanya sudah terbuka karena SIP/EPBB memakainya.

**Di jaringan kantor:** bila server berada di belakang router atau firewall kantor, port 80 dan
443 dari internet harus diteruskan ke server ini (*port forwarding*). Tanyakan ke admin jaringan.

**Uji dari luar kantor.** Pakai HP dengan data seluler, **bukan** WiFi kantor, lalu buka
`http://sensuspajak.banjarbarukota.go.id`.

- Muncul halaman apa pun, termasuk halaman bawaan aaPanel atau *404*: port 80 terbuka. Lanjut.
- Halaman tidak bisa dibuka atau *timeout*: port 80 tertutup di suatu tempat. Selesaikan ini
  dulu, karena Let's Encrypt pasti gagal.

> **Jangan tutup port 80 setelah sertifikat terbit.** Perpanjangan otomatis setiap ±60 hari
> memakai port 80 lagi.

---

## Langkah 3 — Buat situsnya (belum pakai reverse proxy)

Lewati langkah ini bila situsnya sudah dibuat.

aaPanel → **Website** → **Add site**:

| Isian          | Nilai                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Domain         | `sensuspajak.banjarbarukota.go.id`                                      |
| Root directory | Biarkan bawaan aaPanel. **Jangan** arahkan ke folder aplikasi.         |
| PHP version    | *Static* / tanpa PHP                                                   |
| Database / FTP | Jangan buat                                                            |

**Jangan pasang reverse proxy dulu.** Bila reverse proxy sudah terpasang, permintaan verifikasi
Let's Encrypt ikut diteruskan ke aplikasi Sensus Pajak, yang tidak punya berkas verifikasinya.
Hasilnya, sertifikat gagal terbit.

Bila situs terlanjur memakai reverse proxy: buka tab **Reverse proxy**, matikan (*disable*) dulu,
lalu nyalakan lagi di Langkah 5.

---

## Langkah 4 — Minta sertifikat

1. aaPanel → **Website** → klik nama situs `sensuspajak.banjarbarukota.go.id` → tab **SSL**.
2. Pilih **Let's Encrypt**.
3. Verification method: **File verification**. Jangan pilih *DNS verification*, karena DNS
   `.go.id` dikelola Diskominfo dan Anda tidak bisa menambah record-nya sendiri.
4. Centang domain `sensuspajak.banjarbarukota.go.id`.
5. Klik **Apply** dan tunggu 10–60 detik.

Bila berhasil, tab SSL menampilkan status sertifikat beserta tanggal kedaluwarsanya, kira-kira 90
hari dari sekarang.

> ⚠️ **Jangan klik Apply berulang-ulang bila gagal.** Let's Encrypt membatasi jumlah percobaan
> gagal per jam. Kalau batas itu kena, Anda harus menunggu sekitar satu jam. Baca pesan
> galatnya, cocokkan dengan tabel *Pemecahan masalah* di bawah, perbaiki, baru coba lagi.

---

## Langkah 5 — Nyalakan Force HTTPS dan reverse proxy

1. Masih di tab **SSL**, aktifkan **Force HTTPS**. Semua kunjungan `http://` akan dialihkan ke
   `https://`.
2. Tab **Reverse proxy** → **Add reverse proxy** (atau nyalakan lagi yang tadi dimatikan):
   - Name: `sensus-pajak`
   - Target URL: `http://127.0.0.1:4000`, samakan dengan `PORT` di `.env`
   - Send domain: `$host`
3. Di server, isi alamat baru di `.env` lalu muat ulang aplikasi:

   ```bash
   cd /www/wwwroot/sensus-pajak
   nano .env          # APP_URL=https://sensuspajak.banjarbarukota.go.id
   pm2 reload sensus-pajak
   ```

Perpanjangan otomatis tetap berjalan walau reverse proxy menyala, karena aaPanel mengecualikan
folder `/.well-known/` dari proxy. Pastikan saja lewat uji perpanjangan di Langkah 7.

---

## Langkah 6 — Periksa hasilnya

**Dari HP (data seluler):**

- [ ] `https://sensuspajak.banjarbarukota.go.id` terbuka, ada **ikon gembok**, dan tanpa
      peringatan.
- [ ] `http://sensuspajak.banjarbarukota.go.id` otomatis pindah ke `https://`.
- [ ] Buka isi data, lalu ketuk ambil lokasi. Browser **meminta izin lokasi**, dan setelah
      diizinkan titiknya terisi.

**Dari Terminal server:**

```bash
# Tanggal berlaku sertifikat
echo | openssl s_client -connect sensuspajak.banjarbarukota.go.id:443 \
  -servername sensuspajak.banjarbarukota.go.id 2>/dev/null | openssl x509 -noout -issuer -dates
```

Hasilnya harus menyebut penerbit **Let's Encrypt** dan tanggal `notAfter` sekitar 90 hari ke
depan.

---

## Langkah 7 — Pastikan perpanjangan otomatis aktif

Sertifikat yang tidak diperpanjang akan **kedaluwarsa setelah 90 hari**. Setelah itu aplikasi
tidak bisa dibuka dan GPS mati.

1. aaPanel → **Cron**. Pastikan ada tugas perpanjangan sertifikat. Namanya biasanya
   mengandung kata *Let's Encrypt*, *SSL*, atau *renew*, dan tugas ini dibuat otomatis oleh
   aaPanel.
2. Klik **Execute** sekali pada tugas itu, lalu buka **Log**-nya. Tidak boleh ada pesan gagal
   untuk domain ini. Karena sertifikat masih baru, biasanya tertulis tidak perlu diperpanjang.
3. Catat di kalender: **cek tanggal sertifikat sebulan sekali** dengan perintah `openssl` di
   Langkah 6. Tanggal `notAfter` harus selalu lebih dari 30 hari ke depan.

---

## Alternatif: memakai sertifikat dari Diskominfo

Banyak pemerintah daerah sudah punya sertifikat **wildcard** (`*.banjarbarukota.go.id`) yang
berlaku untuk semua subdomainnya. Pakai cara ini bila Let's Encrypt terus gagal, misalnya karena
port 80 tidak bisa dibuka dari internet.

1. Minta ke Diskominfo dua berkas: **private key** (`.key`) dan **sertifikat lengkap dengan
   rantainya** (`fullchain.pem` / `.crt`).
2. aaPanel → situs → tab **SSL** → **Other certificate** (atau *Custom certificate*).
3. Tempel isi `.key` ke kolom *Key*, dan isi sertifikat ke kolom *Certificate (PEM format)*.
   Klik **Save**.
4. Lanjutkan dengan Langkah 5 dan 6.

Kekurangannya: sertifikat ini **tidak diperpanjang otomatis**. Sebelum kedaluwarsa, minta
berkas baru ke Diskominfo lalu ulangi langkah di atas. Catat tanggalnya di kalender.

---

## Pemecahan masalah

| Pesan / gejala                                                        | Penyebab & jalan keluar                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DNS problem: NXDOMAIN` / `no valid A records`                         | Subdomain belum mengarah ke server. Ulangi Langkah 1.                                                                |
| `Timeout during connect` / `Connection refused`                        | Port 80 tertutup dari internet: firewall aaPanel, router kantor, atau ISP. Ulangi Langkah 2.                         |
| `Invalid response from …/.well-known/acme-challenge/…` (404 atau 502)   | Reverse proxy menyala saat verifikasi. Matikan reverse proxy, Apply lagi, lalu nyalakan kembali (Langkah 3–5).        |
| `CAA record … prevents issuance`                                        | DNS `banjarbarukota.go.id` hanya mengizinkan penerbit sertifikat tertentu. Minta Diskominfo menambah record **CAA** untuk `letsencrypt.org`, atau pakai sertifikat Diskominfo. |
| `too many failed authorizations` / `rateLimited`                        | Terlalu sering gagal. Tunggu 1 jam, perbaiki penyebabnya dulu, baru coba lagi.                                        |
| Gembok ada, tapi `502 Bad Gateway`                                      | HTTPS sudah beres; aplikasinya yang mati. Cek `pm2 status` dan port reverse proxy.                                    |
| Di laptop kantor sudah HTTPS, di HP data seluler tidak bisa dibuka       | DNS/port hanya beres di jaringan dalam. Pastikan record A memakai IP **publik** dan port diteruskan dari internet.   |
| Tiba-tiba *Sambungan tidak aman* / `NET::ERR_CERT_DATE_INVALID`          | Sertifikat kedaluwarsa karena perpanjangan gagal. Buka tab SSL lalu klik **Renew**, dan periksa Langkah 7.             |
