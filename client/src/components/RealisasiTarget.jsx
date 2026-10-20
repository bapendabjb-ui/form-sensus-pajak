import { useLayoutEffect, useRef, useState } from "react";
import { Panel } from "./Ui.jsx";

/** Bar harian hanya untuk 30 hari terakhir supaya batangnya tetap terbaca di HP. */
const HARI_BATANG = 30;
/** Laju rata-rata untuk perkiraan kapan target tercapai. */
const HARI_LAJU = 7;
const TINGGI = 200;
const ATAS = 12;
const BAWAH = 24;
const KANAN = 8;

const angka = (n) => Number(n).toLocaleString("id-ID");
const ringkas = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
// Tanggal dari server sudah tanggal setempat; dibaca sebagai UTC supaya tidak bergeser.
const keTanggal = (iso) => new Date(`${iso}T00:00:00Z`);
const fmtPendek = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtLengkap = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtHari = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtBulan = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
const fmtBulanPanjang = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

/** Deret harian -> deret bulanan; `kumulatif` = jumlah sampai akhir bulan itu (atau hari ini). */
function perBulan(harian) {
  const bulan = [];
  for (const h of harian) {
    const akhir = bulan[bulan.length - 1];
    if (akhir && akhir.tanggal.slice(0, 7) === h.tanggal.slice(0, 7)) {
      akhir.jumlah += h.jumlah;
      akhir.kumulatif = h.kumulatif;
    } else {
      bulan.push({ tanggal: `${h.tanggal.slice(0, 7)}-01`, jumlah: h.jumlah, kumulatif: h.kumulatif });
    }
  }
  return bulan;
}

