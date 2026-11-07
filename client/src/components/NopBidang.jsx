import { useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { useDialog } from "./Dialog.jsx";
import { NopInput } from "./Fields.jsx";
import PadankanBidang from "./PadankanBidang.jsx";
import { useSesi, useHanyaLihat } from "../lib/admin.js";
import { navigate } from "../lib/router.js";
import { formatNop, hanyaDigit, PANJANG_NOP } from "../lib/format.js";
import { nibLengkap } from "../lib/nib.js";
import { kabarkanStatusBerubah, warnaStatusBidang } from "../lib/persilBpn.js";
import { ringkasPadanan } from "../lib/padanan.js";

/**
 * NOP PBB di satu bidang BPN (server/src/integrasi.js nopBidang): baris status
 * padanan (lapisan Terintegrasi) dengan tombol Padankan, setiap NOP beserta
 * asalnya - formulir dan/atau ditambah di peta - lalu tambah NOP langsung ke
 * bidang itu. Dipakai tab NOP di panel bidang Peta Sensus (peta/PanelBidang.jsx)
 * dan kotak bidang di formulir PBB (NibInput.jsx).
 *
 * NOP yang ditambah di sini langsung tersimpan saat "Simpan" ditekan, tidak
 * menunggu tombol Simpan formulir.
 *
 * bidang      : { kunci, kodeWilayah | kode, nib }
 * isi         : { nop: [...], tanpaNop: [...], padan } dari server; setIsi menggantinya
 * luasBpn     : luas peta bidang (m²), untuk dibanding luas PBB saat memadankan
 * formulir    : di formulir PBB - NOP formulir ini (nopIni) diisi di kotak NOP objek, jadi
 *               tidak ikut didaftar di sini; yang tampil hanya NOP lain di bidang ini
 * nopIni      : NOP formulir yang sedang diisi (18 digit, atau "")
 * kecuali     : id data yang sedang dibuka di formulir (tidak disebut sebagai data lain)
 * bolehTambah : tombol "+ Tambah NOP" tampil (formulir: sesudah NOP objek terisi)
 * bawah       : (nopDiketik) => node - aksi tambahan di bawah (mis. Isi formulir PBB)
 */
/** "7 Nov 2026" */
const tanggalPendek = (w) => {
  const d = new Date(w);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

export default function NopBidang({
  bidang,
  isi,
  setIsi,
  luasBpn = null,
  formulir = false,
  nopIni = "",
  kecuali = null,
  bolehTambah = true,
  bawah = null,
}) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const sesi = useSesi();
  const hanyaLihat = useHanyaLihat();
  const petugas = !hanyaLihat && (sesi?.role === "admin" || sesi?.role === "petugas");
  const [tambahBuka, setTambahBuka] = useState(false);
  const [padanBuka, setPadanBuka] = useState(false);
  const [nop, setNop] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const digit = hanyaDigit(nop, PANJANG_NOP);
  const lengkap = digit.length === PANJANG_NOP;
  const kode = bidang.kodeWilayah ?? bidang.kode ?? "";
  const nibTeks = nibLengkap(kode, bidang.nib);

  // Di formulir NOP-nya sendiri tidak didaftar ulang; di peta semua NOP tampil.
  const grup = formulir ? isi.nop.filter((g) => g.nop !== nopIni) : isi.nop;
  const daftarNop = [...new Set([...(formulir && nopIni ? [nopIni] : []), ...isi.nop.map((g) => g.nop)])];
  const bidangLain = new Set(isi.nop.filter((g) => g.bidangLain > 0).map((g) => g.nop));
  const ringkas = ringkasPadanan({ daftarNop, bidangLain: bidangLain.size > 0, padan: isi.padan, formulir });
  const nopPadan = ringkas?.status === "padan" ? ringkas.nop || (daftarNop.length === 1 ? daftarNop[0] : "") : "";
  const sudahAda = lengkap && daftarNop.includes(digit);

  const tambah = async () => {
    setMenyimpan(true);
    setGalat("");
    try {
      setIsi(await api.tambahNopBidang({ kunci: bidang.kunci, nop: digit, kecuali }));
      setNop("");
      setTambahBuka(false);
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
      pesan: `NOP ${formatNop(n)} tidak lagi tercatat di bidang NIB ${nibTeks}. Data formulir tidak berubah.`,
      ya: "Hapus",
      bahaya: true,
    });
    if (!ya) return;
    try {
      setIsi(await api.hapusNopBidang(item.id, kecuali));
      kabarkanStatusBerubah();
      toast("NOP dihapus dari bidang ini.");
    } catch (e) {
      toast(e.message, true);
    }
  };

  const bukaData = (d) => navigate(`/kertas-kerja/${d.kkId}/data/${d.entriId}`);

  return (
    <div className="fk-nopbidang">
      {ringkas && (
        <div className={"fk-padan-status is-" + ringkas.status}>
          <span className="fk-padan-titik" style={{ background: warnaStatusBidang(ringkas.status, "peta") }} aria-hidden="true" />
          <span className="fk-padan-status-teks">
            <b>{ringkas.judul}</b>
            <span>{ringkas.sub}</span>
          </span>
          {ringkas.aksi && petugas && (
            <button type="button" className={ringkas.aksi === "padankan" ? "fk-mini is-brand" : "fk-mini"} onClick={() => setPadanBuka(true)}>
              {ringkas.aksi === "padankan" ? "Padankan" : "Ubah"}
            </button>
          )}
        </div>
      )}

      {!formulir && grup.length === 0 && isi.tanpaNop.length === 0 && <span className="fk-balon-sub">Belum ada NOP di bidang ini.</span>}
      {formulir && grup.length > 0 && <span className="fk-tabnop-judul">NOP lain di bidang ini</span>}

      {grup.length > 0 && (
        <ul className="fk-tabnop-daftar">
          {grup.map((g) => (
            <li key={g.nop}>
              <div className="fk-tabnop-baris">
                <b className="fk-tabnop-nop">{formatNop(g.nop)}</b>
                {g.nop === nopPadan && daftarNop.length > 1 && <span className="fk-tabnop-label is-padan">NOP bidang ini</span>}
              </div>
              {g.sensus.map((d) => (
                <div className="fk-tabnop-sumber" key={`s${d.entriId}`}>
                  <span>
                    Formulir KK {d.nomor}
                    {d.judul ? ` · ${d.judul}` : ""}
                  </span>
                  <button type="button" className="fk-balon-buka" onClick={() => bukaData(d)}>
                    Buka
                  </button>
                </div>
              ))}
              {g.peta.map((x) => (
                <div className="fk-tabnop-sumber" key={`p${x.id}`}>
                  <span>{["Ditambah" + (x.oleh ? ` ${x.oleh}` : ""), tanggalPendek(x.waktu), x.keterangan].filter(Boolean).join(" · ")}</span>
                  {x.bisaHapus && (
                    <button type="button" className="fk-tabnop-hapus" onClick={() => hapus(x, g.nop)} aria-label={`Hapus NOP ${formatNop(g.nop)} dari bidang ini`}>
                      Hapus
                    </button>
                  )}
                </div>
              ))}
              {g.bidangLain > 0 && <span className="fk-balon-sub">Juga ada di {g.bidangLain} bidang lain</span>}
            </li>
          ))}
        </ul>
      )}

      {!formulir && isi.tanpaNop.length > 0 && (
        <div className="fk-tabnop-tanpa">
          <span className="fk-balon-sub">Formulir tanpa NOP:</span>
          {isi.tanpaNop.map((d) => (
            <div className="fk-tabnop-sumber" key={`t${d.entriId}`}>
              <span>
                KK {d.nomor}
                {d.judul ? ` · ${d.judul}` : ""}
              </span>
              <button type="button" className="fk-balon-buka" onClick={() => bukaData(d)}>
                Buka
              </button>
            </div>
          ))}
        </div>
      )}

      {bolehTambah &&
        petugas &&
        (tambahBuka ? (
          <div className="fk-tabnop-tambah">
            <NopInput value={nop} onChange={setNop} invalid={Boolean(galat)} ringkas />
            {sudahAda && <span className="fk-hint-kecil">NOP ini sudah ada di bidang ini.</span>}
            {galat && <span className="fk-err">{galat}</span>}
            <div className="fk-tabnop-aksi">
              <button type="button" className="fk-btn" onClick={tambah} disabled={!lengkap || sudahAda || menyimpan}>
                {menyimpan ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                type="button"
                className="fk-btn-ghost"
                onClick={() => {
                  setTambahBuka(false);
                  setNop("");
                  setGalat("");
                }}
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="fk-textbtn is-brand fk-tabnop-tambah-btn" onClick={() => setTambahBuka(true)}>
            {daftarNop.length ? "+ Tambah NOP lain" : "+ Tambah NOP"}
          </button>
        ))}
      {!formulir && !sesi && !hanyaLihat && <span className="fk-hint-kecil">Masuk sebagai petugas atau admin untuk menambah NOP.</span>}
      {bawah && bawah(lengkap ? digit : "")}

      {padanBuka && (
        <PadankanBidang
          buka={padanBuka}
          onTutup={() => setPadanBuka(false)}
          bidang={bidang}
          luasBpn={luasBpn}
          daftarNop={daftarNop}
          bidangLain={bidangLain}
          keputusan={isi.padan?.keputusan || null}
          kecuali={kecuali}
          onSelesai={setIsi}
        />
      )}
    </div>
  );
}
