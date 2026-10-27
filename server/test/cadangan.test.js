"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bacaDatabaseUrl,
  isiOpsiMysql,
  argumenMysqldump,
  folderBulan,
  ringkasFotoPerBulan,
  buatTiket,
  pakaiTiket,
  UMUR_TIKET_MS,
} = require("../src/cadangan");

test("bacaDatabaseUrl membaca bagian DATABASE_URL, termasuk password ber-karakter khusus", () => {
  assert.deepEqual(bacaDatabaseUrl("mysql://sensus:p%40ss%23w0rd@127.0.0.1:3307/sensus_pajak"), {
    host: "127.0.0.1",
    port: "3307",
    user: "sensus",
    password: "p@ss#w0rd",
    database: "sensus_pajak",
  });
  assert.equal(bacaDatabaseUrl("mysql://u:p@localhost/db").port, "3306", "port bawaan");
  assert.equal(bacaDatabaseUrl("postgres://u:p@localhost/db"), null);
  assert.equal(bacaDatabaseUrl("mysql://u:p@localhost/"), null, "tanpa nama database");
  assert.equal(bacaDatabaseUrl(""), null);
  assert.equal(bacaDatabaseUrl(undefined), null);
});

test("isiOpsiMysql meng-escape tanda kutip dan backslash pada password", () => {
  const isi = isiOpsiMysql({ host: "h", port: "3306", user: "u", password: 'a"b\\c' });
  assert.ok(isi.startsWith("[client]\n"));
  assert.ok(isi.includes('password="a\\"b\\\\c"'), isi);
});

test("argumenMysqldump: berkas opsi di depan, salinan konsisten tanpa mengunci tabel", () => {
  const arg = argumenMysqldump("/tmp/x.cnf", "sensus_pajak");
  assert.equal(arg[0], "--defaults-extra-file=/tmp/x.cnf", "MySQL mewajibkan opsi ini paling depan");
  assert.ok(arg.includes("--single-transaction"));
  assert.ok(arg.includes("--no-tablespaces"));
  assert.equal(arg.at(-1), "sensus_pajak");
  assert.ok(!arg.some((a) => a.startsWith("--password") || a.startsWith("-p")), "password tidak lewat argumen");
});

test("folderBulan hanya menerima YYYY-MM yang sah", () => {
  assert.equal(folderBulan("2026-10"), "2026/10");
  assert.equal(folderBulan("2026-13"), null);
  assert.equal(folderBulan("2026-1"), null);
  assert.equal(folderBulan("../etc"), null);
  assert.equal(folderBulan("2026-10/../.."), null);
  assert.equal(folderBulan(undefined), null);
});

test("ringkasFotoPerBulan menjumlahkan per bulan, terbaru di atas", () => {
  assert.deepEqual(
    ringkasFotoPerBulan([
      { berkas: "2026/09/a.jpg", ukuran: 100 },
      { berkas: "2026/10/b.jpg", ukuran: 200 },
      { berkas: "2026/10/c.jpg", ukuran: 300 },
      { berkas: "aneh.jpg", ukuran: 999 },
    ]),
    [
      { bulan: "2026-10", jumlah: 2, ukuran: 500 },
      { bulan: "2026-09", jumlah: 1, ukuran: 100 },
    ]
  );
});

test("tiket unduh hanya bisa dipakai sekali dan kedaluwarsa", () => {
  const kini = 1_000_000;
  const kode = buatTiket({ jenis: "database" }, kini);
  assert.deepEqual(pakaiTiket(kode, kini + 1000), { jenis: "database" });
  assert.equal(pakaiTiket(kode, kini + 1000), null, "kedua kalinya ditolak");

  const lama = buatTiket({ jenis: "foto" }, kini);
  assert.equal(pakaiTiket(lama, kini + UMUR_TIKET_MS + 1), null);
  assert.equal(pakaiTiket("ngawur"), null);
  assert.equal(pakaiTiket(undefined), null);
});