function persen(nilai, target) {
  const p = (nilai / target) * 100;
  if (p > 0 && p < 0.1) return "< 0,1";
  return p.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

/** Perkiraan tanggal target tercapai bila laju rata-rata bertahan. */
function perkiraan(sisa, laju, hariIni) {
  if (sisa <= 0) return "Tercapai";
  if (laju <= 0) return "–";
  const hari = Math.ceil(sisa / laju);
  if (hari > 3650) return "> 10 tahun";
  return fmtBulan.format(new Date(keTanggal(hariIni).getTime() + hari * 864e5));
}

/** Angka sumbu Y yang bulat (1-2-5), tiga ruas kurang lebih. */
function skalaY(maks) {
  const kasar = Math.max(maks, 1) / 3;
  const pangkat = 10 ** Math.floor(Math.log10(kasar));
  const langkah = Math.max(1, [1, 2, 5, 10].map((k) => k * pangkat).find((s) => s >= kasar));
  const atas = Math.max(langkah, Math.ceil(maks / langkah) * langkah);
  const tik = [];
  for (let v = 0; v <= atas; v += langkah) tik.push(v);
  return { atas, tik };
}

/** Batang dengan ujung atas membulat 4px, rata di garis dasar. */
function batang(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function useLebar(ref) {
  const [lebar, setLebar] = useState(0);
  // Diukur langsung sebelum tampil supaya grafik tidak sempat kosong saat ganti mode.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setLebar(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setLebar(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return lebar;
}

const LABEL_GRAFIK = {
  harian: "Grafik kertas kerja per hari. Gunakan panah kiri dan kanan untuk membaca per tanggal.",
  bulanan: "Grafik kertas kerja per bulan. Gunakan panah kiri dan kanan untuk membaca per bulan.",
  kumulatif: "Grafik jumlah kumulatif kertas kerja. Gunakan panah kiri dan kanan untuk membaca per tanggal.",
};

/**
 * Grafik realisasi: batang per hari / per bulan, atau garis kumulatif sejak
 * hari pertama. Arahkan kursor / sentuh / panah kiri-kanan untuk melihat angkanya.
 */
function Grafik({ titik, mode, hariIni }) {
  const wadah = useRef(null);
  const lebar = useLebar(wadah);
  const [aktif, setAktif] = useState(null);

  const kumulatif = mode === "kumulatif";
  const bulanan = mode === "bulanan";
  const nilai = titik.map((t) => (kumulatif ? t.kumulatif : t.jumlah));
  const n = titik.length;
  const { atas, tik } = skalaY(Math.max(...nilai));

  const kiri = Math.max(...tik.map((v) => ringkas.format(v).length)) * 6.6 + 10;
  const lebarPlot = Math.max(1, lebar - kiri - KANAN);
  // Bulanan memasang angka di atas batang; batang tertinggi butuh ruang untuknya.
  const ruangAtas = bulanan ? 22 : ATAS;
  const tinggiPlot = TINGGI - ruangAtas - BAWAH;
  const dasar = ruangAtas + tinggiPlot;
  const y = (v) => dasar - (v / atas) * tinggiPlot;
  const pita = lebarPlot / n;
  const x = (i) => (!kumulatif ? kiri + (i + 0.5) * pita : n === 1 ? kiri + lebarPlot / 2 : kiri + (i * lebarPlot) / (n - 1));

  const pilihDari = (e) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = !kumulatif ? Math.floor((px - kiri) / pita) : n === 1 ? 0 : Math.round(((px - kiri) / lebarPlot) * (n - 1));
    setAktif(Math.min(n - 1, Math.max(0, i)));
  };

  const tombol = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const geser = e.key === "ArrowLeft" ? -1 : 1;
    setAktif((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + geser)));
  };

  // Bulanan: tiap bulan diberi label bila muat. Selebihnya awal, tengah, akhir -
  // cukup untuk membaca rentang tanpa berdesakan.
  const semuaLabel = bulanan && pita >= 64;
  const labelX = semuaLabel
    ? titik.map((_, i) => i)
    : n === 1
      ? [0]
      : n >= 5 && lebar > 300
        ? [0, Math.floor((n - 1) / 2), n - 1]
        : [0, n - 1];
  const jangkar = (i) => (semuaLabel || n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle");
  const posLabel = (i) => (semuaLabel || n === 1 ? x(i) : i === 0 ? kiri : i === n - 1 ? kiri + lebarPlot : x(i));
  const teksX = (iso) => (bulanan ? fmtBulan : fmtPendek).format(keTanggal(iso));
  // Bulan berjalan belum genap; tooltip menyebut sampai tanggal berapa.
  const judulTip = (iso) =>
    bulanan
      ? fmtBulanPanjang.format(keTanggal(iso)) +
        (iso.slice(0, 7) === hariIni.slice(0, 7) ? `, s.d. ${fmtPendek.format(keTanggal(hariIni))}` : "")
      : fmtHari.format(keTanggal(iso));

  const garis = nilai.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const area = `${garis}L${x(n - 1)},${dasar}L${x(0)},${dasar}Z`;
  const t = aktif === null ? null : titik[aktif];

  return (
    <div
      ref={wadah}
      className="fk-grafik"
      tabIndex={0}
      role="group"
      aria-label={LABEL_GRAFIK[mode]}
      onKeyDown={tombol}
      onFocus={() => setAktif((a) => a ?? n - 1)}
      onBlur={() => setAktif(null)}
    >
      {lebar > 0 && (
        <svg width={lebar} height={TINGGI} aria-hidden="true">
          {tik.map((v) => (
            <g key={v}>
              <line x1={kiri} x2={kiri + lebarPlot} y1={y(v)} y2={y(v)} className={v === 0 ? "fk-grafik-dasar" : "fk-grafik-grid"} />
              <text x={kiri - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fk-grafik-sumbu">
                {ringkas.format(v)}
              </text>
            </g>
          ))}
          {labelX.map((i) => (
            <text key={i} x={posLabel(i)} y={TINGGI - 6} textAnchor={jangkar(i)} className="fk-grafik-sumbu">
              {teksX(titik[i].tanggal)}
            </text>
          ))}

          {!kumulatif ? (
            nilai.map((v, i) => {
              if (v <= 0) return null;
              const w = Math.min(24, Math.max(1, pita - 2));
              return (
                <g key={titik[i].tanggal}>
                  <path
                    d={batang(x(i) - w / 2, y(v), w, dasar - y(v))}
                    className={"fk-grafik-batang" + (i === aktif ? " is-aktif" : "")}
                  />
                  {bulanan && pita >= 48 && (
                    <text x={x(i)} y={y(v) - 6} textAnchor="middle" className="fk-grafik-nilai">
                      {angka(v)}
                    </text>
                  )}
                </g>
              );
            })
          ) : (
            <>
              <path d={area} className="fk-grafik-area" />
              <path d={garis} className="fk-grafik-garis" />
              {aktif !== null && <line x1={x(aktif)} x2={x(aktif)} y1={ruangAtas} y2={dasar} className="fk-grafik-silang" />}
              <circle cx={x(aktif ?? n - 1)} cy={y(nilai[aktif ?? n - 1])} r={4} className="fk-grafik-titik" />
            </>
          )}

          <rect
            x={kiri}
            y={0}
            width={lebarPlot}
            height={dasar}
            fill="transparent"
            onPointerDown={pilihDari}
            onPointerMove={pilihDari}
            onPointerLeave={(e) => e.pointerType === "mouse" && setAktif(null)}
          />
        </svg>
      )}

      {t && (
        <div
          className="fk-grafik-tip"
          style={x(aktif) < lebar / 2 ? { left: x(aktif) + 12 } : { right: lebar - x(aktif) + 12 }}
          aria-live="polite"
        >
          <b>{angka(kumulatif ? t.kumulatif : t.jumlah)} kertas kerja</b>
          <span>{judulTip(t.tanggal)}</span>
          <span>{kumulatif ? `+${angka(t.jumlah)} hari itu` : `Kumulatif ${angka(t.kumulatif)}`}</span>
        </div>
      )}
    </div>
  );
}

/** Panel Dashboard: realisasi kertas kerja terhadap target, beserta grafiknya. */
export default function RealisasiTarget({ realisasi }) {
  const [mode, setMode] = useState("harian");
  const { target, hariIni, harian } = realisasi;

  const jumlah = harian.length ? harian[harian.length - 1].kumulatif : 0;
  const sisa = Math.max(0, target - jumlah);
  const laju = harian.slice(-HARI_LAJU).reduce((s, h) => s + h.jumlah, 0) / HARI_LAJU;
  const lebarIsi = Math.min(100, (jumlah / target) * 100);

  const titik = mode === "harian" ? harian.slice(-HARI_BATANG) : mode === "bulanan" ? perBulan(harian) : harian;
  const keterangan = {
    harian:
      harian.length > HARI_BATANG ? `Kertas kerja baru per hari, ${HARI_BATANG} hari terakhir` : "Kertas kerja baru per hari",
    bulanan: "Kertas kerja baru per bulan",
    kumulatif: harian.length
      ? `Jumlah kertas kerja sejak ${fmtLengkap.format(keTanggal(harian[0].tanggal))}`
      : "Jumlah kertas kerja",
  }[mode];

  return (
    <Panel title="Realisasi Kertas Kerja">
      <div className="fk-real-hero">
        <span className="fk-real-angka">{angka(jumlah)}</span>
        <span className="fk-real-dari">
          dari target {angka(target)} · <b>{persen(jumlah, target)}%</b>
        </span>
      </div>
      <div
        className="fk-meter"
        role="meter"
        aria-label="Realisasi terhadap target"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(jumlah, target)}
      >
        <span style={{ width: `${lebarIsi}%`, minWidth: jumlah > 0 ? 6 : 0 }} />
      </div>

      <div className="fk-real-ringkas">
        <div>
          <div className="fk-real-nilai">{angka(sisa)}</div>
          <div className="fk-real-label">Sisa target</div>
        </div>
        <div>
          <div className="fk-real-nilai">
            {laju.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
            <small> /hari</small>
          </div>
          <div className="fk-real-label">Rata-rata {HARI_LAJU} hari terakhir</div>
        </div>
        <div>
          <div className="fk-real-nilai">{perkiraan(sisa, laju, hariIni)}</div>
          <div className="fk-real-label">Perkiraan tercapai</div>
        </div>
      </div>

      <div className="fk-grafik-head">
        <span className="fk-grafik-ket">{keterangan}</span>
        <div className="fk-filter">
          {[
            ["harian", "Harian"],
            ["bulanan", "Bulanan"],
            ["kumulatif", "Kumulatif"],
          ].map(([k, label]) => (
            <button
              type="button"
              key={k}
              className={"fk-filter-btn" + (mode === k ? " is-on" : "")}
              aria-pressed={mode === k}
              onClick={() => setMode(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {harian.length === 0 ? (
        <div className="fk-lt-empty">Belum ada kertas kerja.</div>
      ) : (
        <Grafik key={mode} titik={titik} mode={mode} hariIni={hariIni} />
      )}
    </Panel>
  );
}
