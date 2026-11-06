import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { bukaShapefile, kelompokkanBerkas } from "../lib/shapefile.js";
import { formatUkuran } from "../lib/lapisanPeta.js";
import { formatWaktu } from "../lib/format.js";
import { warnaKecamatan } from "../lib/persilBpn.js";
import { ContohLapisan } from "./peta/bersama.jsx";

/**
 * Pengelolaan persil BPN - khusus admin, dibuka dari tombol Lapisan di Peta
 * Sensus (peta/PilihLapisan.jsx).
 *
 * Impor: admin memilih berkas shapefile (.shp + .dbf, beserta .prj / .cpg bila
 * ada), boleh beberapa kecamatan sekaligus. Browser membacanya
 * (lib/shapefile.js) dan mengirim bidangnya bertahap; baru setelah semua
 * berkas terkirim server menampilkannya, menggantikan kelurahan yang sama.
 * Gagal atau dibatalkan di tengah jalan = persil lama tetap seperti semula.
 *
 * ringkasan : GET /api/persil (lib/persilBpn.js usePersilBpn().ringkasan)
 * onBerubah : muat ulang ringkasan setelah impor / hapus
 */

/** Ukuran satu kiriman (byte JSON): jauh di bawah batas JSON server 2 MB. */
const KIRIM_BAIT = 1.2 * 1024 * 1024;

const angka = (n) => Number(n || 0).toLocaleString("id-ID");

class Dibatalkan extends Error {}

/** Persil tersimpan per kecamatan: [{ kecamatan, kelurahan: [nama], jumlah, kunci: [kunci wilayah] }]. */
function perKecamatan(wilayah = []) {
  const per = new Map();
  for (const w of wilayah) {
    const nama = w.kecamatan || "(tanpa kecamatan)";
    if (!per.has(nama)) per.set(nama, { kecamatan: nama, kelurahan: [], jumlah: 0, kunci: [], diimpor: null });
    const k = per.get(nama);
    k.kelurahan.push(w.kelurahan || "(tanpa kelurahan)");
    k.jumlah += w.jumlah;
    k.kunci.push(w.kunci);
    if (!k.diimpor || new Date(w.diimpor) > new Date(k.diimpor)) k.diimpor = w.diimpor;
  }
  return [...per.values()];
}

/**
 * Catatan untuk satu berkas yang sudah dibaca: sistem koordinat yang dipakai
 * (dan bila berbeda dari .prj), bidang yang dilewati.
 */
