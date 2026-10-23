import { useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { IconLock } from "./Icons.jsx";
import PasswordInput from "./PasswordInput.jsx";

/**
 * Kartu login admin. Dipakai di halaman Formulir dan di layar /masuk,
 * jadi bentuk & perilakunya selalu sama.
 *
 * Sengaja berupa <form> sungguhan: pengelola password di HP dan browser baru
 * menawarkan "Simpan password?" setelah sebuah form dikirim.
 */
export default function LoginAdmin({
  onLoggedIn,
  sub = "Pengelolaan Aplikasi.",
}) {
  const toast = useToast();
  const [form, setForm] = useState({ user: "", pass: "" });
  const [ingat, setIngat] = useState(false);
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
      await api.login(form.user.trim(), form.pass, ingat);
      toast("Berhasil masuk sebagai admin.");
      onLoggedIn();
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
        <h2 className="fk-login-title">Login Admin</h2>
        <p className="fk-login-sub">{sub}</p>

        <input
          className="fk-input"
          name="username"
          placeholder="Username"
          autoComplete="username"
          autoCapitalize="none"
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

        <label className="fk-login-ingat">
          <input type="checkbox" checked={ingat} onChange={(e) => setIngat(e.target.checked)} />
          <span>
            Ingat saya di perangkat ini
            <span className="fk-login-ingat-ket">
              Tetap masuk selama aplikasi dibuka minimal sebulan sekali. Jangan dicentang di perangkat milik bersama.
            </span>
          </span>
        </label>

        {err && <span className="fk-err">{err}</span>}

        <button type="submit" className="fk-btn fk-login-btn" disabled={loading}>
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}
