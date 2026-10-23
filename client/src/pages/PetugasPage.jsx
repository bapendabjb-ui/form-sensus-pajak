import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { Panel, PageHead, Loading, ErrorBox, KunciAdmin } from "../components/Ui.jsx";
import { useAdmin } from "../lib/admin.js";
import { kapitalTiapKata, ubahDengan } from "../lib/kapital.js";
import { useKonfigurasi } from "../lib/konfigurasi.js";
import { formatWaktu } from "../lib/format.js";
import HasilImpor from "../components/HasilImpor.jsx";
import Sheet from "../components/Sheet.jsx";

const formatAngka = (n) => Number(n || 0).toLocaleString("id-ID");

/**
 * Usulan username dari nama, sama aturannya dengan server/src/akunPetugas.js
 * (dua kata pertama tanpa gelar). Hanya usulan - server tetap memeriksa
 * bentuk dan kembarannya saat disimpan.
 */
function sarankanUsername(nama) {
  const kata = String(nama || "")
    .split(",")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((k) => k && !k.includes("."))
    .map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  const dasar = kata.slice(0, 2).join(".");
  return dasar.length >= 3 ? dasar : "";
}

/** Tanpa huruf yang mudah tertukar saat dibacakan (0/o, 1/l/i), sama dengan server. */
const HURUF_PASSWORD = "abcdefghjkmnpqrstuvwxyz23456789";

function passwordAcak(panjang = 10) {
  const acak = new Uint32Array(panjang);
  crypto.getRandomValues(acak);
  return Array.from(acak, (n) => HURUF_PASSWORD[n % HURUF_PASSWORD.length]).join("");
}

/**
 * Lembar pengaturan akun login satu petugas: buat akun, ganti username /
 * password, keluarkan dari semua HP, atau hapus akun. Setelah disimpan,
 * username & password ditampilkan sekali untuk dibagikan ke petugasnya.
 */
