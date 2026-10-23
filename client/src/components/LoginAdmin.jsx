import { useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { IconLock } from "./Icons.jsx";
import PasswordInput from "./PasswordInput.jsx";

/**
 * Kartu login. Satu pintu untuk admin dan petugas - server yang menentukan
 * siapa yang masuk. Dipakai di layar /masuk, layar wajib login, dan di halaman
 * khusus admin (Ekspor, Formulir, Pengajuan), jadi bentuknya selalu sama.
 *
 * Sengaja berupa <form> sungguhan: pengelola password di HP dan browser baru
 * menawarkan "Simpan password?" setelah sebuah form dikirim.
 *
 * khususAdmin : halaman yang hanya berguna bagi admin. Petugas yang masuk dari
 *               sini tetap masuk, tetapi diberi tahu halamannya bukan untuknya.
 */
export default function LoginAdmin({
  onLoggedIn,
  judul = "Login Admin",
  sub = "Pengelolaan Aplikasi.",
  khususAdmin = true,
}) {
  const toast = useToast();
  const [form, setForm] = useState({ user: "", pass: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const masuk = async (ev) => {
    ev.preventDefault();
    if (loading) return;
    if (!form.user.trim() || !form.pass) {
      setErr("Username dan password wajib diisi.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const sesi = await api.login(form.user.trim(), form.pass);
      if (sesi.role === "admin") toast("Berhasil masuk sebagai admin.");
      else if (khususAdmin) toast(`Masuk sebagai ${sesi.nama}. Halaman ini khusus admin.`, true);
      else toast(`Selamat datang, ${sesi.nama}.`);
      onLoggedIn(sesi);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fk-login">
      <form className="fk-login-card" onSubmit={masuk} noValidate>
        <span className="fk-logo fk-login-logo">
          <IconLock />
        </span>
        <h2 className="fk-login-title">{judul}</h2>
        <p className="fk-login-sub">{sub}</p>

        <input
          className="fk-input"
          name="username"
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={form.user}
          onChange={(e) => {
            setForm((f) => ({ ...f, user: e.target.value }));
            setErr("");
          }}
        />
        <PasswordInput
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          value={form.pass}
          onChange={(e) => {
            setForm((f) => ({ ...f, pass: e.target.value }));
            setErr("");
          }}
        />

        {err && <span className="fk-err">{err}</span>}

        <button type="submit" className="fk-btn fk-login-btn" disabled={loading}>
          {loading ? "Memeriksa..." : "Masuk"}
        </button>

        {!khususAdmin && (
          <p className="fk-login-ket">
            Petugas cukup masuk sekali: HP ini diingat selama aplikasi dibuka paling tidak sebulan sekali.
            Lupa password? Minta admin membuatkan yang baru.
          </p>
        )}
      </form>
    </div>
  );
}
