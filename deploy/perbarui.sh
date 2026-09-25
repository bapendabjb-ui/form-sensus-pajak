#!/usr/bin/env bash
#
# Perbarui Sensus Pajak di server kantor ke versi terbaru dari GitHub.
#
#   cd /www/wwwroot/sensus-pajak && bash deploy/perbarui.sh
#
# Urutannya sama dengan yang dulu dikerjakan Railway saat deploy:
# ambil kode -> install -> build frontend -> migrasi database -> restart.
# Berhenti di langkah pertama yang gagal; aplikasi lama tetap berjalan sampai
# langkah restart.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "File .env belum ada. Salin dari .env.example lalu isi dulu." >&2
  exit 1
fi

echo "==> Ambil kode terbaru"
git pull --ff-only

echo "==> Install dependensi"
npm ci --include=dev

echo "==> Build frontend"
npm run build

echo "==> Migrasi database"
npx prisma migrate deploy

echo "==> Restart aplikasi"
if pm2 describe sensus-pajak >/dev/null 2>&1; then
  pm2 reload sensus-pajak
else
  pm2 start deploy/ecosystem.config.js
fi
pm2 save

echo "==> Cek kesehatan"
PORT_APP="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '"'"'"' ')"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${PORT_APP:-4000}/api/health" >/dev/null 2>&1; then
    echo "Selesai - aplikasi berjalan."
    exit 0
  fi
  sleep 2
done
echo "Aplikasi tidak menjawab /api/health. Lihat log: pm2 logs sensus-pajak --lines 50" >&2
exit 1
