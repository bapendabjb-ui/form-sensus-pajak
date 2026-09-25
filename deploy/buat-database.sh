#!/usr/bin/env bash
#
# Buat database Sensus Pajak dari nol di server kantor (MariaDB/MySQL aaPanel).
#
#   cd /www/wwwroot/sensus-pajak && bash deploy/buat-database.sh
#
# Yang dikerjakan:
#   1. membuat database `sensus_pajak` (utf8mb4) dan user `sensus_pajak` dengan
#      password acak, hanya boleh masuk dari server ini sendiri;
#   2. menulis DATABASE_URL ke .env;
#   3. membuat seluruh tabel lewat `prisma migrate deploy`.
#
# Berhenti tanpa mengubah apa pun bila database atau user dengan nama itu sudah
# ada, jadi tidak mungkin menimpa data. Nama bisa diganti lewat environment:
#   NAMA_DB=sensus_uji NAMA_USER=sensus_uji bash deploy/buat-database.sh

set -euo pipefail

cd "$(dirname "$0")/.."

NAMA_DB="${NAMA_DB:-sensus_pajak}"
NAMA_USER="${NAMA_USER:-sensus_pajak}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

if [ ! -f .env ]; then
  echo "File .env belum ada. Jalankan dulu: cp .env.example .env" >&2
  exit 1
fi
if [ ! -d node_modules/prisma ]; then
  echo "Dependensi belum terpasang. Jalankan dulu: npm ci --include=dev" >&2
  exit 1
fi

echo "Password root MySQL ada di aaPanel -> Databases -> Root password."
read -rsp "Password root MySQL: " MYSQL_PWD
echo
export MYSQL_PWD

sql() { mysql -h "$DB_HOST" -P "$DB_PORT" -u root -N -B -e "$1"; }

if ! sql "SELECT 1" >/dev/null; then
  echo "Gagal masuk ke MySQL sebagai root. Periksa passwordnya." >&2
  exit 1
fi

if [ "$(sql "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${NAMA_DB}'")" != "0" ]; then
  echo "Database '${NAMA_DB}' sudah ada. Tidak ada yang diubah." >&2
  echo "Bila memang ingin mulai ulang, hapus dulu lewat aaPanel -> Databases." >&2
  exit 1
fi
if [ "$(sql "SELECT COUNT(*) FROM mysql.user WHERE User='${NAMA_USER}'")" != "0" ]; then
  echo "User MySQL '${NAMA_USER}' sudah ada. Tidak ada yang diubah." >&2
  echo "Hapus dulu user itu, atau pakai nama lain: NAMA_USER=... bash deploy/buat-database.sh" >&2
  exit 1
fi

# Heksadesimal saja, supaya aman ditaruh di URL tanpa perlu di-encode.
PASS_DB="$(openssl rand -hex 16)"

echo "==> Membuat database dan user"
# User dibuat untuk 'localhost' (socket) dan '127.0.0.1' (TCP, dipakai aplikasi),
# karena MySQL yang memakai skip-name-resolve tidak menyamakan keduanya.
if ! sql "
CREATE DATABASE \`${NAMA_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '${NAMA_USER}'@'localhost' IDENTIFIED BY '${PASS_DB}';
CREATE USER '${NAMA_USER}'@'127.0.0.1' IDENTIFIED BY '${PASS_DB}';
GRANT ALL PRIVILEGES ON \`${NAMA_DB}\`.* TO '${NAMA_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${NAMA_DB}\`.* TO '${NAMA_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;"; then
  # Keduanya terbukti belum ada (dicek di atas), jadi apa pun yang sempat
  # terbuat sebelum galat aman dihapus lagi.
  echo "Gagal membuat database. Yang sempat terbuat dihapus kembali." >&2
  sql "DROP DATABASE IF EXISTS \`${NAMA_DB}\`;
       DROP USER IF EXISTS '${NAMA_USER}'@'localhost', '${NAMA_USER}'@'127.0.0.1';" || true
  exit 1
fi
unset MYSQL_PWD

echo "==> Menulis DATABASE_URL ke .env"
URL="mysql://${NAMA_USER}:${PASS_DB}@${DB_HOST}:${DB_PORT}/${NAMA_DB}"
if grep -q '^DATABASE_URL=' .env; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${URL}\"|" .env
else
  printf '\nDATABASE_URL="%s"\n' "$URL" >> .env
fi
chmod 600 .env

echo "==> Membuat tabel"
npx prisma migrate deploy
npx prisma migrate status

echo
echo "Selesai. Database '${NAMA_DB}' siap dipakai."
echo "Password user '${NAMA_USER}' hanya tersimpan di .env (DATABASE_URL)."
