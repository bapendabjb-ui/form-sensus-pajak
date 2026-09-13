import { groupDigits, unformatNumber } from "../lib/format.js";

/**
 * Input nominal uang: menampilkan pemisah ribuan sambil diketik
 * (100000 -> 100.000) dengan awalan "Rp".
 *
 * value  : string angka mentah, mis. "100000"
 * onChange(next) : menerima string angka mentah juga.
 */
export default function MoneyInput({
  value,
  onChange,
  placeholder = "0",
  invalid = false,
  disabled = false,
  ariaLabel,
}) {
  const tampil = groupDigits(value ?? "");

  const handle = (e) => onChange(unformatNumber(e.target.value));

  return (
    <div className="fk-money">
      <span className="fk-money-pre">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={"fk-input fk-money-in" + (invalid ? " is-invalid" : "")}
        placeholder={placeholder}
        value={tampil}
        onChange={handle}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
