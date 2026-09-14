import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { Panel, PageHead, Loading, ErrorBox, KunciAdmin } from "../components/Ui.jsx";
import { useAdmin } from "../lib/admin.js";

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
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
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

      <Panel title="Daftar petugas" sub={`${list.length} orang`}>
        {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
        {loading ? (
          <Loading />
        ) : list.length === 0 ? (
          <div className="fk-lt-empty">Belum Ada Petugas.</div>
        ) : (
          <div className="fk-lib-list">
            {list.map((p) =>
              edit && edit.id === p.id ? (
                <div className="fk-lib-row is-editing" key={p.id}>
                  <div className="fk-newpet fk-newpet-inline">
                    <input
                      className="fk-input"
                      value={edit.nama}
                      onChange={(e) => setEdit((s) => ({ ...s, nama: e.target.value }))}
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
