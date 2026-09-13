import CustomSelect from "./CustomSelect.jsx";
import DatePicker from "./DatePicker.jsx";
import MoneyInput from "./MoneyInput.jsx";
import FotoInput from "./FotoInput.jsx";
import WilayahInput from "./WilayahInput.jsx";
import { CheckIcon } from "./Icons.jsx";
import { groupDigits, unformatNumber } from "../lib/format.js";

/* ---------- pilihan (radio / checkbox) ---------- */

function ChoiceGroup({ tipe, options = [], value, onChange }) {
  if (tipe === "radio") {
    return (
      <div className="fk-choices" role="radiogroup">
        {options.map((opt, i) => (
          <button
            type="button"
            key={`${opt}-${i}`}
            role="radio"
            aria-checked={value === opt}
            className={"fk-choice" + (value === opt ? " is-on" : "")}
            onClick={() => onChange(value === opt ? "" : opt)}
          >
            <span className="fk-ind fk-ind-radio">{value === opt && <span className="fk-dot" />}</span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
    );
  }

  const arr = Array.isArray(value) ? value : [];
  const toggle = (opt) => onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);

  return (
    <div className="fk-choices">
      {options.map((opt, i) => (
        <button
          type="button"
          key={`${opt}-${i}`}
          role="checkbox"
          aria-checked={arr.includes(opt)}
          className={"fk-choice" + (arr.includes(opt) ? " is-on" : "")}
          onClick={() => toggle(opt)}
        >
          <span className="fk-ind fk-ind-check">{arr.includes(opt) && <CheckIcon />}</span>
          <span>{opt}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- angka ---------- */

/** Input angka dengan pemisah ribuan (tanpa awalan Rp). */
function NumberInput({ value, onChange, invalid }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={"fk-input" + (invalid ? " is-invalid" : "")}
      value={groupDigits(value ?? "")}
      onChange={(e) => onChange(unformatNumber(e.target.value))}
      placeholder="0"
    />
  );
}

/* ---------- rentang harga ---------- */

function RangeInput({ value, onChange, invalid }) {
  const v = value && typeof value === "object" ? value : { min: "", max: "" };
  const set = (k, val) => onChange({ ...v, [k]: val });

  return (
    <div className={"fk-range" + (invalid ? " is-invalid" : "")}>
      <MoneyInput value={v.min} onChange={(x) => set("min", x)} placeholder="Dari" ariaLabel="Harga dari" invalid={invalid} />
      <span className="fk-range-sep">–</span>
      <MoneyInput value={v.max} onChange={(x) => set("max", x)} placeholder="Sampai" ariaLabel="Harga sampai" invalid={invalid} />
    </div>
  );
}

/* ---------- rincian tarif ---------- */

const barisBaru = () => ({ layanan: "", jenis: "", harga_min: "", harga_max: "", isRange: false });

function LineTariff({ value, jenisOptions = [], rangePrice, onChange, invalid }) {
  const rows = Array.isArray(value) ? value : [];

  const patch = (i, obj) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...obj } : r)));
  const tambah = () => onChange([...rows, barisBaru()]);
  const hapus = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className={"fk-lt" + (rangePrice ? " is-range" : "") + (invalid ? " is-invalid" : "")}>
      <div className="fk-lt-head">
        <span>Layanan</span>
        <span>Jenis tarif</span>
        <span>Harga</span>
        <span />
      </div>

      {rows.length === 0 && <div className="fk-lt-empty">Belum ada baris — tambah layanan di bawah.</div>}

      {rows.map((r, i) => (
        <div className="fk-lt-row" key={i}>
          <input
            className="fk-input"
            placeholder="mis. Refleksi kaki"
            value={r.layanan || ""}
            onChange={(e) => patch(i, { layanan: e.target.value })}
            aria-label={`Layanan baris ${i + 1}`}
          />

          <CustomSelect
            value={r.jenis || ""}
            options={jenisOptions}
            placeholder="Pilih"
            onChange={(val) => patch(i, { jenis: val })}
          />

          {rangePrice ? (
            <div className="fk-lt-price">
              <MoneyInput
                value={r.harga_min}
                onChange={(x) => patch(i, { harga_min: x })}
                placeholder={r.isRange ? "Dari" : "0"}
                ariaLabel={`Harga baris ${i + 1}`}
              />
              {r.isRange && (
                <>
                  <span className="fk-range-sep">–</span>
                  <MoneyInput
                    value={r.harga_max}
                    onChange={(x) => patch(i, { harga_max: x })}
                    placeholder="Sampai"
                    ariaLabel={`Harga sampai baris ${i + 1}`}
                  />
                </>
              )}
              <button
                type="button"
                className="fk-lt-rangetog"
                onClick={() =>
                  r.isRange ? patch(i, { isRange: false, harga_max: "" }) : patch(i, { isRange: true })
                }
              >
                {r.isRange ? "− rentang" : "+ rentang"}
              </button>
            </div>
          ) : (
            <MoneyInput
              value={r.harga_min}
              onChange={(x) => patch(i, { harga_min: x })}
              ariaLabel={`Harga baris ${i + 1}`}
            />
          )}

          <button type="button" className="fk-lt-del" onClick={() => hapus(i)} aria-label={`Hapus baris ${i + 1}`}>
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="fk-add-opt fk-lt-add" onClick={tambah}>
        + Tambah baris
      </button>
    </div>
  );
}

/* ---------- dispatcher ---------- */

/** Render input yang sesuai untuk satu pertanyaan. */
export default function FieldInput({ q, value, invalid, onChange }) {
  switch (q.tipe) {
    case "text":
      return (
        <input
          className={"fk-input" + (invalid ? " is-invalid" : "")}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "paragraph":
      return (
        <textarea
          className={"fk-input fk-textarea" + (invalid ? " is-invalid" : "")}
          rows={3}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return <NumberInput value={value} onChange={onChange} invalid={invalid} />;

    case "date":
      return <DatePicker value={value || ""} onChange={onChange} invalid={invalid} />;

    case "dropdown":
      return (
        <CustomSelect
          value={value || ""}
          options={q.opsi || []}
          onChange={onChange}
          invalid={invalid}
          emptyText="Opsi belum disiapkan admin"
        />
      );

    case "radio":
    case "checkbox":
      return <ChoiceGroup tipe={q.tipe} options={q.opsi || []} value={value} onChange={onChange} />;

    case "range":
      return <RangeInput value={value} onChange={onChange} invalid={invalid} />;

    case "linetariff":
      return (
        <LineTariff
          value={value}
          jenisOptions={q.opsi || []}
          rangePrice={q.rangeHarga}
          onChange={onChange}
          invalid={invalid}
        />
      );

    case "foto":
      return <FotoInput value={value} onChange={onChange} invalid={invalid} />;

    case "wilayah":
      return <WilayahInput value={value} onChange={onChange} invalid={invalid} />;

    default:
      return null;
  }
}

export { ChoiceGroup, RangeInput, LineTariff, NumberInput };
