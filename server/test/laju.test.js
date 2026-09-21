"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { pembatas } = require("../src/laju");

const buatRes = (statusCode = 200) => {
  const pendengar = {};
  return {
    statusCode,
    header: {},
    setHeader(k, v) {
      this.header[k] = v;
    },
    on(nama, fn) {
      pendengar[nama] = fn;
    },
    /** Tiru express yang menyelesaikan respons. */
    selesai(kode) {
      this.statusCode = kode;
      if (pendengar.finish) pendengar.finish();
    },
  };
};

/** Jalankan middleware sekali; kembalikan galat yang diteruskan ke next(), atau null. */
function panggil(mw, req, res) {
  let galat = null;
  mw(req, res, (e) => {
    galat = e || null;
  });
  return galat;
}

test("pembatas menolak setelah kuota habis dan menyebut Retry-After", () => {
  const mw = pembatas({ jendelaMs: 60000, maks: 3, pesan: "Terlalu sering." });
  const req = { ip: "1.2.3.4" };

  for (let i = 0; i < 3; i += 1) {
    assert.equal(panggil(mw, req, buatRes()), null, `percobaan ke-${i + 1} harus lolos`);
  }

  const res = buatRes();
  const galat = panggil(mw, req, res);
  assert.ok(galat, "percobaan keempat harus ditolak");
  assert.equal(galat.status, 429);
  assert.equal(galat.message, "Terlalu sering.");
  assert.ok(Number(res.header["Retry-After"]) > 0);
});

test("pembatas menghitung per IP, bukan global", () => {
  const mw = pembatas({ jendelaMs: 60000, maks: 1, pesan: "x" });
  assert.equal(panggil(mw, { ip: "1.1.1.1" }, buatRes()), null);
  assert.ok(panggil(mw, { ip: "1.1.1.1" }, buatRes()), "IP yang sama kena batas");
  assert.equal(panggil(mw, { ip: "2.2.2.2" }, buatRes()), null, "IP lain tidak ikut terkena");
});

/*
 * Inti pembatas login: yang dihitung hanya kegagalan, sehingga admin yang tahu
 * passwordnya tidak pernah mengunci dirinya sendiri.
 */
test("mode hanyaGagal tidak menghitung percobaan yang berhasil", () => {
  const mw = pembatas({ jendelaMs: 60000, maks: 2, hanyaGagal: true, pesan: "x" });
  const req = { ip: "9.9.9.9" };

  for (let i = 0; i < 20; i += 1) {
    const res = buatRes();
    assert.equal(panggil(mw, req, res), null);
    res.selesai(200);
  }

  // Dua kegagalan masih diizinkan, yang ketiga ditolak.
  for (let i = 0; i < 2; i += 1) {
    const res = buatRes();
    assert.equal(panggil(mw, req, res), null);
    res.selesai(401);
  }
  assert.ok(panggil(mw, req, buatRes()), "kegagalan ketiga harus ditolak");
});

test("kuota pulih setelah jendela lewat", async () => {
  const mw = pembatas({ jendelaMs: 40, maks: 1, pesan: "x" });
  const req = { ip: "3.3.3.3" };

  assert.equal(panggil(mw, req, buatRes()), null);
  assert.ok(panggil(mw, req, buatRes()));

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(panggil(mw, req, buatRes()), null, "setelah jendela lewat harus boleh lagi");
});
