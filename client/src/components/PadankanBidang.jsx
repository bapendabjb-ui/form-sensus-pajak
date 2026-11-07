import { useEffect, useState } from "react";
import * as api from "../api.js";
import Sheet from "./Sheet.jsx";
import { CheckIcon } from "./Icons.jsx";
import { useToast } from "./Toast.jsx";
import { useDialog } from "./Dialog.jsx";
import { formatNop } from "../lib/format.js";
import { nibLengkap } from "../lib/nib.js";
import { formatLuas, kabarkanStatusBerubah } from "../lib/persilBpn.js";
import { TINDAK_LAIN, luasBeda, petunjukLuas, pilihanDari, susunRincian } from "../lib/padanan.js";

/** Data EPBB yang sudah pernah diambil di halaman ini: nop -> { namaWp, letakOp, luasTanah } | null. */
const epbbTersimpan = new Map();

/**
 * Padankan satu bidang BPN dengan NOP-nya (lapisan Terintegrasi): pilih NOP yang
 * benar untuk bidang ini, lalu apa yang terjadi dengan NOP lainnya - terdaftar
 * dua kali, digabung, atau milik bidang lain. Bila semua NOP benar (tanah sudah
 * dibagi tetapi sertifikatnya belum), bidangnya ditandai perlu dipecah.
 * Tiap NOP tampil dengan nama wajib pajak dan luas tanahnya dari EPBB bila ada,
 * dibanding luas bidang BPN (lib/padanan.js petunjukLuas).
 *
 * bidang     : { kunci, kodeWilayah | kode, nib }
 * luasBpn    : luas peta bidang (m²) atau null
 * daftarNop  : NOP di bidang ini, termasuk NOP formulir yang sedang diisi
 * bidangLain : Set NOP yang juga tercatat di bidang lain
 * keputusan  : keputusan tersimpan (diubah), atau null
 * kecuali    : id data yang sedang dibuka di formulir
 * onSelesai  : (isi tab NOP terbaru) => void
 */
