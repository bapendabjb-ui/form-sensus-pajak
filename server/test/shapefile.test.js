"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

/*
 * Pembaca shapefile persil BPN berjalan di browser admin
 * (client/src/lib/shapefile.js, modul ES tanpa DOM); di sini dimuat langsung.
 *
 * Yang dijaga: koordinat TM-3 / UTM berubah tepat ke derajat, sistem
 * koordinat ditebak per bidang walau .prj salah atau tidak ada (keadaan data
 * BPN Banjarbaru 2026), dan bidang yang tidak jatuh di Banjarbaru dilewati.
 */

const muat = () => import(pathToFileURL(path.join(__dirname, "../../client/src/lib/shapefile.js")).href);

const WILAYAH = { lat: -3.4572, lon: 114.8105, radiusKm: 40 };

// .prj dari data BPN Banjarbaru: Banjarbaru Utara (salah - angkanya TM-3) dan Cempaka (benar).
const PRJ_UTM50S =
  'PROJCS["WGS_1984_UTM_Zone_50S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],' +
  'PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",117.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const PRJ_TM3 =
  'PROJCS["DGN95 / Indonesia TM-3 zone 50.1",GEOGCS["DGN95",DATUM["Datum Geodesi Nasional 1995",SPHEROID["WGS 84",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["false_easting",200000.0],' +
  'PARAMETER["false_northing",1500000.0],PARAMETER["central_meridian",115.5],PARAMETER["scale_factor",0.9999],' +
  'PARAMETER["latitude_of_origin",0.0],UNIT["m",1.0]]';

/* ---------- arah sebaliknya (derajat -> TM), untuk menguji tmKeDerajat dengan rumus yang berbeda ---------- */

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const RAD = Math.PI / 180;

function busur(phi) {
  return (
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi))
  );
}

/** Snyder (8-9), (8-10): derajat -> Transverse Mercator. */
function keTm(lon, lat, { lon0, k0, fe, fn }) {
  const phi = lat * RAD;
  const n = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = EP2 * Math.cos(phi) ** 2;
  const a = (lon - lon0) * RAD * Math.cos(phi);
  const x = fe + k0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t ** 2 + 72 * c - 58 * EP2) * a ** 5) / 120);
  const y =
    fn +
    k0 *
      (busur(phi) +
        n *
          Math.tan(phi) *
          (a ** 2 / 2 + ((5 - t + 9 * c + 4 * c ** 2) * a ** 4) / 24 + ((61 - 58 * t + t ** 2 + 600 * c - 330 * EP2) * a ** 6) / 720));
  return [x, y];
}

const TM3 = { lon0: 115.5, k0: 0.9999, fe: 200000, fn: 1500000 };
const UTM50S = { lon0: 117, k0: 0.9996, fe: 500000, fn: 10000000 };

test("tmKeDerajat: titik asal zona tepat, dan bolak-balik dengan rumus maju selisihnya < 1 cm", async () => {
  const { tmKeDerajat } = await muat();
  assert.deepEqual(tmKeDerajat(200000, 1500000, TM3), [115.5, 0]);
  assert.deepEqual(tmKeDerajat(500000, 10000000, UTM50S), [117, 0]);
  for (const [lon, lat] of [
    [114.821768, -3.448741], // Loktabat Selatan
    [114.674, -3.518], // ujung barat Liang Anggang
    [114.91, -3.383],
  ]) {
    for (const p of [TM3, UTM50S]) {
      const [x, y] = keTm(lon, lat, p);
      const [lon2, lat2] = tmKeDerajat(x, y, p);
      assert.ok(Math.abs(lon2 - lon) < 1e-7 && Math.abs(lat2 - lat) < 1e-7, `${lon},${lat} -> ${lon2},${lat2}`);
    }
  }
});

test("bacaPrj: UTM dan TM-3 dari data BPN, derajat, dan isi yang tidak dikenal", async () => {
  const { bacaPrj } = await muat();
  assert.deepEqual(bacaPrj(PRJ_UTM50S), {
    nama: "WGS_1984_UTM_Zone_50S",
    lon0: 117,
    k0: 0.9996,
    fe: 500000,
    fn: 10000000,
    lat0: 0,
    satuan: 1,
    datumLain: false,
  });
  const tm3 = bacaPrj(PRJ_TM3);
  assert.equal(tm3.nama, "DGN95 / Indonesia TM-3 zone 50.1");
  assert.equal(tm3.lon0, 115.5);
  assert.equal(tm3.fn, 1500000);
  assert.equal(bacaPrj('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]]').geografis, true);
  assert.equal(bacaPrj('PROJCS["X",GEOGCS["Y"],PROJECTION["Lambert_Conformal_Conic"]]').tidakDikenal, true);
  assert.equal(bacaPrj(""), null);
  // ID74 (elipsoid GRS 1967): bidangnya akan bergeser, admin perlu tahu.
  assert.equal(bacaPrj(PRJ_TM3.replace("6378137.0", "6378160.0")).datumLain, true);
});

