import { useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { IconLock } from "./Icons.jsx";

/**
 * Kartu login admin. Dipakai di halaman Formulir dan di layar /masuk,
 * jadi bentuk & perilakunya selalu sama.
 */
export default function LoginAdmin({
  onLoggedIn,
  sub = "Pengelolaan Aplikasi.",
}) {
  const toast = useToast();
  const [form, setForm] = useState({ user: "", pass: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const masuk = async () => {
    if (!form.user.trim() || !form.pass) {
      setErr("Username dan password wajib diisi.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      await api.login(form.user.trim(), form.pass);
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
      <div className="fk-login-card">
        <span className="fk-logo fk-login-logo">
          <IconLock />
        </span>
        <h2 className="fk-login-title">Login Admin</h2>
        <p className="fk-login-sub">{sub}</p>

        <input
          className="fk-input"
          placeholder="Username"
          autoComplete="username"
          value={form.user}
          onChange={(e) => {
            setForm((f) => ({ ...f, user: e.target.value }));
            setErr("");
          }}
        />
        <input
          className="fk-input"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={form.pass}
          onChange={(e) => {
            setForm((f) => ({ ...f, pass: e.target.value }));
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && masuk()}
        />

        {err && <span className="fk-err">{err}</span>}

        <button type="button" className="fk-btn fk-login-btn" onClick={masuk} disabled={loading}>
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </div>
    </div>
  );
}
