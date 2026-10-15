"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { susunAlamat, sumberEpbbSah, aktif, cekNop, cariNop, kunciCariNop } = require("../src/epbb");
const config = require("../src/config");

test("susunAlamat menggabungkan bagian yang terisi saja", () => {
  assert.equal(
    susunAlamat({ jalan: "JL. MAWAR", blok_kav_no: "NO. 5", rt: "001", rw: "002" }, [
      ["KEL. ", "GUNTUNG PAYUNG"],
      ["KEC. ", "LANDASAN ULIN"],
    ]),
    "JL. MAWAR NO. 5, RT 001/RW 002, KEL. GUNTUNG PAYUNG, KEC. LANDASAN ULIN"
  );
});

test("susunAlamat tidak meninggalkan koma menggantung", () => {
  assert.equal(susunAlamat({ jalan: "JL. MAWAR" }, []), "JL. MAWAR");
  assert.equal(susunAlamat({ rt: "001" }, []), "RT 001");
  assert.equal(susunAlamat({}, [["KEL. ", ""]]), "");
  assert.equal(susunAlamat(), "");
});

test("susunAlamat merapikan spasi berlebih dari SISMIOP", () => {
  assert.equal(susunAlamat({ jalan: "  JL.   MAWAR  " }, []), "JL. MAWAR");
});

/*
 * Pengisian otomatis hanya boleh menulis ke tipe pertanyaan yang cocok - tanpa
 * penjagaan ini, "luas_tanah" bisa masuk ke pertanyaan bertipe tanggal.
 */
test("sumberEpbbSah memasangkan sumber EPBB dengan tipe pertanyaan yang cocok", () => {
  assert.equal(sumberEpbbSah("text", "nama_wp"), true);
  assert.equal(sumberEpbbSah("wilayah", "wilayah_op"), true);
  assert.equal(sumberEpbbSah("number", "luas_tanah"), true);
  assert.equal(sumberEpbbSah("date", "nama_wp"), false);
  assert.equal(sumberEpbbSah("text", "kolom_karangan"), false);
  assert.equal(sumberEpbbSah("text", "constructor"), false, "properti bawaan Object bukan sumber");
});

test("cek NOP mati bila URL atau kunci API belum diisi", () => {
  const url = config.epbbApiUrl;
  const key = config.epbbApiKey;
  try {
    config.epbbApiUrl = "";
    config.epbbApiKey = "abc";
    assert.equal(aktif(), false);
    config.epbbApiUrl = "https://epbb.contoh.test/api/nop/cek";
    assert.equal(aktif(), true);
  } finally {
    config.epbbApiUrl = url;
    config.epbbApiKey = key;
  }
});

test("kunciCariNop merapikan kata kunci dan menolak yang terlalu umum", () => {
  assert.deepEqual(kunciCariNop({ nama: "  siti   aminah ", nik: "6372 0101 0101 0001", letak: "" }), {
    nama: "siti aminah",
    nik: "6372010101010001",
    letak: "",
  });
  assert.deepEqual(kunciCariNop({ letak: "jl. mawar" }), { nama: "", nik: "", letak: "jl. mawar" });
  assert.equal(kunciCariNop({ nama: "x".repeat(100) }).nama.length, 60);

  const tolak = (q, pesan) => assert.throws(() => kunciCariNop(q), (e) => e.status === 400 && pesan.test(e.message));
  tolak({}, /Isi nama, NIK, atau letak/);
  tolak({ nama: "   " }, /Isi nama, NIK, atau letak/);
  tolak({ nama: "ab" }, /minimal 3 huruf/);
  tolak({ nama: "a. -b" }, /minimal 3 huruf/);
  tolak({ nama: "siti", letak: "jl" }, /minimal 3 huruf/);
  tolak({ nik: "637201010101000" }, /NIK harus 16 digit/);
  tolak({ nama: ["siti", "aminah"] }, /Isi nama, NIK, atau letak/);
});

