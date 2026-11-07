import { useEffect, useState } from "react";
import NopBidang from "../NopBidang.jsx";
import { IkonTutup } from "../Icons.jsx";
import { useHanyaLihat } from "../../lib/admin.js";
import { navigate } from "../../lib/router.js";
import { bidangDariPersil, nibLengkap, kunciBidang } from "../../lib/nib.js";
import { formatLuas } from "../../lib/persilBpn.js";
import { titipBidang } from "../../lib/titipanBidang.js";

/**
 * Panel bidang persil yang diketuk / dicari di Peta Sensus: tetap di kiri atas
 * peta, tidak ikut bergeser. Dua tab:
 *   NIB - keterangan BPN (NIB, tipe hak, luas peta, kelurahan, atribut berkas)
 *   NOP - NOP PBB yang tercatat di bidang ini, dari data sensus (formulir) dan
 *         dari peta; petugas / admin bisa menambah NOP langsung di sini, atau
 *         memulai formulir PBB untuk bidang ini.
 * Mesin peta menyorot bidangnya dan menjaganya tidak tertutup panel (geserPanel).
 *
 * bidang   : bidang dari server (/persil/titik?bentuk=1, /persil/cari) - kunci, nib,
 *            kodeWilayah, ..., fitur.properties.nop (server/src/integrasi.js nopBidang)
 * panelRef : ref elemen panel, dibaca mesin peta untuk mengukurnya
 */

/** Tab terakhir dipilih (per perangkat): petugas yang sedang memetakan NOP tidak perlu pindah tab setiap ketukan. */
const KUNCI_TAB = "sensus.tabBidang";
const bacaTab = () => {
  try {
    return localStorage.getItem(KUNCI_TAB) === "nop" ? "nop" : "nib";
  } catch {
    return "nib";
  }
};

/** Atribut berkas BPN yang tampil di tab NIB; sisanya cukup disebut jumlahnya. */
const ATRIBUT_MAKS = 12;

const kosong = { nop: [], tanpaNop: [] };

export default function PanelBidang({ bidang: masuk, onTutup, panelRef }) {
  // Kunci "kode|nib" dari server; disusun sendiri bila tidak ikut terkirim.
  const bidang = masuk.kunci ? masuk : { ...masuk, kunci: kunciBidang(masuk.kodeWilayah, masuk.nib) };
  const [tab, setTab] = useState(bacaTab);
  const [isi, setIsi] = useState(() => masuk.fitur?.properties?.nop || kosong);

  // Bidang diketuk lagi / bidang lain: isi tab NOP dari jawaban server terbaru.
  useEffect(() => {
    setIsi(masuk.fitur?.properties?.nop || kosong);
  }, [masuk]);

  const pilihTab = (t) => {
    setTab(t);
    try {
      localStorage.setItem(KUNCI_TAB, t);
    } catch {
      /* penyimpanan tidak tersedia */
    }
  };

  return (
    <div className="fk-peta-panel" ref={panelRef} role="region" aria-label="Keterangan bidang terpilih">
      <div className="fk-panel-kepala">
        <strong>Persil BPN</strong>
        <button type="button" className="fk-peta-panel-tutup" onClick={onTutup} aria-label="Tutup keterangan bidang" title="Tutup">
          <IkonTutup />
        </button>
      </div>
      <div className="fk-panel-tab" role="tablist" aria-label="Keterangan bidang">
        <button type="button" role="tab" aria-selected={tab === "nib"} className={tab === "nib" ? "is-on" : ""} onClick={() => pilihTab("nib")}>
          NIB
        </button>
        <button type="button" role="tab" aria-selected={tab === "nop"} className={tab === "nop" ? "is-on" : ""} onClick={() => pilihTab("nop")}>
          NOP <span className="fk-panel-tab-jumlah">{isi.nop.length}</span>
        </button>
      </div>
      {tab === "nib" ? <TabNib bidang={bidang} /> : <TabNop key={bidang.kunci} bidang={bidang} isi={isi} setIsi={setIsi} />}
    </div>
  );
}

/** Keterangan BPN bidang ini. */
function TabNib({ bidang }) {
  const p = bidang.fitur?.properties || {};
  const utama = [
    ["NIB", p.nib || nibLengkap(bidang.kodeWilayah, bidang.nib)],
    ["Tipe hak", p.tipeHak],
    ["Luas peta", Number.isFinite(p.luasPeta) ? formatLuas(p.luasPeta) : ""],
    ["Kelurahan", p.kelurahan],
    ["Kecamatan", p.kecamatan],
  ];
  const lain = Object.entries(p.lain && typeof p.lain === "object" ? p.lain : {});
  const baris = [...utama, ...lain].filter(([, v]) => v !== null && v !== undefined && v !== "");
  const lebih = baris.length - ATRIBUT_MAKS;
  return (
    <div className="fk-panel-isi" role="tabpanel">
      <table className="fk-balon-tabel">
        <tbody>
          {baris.slice(0, ATRIBUT_MAKS).map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lebih > 0 && <span className="fk-balon-sub">+{lebih} atribut lain</span>}
    </div>
  );
}

/** NOP PBB di bidang ini (components/NopBidang.jsx), lalu mulai formulir PBB untuk bidang ini. */
function TabNop({ bidang, isi, setIsi }) {
  const hanyaLihat = useHanyaLihat();
  // Formulir PBB untuk bidang ini: dititipkan, lalu petugas memilih kertas kerja & formulirnya.
  const isiFormulir = (nopDiketik) => {
    const nopTitip = nopDiketik || (isi.nop.length === 1 ? isi.nop[0].nop : "");
    titipBidang({ bidang: bidangDariPersil(bidang), nop: nopTitip });
    navigate("/kertas-kerja");
  };
  return (
    <div className="fk-panel-isi" role="tabpanel">
      <NopBidang
        bidang={bidang}
        isi={isi}
        setIsi={setIsi}
        bawah={(nopDiketik) =>
          !hanyaLihat && (
            <button type="button" className="fk-textbtn is-brand fk-tabnop-formulir" onClick={() => isiFormulir(nopDiketik)}>
              Isi formulir PBB untuk bidang ini
            </button>
          )
        }
      />
    </div>
  );
}
