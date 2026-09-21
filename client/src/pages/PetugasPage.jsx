import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { Panel, PageHead, Loading, ErrorBox, KunciAdmin } from "../components/Ui.jsx";
import { useAdmin } from "../lib/admin.js";
import { kapitalTiapKata, ubahDengan } from "../lib/kapital.js";

const formatAngka = (n) => Number(n || 0).toLocaleString("id-ID");

/**
 * Rekap hasil kerja seorang petugas. Petugas yang belum pernah masuk tim
 * ditandai jelas, bukan ditampilkan sebagai "0 data" yang mudah terbaca
 * sebagai kegagalan mengisi.
 */
function RekapPetugas({ data = 0, kertasKerja = 0 }) {
  if (!kertasKerja) return <div className="fk-rekap is-kosong">Belum ditugaskan</div>;
  return (
    <div
      className="fk-rekap"
      title={`${formatAngka(data)} data dari ${formatAngka(kertasKerja)} kertas kerja`}
    >
      <span className="fk-rekap-num">{formatAngka(data)}</span>
      <span className="fk-rekap-label">data</span>
      <span className="fk-rekap-sep">·</span>
      <span className="fk-rekap-num">{formatAngka(kertasKerja)}</span>
      <span className="fk-rekap-label">kertas kerja</span>
    </div>
  );
}

export default function PetugasPage() {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const admin = useAdmin();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ nama: "", nip: "" });
  const [menyimpan, setMenyimpan] = useState(false);
  const [edit, setEdit] = useState(null); // { id, nama, nip }
  const [cari, setCari] = useState("");

  const muat = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setList(await api.listPetugas());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const tambah = async () => {
    if (!form.nama.trim()) {
      toast("Nama petugas wajib diisi.", true);
      return;
    }
    setMenyimpan(true);
    try {
      await api.createPetugas(form.nama.trim(), form.nip.trim());
      setForm({ nama: "", nip: "" });
      await muat();
      toast("Petugas ditambahkan.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMenyimpan(false);
    }
  };

  const simpanEdit = async () => {
    if (!edit.nama.trim()) {
      toast("Nama petugas wajib diisi.", true);
      return;
    }
    try {
      await api.updatePetugas(edit.id, edit.nama.trim(), edit.nip.trim());
      setEdit(null);
      await muat();
      toast("Perubahan tersimpan.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const hapus = async (p) => {
    const ya = await konfirmasi({
      judul: `Hapus petugas "${p.nama}"?`,
      pesan: "Petugas yang masih tercatat di kertas kerja tidak bisa dihapus.",
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      await api.deletePetugas(p.id);
      await muat();
      toast("Petugas dihapus.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  // Cocok bila nama memuat kata kunci, atau NIP memuat angkanya (spasi diabaikan).
  const kata = cari.trim().toLowerCase();
  const angka = kata.replace(/\s/g, "");
  const tersaring = kata
    ? list.filter(
        (p) => p.nama.toLowerCase().includes(kata) || (angka && (p.nip || "").replace(/\s/g, "").includes(angka))
      )
    : list;

  return (
    <>
      <PageHead
        title="Data Petugas"
        sub="Daftar Ini Menjadi Sumber Dropdown Petugas Saat Membuat Kertas Kerja."
      />

      {admin ? (
        <Panel title="Tambah Petugas">
          <div className="fk-newpet">
            <input
              className="fk-input"
              placeholder="Nama Petugas"
              autoCapitalize="words"
              value={form.nama}
              onChange={ubahDengan(kapitalTiapKata, (nama) => setForm((f) => ({ ...f, nama })))}
              onKeyDown={(e) => e.key === "Enter" && tambah()}
            />
            <input
              className="fk-input"
              placeholder="NIP (Opsional)"
              inputMode="numeric"
              value={form.nip}
              onChange={(e) => setForm((f) => ({ ...f, nip: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && tambah()}
            />
            <button type="button" className="fk-btn" onClick={tambah} disabled={menyimpan}>
              {menyimpan ? "Menyimpan..." : "Tambah"}
            </button>
          </div>
        </Panel>
      ) : (
        <KunciAdmin>Menambah, mengubah, dan menghapus petugas hanya bisa dilakukan admin.</KunciAdmin>
      )}

      <Panel
        title="Daftar petugas"
        sub={kata ? `${tersaring.length} dari ${list.length} orang` : `${list.length} orang`}
      >
        {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
        {list.length > 0 && (
          <input
            type="search"
            className="fk-input fk-cari"
            placeholder="Cari nama atau NIP..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            enterKeyHint="search"
            aria-label="Cari petugas"
          />
        )}
        {loading ? (
          <Loading />
        ) : list.length === 0 ? (
          <div className="fk-lt-empty">Belum Ada Petugas.</div>
        ) : tersaring.length === 0 ? (
          <div className="fk-lt-empty">Tidak ada petugas yang cocok dengan “{cari.trim()}”.</div>
        ) : (
          <div className="fk-lib-list">
            {tersaring.map((p) =>
              edit && edit.id === p.id ? (
                <div className="fk-lib-row is-editing" key={p.id}>
                  <div className="fk-newpet fk-newpet-inline">
                    <input
                      className="fk-input"
                      autoCapitalize="words"
                      value={edit.nama}
                      onChange={ubahDengan(kapitalTiapKata, (nama) => setEdit((s) => ({ ...s, nama })))}
                      placeholder="Nama petugas"
                    />
                    <input
                      className="fk-input"
                      value={edit.nip}
                      inputMode="numeric"
                      onChange={(e) => setEdit((s) => ({ ...s, nip: e.target.value }))}
                      placeholder="NIP"
                    />
                    <button type="button" className="fk-mini" onClick={simpanEdit}>
                      Simpan
                    </button>
                    <button type="button" className="fk-mini" onClick={() => setEdit(null)}>
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="fk-lib-row" key={p.id}>
                  <div>
                    <div className="fk-lib-title">{p.nama}</div>
                    <div className="fk-lib-sub">NIP {p.nip || "—"}</div>
                  </div>
                  <RekapPetugas data={p.jumlahData} kertasKerja={p.jumlahKertasKerja} />
                  {admin && (
                    <div className="fk-kk-card-actions">
                      <button
                        type="button"
                        className="fk-mini"
                        onClick={() => setEdit({ id: p.id, nama: p.nama, nip: p.nip })}
                      >
                        Ubah
                      </button>
                      <button type="button" className="fk-mini is-danger" onClick={() => hapus(p)}>
                        Hapus
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
