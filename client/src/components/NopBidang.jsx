import { useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { useDialog } from "./Dialog.jsx";
import { NopInput } from "./Fields.jsx";
import { useSesi, useHanyaLihat } from "../lib/admin.js";
import { navigate } from "../lib/router.js";
import { formatNop, formatWaktu, hanyaDigit, PANJANG_NOP } from "../lib/format.js";
import { nibLengkap } from "../lib/nib.js";
import { kabarkanStatusBerubah } from "../lib/persilBpn.js";

/**
 * NOP PBB di satu bidang BPN (lapisan NOP PBB, server/src/integrasi.js
 * nopBidang): setiap NOP beserta asalnya - data sensus (formulir) dan/atau
 * peta - lalu tambah NOP langsung ke lapisan itu. Dipakai tab NOP di panel
 * bidang Peta Sensus (peta/PanelBidang.jsx) dan kotak bidang di pertanyaan
 * Bidang Tanah BPN formulir PBB (NibInput.jsx).
 *
 * NOP yang ditambah di sini langsung tersimpan saat "Simpan NOP" ditekan, tidak
 * menunggu tombol Simpan formulir. NOP formulir itu sendiri (pertanyaan NOP PBB)
 * tersimpan bersama formulirnya.
 *
 * bidang   : { kunci, kodeWilayah | kode, nib }
 * isi      : { nop: [...], tanpaNop: [...] } dari server; setIsi menggantinya
 * nopIni   : NOP formulir yang sedang diisi (18 digit) - ditandai "NOP formulir ini"
 * kecuali  : id data yang sedang dibuka di formulir (tidak disebut sebagai data sensus)
 * diPeta   : false = NIB dari sertifikat yang tidak ada di peta BPN: tidak bisa ditambah NOP
 * terlipat : isian tambah tersembunyi di balik tombol "+ Tambah NOP"
 * bawah    : (nopDiketik) => node - aksi tambahan di bawah isian (mis. Isi formulir PBB)
 * judul    : judul kecil di atas daftar (formulir), atau kosong (tab NOP sudah berjudul)
 */
export default function NopBidang({ bidang, isi, setIsi, nopIni = "", kecuali = null, diPeta = true, terlipat = false, bawah = null, judul = "" }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const sesi = useSesi();
  const hanyaLihat = useHanyaLihat();
  const bisaTambah = sesi?.role === "admin" || sesi?.role === "petugas";
  const [buka, setBuka] = useState(!terlipat);
  const [nop, setNop] = useState("");
  const [ket, setKet] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const digit = hanyaDigit(nop, PANJANG_NOP);
  const lengkap = digit.length === PANJANG_NOP;
  const kode = bidang.kodeWilayah ?? bidang.kode ?? "";
  const nibTeks = nibLengkap(kode, bidang.nib);

  // NOP formulir ini ikut tampil di daftarnya, walau belum tersimpan.
  const grup = isi.nop.map((g) => ({ ...g, ini: Boolean(nopIni) && g.nop === nopIni }));
  if (nopIni && !grup.some((g) => g.ini)) grup.unshift({ nop: nopIni, sensus: [], peta: [], bidangLain: 0, ini: true });
  const sudahAda = lengkap && grup.some((g) => g.nop === digit);

  const tambah = async () => {
    setMenyimpan(true);
    setGalat("");
    try {
      setIsi(await api.tambahNopBidang({ kunci: bidang.kunci, nop: digit, keterangan: ket, kecuali }));
      setNop("");
      setKet("");
      if (terlipat) setBuka(false);
      kabarkanStatusBerubah();
      toast(`NOP ${formatNop(digit)} ditambahkan ke bidang NIB ${nibTeks}.`);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (item, n) => {
    const ya = await konfirmasi({
      judul: "Hapus NOP dari bidang ini?",
      pesan: `NOP ${formatNop(n)} tidak lagi tercatat di bidang NIB ${nibTeks}. Data sensus tidak berubah.`,
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
      {judul && <span className="fk-tabnop-judul">{judul}</span>}
      {grup.length > 1 && <span className="fk-balon-kurang">{grup.length} NOP berbeda di bidang ini: perlu ditinjau.</span>}
      {grup.length === 0 && isi.tanpaNop.length === 0 && <span className="fk-balon-sub">Belum ada NOP di bidang ini.</span>}

      {grup.length > 0 && (
        <ul className="fk-tabnop-daftar">
          {grup.map((g) => (
            <li key={g.nop}>
              <b className="fk-tabnop-nop">{formatNop(g.nop)}</b>
              {g.ini && (
                <div className="fk-tabnop-sumber">
                  <span>
                    <span className="fk-tabnop-label is-ini">NOP formulir ini</span>
                    tersimpan bersama formulir
                  </span>
                </div>
              )}
              {g.sensus.map((d) => (
                <div className="fk-tabnop-sumber" key={`s${d.entriId}`}>
                  <span>
                    <span className="fk-tabnop-label">Data sensus</span> KK {d.nomor}
                    {d.judul ? ` · ${d.judul}` : ""}
                  </span>
                  <button type="button" className="fk-balon-buka" onClick={() => bukaData(d)}>
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
              <button type="button" className="fk-balon-buka" onClick={() => bukaData(d)}>
                Buka
              </button>
            </div>
          ))}
        </div>
      )}

      {!diPeta ? (
        <span className="fk-hint-kecil">NIB ini tidak ada di peta BPN: NOP-nya cukup diisi di pertanyaan NOP PBB.</span>
      ) : bisaTambah ? (
        buka ? (
          <div className="fk-tabnop-tambah">
            <span className="fk-tabnop-judul">Tambah NOP ke bidang ini</span>
            <NopInput value={nop} onChange={setNop} invalid={Boolean(galat)} />
            <input
              className="fk-input"
              value={ket}
              maxLength={200}
              placeholder="Keterangan (opsional), mis. sebagian bidang"
              aria-label="Keterangan NOP (opsional)"
              onChange={(e) => setKet(e.target.value)}
            />
            {sudahAda && (
              <span className="fk-hint-kecil">
                {digit === nopIni ? "Ini NOP formulir ini: tersimpan bersama formulirnya." : "NOP ini sudah tercatat di bidang ini."}
              </span>
            )}
            {galat && <span className="fk-err">{galat}</span>}
            <span className="fk-hint-kecil">Tersimpan langsung ke lapisan NOP PBB saat Simpan NOP ditekan.</span>
            <div className="fk-tabnop-aksi">
              <button type="button" className="fk-btn" onClick={tambah} disabled={!lengkap || sudahAda || menyimpan}>
                {menyimpan ? "Menyimpan..." : "Simpan NOP"}
              </button>
              {terlipat && (
                <button type="button" className="fk-btn-ghost" onClick={() => setBuka(false)}>
                  Batal
                </button>
              )}
            </div>
          </div>
        ) : (
          <button type="button" className="fk-textbtn is-brand" onClick={() => setBuka(true)}>
            + Tambah NOP ke bidang ini
          </button>
        )
      ) : (
        !hanyaLihat && <span className="fk-hint-kecil">Masuk sebagai petugas atau admin untuk menambah NOP di bidang ini.</span>
      )}
      {bawah && bawah(lengkap ? digit : "")}
    </div>
  );
}
