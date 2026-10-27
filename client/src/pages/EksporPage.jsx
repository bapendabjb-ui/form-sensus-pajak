import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import CustomSelect from "../components/CustomSelect.jsx";
import { useToast } from "../components/Toast.jsx";
import { PageHead, Panel, Loading, ErrorBox } from "../components/Ui.jsx";
import LoginAdmin from "../components/LoginAdmin.jsx";

/**
 * Halaman ekspor: satu tempat untuk mengunduh data sebagai Excel atau CSV.
 *   - Per kertas kerja: semua formulir, atau satu formulir di kertas kerja itu.
 *   - Per formulir: seluruh data formulir itu dari semua kertas kerja.
 *   - Per kecamatan / kelurahan objek pajak: semua formulir atau satu formulir.
 *   - Per petugas: data di kertas kerja yang timnya memuat petugas itu.
 * Unduhannya sama dengan tombol ekspor di halaman kertas kerja & bank formulir.
 */

const SEMUA_FORMULIR = "Semua formulir";
const SEMUA_KELURAHAN = "Semua kelurahan";

const formatAngka = (n) => Number(n || 0).toLocaleString("id-ID");

/** "00012 · Andi Saputra +2 · 5 data" */
const labelKk = (k) => {
  const tim = k.petugas || [];
  const pj = tim[0]?.nama || "—";
  const lain = tim.length > 1 ? ` +${tim.length - 1}` : "";
  return `${k.nomor} · ${pj}${lain} · ${k.jumlahData} data`;
};

const labelJumlah = (judul, jumlah) => `${judul} · ${jumlah} data`;

function TombolUnduh({ onExcel, onCsv, disabled }) {
  return (
    <div className="fk-ekspor-aksi">
      <button type="button" className="fk-btn" onClick={onExcel} disabled={disabled}>
        Unduh Excel
      </button>
      <button type="button" className="fk-btn-ghost" onClick={onCsv} disabled={disabled}>
        Unduh CSV
      </button>
    </div>
  );
}

/**
 * Ringkasan sebelum mengunduh: jumlah kertas kerja & data, serta formulir yang
 * berisi data beserta jumlahnya. Dimuat ulang setiap `ambil` berganti (buat
 * dengan useCallback); null = belum ada pilihan.
 *
 * `formulir` hanya berlaku bila masih ada di ringkasan terbaru, supaya pilihan
 * formulir yang tertinggal dari pilihan sebelumnya tidak ikut terkirim.
 */
function useRingkasan(ambil) {
  const toast = useToast();
  const [ringkas, setRingkas] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [formId, setFormId] = useState(null); // null = semua formulir

  useEffect(() => {
    setRingkas(null);
    setMemuat(Boolean(ambil));
    if (!ambil) return undefined;
    let batal = false;
    ambil()
      .then((r) => !batal && setRingkas(r))
      .catch((e) => !batal && toast(e.message, true))
      .finally(() => !batal && setMemuat(false));
    return () => {
      batal = true;
    };
  }, [ambil, toast]);

  const formulir = ringkas?.formulir || [];
  const form = formulir.find((f) => f.id === formId) || null;
  const kosong = ringkas?.data === 0;
  return {
    ringkas,
    siap: Boolean(ringkas) && !memuat && !kosong,
    kosong,
    formId: form?.id ?? null,
    pilihFormulir: (
      <>
        <span className="fk-q-name">Formulir</span>
        <CustomSelect
          value={form ? labelJumlah(form.judul, form.jumlah) : SEMUA_FORMULIR}
          options={[SEMUA_FORMULIR, ...formulir.map((f) => labelJumlah(f.judul, f.jumlah))]}
          title="Pilih formulir"
          disabled={!ringkas || memuat || kosong}
          onChange={(label) => setFormId(formulir.find((f) => labelJumlah(f.judul, f.jumlah) === label)?.id ?? null)}
        />
      </>
    ),
  };
}

