/*
 * Akun pejabat (khusus admin, di halaman Petugas). Pejabat masuk untuk melihat
 * kertas kerja, data, dan peta tanpa bisa mengubah apa pun. Bukan petugas, jadi
 * tidak muncul di pilihan tim kertas kerja.
 */

import { useCallback, useEffect, useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { Panel, Loading, ErrorBox } from "./Ui.jsx";
import Sheet from "./Sheet.jsx";
import { formatWaktu } from "../lib/format.js";
import { passwordAcak, salinAkun } from "../lib/akun.js";

/**
 * Isian satu akun pejabat: buat baru (`pejabat` null) atau ubah. Setelah
 * password disimpan, username & password ditampilkan sekali untuk dibagikan.
 */
function AturPejabat({ pejabat, onTutup, onBerubah }) {
  const toast = useToast();
  const [nama, setNama] = useState(pejabat?.nama || "");
  const [username, setUsername] = useState(pejabat?.username || "");
  const [password, setPassword] = useState(pejabat ? "" : passwordAcak());
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [dibagikan, setDibagikan] = useState(null); // { username, password } setelah disimpan
  // Konfirmasi di dalam lembar, bukan dialog: dialog yang ditutup memakai
  // tombol Kembali riwayat yang sama dan ikut menutup lembar ini.
  const [yakin, setYakin] = useState(null); // "keluarkan" | "hapus" | null

  const simpan = async () => {
    setSibuk(true);
    setGalat("");
    try {
      const data = { nama: nama.trim(), username: username.trim(), password };
      const hasil = pejabat ? await api.ubahPejabat(pejabat.id, data) : await api.buatPejabat(data);
      toast(pejabat ? "Akun pejabat diperbarui." : "Akun pejabat dibuat.");
      onBerubah();
      if (password) setDibagikan({ username: hasil.username, password });
      else onTutup();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const lakukan = async () => {
    setSibuk(true);
    try {
      if (yakin === "keluarkan") {
        await api.keluarkanPejabat(pejabat.id);
        toast(`${pejabat.nama} dikeluarkan dari semua perangkat.`);
      } else {
        await api.hapusPejabat(pejabat.id);
        toast("Akun pejabat dihapus.");
        onBerubah();
      }
      onTutup();
    } catch (e) {
      toast(e.message, true);
      setSibuk(false);
    }
  };

  const salin = async () => {
    if (await salinAkun(dibagikan)) toast("Disalin. Tempel di pesan untuk pejabatnya.");
    else toast("Tidak bisa menyalin otomatis. Catat username dan password di atas.", true);
  };

  if (dibagikan) {
    return (
      <div className="fk-akun-bagi">
        <p className="fk-hint" style={{ marginTop: 0 }}>
          Bagikan ke {nama.trim()}. Password ini hanya tampil sekarang.
        </p>
        <dl className="fk-akun-data">
          <dt>Username</dt>
          <dd>{dibagikan.username}</dd>
          <dt>Password</dt>
          <dd>{dibagikan.password}</dd>
        </dl>
        <div className="fk-form-actions">
          <button type="button" className="fk-btn-ghost" onClick={salin}>
            Salin
          </button>
          <button type="button" className="fk-btn" onClick={onTutup}>
            Selesai
          </button>
        </div>
      </div>
    );
  }

  const ubahIsian = (setter) => (e) => {
    setter(e.target.value);
    setGalat("");
  };

  return (
    <div className="fk-akun-form">
      <p className="fk-hint" style={{ marginTop: 0 }}>
        {pejabat
          ? pejabat.masukTerakhir
            ? `Terakhir masuk ${formatWaktu(pejabat.masukTerakhir)}.`
            : "Belum pernah masuk."
          : "Pejabat bisa melihat kertas kerja, data, foto, dan peta, tetapi tidak bisa menambah, mengubah, atau menghapus apa pun."}
      </p>
      <div>
        <label className="fk-q-name" htmlFor="fk-pejabat-nama">
          Nama / jabatan
        </label>
        <input
          id="fk-pejabat-nama"
          className="fk-input"
          value={nama}
          placeholder="Mis. Kepala Bapenda"
          autoCapitalize="words"
          onChange={ubahIsian(setNama)}
        />
      </div>
      <div>
        <label className="fk-q-name" htmlFor="fk-pejabat-username">
          Username
        </label>
        <input
          id="fk-pejabat-username"
          className="fk-input"
          value={username}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          onChange={ubahIsian(setUsername)}
        />
      </div>
      <div>
        <label className="fk-q-name" htmlFor="fk-pejabat-password">
          {pejabat ? "Password baru" : "Password"}
        </label>
        <div className="fk-akun-pass">
          <input
            id="fk-pejabat-password"
            className="fk-input"
            value={password}
            placeholder={pejabat ? "Kosongkan bila tidak diganti" : ""}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="new-password"
            onChange={ubahIsian(setPassword)}
          />
          <button type="button" className="fk-btn-ghost" onClick={() => setPassword(passwordAcak())}>
            Acak
          </button>
        </div>
        {pejabat && password && <span className="fk-hint">Password baru mengeluarkan akun ini dari semua perangkat.</span>}
      </div>

      {galat && <span className="fk-err">{galat}</span>}

      <div className="fk-form-actions">
        <button type="button" className="fk-btn" onClick={simpan} disabled={sibuk}>
          {sibuk ? "Menyimpan..." : pejabat ? "Simpan" : "Buat akun"}
        </button>
      </div>

      {pejabat && !yakin && (
        <div className="fk-akun-lain">
          <button type="button" className="fk-btn-ghost" onClick={() => setYakin("keluarkan")}>
            Keluarkan dari semua perangkat
          </button>
          <button type="button" className="fk-btn-danger" onClick={() => setYakin("hapus")}>
            Hapus akun
          </button>
        </div>
      )}

      {pejabat && yakin && (
        <div className="fk-akun-lain fk-akun-yakin" role="alert">
          <p className="fk-hint" style={{ margin: 0, flexBasis: "100%" }}>
            {yakin === "keluarkan"
              ? "Semua perangkat yang memakai akun ini harus login lagi. Akunnya tetap ada - pakai ini bila HP hilang."
              : "Akun ini tidak bisa dipakai masuk lagi. Data sensus tidak berubah."}
          </p>
          <button type="button" className="fk-btn-ghost" onClick={() => setYakin(null)} disabled={sibuk}>
            Batal
          </button>
          <button type="button" className="fk-btn-danger" onClick={lakukan} disabled={sibuk}>
            {yakin === "keluarkan" ? "Ya, keluarkan" : "Ya, hapus akun"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AkunPejabat() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // { pejabat: object | null } selama lembar terbuka; pejabat null = akun baru.
  const [dibuka, setDibuka] = useState(null);

  const muat = useCallback(async () => {
    setError("");
    try {
      setList(await api.listPejabat());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <Panel
      title="Akun Pejabat"
      sub="Untuk pimpinan: bisa melihat kertas kerja, data, dan peta, tetapi tidak bisa mengubah apa pun."
    >
      {error && <ErrorBox onRetry={muat}>{error}</ErrorBox>}
      {loading ? (
        <Loading />
      ) : (
        list.length > 0 && (
          <div className="fk-lib-list" style={{ marginBottom: 14 }}>
            {list.map((p) => (
              <div className="fk-lib-row" key={p.id}>
                <div>
                  <div className="fk-lib-title">{p.nama}</div>
                  <div className="fk-lib-sub">
                    {p.username} · {p.masukTerakhir ? `terakhir masuk ${formatWaktu(p.masukTerakhir)}` : "belum pernah masuk"}
                  </div>
                </div>
                <div className="fk-kk-card-actions">
                  <button type="button" className="fk-mini" onClick={() => setDibuka({ pejabat: p })}>
                    Akun
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
      <button type="button" className="fk-btn" onClick={() => setDibuka({ pejabat: null })}>
        + Tambah akun pejabat
      </button>

      <Sheet
        open={Boolean(dibuka)}
        onClose={() => setDibuka(null)}
        title={dibuka?.pejabat ? `Akun ${dibuka.pejabat.nama}` : "Akun pejabat baru"}
        tengah
      >
        {dibuka && (
          <AturPejabat
            key={dibuka.pejabat?.id ?? "baru"}
            pejabat={dibuka.pejabat}
            onTutup={() => setDibuka(null)}
            onBerubah={muat}
          />
        )}
      </Sheet>
    </Panel>
  );
}