function catatanBerkas({ prj, adaPrj, laporan }) {
  const catatan = [];
  const dipakai = Object.entries(laporan.perCrs).sort((a, b) => b[1] - a[1]);
  const daftarDipakai = dipakai.map(([n, j]) => `${n} (${angka(j)} bidang)`).join(", ");
  const cocokPrj = prj && dipakai.length === 1 && prj.nama === dipakai[0][0];

  if (!adaPrj) {
    if (dipakai.length) catatan.push(`Tanpa .prj - sistem koordinat ditebak: ${daftarDipakai}.`);
  } else if (!prj || prj.tidakDikenal) {
    catatan.push(`Isi .prj tidak dikenali${prj?.nama ? ` (${prj.nama})` : ""}; sistem koordinat ditebak: ${daftarDipakai}.`);
  } else if (!cocokPrj && dipakai.length) {
    catatan.push(`Keterangan .prj (${prj.nama}) tidak cocok dengan koordinatnya; dipakai: ${daftarDipakai}.`);
  }
  if (adaPrj && prj?.datumLain) catatan.push("Datum di .prj bukan WGS 84 / DGN95: bidangnya bisa bergeser puluhan meter.");
  if (!adaPrj && dipakai.length > 1) catatan.push("Berkas ini memakai lebih dari satu sistem koordinat.");

  if (laporan.nyasar) {
    const contoh = laporan.contohNyasar
      .map((c) => [c.nib && `NIB ${c.nib}`, c.kelurahan].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; ");
    catatan.push(
      `${angka(laporan.nyasar)} bidang tidak jatuh di wilayah Banjarbaru dengan sistem koordinat mana pun, dilewati` +
        (contoh ? `: ${contoh}` : "") +
        "."
    );
  }
  if (laporan.rusak) {
    const contoh = laporan.contohRusak
      .map((c) => [c.nib && `NIB ${c.nib}`, c.kelurahan].filter(Boolean).join(", "))
      .filter(Boolean)
      .join("; ");
    catatan.push(
      `${angka(laporan.rusak)} bidang di berkas BPN bentuknya rusak (hanya garis / titik, tidak bisa digambar), dilewati` +
        (contoh ? `: ${contoh}` : "") +
        "."
    );
  }
  const kosong = laporan.kosong + laporan.terhapus;
  if (kosong) catatan.push(`${angka(kosong)} baris tanpa bentuk / terhapus dilewati.`);
  return catatan;
}

const ALASAN_TOLAK = {
  "di luar wilayah": "di luar wilayah",
  "tanpa bentuk": "bentuknya rusak",
  "terlalu rumit": "bentuknya terlalu rumit",
  "bukan bidang": "bukan bidang",
};

export default function KelolaPersil({ ringkasan, onBerubah }) {
  const toast = useToast();
  const berkasRef = useRef(null);
  const batalRef = useRef(false);
  const [kelompok, setKelompok] = useState([]);
  const [proses, setProses] = useState(null); // { nama, ke, dari, dibaca, jumlah } | { menyelesaikan: true }
  const [hasil, setHasil] = useState(null); // { perBerkas, ditolak, server }
  const [yakinHapus, setYakinHapus] = useState(null); // nama kecamatan | "semua"
  const [menghapus, setMenghapus] = useState(false);

  const daftarKec = useMemo(() => perKecamatan(ringkasan?.wilayah), [ringkasan]);
  const warna = useMemo(() => warnaKecamatan(daftarKec.map((k) => k.kecamatan)), [daftarKec]);
  const siap = kelompok.filter((g) => g.kurang.length === 0);
  const sibuk = Boolean(proses) || menghapus;

  // Menutup / memuat ulang halaman di tengah impor membuang kiriman yang belum selesai.
  useEffect(() => {
    if (!proses) return undefined;
    const tahan = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [proses]);

  const pilihBerkas = (e) => {
    const daftar = [...(e.target.files || [])];
    e.target.value = ""; // berkas yang sama boleh dipilih lagi
    const g = kelompokkanBerkas(daftar);
    if (daftar.length && g.length === 0) {
      toast("Tidak ada berkas .shp / .dbf di pilihan itu. Ekstrak dulu berkas RAR / ZIP-nya.", true);
    }
    setKelompok(g);
    setHasil(null);
  };

  const impor = async () => {
    batalRef.current = false;
    setHasil(null);
    let token = null;
    try {
      const konf = await api.getKonfigurasi();
      const wilayah = konf.persil?.wilayah;
      if (!wilayah) throw new Error("Server belum mendukung persil BPN. Muat ulang halaman.");
      const mulai = await api.mulaiImporPersil();
      token = mulai.token;

      const perBerkas = [];
      const ditolak = {};
      for (let b = 0; b < siap.length; b++) {
        const g = siap[b];
        setProses({ nama: g.nama, ke: b + 1, dari: siap.length, dibaca: 0, jumlah: 0 });
        let sf;
        try {
          sf = await bukaShapefile(g, wilayah);
        } catch (e) {
          throw new Error(`${g.nama}: ${e.message}`);
        }
        setProses((p) => ({ ...p, jumlah: sf.jumlah }));

        let kiriman = [];
        let ukuran = 0;
        const kirim = async () => {
          if (!kiriman.length) return;
          const h = await api.kirimPersil(token, { sumber: g.nama, fitur: kiriman });
          for (const [alasan, n] of Object.entries(h.ditolak || {})) ditolak[alasan] = (ditolak[alasan] || 0) + n;
          kiriman = [];
          ukuran = 0;
        };

        for await (const fitur of sf.tahap(1000)) {
          for (const f of fitur) {
            const n = JSON.stringify(f).length + 1;
            if (kiriman.length && (ukuran + n > KIRIM_BAIT || kiriman.length >= mulai.kirimMaks)) await kirim();
            kiriman.push(f);
            ukuran += n;
          }
          if (batalRef.current) throw new Dibatalkan();
          setProses((p) => ({ ...p, dibaca: sf.laporan.dibaca }));
        }
        await kirim();
        perBerkas.push({ nama: g.nama, prj: sf.prj, adaPrj: Boolean(g.prj), laporan: { ...sf.laporan } });
      }

      if (batalRef.current) throw new Dibatalkan();
      setProses({ menyelesaikan: true });
      const server = await api.selesaikanImporPersil(token);
      token = null;
      setHasil({ perBerkas, ditolak, server });
      setKelompok([]);
      api.lupakanPersilTitik();
      await onBerubah();
      toast(`Persil BPN diperbarui: ${angka(server.jumlah)} bidang di ${angka(server.wilayah)} kelurahan.`);
    } catch (e) {
      if (token) api.batalkanImporPersil(token).catch(() => {});
      toast(e instanceof Dibatalkan ? "Impor dibatalkan. Persil lama tidak berubah." : e.message, !(e instanceof Dibatalkan));
    } finally {
      setProses(null);
    }
  };

  const hapus = async (kec) => {
    setMenghapus(true);
    try {
      const isi = kec === "semua" ? { semua: true } : { kunci: daftarKec.find((k) => k.kecamatan === kec)?.kunci || [] };
      const h = await api.hapusPersil(isi);
      api.lupakanPersilTitik();
      await onBerubah();
      toast(`${angka(h.dihapus)} bidang persil dihapus.`);
      setYakinHapus(null);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMenghapus(false);
    }
  };

  const persen = proses && proses.jumlah ? Math.round((proses.dibaca / proses.jumlah) * 100) : 0;

  return (
    <div className="fk-kelola-lapisan">
      <section className="fk-kelola-bagian">
        <div className="fk-kelola-judul">Impor shapefile persil BPN</div>
        <p className="fk-hint-kecil">
          Pilih berkas <strong>.shp</strong> dan <strong>.dbf</strong>, beserta <strong>.prj</strong> dan{" "}
          <strong>.cpg</strong> bila ada. Boleh beberapa kecamatan sekaligus. Ekstrak dulu berkas RAR / ZIP-nya
          (klik kanan → Extract).
        </p>
        <p className="fk-hint-kecil">
          Sistem koordinat ditebak per bidang (TM-3, UTM, atau derajat WGS 84), jadi .prj yang salah atau tidak ada
          tidak menjadi masalah. Kelurahan yang sudah ada diganti isinya; kelurahan lain tidak berubah.
        </p>

        <div className="fk-berkas-pilih">
          <button type="button" className="fk-btn-ghost" onClick={() => berkasRef.current?.click()} disabled={sibuk}>
            {kelompok.length ? "Ganti berkas" : "Pilih berkas shapefile"}
          </button>
          <input ref={berkasRef} type="file" multiple accept=".shp,.dbf,.prj,.cpg" onChange={pilihBerkas} hidden />
        </div>

        {kelompok.length > 0 && (
          <ul className="fk-persil-berkas">
            {kelompok.map((g) => (
              <li key={g.nama} className={g.kurang.length ? "is-kurang" : ""}>
                <span className="fk-lapisan-nama">{g.nama}</span>
                <span className="fk-hint-kecil">
                  {g.kurang.length
                    ? `Kurang berkas ${g.kurang.map((e) => `.${e}`).join(" dan ")} - tidak ikut diimpor`
                    : [
                        `.shp ${formatUkuran(g.shp.size)}`,
                        `.dbf ${formatUkuran(g.dbf.size)}`,
                        g.prj ? ".prj" : "tanpa .prj",
                      ].join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {proses ? (
          <div className="fk-persil-proses" role="status">
            <span>
              {proses.menyelesaikan
                ? "Menyimpan dan menampilkan persil…"
                : `${proses.nama} (${proses.ke} dari ${proses.dari}) · ${angka(proses.dibaca)} / ${angka(proses.jumlah)} bidang`}
            </span>
            <div className="fk-progres">
              <div style={{ width: `${proses.menyelesaikan ? 100 : persen}%` }} />
            </div>
            {!proses.menyelesaikan && (
              <button type="button" className="fk-mini" onClick={() => (batalRef.current = true)}>
                Batalkan
              </button>
            )}
            <span className="fk-hint-kecil">Biarkan halaman ini terbuka sampai impor selesai.</span>
          </div>
        ) : (
          siap.length > 0 && (
            <div className="fk-ekspor-aksi">
              <button type="button" className="fk-btn" onClick={impor} disabled={sibuk}>
                {`Impor ${siap.length} shapefile`}
              </button>
            </div>
          )
        )}

        {hasil && (
          <div className="fk-persil-hasil">
            <strong>
              Tersimpan {angka(hasil.server.jumlah)} bidang di {angka(hasil.server.wilayah)} kelurahan
              {hasil.server.diganti ? ` (menggantikan ${angka(hasil.server.diganti)} bidang lama)` : ""}.
            </strong>
            {hasil.perBerkas.map((b) => {
              const catatan = catatanBerkas(b);
              return (
                <div key={b.nama} className="fk-persil-hasil-berkas">
                  <span>
                    {b.nama}: {angka(b.laporan.diambil)} bidang
                  </span>
                  {catatan.map((c, i) => (
                    <span key={i} className="fk-hint-kecil">
                      {c}
                    </span>
                  ))}
                </div>
              );
            })}
            {Object.keys(hasil.ditolak).length > 0 && (
              <span className="fk-hint-kecil">
                Ditolak server:{" "}
                {Object.entries(hasil.ditolak)
                  .map(([a, n]) => `${angka(n)} bidang ${ALASAN_TOLAK[a] || a}`)
                  .join(", ")}
                .
              </span>
            )}
          </div>
        )}
      </section>

      <section className="fk-kelola-bagian">
        <div className="fk-kelola-judul">Persil tersimpan</div>
        {!ringkasan || ringkasan.jumlah === 0 ? (
          <p className="fk-hint-kecil">Belum ada persil.</p>
        ) : (
          <>
            <p className="fk-hint-kecil">
              {angka(ringkasan.jumlah)} bidang di {angka(ringkasan.wilayah.length)} kelurahan. Tampil di Peta
              Sensus saat peta diperbesar; NIB-nya ikut di ekspor data dan di halaman data.
            </p>
            {daftarKec.map((k) => (
              <div className="fk-lapisan-baris" key={k.kecamatan}>
                <div className="fk-lapisan-baris-atas">
                  <ContohLapisan warna={warna[k.kecamatan]?.peta || "#64748B"} />
                  <span className="fk-lapisan-teks">
                    <span className="fk-lapisan-nama">Kec. {k.kecamatan}</span>
                    <span className="fk-hint-kecil">
                      {angka(k.jumlah)} bidang · {k.kelurahan.join(", ")}
                      {k.diimpor ? ` · diimpor ${formatWaktu(k.diimpor)}` : ""}
                    </span>
                  </span>
                  {yakinHapus !== k.kecamatan && (
                    <button
                      type="button"
                      className="fk-mini is-danger"
                      onClick={() => setYakinHapus(k.kecamatan)}
                      disabled={sibuk}
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {yakinHapus === k.kecamatan && (
                  <div className="fk-lapisan-yakin" role="alert">
                    <span>Hapus {angka(k.jumlah)} bidang persil Kec. {k.kecamatan}? Berkas shapefile-nya tidak terpengaruh.</span>
                    <div className="fk-lapisan-baris-aksi">
                      <button type="button" className="fk-mini is-danger" onClick={() => hapus(k.kecamatan)} disabled={sibuk}>
                        {menghapus ? "Menghapus..." : "Ya, hapus"}
                      </button>
                      <button type="button" className="fk-mini" onClick={() => setYakinHapus(null)} disabled={menghapus}>
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {yakinHapus === "semua" ? (
              <div className="fk-lapisan-yakin" role="alert">
                <span>Hapus seluruh {angka(ringkasan.jumlah)} bidang persil dari aplikasi?</span>
                <div className="fk-lapisan-baris-aksi">
                  <button type="button" className="fk-mini is-danger" onClick={() => hapus("semua")} disabled={sibuk}>
                    {menghapus ? "Menghapus..." : "Ya, hapus semua"}
                  </button>
                  <button type="button" className="fk-mini" onClick={() => setYakinHapus(null)} disabled={menghapus}>
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="fk-mini is-danger fk-persil-hapus-semua"
                onClick={() => setYakinHapus("semua")}
                disabled={sibuk}
              >
                Hapus semua persil
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
