#!/usr/bin/env bash
#
# Pasang Sensus Pajak di server kantor dari nol (Langkah 3-5 panduan migrasi).
#
#   cd /www/wwwroot/sensus-pajak && bash deploy/pasang.sh
#
# Yang dikerjakan:
#   1. membuat .env: JWT_SECRET dan password admin dibuat acak, alamat & kunci
#      EPBB ditanyakan (bila .env sudah ada, dipakai apa adanya);
#   2. npm ci + build frontend;
#   3. membuat database lewat deploy/buat-database.sh (menanyakan password root
#      MySQL) - dilewati bila .env sudah menunjuk ke database;
#   4. menjalankan aplikasi dengan PM2 lalu memeriksa /api/health.
#
# Aman dijalankan ulang bila berhenti di tengah: langkah yang sudah selesai
# tidak diulang dengan cara yang merusak.

set -euo pipefail

cd "$(dirname "$0")/.."

for perintah in node npm pm2 mysql openssl curl; do
  if ! command -v "$perintah" >/dev/null 2>&1; then
    echo "Perintah '$perintah' belum terpasang. Selesaikan Langkah 2 panduan dulu." >&2
    exit 1
  fi
done

PASSWORD_ADMIN_BARU=""

echo "==> [1/4] Menyiapkan .env"
if [ -f .env ] && grep -q 'ganti-dengan' .env; then
  echo ".env masih berisi nilai contoh dari .env.example." >&2
  echo "Hapus dulu (rm .env) lalu jalankan ulang, supaya .env dibuat otomatis." >&2
  exit 1
elif [ -f .env ]; then
  echo ".env sudah ada - dipakai apa adanya."
else
  echo "Alamat & kunci API EPBB ada di Railway -> service aplikasi -> Variables."
  echo "Kosongkan keduanya bila fitur cek NOP belum dipakai."
  read -rp "EPBB_API_URL : " EPBB_URL
  read -rp "EPBB_API_KEY : " EPBB_KEY

  JWT="$(openssl rand -hex 48)"
  PASSWORD_ADMIN_BARU="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 16)"

  umask 077
  cat > .env <<ENV
NODE_ENV=production

# Diisi oleh deploy/buat-database.sh.
DATABASE_URL=

JWT_SECRET="${JWT}"
JWT_EXPIRES_IN="12h"

# Hanya dipakai saat akun admin belum ada. Setelah login pertama, ganti password
# lewat halaman Akun lalu kosongkan nilai ini.
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="${PASSWORD_ADMIN_BARU}"

# Hanya bisa dicapai lewat reverse proxy aaPanel.
HOST=127.0.0.1
PORT=4000

UPLOAD_DIR=
UPLOAD_MAX_MB=8
APP_TIMEZONE="Asia/Makassar"

# Isi setelah subdomain aktif, mis. https://sensuspajak.banjarbarukota.go.id
APP_URL=

EPBB_API_URL='${EPBB_URL}'
EPBB_API_KEY='${EPBB_KEY}'
EPBB_TIMEOUT_MS=10000

SEED_DEMO=false
CORS_ORIGIN=
ENV
  umask 022
  echo ".env dibuat."
fi

echo "==> [2/4] Install dependensi & build"
npm ci --include=dev
npm run build

echo "==> [3/4] Database"
if grep -qE '^DATABASE_URL="?mysql://' .env; then
  echo "DATABASE_URL sudah terisi - database tidak dibuat ulang, hanya migrasi."
  npx prisma migrate deploy
else
  bash deploy/buat-database.sh
fi

echo "==> [4/4] Menjalankan aplikasi"
if pm2 describe sensus-pajak >/dev/null 2>&1; then
  pm2 reload sensus-pajak
else
  pm2 start deploy/ecosystem.config.js
fi
pm2 save

PORT_APP="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '"'"'"' ')"
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT_APP:-4000}/api/health" >/dev/null 2>&1; then
    echo
    echo "=============================================================="
    echo " Sensus Pajak berjalan di http://127.0.0.1:${PORT_APP:-4000}"
    if [ -n "$PASSWORD_ADMIN_BARU" ]; then
      echo
      echo " Login admin"
      echo "   Username : admin"
      echo "   Password : ${PASSWORD_ADMIN_BARU}"
      echo
      echo " CATAT password ini sekarang. Password juga tersimpan di .env"
      echo " (ADMIN_PASSWORD) sampai Anda menggantinya lewat halaman Akun."
    fi
    echo "=============================================================="
    exit 0
  fi
  sleep 2
done

echo "Aplikasi tidak menjawab /api/health. Lihat log: pm2 logs sensus-pajak --lines 50" >&2
exit 1
