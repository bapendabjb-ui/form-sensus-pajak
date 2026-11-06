import { useEffect, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../Toast.jsx";
import { useDialog } from "../Dialog.jsx";
import { NopInput } from "../Fields.jsx";
import { IkonTutup } from "../Icons.jsx";
import { useSesi, useHanyaLihat } from "../../lib/admin.js";
import { navigate } from "../../lib/router.js";
import { formatNop, formatWaktu, hanyaDigit, PANJANG_NOP } from "../../lib/format.js";
import { bidangDariPersil, nibLengkap, kunciBidang } from "../../lib/nib.js";
import { formatLuas, kabarkanStatusBerubah } from "../../lib/persilBpn.js";
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

/** NOP PBB di bidang ini: daftar dari kedua sumber, tambah, hapus, dan mulai formulir PBB. */
function TabNop({ bidang, isi, setIsi }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const sesi = useSesi();
  const hanyaLihat = useHanyaLihat();
  const bisaTambah = sesi?.role === "admin" || sesi?.role === "petugas";
  const [nop, setNop] = useState("");
  const [ket, setKet] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const digit = hanyaDigit(nop, PANJANG_NOP);
  const lengkap = digit.length === PANJANG_NOP;
  const sudahAda = lengkap && isi.nop.some((g) => g.nop === digit);

  const tambah = async () => {
    setMenyimpan(true);
    setGalat("");
    try {
      setIsi(await api.tambahNopBidang({ kunci: bidang.kunci, nop: digit, keterangan: ket }));
      setNop("");
      setKet("");
      kabarkanStatusBerubah();
      toast(`NOP ${formatNop(digit)} ditambahkan ke bidang ini.`);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (item, n) => {
    const ya = await konfirmasi({
      judul: "Hapus NOP dari bidang ini?",
      pesan: `NOP ${formatNop(n)} tidak lagi tercatat di bidang NIB ${nibLengkap(bidang.kodeWilayah, bidang.nib)}. Data sensus tidak berubah.`,
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      setIsi(await api.hapusNopBidang(item.id));
      kabarkanStatusBerubah();
      toast("NOP dihapus dari bidang ini.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  // Formulir PBB untuk bidang ini: dititipkan, lalu petugas memilih kertas kerja & formulirnya.
  const isiFormulir = () => {
    const nopTitip = lengkap ? digit : isi.nop.length === 1 ? isi.nop[0].nop : "";
    titipBidang({ bidang: bidangDariPersil(bidang), nop: nopTitip });
    navigate("/kertas-kerja");
  };

  const buka = (d) => navigate(`/kertas-kerja/${d.kkId}/data/${d.entriId}`);

  return (
    <div className="fk-panel-isi" role="tabpanel">
      {isi.nop.length > 1 && (
        <span className="fk-balon-kurang">{isi.nop.length} NOP berbeda di bidang ini: perlu ditinjau.</span>
      )}
      {isi.nop.length === 0 && isi.tanpaNop.length === 0 && <span className="fk-balon-sub">Belum ada NOP di bidang ini.</span>}

      {isi.nop.length > 0 && (
        <ul className="fk-tabnop-daftar">
          {isi.nop.map((g) => (
            <li key={g.nop}>
              <b className="fk-tabnop-nop">{formatNop(g.nop)}</b>
              {g.sensus.map((d) => (
                <div className="fk-tabnop-sumber" key={`s${d.entriId}`}>
                  <span>
                    <span className="fk-tabnop-label">Data sensus</span> KK {d.nomor}
                    {d.judul ? ` · ${d.judul}` : ""}
                  </span>
                  <button type="button" className="fk-balon-buka" onClick={() => buka(d)}>
                    Buka
                  </button>
                </div>
              ))}
              {g.peta.map((x) => (
                <div className="fk-tabnop-sumber" key={`p${x.id}`}>
                  <span>
                    <span className="fk-tabnop-label is-peta">Dari peta</span>
                    {[x.oleh, formatWaktu(x.waktu), x.keterangan].filter(Boolean).join(" · ")}
                  </span>
                  {x.bisaHapus && (
                    <button type="button" className="fk-tabnop-hapus" onClick={() => hapus(x, g.nop)} aria-label={`Hapus NOP ${formatNop(g.nop)} dari bidang ini`}>
                      Hapus
                    </button>
                  )}
                </div>
              ))}
              {g.bidangLain > 0 && <span className="fk-balon-sub">NOP ini juga tercatat di {g.bidangLain} bidang lain.</span>}
            </li>
          ))}
        </ul>
      )}

      {isi.tanpaNop.length > 0 && (
        <div className="fk-tabnop-tanpa">
          <span className="fk-balon-sub">Tercatat di data sensus tanpa NOP:</span>
          {isi.tanpaNop.map((d) => (
            <div className="fk-tabnop-sumber" key={`t${d.entriId}`}>
              <span>
                KK {d.nomor}
                {d.judul ? ` · ${d.judul}` : ""}
              </span>
              <button type="button" className="fk-balon-buka" onClick={() => buka(d)}>
                Buka
              </button>
            </div>
          ))}
        </div>
      )}

      {bisaTambah && (
        <div className="fk-tabnop-tambah">
          <span className="fk-tabnop-judul">Tambah NOP</span>
          <NopInput value={nop} onChange={setNop} invalid={Boolean(galat)} />
          <input
            className="fk-input"
            value={ket}
            maxLength={200}
            placeholder="Keterangan (opsional), mis. sebagian bidang"
            aria-label="Keterangan NOP (opsional)"
            onChange={(e) => setKet(e.target.value)}
          />
          {sudahAda && <span className="fk-hint-kecil">NOP ini sudah tercatat di bidang ini.</span>}
          {galat && <span className="fk-err">{galat}</span>}
          <button type="button" className="fk-btn" onClick={tambah} disabled={!lengkap || sudahAda || menyimpan}>
            {menyimpan ? "Menyimpan..." : "Simpan NOP"}
          </button>
        </div>
      )}
      {!bisaTambah && !hanyaLihat && (
        <span className="fk-hint-kecil">Masuk sebagai petugas atau admin untuk menambah NOP di bidang ini.</span>
      )}
      {!hanyaLihat && (
        <button type="button" className="fk-textbtn is-brand fk-tabnop-formulir" onClick={isiFormulir}>
          Isi formulir PBB untuk bidang ini
        </button>
      )}
    </div>
  );
}
