import { useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { CheckIcon } from "./Icons.jsx";
import { ContohLapisan } from "./peta/bersama.jsx";
import { PALET_LAPISAN, warnaBerikutnya, formatUkuran } from "../lib/lapisanPeta.js";

/**
 * Isi pengelolaan lapisan peta dari GIS - khusus admin, ditampilkan di lembar
 * yang dibuka tombol Lapisan di Peta Sensus (peta/PilihLapisan.jsx). Unggah
 * GeoJSON hasil ekspor QGIS / ArcGIS, ganti nama dan warna, atur apakah
 * langsung tampil saat peta dibuka, atau hapus. Aturan berkasnya (EPSG:4326,
 * ukuran) diperiksa server: server/src/lapisanPeta.js.
 *
 * Hapus dikonfirmasi di barisnya sendiri, bukan lewat useDialog: dialog di atas
 * lembar membuang entri riwayatnya saat ditutup, dan lembarnya ikut tertutup.
 *
 * daftar    : lapisan yang ada (useLapisanPeta().daftar)
 * onBerubah : muat ulang daftar setelah ada perubahan
 */

/** "batas-blok_pbb.geojson" -> "batas blok pbb" (sama dengan server). */
const namaDariBerkas = (nama) =>
  String(nama || "")
    .replace(/\.(geo)?json$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

/** Pilihan warna: bulatan-bulatan palet. */
function PilihWarna({ warna, onChange, kecil = false, disabled = false }) {
  return (
    <div className={"fk-palet" + (kecil ? " is-kecil" : "")} role="radiogroup" aria-label="Warna lapisan">
      {PALET_LAPISAN.map((w) => (
        <button
          type="button"
          key={w}
          role="radio"
          aria-checked={w === warna?.toUpperCase()}
          aria-label={`Warna ${w}`}
          className={"fk-palet-warna" + (w === warna?.toUpperCase() ? " is-on" : "")}
          style={{ "--warna": w }}
          disabled={disabled}
          onClick={() => onChange(w)}
        />
      ))}
    </div>
  );
}

/** Satu lapisan tersimpan beserta pengaturannya. */
function BarisLapisan({ l, onBerubah }) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const [ubahNama, setUbahNama] = useState(null); // null = tidak sedang mengubah nama
  const [yakinHapus, setYakinHapus] = useState(false);

  const simpan = async (data, pesan) => {
    setSibuk(true);
    try {
      await api.ubahLapisan(l.id, data);
      await onBerubah();
      if (pesan) toast(pesan);
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const hapus = async () => {
    setSibuk(true);
    try {
      await api.hapusLapisan(l.id);
      await onBerubah();
      toast(`Lapisan "${l.nama}" dihapus.`);
    } catch (e) {
      toast(e.message, true);
      setSibuk(false);
      setYakinHapus(false);
    }
  };

  return (
    <div className="fk-lapisan-baris">
      <div className="fk-lapisan-baris-atas">
        <ContohLapisan warna={l.warna} />
        {ubahNama === null ? (
          <span className="fk-lapisan-teks">
            <span className="fk-lapisan-nama">{l.nama}</span>
            <span className="fk-hint-kecil">
              {l.jumlahFitur.toLocaleString("id-ID")} fitur · {formatUkuran(l.ukuran)}
              {l.dibuatOleh ? ` · diunggah ${l.dibuatOleh}` : ""}
            </span>
          </span>
        ) : (
          <form
            className="fk-lapisan-ubah"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await simpan({ nama: ubahNama }, "Nama lapisan disimpan.")) setUbahNama(null);
            }}
          >
            <input
              className="fk-input"
              value={ubahNama}
              maxLength={100}
              onChange={(e) => setUbahNama(e.target.value)}
              aria-label="Nama lapisan"
              autoFocus
            />
            <button type="submit" className="fk-mini" disabled={sibuk || !ubahNama.trim()}>
              Simpan
            </button>
            <button type="button" className="fk-mini" onClick={() => setUbahNama(null)} disabled={sibuk}>
              Batal
            </button>
          </form>
        )}
      </div>

      {yakinHapus ? (
        <div className="fk-lapisan-yakin" role="alert">
          <span>Hapus dari Peta Sensus semua pemakai? Berkas aslinya di QGIS / ArcGIS tidak terpengaruh.</span>
          <div className="fk-lapisan-baris-aksi">
            <button type="button" className="fk-mini is-danger" onClick={hapus} disabled={sibuk}>
              {sibuk ? "Menghapus..." : "Ya, hapus"}
            </button>
            <button type="button" className="fk-mini" onClick={() => setYakinHapus(false)} disabled={sibuk}>
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="fk-lapisan-baris-aksi">
          <PilihWarna kecil warna={l.warna} disabled={sibuk} onChange={(w) => w !== l.warna && simpan({ warna: w })} />
          <button
            type="button"
            role="checkbox"
            aria-checked={l.tampil}
            className={"fk-mini fk-mini-saklar" + (l.tampil ? " is-on" : "")}
            disabled={sibuk}
            onClick={() =>
              simpan(
                { tampil: !l.tampil },
                l.tampil ? "Lapisan tidak lagi langsung tampil." : "Lapisan langsung tampil saat peta dibuka."
              )
            }
            title="Pemakai yang belum pernah mengatur lapisan ini melihatnya menyala saat Peta Sensus dibuka"
          >
            {l.tampil && <CheckIcon />} Tampil saat peta dibuka
          </button>
          {ubahNama === null && (
            <button type="button" className="fk-mini" onClick={() => setUbahNama(l.nama)} disabled={sibuk}>
              Ganti nama
            </button>
          )}
          <button type="button" className="fk-mini is-danger" onClick={() => setYakinHapus(true)} disabled={sibuk}>
            Hapus
          </button>
        </div>
      )}
    </div>
  );
}