export default function PadankanBidang({ buka, onTutup, bidang, luasBpn = null, daftarNop, bidangLain = new Set(), keputusan = null, kecuali = null, onSelesai }) {
  const toast = useToast();
  const { konfirmasi } = useDialog();
  const awal = pilihanDari(keputusan);
  const [pilihan, setPilihan] = useState(awal.pilihan);
  const [lain, setLain] = useState(awal.lain);
  const [sesuaikan, setSesuaikan] = useState(awal.sesuaikan);
  const [catatan, setCatatan] = useState(awal.catatan);
  const [epbb, setEpbb] = useState(() => Object.fromEntries(daftarNop.map((n) => [n, epbbTersimpan.get(n)])));
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const nibTeks = nibLengkap(bidang.kodeWilayah ?? bidang.kode ?? "", bidang.nib);

  // Nama wajib pajak dan luas tanah tiap NOP dari EPBB, bila cek NOP aktif.
  const kunciNop = daftarNop.join(",");
  useEffect(() => {
    if (!buka) return undefined;
    let batal = false;
    api
      .getKonfigurasi()
      .then((k) => {
        if (batal || !k.cekNop) return;
        for (const n of kunciNop.split(",")) {
          if (epbbTersimpan.has(n)) continue;
          api
            .cekNop(n)
            .then((d) => ({ namaWp: d.namaWp || "", letakOp: d.letakOp || "", luasTanah: Number.isFinite(d.luasTanah) && d.luasTanah > 0 ? d.luasTanah : null }))
            .catch(() => null)
            .then((d) => {
              epbbTersimpan.set(n, d);
              if (!batal) setEpbb((e) => ({ ...e, [n]: d }));
            });
        }
      })
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, [buka, kunciNop]);

  const luas = Object.fromEntries(daftarNop.map((n) => [n, epbb[n]?.luasTanah ?? null]));
  const petunjuk = petunjukLuas(luasBpn, daftarNop.map((n) => luas[n]));
  // Luas yang perlu disesuaikan: bawaannya dicentang bila luas PBB jauh dari BPN.
  const beda = (n) => luasBeda(luas[n], luasBpn);
  const centang = (n) => sesuaikan[n] ?? beda(n);
  const nopDipakai = daftarNop.includes(pilihan) ? [pilihan] : [];
  const sesuaikanLengkap = Object.fromEntries(daftarNop.map((n) => [n, centang(n)]));
  const rincian = susunRincian(daftarNop, { pilihan, lain, luas, sesuaikan: sesuaikanLengkap });
  const lainnya = daftarNop.filter((n) => n !== pilihan);

  const simpan = async () => {
    if (!rincian) return;
    setSibuk(true);
    setGalat("");
    try {
      const isi = await api.simpanPadanan({ kunci: bidang.kunci, rincian, catatan, kecuali });
      kabarkanStatusBerubah();
      toast(`Bidang NIB ${nibTeks} sudah dipadankan.`);
      onSelesai(isi);
      onTutup();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const batalkan = async () => {
    const ya = await konfirmasi({
      judul: "Batalkan padanan?",
      pesan: `Bidang NIB ${nibTeks} kembali perlu dipadankan. NOP-nya tidak terhapus.`,
      ya: "Batalkan padanan",
      bahaya: true,
    });
    if (!ya) return;
    setSibuk(true);
    try {
      const isi = await api.hapusPadanan(bidang.kunci, kecuali);
      kabarkanStatusBerubah();
      onSelesai(isi);
      onTutup();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  const opsi = (nilai, isi) => (
    <button
      type="button"
      key={nilai}
      role="radio"
      aria-checked={pilihan === nilai}
      className={"fk-choice fk-padan-opsi" + (pilihan === nilai ? " is-on" : "")}
      onClick={() => setPilihan(nilai)}
    >
      <span className="fk-ind fk-ind-radio">{pilihan === nilai && <span className="fk-dot" />}</span>
      <span className="fk-padan-opsi-isi">{isi}</span>
    </button>
  );

  return (
    <Sheet open={buka} onClose={onTutup} title="Padankan bidang" tengah>
      <div className="fk-padan">
        <p className="fk-padan-bidang">
          NIB {nibTeks}
          {Number.isFinite(luasBpn) && <span> · luas BPN {formatLuas(luasBpn)}</span>}
        </p>
        {petunjuk && <p className="fk-padan-petunjuk">{petunjuk}</p>}

        <span className="fk-padan-tanya">{daftarNop.length > 1 ? "NOP mana yang benar untuk bidang ini?" : "NOP ini benar untuk bidang ini?"}</span>
        <div className="fk-choices" role="radiogroup" aria-label="NOP untuk bidang ini">
          {daftarNop.map((n) => {
            const e = epbb[n];
            const rinci = [e?.namaWp, Number.isFinite(luas[n]) && `tanah ${formatLuas(luas[n])}`].filter(Boolean).join(" · ");
            return opsi(
              n,
              <>
                <b className="fk-padan-nop">{formatNop(n)}</b>
                {(rinci || beda(n)) && (
                  <span className="fk-padan-sub">
                    {rinci}
                    {beda(n) && <span className="fk-padan-beda">beda dengan BPN</span>}
                  </span>
                )}
                {e?.letakOp && <span className="fk-padan-sub">{e.letakOp}</span>}
                {bidangLain.has(n) && <span className="fk-padan-sub">Juga ada di bidang lain</span>}
              </>
            );
          })}
          {daftarNop.length > 1 && opsi("pecah", "Semua benar, sertifikatnya perlu dipecah")}
          {daftarNop.length === 1 && bidangLain.size > 0 && opsi("pecah", "Benar, tapi NOP ini juga mencakup bidang lain")}
          {daftarNop.length === 1 && opsi("tanpa", "Bukan, NOP ini milik bidang lain")}
        </div>

        {nopDipakai.length > 0 &&
          lainnya.map((n) => (
            <div className="fk-padan-lain" key={n}>
              <span className="fk-padan-tanya">NOP {formatNop(n)} kenapa?</span>
              <div className="fk-peta-jenis fk-padan-tindak" role="radiogroup" aria-label={`NOP ${formatNop(n)}`}>
                {TINDAK_LAIN.map((t) => (
                  <button
                    type="button"
                    key={t.kunci}
                    role="radio"
                    aria-checked={lain[n] === t.kunci}
                    className={lain[n] === t.kunci ? "is-on" : ""}
                    onClick={() => setLain((x) => ({ ...x, [n]: t.kunci }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

        {nopDipakai
          .filter((n) => beda(n))
          .map((n) => (
            <button
              type="button"
              key={n}
              role="checkbox"
              aria-checked={centang(n)}
              className={"fk-choice" + (centang(n) ? " is-on" : "")}
              onClick={() => setSesuaikan((x) => ({ ...x, [n]: !centang(n) }))}
            >
              <span className="fk-ind fk-ind-check">{centang(n) && <CheckIcon />}</span>
              <span>
                Luas PBB perlu disesuaikan: {formatLuas(luas[n])} → {formatLuas(luasBpn)}
              </span>
            </button>
          ))}

        <input
          className="fk-input"
          value={catatan}
          maxLength={200}
          placeholder="Catatan (boleh kosong)"
          aria-label="Catatan padanan"
          onChange={(e) => setCatatan(e.target.value)}
        />
        {galat && <span className="fk-err">{galat}</span>}

        <div className="fk-padan-aksi">
          <button type="button" className="fk-btn" onClick={simpan} disabled={!rincian || sibuk}>
            {sibuk ? "Menyimpan..." : "Simpan"}
          </button>
          <button type="button" className="fk-btn-ghost" onClick={onTutup} disabled={sibuk}>
            Batal
          </button>
          {keputusan && (
            <button type="button" className="fk-textbtn fk-padan-hapus" onClick={batalkan} disabled={sibuk}>
              Batalkan padanan
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
