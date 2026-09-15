import { useState } from "react";
import { IkonMata, IkonMataTutup } from "./Icons.jsx";

/**
 * Kolom password dengan tombol mata untuk menampilkan / menyembunyikan isian.
 * Props lain (value, onChange, autoComplete, ...) diteruskan ke <input>.
 */
export default function PasswordInput({ invalid = false, ...props }) {
  const [lihat, setLihat] = useState(false);

  return (
    <div className="fk-pass">
      <input
        {...props}
        type={lihat ? "text" : "password"}
        className={"fk-input" + (invalid ? " is-invalid" : "")}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="fk-pass-mata"
        onClick={() => setLihat((v) => !v)}
        aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={lihat}
        title={lihat ? "Sembunyikan password" : "Tampilkan password"}
      >
        {lihat ? <IkonMataTutup /> : <IkonMata />}
      </button>
    </div>
  );
}