test("zonaDi: Banjarbaru = TM-3 zona 50.1 dan UTM zona 50", async () => {
  const { zonaDi } = await muat();
  const z = zonaDi(WILAYAH.lon);
  assert.equal(z.tm3.nama, "TM-3 zona 50.1");
  assert.equal(z.tm3.lon0, 115.5);
  assert.equal(z.utmS.lon0, 117);
  assert.equal(zonaDi(118).tm3.nama, "TM-3 zona 50.2");
});

test("pilihCrs: .prj yang salah dilewati, tiap titik mendapat sistem koordinat yang membawanya ke Banjarbaru", async () => {
  const { calonCrs, pilihCrs, bacaPrj } = await muat();
  const calon = calonCrs(WILAYAH, bacaPrj(PRJ_UTM50S));
  const nama = (k) => (k < 0 ? null : calon[k].nama);
  // Angka TM-3 di berkas ber-.prj UTM (Banjarbaru Utara).
  assert.equal(nama(pilihCrs(calon, ...keTm(114.828289, -3.442415, TM3), WILAYAH)), "TM-3 zona 50.1");
  // Angka UTM (Sungai Besar).
  assert.equal(nama(pilihCrs(calon, ...keTm(114.83, -3.46, UTM50S), WILAYAH)), "WGS_1984_UTM_Zone_50S");
  // Sudah berderajat.
  assert.equal(nama(pilihCrs(calon, 114.83, -3.46, WILAYAH)), "WGS 84 (derajat)");
  // Bidang nyasar di data Cempaka.
  assert.equal(pilihCrs(calon, 458373.229, 1112000.868, WILAYAH), -1);
});

test("cincinKeGeometri: lubang masuk ke cincin luarnya, dua cincin luar = MultiPolygon", async () => {
  const { cincinKeGeometri } = await muat();
  const searah = (x, y, d) => [[x, y], [x, y + d], [x + d, y + d], [x + d, y], [x, y]];
  const lawan = (x, y, d) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
  const g = cincinKeGeometri([searah(0, 0, 10), lawan(2, 2, 2)]);
  assert.equal(g.type, "Polygon");
  assert.equal(g.coordinates.length, 2);
  const m = cincinKeGeometri([searah(0, 0, 10), searah(20, 0, 5), lawan(21, 1, 1)]);
  assert.equal(m.type, "MultiPolygon");
  assert.equal(m.coordinates[1].length, 2);
  // Penulis yang membalik arah semua cincin: tetap terbaca sebagai bidang.
  assert.equal(cincinKeGeometri([lawan(0, 0, 10)]).type, "Polygon");
});

test("kelompokkanBerkas: per nama shapefile, ekstensi tak peduli huruf besar, yang kurang ditandai", async () => {
  const { kelompokkanBerkas } = await muat();
  const g = kelompokkanBerkas(
    ["Cempaka.SHP", "Cempaka.dbf", "Cempaka.prj", "Cempaka.sbn", "Utara.shp", "catatan.txt"].map((name) => ({ name }))
  );
  assert.deepEqual(
    g.map((x) => [x.nama, x.kurang]),
    [
      ["Cempaka", []],
      ["Utara", ["dbf"]],
    ]
  );
  assert.equal(g[0].prj.name, "Cempaka.prj");
});

/* ---------- shapefile buatan ---------- */