export default function KelolaLapisan({ daftar = [], onBerubah }) {
  const toast = useToast();
  const berkasRef = useRef(null);
  const [berkas, setBerkas] = useState(null);
  const [nama, setNama] = useState("");
  const [warna, setWarna] = useState(PALET_LAPISAN[0]);
  const [tampil, setTampil] = useState(true);
  const [mengunggah, setMengunggah] = useState(false);
  const [maksMb, setMaksMb] = useState(18); // sementara, sampai /api/konfigurasi menjawab

  useEffect(() => {
    api
      .getKonfigurasi()
      .then((k) => k.lapisanMaksMb && setMaksMb(k.lapisanMaksMb))
      .catch(() => {});
  }, []);

  const pilihBerkas = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // berkas yang sama boleh dipilih lagi
    if (!f) return;
    if (f.size > maksMb * 1024 * 1024) {
      toast(
        `Ukuran berkas ${formatUkuran(f.size)}, melebihi ${maksMb} MB. Sederhanakan garisnya di QGIS ` +
          "(Vector → Geometry Tools → Simplify) atau pecah per kecamatan / kelurahan.",
        true
      );
      return;
    }
    setBerkas(f);
    setNama((n) => n.trim() || namaDariBerkas(f.name));
    setWarna(warnaBerikutnya(daftar));
  };

  const unggah = async () => {
    setMengunggah(true);
    try {
      const hasil = await api.unggahLapisan(berkas, { nama: nama.trim(), warna, tampil });
      await onBerubah();
      const lewat = hasil.dilewati ? ` ${hasil.dilewati.toLocaleString("id-ID")} fitur tanpa bentuk dilewati.` : "";
      toast(`Lapisan "${hasil.nama}" diunggah: ${hasil.jumlahFitur.toLocaleString("id-ID")} fitur.${lewat}`);
      setBerkas(null);
      setNama("");
      setTampil(true);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMengunggah(false);
    }
  };

  return (
    <div className="fk-kelola-lapisan">
      <section className="fk-kelola-bagian">
        <div className="fk-kelola-judul">Unggah lapisan baru</div>
        <p className="fk-hint-kecil">
          Berkas GeoJSON berkoordinat <strong>EPSG:4326 (WGS 84)</strong>, paling besar {maksMb} MB, mis. batas
          blok PBB atau persil.
          <br />
          <strong>QGIS:</strong> klik kanan layer → Export → Save Features As… → Format GeoJSON, CRS EPSG:4326 -
          WGS 84.
          <br />
          <strong>ArcGIS Pro:</strong> tool Features To JSON, centang Output to GeoJSON dan Project to WGS_1984.
        </p>

        <div className="fk-berkas-pilih">
          <button type="button" className="fk-btn-ghost" onClick={() => berkasRef.current?.click()} disabled={mengunggah}>
            {berkas ? "Ganti berkas" : "Pilih berkas GeoJSON"}
          </button>
          {berkas && (
            <span className="fk-hint-kecil">
              {berkas.name} · {formatUkuran(berkas.size)}
            </span>
          )}
          {/* Dipicu lewat tombol di atas: input berkas bawaan browser tidak bisa
              diseragamkan tampilannya dengan tombol lain. */}
          <input
            ref={berkasRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={pilihBerkas}
            hidden
          />
        </div>

        {berkas && (
          <>
            <span className="fk-q-name">Nama lapisan</span>
            <input
              className="fk-input"
              value={nama}
              maxLength={100}
              placeholder="mis. Batas blok PBB Cempaka"
              onChange={(e) => setNama(e.target.value)}
            />

            <span className="fk-q-name">Warna</span>
            <PilihWarna warna={warna} onChange={setWarna} disabled={mengunggah} />

            <button
              type="button"
              role="checkbox"
              aria-checked={tampil}
              className={"fk-choice" + (tampil ? " is-on" : "")}
              onClick={() => setTampil((t) => !t)}
            >
              <span className="fk-ind fk-ind-check">{tampil && <CheckIcon />}</span>
              <span>Langsung tampil saat Peta Sensus dibuka</span>
            </button>

            <div className="fk-ekspor-aksi">
              <button type="button" className="fk-btn" onClick={unggah} disabled={mengunggah || !nama.trim()}>
                {mengunggah ? "Mengunggah..." : "Unggah"}
              </button>
            </div>
          </>
        )}

        <p className="fk-hint-kecil">
          Semua yang bisa membuka Peta Sensus ikut melihat lapisan beserta atributnya. Buang dulu kolom data
          pribadi yang tidak perlu (mis. NIK pemilik) di QGIS sebelum mengunggah.
        </p>
      </section>

      <section className="fk-kelola-bagian">
        <div className="fk-kelola-judul">Lapisan tersimpan</div>
        {daftar.length === 0 ? (
          <p className="fk-hint-kecil">Belum ada lapisan.</p>
        ) : (
          daftar.map((l) => <BarisLapisan key={l.id} l={l} onBerubah={onBerubah} />)
        )}
      </section>
    </div>
  );
}
