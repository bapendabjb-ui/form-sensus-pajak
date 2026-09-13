/* Komponen tampilan kecil yang dipakai di beberapa halaman. */

export function PageHead({ title, sub, children }) {
  return (
    <div className={"fk-page-head" + (children ? " fk-row-between" : "")}>
      <div>
        <h1 className="fk-page-title">{title}</h1>
        {sub && <p className="fk-page-sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, sub, children, className = "" }) {
  return (
    <section className={`fk-panel ${className}`.trim()}>
      {(title || sub) && (
        <div className="fk-panel-head">
          {title && <h2 className="fk-panel-title">{title}</h2>}
          {sub && <span className="fk-panel-sub">{sub}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children, action }) {
  return (
    <div className="fk-empty">
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Loading({ label = "Memuat data..." }) {
  return (
    <div className="fk-loading" role="status">
      <span className="fk-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ children, onRetry }) {
  return (
    <div className="fk-errbox" role="alert">
      <span>{children}</span>
      {onRetry && (
        <button type="button" className="fk-mini" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function StatusPill({ status }) {
  const selesai = status === "selesai";
  return (
    <span className={"fk-pill" + (selesai ? " is-done" : " is-draft")}>
      {selesai ? "Selesai" : "Draft"}
    </span>
  );
}