/** .shp poligon dari daftar bentuk: tiap bentuk = cincin-cincin [[x, y], ...], atau null. */
function buatShp(bentuk) {
  const rekaman = bentuk.map((cincin, i) => {
    let isi;
    if (!cincin) {
      isi = Buffer.alloc(4);
    } else {
      const nTitik = cincin.reduce((n, c) => n + c.length, 0);
      isi = Buffer.alloc(44 + 4 * cincin.length + 16 * nTitik);
      isi.writeInt32LE(5, 0);
      isi.writeInt32LE(cincin.length, 36);
      isi.writeInt32LE(nTitik, 40);
      let t = 0;
      cincin.forEach((c, b) => {
        isi.writeInt32LE(t, 44 + 4 * b);
        for (const [x, y] of c) {
          const o = 44 + 4 * cincin.length + 16 * t;
          isi.writeDoubleLE(x, o);
          isi.writeDoubleLE(y, o + 8);
          t++;
        }
      });
    }
    const kepala = Buffer.alloc(8);
    kepala.writeInt32BE(i + 1, 0);
    kepala.writeInt32BE(isi.length / 2, 4);
    return Buffer.concat([kepala, isi]);
  });
  const kepala = Buffer.alloc(100);
  kepala.writeInt32BE(9994, 0);
  kepala.writeInt32BE((100 + rekaman.reduce((n, r) => n + r.length, 0)) / 2, 24);
  kepala.writeInt32LE(1000, 28);
  kepala.writeInt32LE(5, 32);
  return Buffer.concat([kepala, ...rekaman]);
}

/** .dbf dari kolom [{ nama, tipe, panjang }] dan baris (objek); `hapus` = indeks baris bertanda terhapus. */
function buatDbf(kolom, baris, hapus = new Set()) {
  const panjangKepala = 32 + 32 * kolom.length + 1;
  const panjangRekaman = 1 + kolom.reduce((n, k) => n + k.panjang, 0);
  const kepala = Buffer.alloc(panjangKepala);
  kepala.writeUInt8(3, 0);
  kepala.writeUInt32LE(baris.length, 4);
  kepala.writeUInt16LE(panjangKepala, 8);
  kepala.writeUInt16LE(panjangRekaman, 10);
  kolom.forEach((k, i) => {
    const o = 32 + 32 * i;
    kepala.write(k.nama, o, "latin1");
    kepala.write(k.tipe, o + 11, "latin1");
    kepala.writeUInt8(k.panjang, o + 16);
  });
  kepala.writeUInt8(0x0d, panjangKepala - 1);
  const isi = baris.map((b, i) => {
    const r = Buffer.alloc(panjangRekaman, 0x20);
    if (hapus.has(i)) r.write("*", 0, "latin1");
    let o = 1;
    for (const k of kolom) {
      const v = b[k.nama] === undefined || b[k.nama] === null ? "" : String(b[k.nama]);
      const teks = k.tipe === "N" ? v.padStart(k.panjang) : v;
      Buffer.from(teks, "utf8").copy(r, o, 0, k.panjang);
      o += k.panjang;
    }
    return r;
  });
  return Buffer.concat([kepala, ...isi, Buffer.from([0x1a])]);
}

/** Persegi searah jarum jam (cincin luar) di sekitar titik berderajat, dalam koordinat proyeksi `p`. */
const persegi = (lon, lat, p, d = 20) => {
  const [x, y] = keTm(lon, lat, p);
  return [[x, y], [x, y + d], [x + d, y + d], [x + d, y], [x, y]];
};

const KOLOM = [
  { nama: "KODEWILAYA", tipe: "C", panjang: 20 },
  { nama: "KECAMATAN", tipe: "C", panjang: 40 },
  { nama: "KELURAHAN", tipe: "C", panjang: 40 },
  { nama: "TIPEHAK", tipe: "C", panjang: 30 },
  { nama: "NIB", tipe: "C", panjang: 10 },
  { nama: "LUASPETA", tipe: "N", panjang: 19 },
  { nama: "PENGGUNAAN", tipe: "C", panjang: 30 },
  { nama: "OBJECTID", tipe: "N", panjang: 10 },
];

const baris = (nib, kelurahan, lebih = {}) => ({
  KODEWILAYA: "17117102",
  KECAMATAN: "Banjarbaru Utara",
  KELURAHAN: kelurahan,
  TIPEHAK: "Hak Milik",
  NIB: nib,
  LUASPETA: "161.393000000000001",
  OBJECTID: 1,
  ...lebih,
});