function AturAkun({ petugas, onTutup, onBerubah }) {
  const toast = useToast();
  const akun = petugas.akun;
  const [username, setUsername] = useState(akun?.username || sarankanUsername(petugas.nama));
  const [password, setPassword] = useState(akun ? "" : passwordAcak());
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
      const hasil = await api.aturAkunPetugas(petugas.id, username.trim(), password);
      toast(akun ? "Akun diperbarui." : "Akun dibuat.");
      onBerubah();
      if (password) setDibagikan({ username: hasil.akun.username, password });
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
        await api.keluarkanPetugas(petugas.id);
        toast(`${petugas.nama} dikeluarkan dari semua HP.`);
      } else {
        await api.hapusAkunPetugas(petugas.id);
        toast("Akun dihapus.");
        onBerubah();
      }
      onTutup();
    } catch (e) {
      toast(e.message, true);
      setSibuk(false);
    }
  };

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(`Username: ${dibagikan.username}\nPassword: ${dibagikan.password}`);
      toast("Disalin. Tempel di pesan untuk petugasnya.");
    } catch {
      toast("Tidak bisa menyalin otomatis. Catat username dan password di atas.", true);
    }
  };

  if (dibagikan) {
    return (
      <div className="fk-akun-bagi">
        <p className="fk-hint" style={{ marginTop: 0 }}>
          Bagikan ke {petugas.nama}. Password ini hanya tampil sekarang.
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

  return (
    <div className="fk-akun-form">
      <p className="fk-hint" style={{ marginTop: 0 }}>
        {akun
          ? akun.masukTerakhir
            ? `Terakhir masuk ${formatWaktu(akun.masukTerakhir)}.`
            : "Belum pernah masuk."
          : "Belum punya akun. Username diusulkan dari nama dan password dibuat acak; keduanya boleh diganti."}
      </p>
      <div>
        <label className="fk-q-name" htmlFor="fk-akun-username">
          Username
        </label>
        <input
          id="fk-akun-username"
          className="fk-input"
          value={username}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setUsername(e.target.value);
            setGalat("");
          }}
        />
      </div>
      <div>
        <label className="fk-q-name" htmlFor="fk-akun-password">
          {akun ? "Password baru" : "Password"}
        </label>
        <div className="fk-akun-pass">
          <input
            id="fk-akun-password"
            className="fk-input"
            value={password}
            placeholder={akun ? "Kosongkan bila tidak diganti" : ""}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="new-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setGalat("");
            }}
          />
          <button type="button" className="fk-btn-ghost" onClick={() => setPassword(passwordAcak())}>
            Acak
          </button>
        </div>
        {akun && password && (
          <span className="fk-hint">Password baru mengeluarkan petugas ini dari semua HP.</span>
        )}
      </div>

      {galat && <span className="fk-err">{galat}</span>}

      <div className="fk-form-actions">
        <button type="button" className="fk-btn" onClick={simpan} disabled={sibuk}>
          {sibuk ? "Menyimpan..." : akun ? "Simpan" : "Buat akun"}
        </button>
      </div>

      {akun && !yakin && (
        <div className="fk-akun-lain">
          <button type="button" className="fk-btn-ghost" onClick={() => setYakin("keluarkan")}>
            Keluarkan dari semua HP
          </button>
          <button type="button" className="fk-btn-danger" onClick={() => setYakin("hapus")}>
            Hapus akun
          </button>
        </div>
      )}

      {akun && yakin && (
        <div className="fk-akun-lain fk-akun-yakin" role="alert">
          <p className="fk-hint" style={{ margin: 0, flexBasis: "100%" }}>
            {yakin === "keluarkan"
              ? "Semua HP yang memakai akun ini harus login lagi. Akunnya tetap ada - pakai ini bila HP hilang."
              : "Petugasnya tetap terdaftar dan datanya tidak berubah, tetapi tidak bisa login lagi sampai dibuatkan akun baru."}
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
  const [mengimpor, setMengimpor] = useState(false);
  const [hasilImpor, setHasilImpor] = useState(null);
  const berkasRef = useRef(null);
  const konfigurasi = useKonfigurasi();
  const [wajib, setWajib] = useState(null); // null = ikuti konfigurasi
  const [mengubahWajib, setMengubahWajib] = useState(false);
  const [membuatAkun, setMembuatAkun] = useState(false);
  const [akunDibuka, setAkunDibuka] = useState(null); // petugas yang lembar akunnya terbuka

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

  const unduh = (jenis) => api.unduhPetugas(jenis).catch((e) => toast(e.message, true));

  const pilihBerkas = () => berkasRef.current?.click();

  const imporBerkas = async (e) => {
    const file = e.target.files?.[0];
    // Kosongkan nilainya agar memilih berkas yang SAMA dua kali tetap memicu onChange.
    e.target.value = "";
    if (!file) return;

    setMengimpor(true);
    setHasilImpor(null);
    try {
      const hasil = await api.imporPetugas(file);
      setHasilImpor(hasil);
      if (hasil.ditambahkan > 0) {
        await muat();
        toast(`${hasil.ditambahkan} petugas ditambahkan.`);
      } else {
        toast("Tidak ada petugas baru yang ditambahkan.", true);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      setMengimpor(false);
    }
  };

  const wajibLogin = wajib ?? konfigurasi.wajibLogin;
  const punyaAkun = list.filter((p) => p.akun).length;
  const belumAkun = list.length - punyaAkun;

  const ubahWajib = async () => {
    const nyalakan = !wajibLogin;
    const ya = await konfirmasi(
      nyalakan
        ? {
            judul: "Wajibkan login?",
            pesan:
              belumAkun > 0
                ? `${belumAkun} petugas belum punya akun dan tidak bisa memakai aplikasi sampai dibuatkan. Yang sudah punya akun cukup login sekali di HP-nya.`
                : "Siapa pun yang belum masuk akan diminta login. Petugas cukup login sekali di HP-nya.",
            ya: "Wajibkan login",
          }
        : {
            judul: "Matikan wajib login?",
            pesan: "Aplikasi kembali bisa dipakai tanpa login oleh siapa pun yang tahu alamatnya, termasuk melihat data wajib pajak.",
            ya: "Matikan",
            bahaya: true,
          }
    );
    if (!ya) return;
    setMengubahWajib(true);
    try {
      const hasil = await api.aturWajibLogin(nyalakan);
      setWajib(hasil.wajib);
      toast(hasil.wajib ? "Login petugas sekarang wajib." : "Login petugas tidak lagi wajib.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMengubahWajib(false);
    }
  };

  const buatAkunMassal = async () => {
    const ya = await konfirmasi({
      judul: `Buat akun untuk ${belumAkun} petugas?`,
      pesan:
        "Username dibuat dari nama dan password dibuat acak. Daftarnya terunduh sebagai Excel - itu satu-satunya salinan password, jadi simpan baik-baik lalu bagikan ke masing-masing petugas.",
      ya: "Buat & unduh",
    });
    if (!ya) return;
    setMembuatAkun(true);
    try {
      const { jumlah, sisa } = await api.buatAkunMassal();
      await muat();
      toast(
        sisa > 0
          ? `${jumlah} akun dibuat dan terunduh. Masih ${sisa} petugas lagi - klik sekali lagi.`
          : `${jumlah} akun dibuat. Berkas Excel berisi password sudah terunduh.`
      );
    } catch (e) {
      toast(e.message, true);
    } finally {
      setMembuatAkun(false);
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

      {admin && (
        <Panel
          title="Login Petugas"
          sub={loading ? "" : `${formatAngka(punyaAkun)} dari ${formatAngka(list.length)} petugas sudah punya akun.`}
        >
          <button
            type="button"
            className={"fk-switch fk-switch-formulir" + (wajibLogin ? " is-on" : "")}
            onClick={ubahWajib}
            aria-pressed={wajibLogin}
            disabled={mengubahWajib || !konfigurasi.dimuat}
          >
            <span className="fk-switch-knob" />
            <span>
              Wajib login
              <span className="fk-switch-ket">
                Bila aktif, aplikasi - termasuk data dan foto - hanya bisa dibuka setelah masuk. Admin tetap
                bisa masuk. Nyalakan setelah akun petugas dibagikan.
              </span>
            </span>
          </button>

          <div className="fk-impor-aksi" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="fk-btn"
              onClick={buatAkunMassal}
              disabled={membuatAkun || loading || belumAkun === 0}
            >
              {membuatAkun
                ? "Membuat akun..."
                : belumAkun > 0
                  ? `Buat akun untuk ${formatAngka(belumAkun)} petugas`
                  : "Semua petugas sudah punya akun"}
            </button>
          </div>
          <p className="fk-hint">
            Password hanya ada di berkas Excel yang terunduh. Petugas yang lupa password: buka{" "}
            <strong>Akun</strong> pada barisnya lalu buat password baru.
          </p>
        </Panel>
      )}

      {admin && (
        <Panel
          title="Impor & Ekspor"
          sub="Unduh daftar sebagai Excel/CSV, atau tambahkan banyak petugas sekaligus dari berkas."
        >
          <div className="fk-impor-aksi">
            <button type="button" className="fk-btn-ghost" onClick={() => unduh("xlsx")}>
              Unduh Excel
            </button>
            <button type="button" className="fk-btn-ghost" onClick={() => unduh("csv")}>
              Unduh CSV
            </button>
            <span className="fk-impor-pisah" aria-hidden="true" />
            <button type="button" className="fk-btn" onClick={pilihBerkas} disabled={mengimpor}>
              {mengimpor ? "Mengimpor..." : "Impor dari berkas"}
            </button>
            {/* Dipicu lewat tombol di atas: input berkas bawaan browser tidak bisa
                diseragamkan tampilannya dengan tombol lain. */}
            <input
              ref={berkasRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={imporBerkas}
              hidden
            />
          </div>

          <p className="fk-hint">
            Berkas perlu punya kolom berjudul <strong>Nama</strong>, dan <strong>NIP</strong> bila ada.
            Urutan kolom bebas. Petugas yang namanya sudah terdaftar akan dilewati, jadi berkas yang
            sama aman diimpor ulang.
          </p>

          <HasilImpor hasil={hasilImpor} onTutup={() => setHasilImpor(null)} />
        </Panel>
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
                    <div className="fk-lib-sub">
                      NIP {p.nip || "—"}
                      {admin && (
                        <span className={"fk-akun-status" + (p.akun ? "" : " is-belum")}>
                          {p.akun ? ` · ${p.akun.username}` : " · Belum punya akun"}
                        </span>
                      )}
                    </div>
                  </div>
                  <RekapPetugas data={p.jumlahData} kertasKerja={p.jumlahKertasKerja} />
                  {admin && (
                    <div className="fk-kk-card-actions">
                      <button type="button" className="fk-mini" onClick={() => setAkunDibuka(p)}>
                        Akun
                      </button>
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

      <Sheet
        open={Boolean(akunDibuka)}
        onClose={() => setAkunDibuka(null)}
        title={akunDibuka ? `Akun ${akunDibuka.nama}` : "Akun"}
        tengah
      >
        {akunDibuka && (
          <AturAkun
            key={akunDibuka.id}
            petugas={akunDibuka}
            onTutup={() => setAkunDibuka(null)}
            onBerubah={muat}
          />
        )}
      </Sheet>
    </>
  );
}
