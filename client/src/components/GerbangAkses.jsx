import { useState } from "react";
import * as api from "../api.js";
import { Lambang } from "./Icons.jsx";
import LoginAdmin from "./LoginAdmin.jsx";

/**
 * Gerbang kode akses.
 *
 * Tampil menggantikan seluruh aplikasi bila server dipasangi AKSES_KODE dan
 * perangkat ini belum pernah memasukkannya. Bentuknya sengaja dibuat seperti
 * kartu login admin supaya tidak terasa seperti layar galat.
 *
 * Kodenya sendiri tidak disimpan di sisi klien: server menukarnya dengan cookie
 * HttpOnly berumur 30 hari, jadi petugas cukup mengetiknya sekali per perangkat.
 * Cookie itu pula yang membuat <img src="/api/foto/..."> tetap bisa memuat foto,
 * yang tidak mungkin dilakukan dengan header Authorization.
 *
 * Admin punya jalan masuk sendiri di sini: tokennya diterima server sebagai
 * pengganti kode akses, sehingga admin tidak perlu tahu kode yang dibagikan
 * kepada petugas lapangan.
 */
export default function GerbangAkses({ onLolos }) {
  const [modeAdmin, setModeAdmin] = useState(false);
  const [kode, setKode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const kirim = async () => {
    if (!kode.trim()) {
      setErr("Kode akses wajib diisi.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      await api.kirimKodeAkses(kode.trim());
      onLolos();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (modeAdmin) {
    return (
      <div className="fk-login">
        <LoginAdmin onLoggedIn={onLolos} sub="Masuk dengan akun admin, tanpa kode akses." />
        <button type="button" className="fk-akses-alt" onClick={() => setModeAdmin(false)}>
          Kembali ke kode akses
        </button>
      </div>
    );
  }

  return (
    <div className="fk-login">
      <div className="fk-login-card">
        <span className="fk-logo fk-login-logo">
          <Lambang />
        </span>
        <h2 className="fk-login-title">Sensus Pajak</h2>
        <p className="fk-login-sub">
          Masukkan kode akses untuk mulai bekerja. Kodenya dibagikan admin dan cukup dimasukkan
          sekali di perangkat ini.
        </p>

        <input
          className="fk-input"
          placeholder="Kode akses"
          autoComplete="one-time-code"
          autoFocus
          value={kode}
          onChange={(e) => {
            setKode(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && kirim()}
        />

        {err && <span className="fk-err">{err}</span>}

        <button type="button" className="fk-btn fk-login-btn" onClick={kirim} disabled={loading}>
          {loading ? "Memeriksa..." : "Lanjutkan"}
        </button>

        <button type="button" className="fk-akses-alt" onClick={() => setModeAdmin(true)}>
          Saya admin
        </button>
      </div>
    </div>
  );
}
