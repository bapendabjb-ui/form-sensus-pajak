import { useState } from "react";
import * as api from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { PageHead, Panel } from "../components/Ui.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

const PASSWORD_MIN = 8;
const KOSONG = { lama: "", baru: "", ulang: "" };

/** Akun admin: ganti password & keluar. */
export default function AkunPage({ onKeluar }) {
  const toast = useToast();
  const [form, setForm] = useState(KOSONG);
  const [galat, setGalat] = useState({});
  const [sibuk, setSibuk] = useState(false);

  const ubah = (kunci) => (e) => {
    setForm((f) => ({ ...f, [kunci]: e.target.value }));
    setGalat((g) => ({ ...g, [kunci]: "" }));
  };

  const simpan = async () => {
    const g = {};
    if (!form.lama) g.lama = "Password lama wajib diisi.";
    if (form.baru.length < PASSWORD_MIN) g.baru = `Password baru minimal ${PASSWORD_MIN} karakter.`;
    else if (form.baru === form.lama) g.baru = "Password baru harus berbeda dari password lama.";
    if (form.ulang !== form.baru) g.ulang = "Ulangi password baru dengan isian yang sama.";
    setGalat(g);
    if (Object.keys(g).length) return;

    setSibuk(true);
    try {
      await api.gantiPassword(form.lama, form.baru);
      setForm(KOSONG);
      toast("Password admin berhasil diganti.");
    } catch (e) {
      if (e.message === "Password lama salah.") setGalat({ lama: e.message });
      else toast(e.message, true);
    } finally {
      setSibuk(false);
    }
  };

  const kolom = (kunci, label, autoComplete) => (
    <div>
      <label className="fk-q-name" htmlFor={`fk-akun-${kunci}`}>
        {label}
      </label>
      <PasswordInput
        id={`fk-akun-${kunci}`}
        autoComplete={autoComplete}
        value={form[kunci]}
        invalid={Boolean(galat[kunci])}
        onChange={ubah(kunci)}
        onKeyDown={(e) => e.key === "Enter" && simpan()}
      />
      {galat[kunci] && <span className="fk-err">{galat[kunci]}</span>}
    </div>
  );

  return (
    <>
      <PageHead title="Akun Admin" sub="Ganti Password Dan Keluar Dari Sesi Admin." />

      <Panel title="Ganti Password">
        <div className="fk-akun-form">
          {kolom("lama", "Password lama", "current-password")}
          {kolom("baru", `Password baru (minimal ${PASSWORD_MIN} karakter)`, "new-password")}
          {kolom("ulang", "Ulangi password baru", "new-password")}
          <div>
            <button type="button" className="fk-btn" onClick={simpan} disabled={sibuk}>
              {sibuk ? "Menyimpan..." : "Simpan password"}
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Sesi">
        <button type="button" className="fk-btn-ghost" onClick={onKeluar}>
          Keluar dari admin
        </button>
      </Panel>
    </>
  );
}