test("bukaShapefile: .prj salah, CRS campur, bidang nyasar, bentuk kosong, baris terhapus, bidang berlubang", async () => {
  const { bukaShapefile } = await muat();
  const lubang = (() => {
    const [x, y] = keTm(114.8301, -3.4399, TM3); // ±11 m di timur laut sudut bidang 40 m
    return [[x, y], [x + 4, y], [x + 4, y + 4], [x, y + 4], [x, y]];
  })();
  const bentuk = [
    [persegi(114.828289, -3.442415, TM3)], // TM-3 walau .prj bertuliskan UTM
    [persegi(114.83, -3.46, UTM50S)], // UTM
    [[[458373.229, 1112000.868], [458373.229, 1112020], [458393, 1112020], [458373.229, 1112000.868]]], // nyasar
    null, // bentuk kosong
    [persegi(114.82, -3.45, TM3)], // baris .dbf-nya terhapus
    [persegi(114.83, -3.44, TM3, 40), lubang], // berlubang
    (() => {
      // Bentuknya hanya garis (ada 43 di data BPN Banjarbaru).
      const [x, y] = keTm(114.834044, -3.460571, TM3);
      return [[[x, y], [x, y], [x + 3, y + 36], [x, y]]];
    })(),
  ];
  const isiDbf = [
    baris("00214", "Komet"),
    baris("04939", "Sungai Besar"),
    baris("01272", "Bangkal"),
    baris("00001", "Komet"),
    baris("00002", "Komet"),
    baris("00003", "Paläm", { PENGGUNAAN: "Rumah" }),
    baris("00765", "Guntung Paikat"),
  ];
  const sf = await bukaShapefile(
    {
      nama: "Uji",
      shp: new Blob([buatShp(bentuk)]),
      dbf: new Blob([buatDbf(KOLOM, isiDbf, new Set([4]))]),
      prj: new Blob([PRJ_UTM50S]),
      cpg: new Blob(["UTF-8"]),
    },
    WILAYAH
  );
  assert.equal(sf.jumlah, 7);
  assert.equal(sf.kolom.nib, "NIB");

  const fitur = [];
  // Tahap kecil: rekaman .dbf dibaca sepotong-sepotong.
  for await (const t of sf.tahap(4)) fitur.push(...t);

  assert.deepEqual(
    fitur.map((f) => f.nib),
    ["00214", "04939", "00003"]
  );
  assert.deepEqual(sf.laporan.perCrs, { "TM-3 zona 50.1": 2, WGS_1984_UTM_Zone_50S: 1 });
  assert.equal(sf.laporan.nyasar, 1);
  assert.deepEqual(sf.laporan.contohNyasar.map((c) => c.nib), ["01272"]);
  assert.equal(sf.laporan.kosong, 1);
  assert.equal(sf.laporan.terhapus, 1);
  assert.equal(sf.laporan.rusak, 1);
  assert.deepEqual(sf.laporan.contohRusak, [{ nib: "00765", kelurahan: "Guntung Paikat" }]);
  assert.equal(sf.laporan.diambil, 3);

  // Titik pertama tiap bidang kembali ke derajat asalnya (dibulatkan 6 desimal).
  assert.deepEqual(fitur[0].geometri.coordinates[0][0], [114.828289, -3.442415]);
  assert.deepEqual(fitur[1].geometri.coordinates[0][0], [114.83, -3.46]);

  const [a, , c] = fitur;
  assert.equal(a.kodeWilayah, "17117102");
  assert.equal(a.luasPeta, 161.39);
  assert.deepEqual(a.atribut, {}); // OBJECTID dibuang
  assert.equal(c.kelurahan, "Paläm"); // UTF-8 dari .cpg
  assert.deepEqual(c.atribut, { PENGGUNAAN: "Rumah" });
  assert.equal(c.geometri.type, "Polygon");
  assert.equal(c.geometri.coordinates.length, 2);
});

test("bukaShapefile: .shp dan .dbf yang tidak sepasang ditolak", async () => {
  const { bukaShapefile } = await muat();
  const sf = await bukaShapefile(
    {
      nama: "Rusak",
      shp: new Blob([buatShp([[persegi(114.82, -3.45, TM3)]])]),
      dbf: new Blob([buatDbf(KOLOM, [baris("1", "A"), baris("2", "B")])]),
    },
    WILAYAH
  );
  await assert.rejects(async () => {
    for await (const _ of sf.tahap()) void _;
  }, /tidak sepasang/);
});

test("bukaShapefile: berkas garis / titik ditolak dengan pesan yang jelas", async () => {
  const { bukaShapefile } = await muat();
  const shp = buatShp([]);
  shp.writeInt32LE(3, 32);
  await assert.rejects(
    bukaShapefile({ nama: "Jalan", shp: new Blob([shp]), dbf: new Blob([buatDbf(KOLOM, [])]) }, WILAYAH),
    /garis, bukan bidang/
  );
});