/**
 * Per kecamatan / kelurahan objek pajak (lihat server/src/eksporWilayah.js).
 * Daftar formulirnya hanya yang berisi data di wilayah itu.
 */
function PanelWilayah({ unduhKe }) {
  const toast = useToast();
  const [wilayah, setWilayah] = useState([]);
  const [kecKode, setKecKode] = useState(null);
  const [kelKode, setKelKode] = useState(null); // null = semua kelurahan

  useEffect(() => {
    api.getWilayah().then(setWilayah).catch((e) => toast(e.message, true));
  }, [toast]);

  const ambil = useCallback(() => api.ringkasEksporWilayah(kecKode, kelKode), [kecKode, kelKode]);
  const { ringkas, siap, kosong, formId, pilihFormulir } = useRingkasan(kecKode ? ambil : null);

  const kec = wilayah.find((k) => k.kode === kecKode) || null;
  const kel = kec?.kelurahan.find((l) => l.kode === kelKode) || null;
  const pilihan = { kecamatan: kecKode, kelurahan: kelKode, formulir: formId };

  return (
    <Panel
      title="Per kecamatan / kelurahan"
      sub="Data kertas kerja yang objek pajaknya berada di wilayah itu, urut nomor kertas kerja."
    >
      <div className="fk-ekspor-isian">
        <span className="fk-q-name">Kecamatan</span>
        <CustomSelect
          value={kec?.nama || ""}
          options={wilayah.map((k) => k.nama)}
          placeholder="Pilih kecamatan"
          title="Pilih kecamatan"
          onChange={(nama) => {
            setKecKode(wilayah.find((k) => k.nama === nama)?.kode ?? null);
            setKelKode(null);
          }}
        />

        <span className="fk-q-name">Kelurahan</span>
        <CustomSelect
          value={kel?.nama || SEMUA_KELURAHAN}
          options={[SEMUA_KELURAHAN, ...(kec?.kelurahan.map((l) => l.nama) || [])]}
          title="Pilih kelurahan"
          disabled={!kec}
          onChange={(nama) => setKelKode(kec?.kelurahan.find((l) => l.nama === nama)?.kode ?? null)}
        />

        {pilihFormulir}

        {ringkas && (
          <span className="fk-hint-kecil">
            {kosong
              ? "Belum ada data dengan objek pajak di wilayah ini."
              : `${formatAngka(ringkas.kertasKerja)} kertas kerja · ${formatAngka(ringkas.data)} data.`}
            {ringkas.tanpaWilayah > 0 &&
              ` ${formatAngka(ringkas.tanpaWilayah)} kertas kerja berisi data belum punya kecamatan/kelurahan objek pajak, jadi tidak masuk ekspor wilayah mana pun.`}
          </span>
        )}
      </div>

      <TombolUnduh
        disabled={!siap}
        onExcel={() => unduhKe(api.unduhWilayah(pilihan, "xlsx"))}
        onCsv={() => unduhKe(api.unduhWilayah(pilihan, "csv"))}
      />
    </Panel>
  );
}

/**
 * Per petugas: semua data di kertas kerja yang timnya memuat petugas itu -
 * patokan yang sama dengan angka di menu Petugas.
 */
