"use strict";

/**
 * Validasi isi formulir, dan berkas impor/ekspor bank formulir.
 *
 * Berkas bank formulir adalah JSON berisi susunan formulir (judul, pertanyaan,
 * opsi) tanpa data isian dan tanpa id database, supaya bisa dipindahkan antar
 * server - mis. dari server uji ke produksi. Setiap formulir di berkas lewat
 * validasi yang sama dengan editor admin (bacaPayload).
 */

const { ApiError, badRequest } = require("./http");
const { TIPE, BERTIPE_OPSI } = require("./answers");
const { sumberEpbbSah } = require("./epbb");

/** Penanda berkas, agar JSON lain (mis. hasil ekspor aplikasi lain) tidak ikut terbaca. */
const JENIS_BERKAS = "sensus-pajak/bank-formulir";
const VERSI_BERKAS = 1;

/** Posisi pertanyaan di halaman isi data. "" = lebar penuh. */
const KOLOM = ["", "kiri", "kanan"];

/** Validasi & normalisasi body {judul, deskripsi, pertanyaan[]} dari editor admin. */
function bacaPayload(body) {
  const judul = String(body?.judul ?? "").trim();
  if (!judul) throw badRequest("Judul formulir wajib diisi.");
  if (judul.length > 200) throw badRequest("Judul formulir maksimal 200 karakter.");

  const deskripsi = String(body?.deskripsi ?? "").trim();

  // Nama ikon dipilih dari daftar di klien; server hanya memastikan bentuknya aman.
  const ikonMasuk = String(body?.ikon ?? "").trim();
  const ikon = /^[a-z0-9-]{1,40}$/.test(ikonMasuk) ? ikonMasuk : "";

  const judulKolom = (v) => String(v ?? "").trim().slice(0, 100);
  const judulKolomKiri = judulKolom(body?.judulKolomKiri);
  const judulKolomKanan = judulKolom(body?.judulKolomKanan);

  const masuk = Array.isArray(body?.pertanyaan) ? body.pertanyaan : [];
  const pertanyaan = masuk.map((q, i) => {
    const tipe = String(q?.tipe || "");
    if (!TIPE.includes(tipe)) throw badRequest(`Tipe pertanyaan "${tipe}" tidak dikenal.`);

    const label = String(q?.label ?? "").trim();
    if (label.length > 300) throw badRequest("Label pertanyaan maksimal 300 karakter.");

    const keterangan = String(q?.keterangan ?? "").trim();
    if (keterangan.length > 500) throw badRequest("Keterangan pertanyaan maksimal 500 karakter.");

    let opsi = [];
    if (BERTIPE_OPSI.includes(tipe)) {
      opsi = (Array.isArray(q?.opsi) ? q.opsi : [])
        .map((o) => String(o ?? "").trim())
        .filter((o) => o !== "")
        .slice(0, 100);
      if (opsi.length === 0) {
        throw badRequest(
          `Pertanyaan "${label || "(tanpa judul)"}" bertipe ${tipe} harus punya minimal satu opsi.`
        );
      }
    }

    const id = Number(q?.id);

    return {
      id: Number.isInteger(id) && id > 0 ? id : null,
      tipe,
      label,
      keterangan,
      wajib: Boolean(q?.wajib),
      rangeHarga: tipe === "linetariff" ? Boolean(q?.rangeHarga) : false,
      isiEpbb: sumberEpbbSah(tipe, q?.isiEpbb) ? String(q.isiEpbb) : "",
      kolom: KOLOM.includes(q?.kolom) ? q.kolom : "",
      urutan: i,
      opsi,
    };
  });

  return { judul, deskripsi, ikon, judulKolomKiri, judulKolomKanan, pertanyaan };
}

/** Judul dibandingkan tanpa beda huruf besar/kecil dan spasi ganda. */
const kunciJudul = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Susun isi berkas ekspor dari formulir hasil bentukFormulir(), urut tampil.
 * Id sengaja dibuang: id hanya bermakna di database asalnya.
 */
function susunBerkasBank(formulir, diekspor = new Date()) {
  return {
    jenis: JENIS_BERKAS,
    versi: VERSI_BERKAS,
    diekspor: diekspor.toISOString(),
    formulir: formulir.map((f) => ({
      judul: f.judul,
      deskripsi: f.deskripsi || "",
      ikon: f.ikon || "",
      judulKolomKiri: f.judulKolomKiri || "",
      judulKolomKanan: f.judulKolomKanan || "",
      pertanyaan: (f.pertanyaan || []).map((q) => ({
        tipe: q.tipe,
        label: q.label,
        keterangan: q.keterangan || "",
        wajib: Boolean(q.wajib),
        rangeHarga: Boolean(q.rangeHarga),
        isiEpbb: q.isiEpbb || "",
        kolom: q.kolom || "",
        opsi: q.opsi || [],
      })),
    })),
  };
}

/**
 * Baca isi berkas impor.
 *
 * Seperti impor petugas, berkas diterima sebagian: formulir yang judulnya
 * sudah ada dilewati (baik di bank maupun di formulir sebelumnya dalam berkas
 * yang sama), formulir yang tidak lolos validasi ditolak, sisanya siap
 * ditambahkan. Karena itu berkas yang sama aman diimpor ulang.
 *
 * @param {unknown} isi JSON berkas
 * @param {string[]} judulAda judul formulir yang sudah ada di bank
 * @returns {{ galat?: string, dibaca?: number, tambah?: object[], dilewati?: object[], ditolak?: object[] }}
 *   `baris` pada dilewati/ditolak = urutan formulir di berkas, mulai 1.
 */
function bacaBerkasBank(isi, judulAda = []) {
  if (!isi || typeof isi !== "object" || isi.jenis !== JENIS_BERKAS || !Array.isArray(isi.formulir)) {
    return { galat: "Berkas ini bukan hasil ekspor bank formulir Sensus Pajak." };
  }
  if (Number(isi.versi) > VERSI_BERKAS) {
    return { galat: "Berkas dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi ini dulu." };
  }
  if (isi.formulir.length === 0) return { galat: "Berkas tidak berisi formulir." };

  const terpakai = new Set(judulAda.map(kunciJudul));
  const tambah = [];
  const dilewati = [];
  const ditolak = [];

  isi.formulir.forEach((mentah, i) => {
    const baris = i + 1;
    const nama = String(mentah?.judul ?? "").trim();

    let f;
    try {
      f = bacaPayload(mentah);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      ditolak.push({ baris, nama, alasan: e.message });
      return;
    }

    const kunci = kunciJudul(f.judul);
    if (terpakai.has(kunci)) {
      dilewati.push({ baris, nama: f.judul, alasan: "Judul formulir sudah ada." });
      return;
    }
    terpakai.add(kunci);
    // Id pertanyaan dari server asal tidak boleh ikut: bisa menunjuk pertanyaan lain di sini.
    tambah.push({ ...f, pertanyaan: f.pertanyaan.map((q) => ({ ...q, id: null })) });
  });

  return { dibaca: isi.formulir.length, tambah, dilewati, ditolak };
}

module.exports = { JENIS_BERKAS, VERSI_BERKAS, bacaPayload, kunciJudul, susunBerkasBank, bacaBerkasBank };