/** Jalankan fn dengan fetch tiruan yang membalas `balasan` dan mencatat permintaannya. */
async function denganEpbb(balasan, fn) {
  const asli = { fetch: globalThis.fetch, url: config.epbbApiUrl, key: config.epbbApiKey, error: console.error, warn: console.warn };
  const panggilan = [];
  const log = [];
  globalThis.fetch = async (url, opsi) => {
    panggilan.push({ url: String(url), opsi });
    const { status = 200, body } = balasan;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  console.error = console.warn = (...a) => log.push(a.join(" "));
  config.epbbApiUrl = "https://epbb.contoh.test/api/nop/cek/";
  config.epbbApiKey = "rahasia";
  try {
    return await fn({ panggilan, log });
  } finally {
    globalThis.fetch = asli.fetch;
    config.epbbApiUrl = asli.url;
    config.epbbApiKey = asli.key;
    console.error = asli.error;
    console.warn = asli.warn;
  }
}

test("cariNop memanggil api/nop/cari dengan kunci API dan merangkum hasilnya", async () => {
  const body = {
    status: "ok",
    data: {
      hasil: [
        {
          nop: "637201000300100010",
          nama_wp: " HJ.  SITI AMINAH ",
          letak_op: { jalan: "JL. MAWAR", blok_kav_no: "NO. 5", rt: "001", rw: "", kelurahan: "GUNTUNG PAYUNG", kecamatan: "LANDASAN ULIN" },
        },
      ],
      lebih: true,
    },
  };
  await denganEpbb({ body }, async ({ panggilan }) => {
    const hasil = await cariNop({ nama: "siti aminah", nik: "", letak: "mawar" });
    assert.deepEqual(hasil, {
      hasil: [
        {
          nop: "637201000300100010",
          namaWp: "HJ. SITI AMINAH",
          letakOp: "JL. MAWAR NO. 5, RT 001, KEL. GUNTUNG PAYUNG, KEC. LANDASAN ULIN",
        },
      ],
      lebih: true,
    });
    assert.equal(panggilan.length, 1);
    assert.equal(panggilan[0].url, "https://epbb.contoh.test/api/nop/cari?nama=siti+aminah&letak=mawar");
    assert.equal(panggilan[0].opsi.headers["X-Api-Key"], "rahasia");
  });
});

test("cariNop: EPBB yang belum diperbarui dan kata kunci yang ditolak", async () => {
  // api/Nop.php lama: 404 yang diganti halaman login oleh server web EPBB.
  await denganEpbb({ status: 404, body: "<html>Login</html>" }, async ({ log }) => {
    await assert.rejects(cariNop({ nama: "siti", nik: "6372010101010001", letak: "" }), (e) => {
      assert.equal(e.status, 502);
      assert.match(e.message, /belum tersedia di EPBB/);
      return true;
    });
    // Nama dan NIK tidak boleh ikut tercatat di log server.
    assert.ok(log.length > 0);
    assert.ok(log.every((baris) => !/siti|6372010101010001/i.test(baris)), log.join("\n"));
  });

  await denganEpbb({ body: { status: "invalid", message: "NIK harus 16 digit." } }, async () => {
    await assert.rejects(cariNop({ nama: "", nik: "6372010101010001", letak: "" }), { status: 400, message: "NIK harus 16 digit." });
  });

  await denganEpbb({ status: 401, body: { status: "unauthorized", message: "Kunci API tidak valid." } }, async () => {
    await assert.rejects(cariNop({ nama: "siti", nik: "", letak: "" }), { status: 502, message: /Kunci API ditolak/ });
  });
});

test("cekNop tetap membaca balasan EPBB seperti sebelumnya", async () => {
  const body = {
    status: "ok",
    data: {
      nop: "637201000300100010",
      nama_wp: "BUDI",
      letak_sp: { jalan: "JL. A", kelurahan: "KOMET", kota: "BANJARBARU" },
      letak_op: { jalan: "JL. MAWAR", rt: "001", rw: "002", kelurahan: "GUNTUNG PAYUNG", kecamatan: "LANDASAN ULIN" },
      luas_tanah: 250.5,
      luas_bangunan: 72,
      belum_bayar: ["2023"],
    },
  };
  await denganEpbb({ body }, async ({ panggilan }) => {
    const d = await cekNop("637201000300100010");
    assert.equal(panggilan[0].url, "https://epbb.contoh.test/api/nop/cek/637201000300100010");
    assert.equal(d.letakOp, "JL. MAWAR, RT 001/RW 002, KEL. GUNTUNG PAYUNG, KEC. LANDASAN ULIN");
    assert.equal(d.letakSp, "JL. A, KEL. KOMET, BANJARBARU");
    assert.deepEqual(d.belumBayar, ["2023"]);
  });

  await denganEpbb({ body: { status: "not_found", message: "NOP tidak terdaftar." } }, async () => {
    await assert.rejects(cekNop("637201000300100010"), { status: 404 });
  });
  await denganEpbb({ status: 503, body: { status: "disabled", message: "x" } }, async () => {
    await assert.rejects(cekNop("637201000300100010"), { status: 502, message: /belum aktif/ });
  });
});