function PanelPetugas({ unduhKe }) {
  const toast = useToast();
  const [petugas, setPetugas] = useState([]);
  const [petugasIds, setPetugasIds] = useState([]); // urut pilihan

  useEffect(() => {
    api
      .listPetugas()
      .then((list) => setPetugas(list.filter((p) => p.jumlahKertasKerja > 0)))
      .catch((e) => toast(e.message, true));
  }, [toast]);

  // Kunci teks supaya ringkasan hanya dimuat ulang bila pilihannya benar-benar berubah.
  const kunci = petugasIds.join(",");
  const ambil = useCallback(() => api.ringkasEksporPetugas(kunci), [kunci]);
  const { ringkas, siap, kosong, formId, pilihFormulir } = useRingkasan(kunci ? ambil : null);

  const labelPetugas = (p) => labelJumlah(p.nama, p.jumlahData);
  const dipilih = petugasIds.map((id) => petugas.find((p) => p.id === id)).filter(Boolean);
  const sisa = petugas.filter((p) => !petugasIds.includes(p.id));
  const pilihan = { petugas: petugasIds, formulir: formId };
  const tanpaData = ringkas ? ringkas.kertasKerja - ringkas.kertasKerjaBerdata : 0;

  return (
    <Panel
      title="Per petugas"
      sub="Semua data di kertas kerja yang timnya memuat petugas terpilih, urut nomor kertas kerja. Bila beberapa petugas dipilih, kertas kerja yang sama hanya muncul sekali."
    >
      <div className="fk-ekspor-isian">
        <span className="fk-q-name">Petugas</span>
        {dipilih.length > 0 && (
          <div className="fk-chips">
            {dipilih.map((p) => (
              <span className="fk-chip fk-chip-hapus" key={p.id}>
                {p.nama}
                <button
                  type="button"
                  aria-label={`Hapus ${p.nama}`}
                  onClick={() => setPetugasIds((ids) => ids.filter((id) => id !== p.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <CustomSelect
          value=""
          options={sisa.map(labelPetugas)}
          placeholder={dipilih.length ? "Tambah petugas lain" : "Pilih petugas"}
          title="Pilih petugas"
          emptyText={petugas.length ? "Semua petugas sudah dipilih" : "Belum ada petugas yang masuk tim"}
          onChange={(label) => {
            const p = sisa.find((x) => labelPetugas(x) === label);
            if (p) setPetugasIds((ids) => [...ids, p.id]);
          }}
        />

        {pilihFormulir}

        {ringkas && (
          <span className="fk-hint-kecil">
            {kosong
              ? `Kertas kerja ${dipilih.length > 1 ? "petugas-petugas" : "petugas"} ini belum berisi data.`
              : `${formatAngka(ringkas.kertasKerja)} kertas kerja · ${formatAngka(ringkas.data)} data.`}
            {!kosong &&
              tanpaData > 0 &&
              ` ${formatAngka(tanpaData)} kertas kerja belum berisi data, jadi tidak punya baris di berkas.`}
          </span>
        )}
      </div>

      <TombolUnduh
        disabled={!siap}
        onExcel={() => unduhKe(api.unduhPetugasData(pilihan, "xlsx"))}
        onCsv={() => unduhKe(api.unduhPetugasData(pilihan, "csv"))}
      />
    </Panel>
  );
}

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** "2026-10" -> "Oktober 2026". */
const labelBulan = (bulan) => {
  const [tahun, b] = bulan.split("-");
  return `${NAMA_BULAN[Number(b) - 1] || b} ${tahun}`;
};

/** 1234567 -> "1,2 MB". */
const formatUkuran = (byte) => {
  const satuan = [
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ].find(([n]) => byte >= n) || [1, "B"];
  return `${(byte / satuan[0]).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${satuan[1]}`;
};

/**
 * Cadangan manual untuk disimpan di luar server (lihat server/src/cadangan.js):
 * database, dan foto per bulan karena seluruh foto bisa berukuran beberapa GB.
 */
function PanelCadangan() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");
  const [meminta, setMeminta] = useState(false);

  useEffect(() => {
    api
      .ringkasCadangan()
      .then(setData)
      .catch((e) => setGalat(e.message));
  }, []);

  const unduh = async (isi) => {
    setMeminta(true);
    try {
      await api.unduhCadangan(isi);
      toast("Unduhan dimulai. Kemajuannya terlihat di daftar unduhan browser.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMeminta(false);
    }
  };

  return (
    <Panel
      title="Cadangan data"
      sub="Salinan untuk disimpan di luar server, mis. harddisk kantor. Berisi seluruh data pribadi wajib pajak, jadi simpan di tempat yang aman."
    >
      {galat ? (
        <p className="fk-hint">{galat}</p>
      ) : !data ? (
        <Loading label="Memuat ukuran cadangan..." />
      ) : (
        <div className="fk-cadangan">
          <div className="fk-cadangan-baris">
            <div className="fk-cadangan-isi">
              <div className="fk-cadangan-judul">Database</div>
              <div className="fk-hint-kecil">
                Semua kertas kerja, data, petugas, dan akun
                {data.database.ukuran ? ` · ±${formatUkuran(data.database.ukuran)} sebelum dikompres` : ""}. Unduh
                rutin, mis. setiap hari.
              </div>
              {!data.database.tersedia && (
                <div className="fk-hint-kecil fk-cadangan-galat">
                  mysqldump tidak ditemukan di server. Isi MYSQLDUMP_PATH di .env dengan lokasinya.
                </div>
              )}
            </div>
            <button
              type="button"
              className="fk-btn"
              disabled={!data.database.tersedia || meminta}
              onClick={() => unduh({ jenis: "database" })}
            >
              Unduh database
            </button>
          </div>

          <div className="fk-cadangan-isi">
            <div className="fk-cadangan-judul">Foto per bulan</div>
            <div className="fk-hint-kecil">
              Bulan yang sudah lewat cukup diunduh sekali; bulan berjalan diunduh ulang secara berkala.
            </div>
          </div>
          {data.foto.length === 0 ? (
            <div className="fk-hint-kecil">Belum ada foto.</div>
          ) : (
            data.foto.map((f) => (
              <div className="fk-cadangan-baris" key={f.bulan}>
                <div className="fk-cadangan-isi">
                  <div className="fk-cadangan-judul">{labelBulan(f.bulan)}</div>
                  <div className="fk-hint-kecil">
                    {formatAngka(f.jumlah)} foto · {formatUkuran(f.ukuran)}
                  </div>
                </div>
                <button
                  type="button"
                  className="fk-btn-ghost"
                  disabled={meminta}
                  onClick={() => unduh({ jenis: "foto", bulan: f.bulan })}
                >
                  Unduh
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}

export default function EksporPage({ admin, onAuthChanged }) {
  const toast = useToast();
  // Unduhan lewat fetch bertoken bisa gagal (sesi habis, jaringan putus);
  // tanpa ini galatnya tenggelam sebagai promise yang ditolak diam-diam.
  const unduhKe = (janji) => janji.catch((e) => toast(e.message, true));
  const [kkList, setKkList] = useState([]);
  const [formList, setFormList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Per kertas kerja
  const [kkId, setKkId] = useState(null);
  const [grup, setGrup] = useState([]); // formulir yang punya data di kertas kerja terpilih
  const [memuatGrup, setMemuatGrup] = useState(false);
  const [kkFormId, setKkFormId] = useState(null); // null = semua formulir

  // Per formulir
  const [formId, setFormId] = useState(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kk, formulir] = await Promise.all([api.pilihanKertasKerja(), api.listFormulir()]);
      setKkList(kk);
      setFormList(formulir);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Jangan memanggil API sebelum admin: layarnya pun tidak ditampilkan.
  useEffect(() => {
    if (admin) muat();
  }, [admin, muat]);

  // Daftar formulir untuk kertas kerja terpilih diambil dari detailnya (hanya yang sudah berisi data).
  useEffect(() => {
    setKkFormId(null);
    if (!kkId) {
      setGrup([]);
      return undefined;
    }
    let batal = false;
    setMemuatGrup(true);
    api
      .getKertasKerja(kkId)
      .then((d) => {
        if (batal) return;
        const jumlah = new Map();
        for (const e of d.entri) jumlah.set(e.formulirId, (jumlah.get(e.formulirId) || 0) + 1);
        setGrup(
          d.formulir.filter((f) => jumlah.has(f.id)).map((f) => ({ id: f.id, judul: f.judul, jumlah: jumlah.get(f.id) }))
        );
      })
      .catch((e) => !batal && toast(e.message, true))
      .finally(() => !batal && setMemuatGrup(false));
    return () => {
      batal = true;
    };
  }, [kkId, toast]);

  if (loading) return <Loading label="Memuat data ekspor..." />;
  if (error) return <ErrorBox onRetry={muat}>{error}</ErrorBox>;

  const kkTerpilih = kkList.find((k) => k.id === kkId) || null;
  const grupTerpilih = grup.find((g) => g.id === kkFormId) || null;
  const formBerisi = formList.filter((f) => f.jumlahData > 0);
  const formTerpilih = formBerisi.find((f) => f.id === formId) || null;

  // Menunya disembunyikan bagi yang belum login, tetapi alamat /ekspor masih
  // bisa diketik langsung - jadi layarnya sendiri ikut dijaga.
  if (!admin) return <LoginAdmin onLoggedIn={onAuthChanged} sub="Ekspor Data Hanya Untuk Admin." />;

  return (
    <>
      <PageHead
        title="Ekspor Data"
        sub="Unduh Data Sebagai Excel atau CSV: Per Kertas Kerja, Per Formulir, Per Kecamatan/Kelurahan, atau Per Petugas."
      />

      <Panel title="Per kertas kerja" sub="Satu kertas kerja — seluruh formulir atau satu formulir saja.">
        <div className="fk-ekspor-isian">
          <span className="fk-q-name">Kertas kerja</span>
          <CustomSelect
            value={kkTerpilih ? labelKk(kkTerpilih) : ""}
            options={kkList.map(labelKk)}
            placeholder="Pilih kertas kerja"
            title="Pilih kertas kerja"
            emptyText="Belum ada kertas kerja"
            onChange={(label) => setKkId(kkList.find((k) => labelKk(k) === label)?.id ?? null)}
          />

          <span className="fk-q-name">Formulir</span>
          <CustomSelect
            value={grupTerpilih ? labelJumlah(grupTerpilih.judul, grupTerpilih.jumlah) : SEMUA_FORMULIR}
            options={[SEMUA_FORMULIR, ...grup.map((g) => labelJumlah(g.judul, g.jumlah))]}
            title="Pilih formulir"
            disabled={!kkTerpilih || memuatGrup}
            onChange={(label) =>
              setKkFormId(grup.find((g) => labelJumlah(g.judul, g.jumlah) === label)?.id ?? null)
            }
          />
          {kkTerpilih && !memuatGrup && grup.length === 0 && (
            <span className="fk-hint-kecil">Kertas kerja ini belum berisi data — berkas hanya memuat identitasnya.</span>
          )}
        </div>

        <TombolUnduh
          disabled={!kkTerpilih || memuatGrup}
          onExcel={() => unduhKe(api.unduhExcel(kkId, kkFormId || undefined))}
          onCsv={() => unduhKe(api.unduhCsv(kkId, kkFormId || undefined))}
        />
      </Panel>

      <Panel title="Per formulir" sub="Seluruh data satu formulir dari semua kertas kerja, urut nomor kertas kerja.">
        <div className="fk-ekspor-isian">
          <span className="fk-q-name">Formulir</span>
          <CustomSelect
            value={formTerpilih ? labelJumlah(formTerpilih.judul, formTerpilih.jumlahData) : ""}
            options={formBerisi.map((f) => labelJumlah(f.judul, f.jumlahData))}
            placeholder="Pilih formulir"
            title="Pilih formulir"
            emptyText="Belum ada formulir yang berisi data"
            onChange={(label) =>
              setFormId(formBerisi.find((f) => labelJumlah(f.judul, f.jumlahData) === label)?.id ?? null)
            }
          />
        </div>

        <TombolUnduh
          disabled={!formTerpilih}
          onExcel={() => unduhKe(api.unduhFormulir(formId, "xlsx"))}
          onCsv={() => unduhKe(api.unduhFormulir(formId, "csv"))}
        />
      </Panel>

      <PanelWilayah unduhKe={unduhKe} />

      <PanelPetugas unduhKe={unduhKe} />

      <PanelCadangan />
    </>
  );
}
