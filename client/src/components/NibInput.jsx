import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api.js";
import { useToast } from "./Toast.jsx";
import { ChoiceGroup, NopInput } from "./Fields.jsx";
import NopBidang from "./NopBidang.jsx";
import { usePersilBpn, formatLuas } from "../lib/persilBpn.js";
import {
  NIB_MAKS_BIDANG,
  STATUS_TANAH,
  kunciBidang,
  nibLengkap,
  nibDari,
  bidangDariPersil,
  totalLuas,
  bacaNibLengkap,
  formatKetikanNib,
  titikDalamBidang,
} from "../lib/nib.js";

// Peta cukup besar: unduh hanya saat petugas membukanya.
const PetaBidang = lazy(() => import("./PetaBidang.jsx"));

/** Bentuk bidang yang sudah pernah diambil dari server, untuk disorot di peta: kunci -> Feature. */
const bentukTersimpan = new Map();

/**
 * Pertanyaan Bidang Tanah BPN (NIB) pada formulir PBB: bidang BPN yang
 * ditempati objek pajak ini. Satu objek boleh menempati beberapa bidang, dan
 * satu bidang boleh dicatat di beberapa data - pencocokannya menjadi
 * 1 NIB = 1 NOP dikerjakan belakangan (halaman Integrasi NIB-NOP).
 *
 * Tiga cara mengisi:
 *   1. Usulan dari titik Lokasi: bidang tempat titik koordinat objek berada.
 *   2. Pilih di peta: ketuk bidang di peta persil BPN (boleh beberapa).
 *   3. Ketik NIB dari sertifikat: dicari di data BPN; yang tidak ada di peta
 *      tetap bisa dicatat.
 * Tanpa NIB, petugas memilih alasannya (tanah belum bersertifikat, dsb.).
 *
 * Di setiap bidang terpilih tampil NOP lain yang sudah tercatat di bidang itu
 * (components/NopBidang.jsx) - dari data lain dan dari peta - dan bila ada lebih
 * dari satu NOP, tombol Padankan (lapisan Terintegrasi). Petugas bisa langsung
 * menambah NOP lain ke bidang itu - tersimpan saat itu juga, sama dengan tab NOP
 * di Peta Sensus.
 *
 * Bila formulirnya punya pertanyaan NOP PBB, begitu ada bidang terpilih pertanyaan
 * itu pindah ke sini sebagai isian "NOP objek" (IsiData.jsx tidak menampilkannya
 * di tempat asalnya) - dengan Lihat / Cari NOP EPBB dan "Isi ke Formulir" - supaya
 * petugas cukup memilih bidang lalu mengetik NOP-nya, dan data wajib pajak terisi
 * dari EPBB. Satu bidang: isiannya di dalam kartu bidang; beberapa bidang: di bawahnya.
 * NOP lain ke bidang yang sama baru bisa ditambah sesudah NOP objek terisi.
 *
 * Koordinat objek (pertanyaan Lokasi) yang masih kosong diisi otomatis dengan titik di
 * dalam bidang pertama yang ada di peta BPN (konteks.titikOtomatis). Titik itu ikut pindah
 * bila bidangnya diganti, dan dihapus bila bidangnya dilepas - selama petugas belum
 * mengambil GPS atau menggeser titiknya sendiri.
 *
 * value   : { bidang: [...], status } - lib/nib.js
 * konteks : { entriId, titik: { lat, lon } | null, nop, nopObjek } - data yang sedang dibuka,
 *           titik pertanyaan Lokasi pertamanya, NOP-nya (18 digit, atau ""), dan isian
 *           pertanyaan NOP PBB { qid, value, onChange, isiEpbb, wajib, invalid, galat } | null
 */
export default function NibInput({ value, onChange, invalid, konteks = {} }) {
  const toast = useToast();
  const v = useMemo(() => nibDari(value), [value]);
  const { entriId = null, titik = null, nop: nopIni = "", nopObjek = null, titikOtomatis = null } = konteks;
  const persil = usePersilBpn({ paksa: true });
  const [petaBuka, setPetaBuka] = useState(false);
  const [ketikBuka, setKetikBuka] = useState(false);
  const [mencari, setMencari] = useState(false);
  const [fokus, setFokus] = useState(null);
  // Bentuk bidang terpilih yang sudah diketahui (kunci -> Feature), untuk sorotan peta.
  const [bentuk, setBentuk] = useState(() => new Map());
  // NOP yang sudah tercatat di tiap bidang terpilih, kecuali data ini: { [kunci]: isi } (api.nopBidang).
  const [isiNop, setIsiNop] = useState({});
  const [usulan, setUsulan] = useState(null);

  const vRef = useRef(v);
  vRef.current = v;
  const kunciTerpilih = v.bidang.map((b) => kunciBidang(b.kode, b.nib));
  const kunciGabung = kunciTerpilih.join(",");

  const simpanBentuk = (kunci, fitur) => {
    if (!fitur) return;
    bentukTersimpan.set(kunci, fitur);
    setBentuk((m) => new Map(m).set(kunci, fitur));
  };

  const ubah = (bidang) => onChange({ bidang, status: bidang.length ? "" : vRef.current.status });

  const tambah = (b) => {
    const kini = vRef.current.bidang;
    const k = kunciBidang(b.kode, b.nib);
    if (kini.some((x) => kunciBidang(x.kode, x.nib) === k)) return false;
    if (kini.length >= NIB_MAKS_BIDANG) {
      toast(`Paling banyak ${NIB_MAKS_BIDANG} bidang per data.`, true);
      return false;
    }
    onChange({ bidang: [...kini, b], status: "" });
    return true;
  };

  const lepas = (kunci) => ubah(vRef.current.bidang.filter((b) => kunciBidang(b.kode, b.nib) !== kunci));

  // NOP di bidang-bidang terpilih: data sensus lain dan NOP dari peta.
  useEffect(() => {
    if (!kunciGabung) {
      setIsiNop({});
      return undefined;
    }
    let batal = false;
    const t = setTimeout(() => {
      for (const k of kunciGabung.split(",")) {
        api
          .nopBidang(k, entriId)
          .then((isi) => !batal && setIsiNop((m) => ({ ...m, [k]: isi })))
          .catch(() => {});
      }
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [kunciGabung, entriId]);

  // Koordinat objek otomatis dari bidang pertama yang ada di peta BPN. Membuka data lama tidak
  // mengubah apa pun: hanya memilih / mengganti / melepas bidang yang memicunya.
  const otomatisRef = useRef(titikOtomatis);
  otomatisRef.current = titikOtomatis;
  const bidangTitik = v.bidang.find((b) => b.diPeta !== false) || null;
  const kunciTitik = bidangTitik ? kunciBidang(bidangTitik.kode, bidangTitik.nib) : "";
  const awalTitik = useRef(true);
  useEffect(() => {
    const lewati = awalTitik.current && Boolean(entriId);
    awalTitik.current = false;
    const o = otomatisRef.current;
    if (!o || lewati) return undefined;
    if (!kunciTitik) {
      if (o.dariBidang) o.hapus();
      return undefined;
    }
    if (!o.boleh) return undefined;
    let batal = false;
    const pakai = (fitur) => {
      const t = titikDalamBidang(fitur?.geometry);
      if (!batal && t && otomatisRef.current?.boleh) otomatisRef.current.atur(t);
    };
    const ada = bentukTersimpan.get(kunciTitik);
    if (ada) pakai(ada);
    else {
      const [kode, nib] = kunciTitik.split("|");
      api
        .cariPersil(nibLengkap(kode, nib))
        .then((daftar) => {
          const p = (daftar || []).find((x) => kunciBidang(x.kodeWilayah, x.nib) === kunciTitik);
          if (!p) return;
          bentukTersimpan.set(kunciTitik, p.fitur);
          pakai(p.fitur);
        })
        .catch(() => {});
    }
    return () => {
      batal = true;
    };
  }, [kunciTitik]); // eslint-disable-line react-hooks/exhaustive-deps

  // Usulan dari titik Lokasi, selama belum ada bidang yang dipilih.
  useEffect(() => {
    setUsulan(null);
    if (!titik || !Number.isFinite(titik.lat) || !Number.isFinite(titik.lon)) return undefined;
    let batal = false;
    const t = setTimeout(() => {
      api
        .persilDiTitik(titik.lat, titik.lon)
        .then((h) => !batal && setUsulan(h?.persil || null))
        .catch(() => {});
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [titik?.lat, titik?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Peta dibuka: cari bentuk bidang terpilih yang belum diketahui, supaya ikut tersorot.
  useEffect(() => {
    if (!petaBuka) return undefined;
    let batal = false;
    for (const b of vRef.current.bidang) {
      const k = kunciBidang(b.kode, b.nib);
      if (bentuk.has(k)) continue;
      if (bentukTersimpan.has(k)) {
        simpanBentuk(k, bentukTersimpan.get(k));
        continue;
      }
      if (b.diPeta === false) continue;
      api
        .cariPersil(nibLengkap(b.kode, b.nib))
        .then((daftar) => {
          const p = (daftar || []).find((x) => kunciBidang(x.kodeWilayah, x.nib) === k);
          if (!batal && p) simpanBentuk(k, p.fitur);
        })
        .catch(() => {});
    }
    return () => {
      batal = true;
    };
  }, [petaBuka, kunciGabung]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ketukan di peta: pilih bidang di titik itu, atau batalkan bila sudah terpilih. */
  const ketuk = async (lat, lon) => {
    setMencari(true);
    try {
      const { persil: b } = await api.bidangDiTitik(lat, lon);
      if (!b) {
        toast("Tidak ada bidang BPN di titik itu.", true);
        return;
      }
      const k = kunciBidang(b.kodeWilayah, b.nib);
      if (vRef.current.bidang.some((x) => kunciBidang(x.kode, x.nib) === k)) {
        lepas(k);
        return;
      }
      if (tambah(bidangDariPersil(b, "peta"))) simpanBentuk(k, b.fitur);
    } catch (e) {
      toast(e.status === 0 ? "Tidak ada koneksi. Bidang belum bisa dipilih." : e.message, true);
    } finally {
      setMencari(false);
    }
  };

  const pakaiUsulan = () => {
    if (!usulan) return;
    tambah(bidangDariPersil(usulan, "peta"));
  };

  const terpilihBerbentuk = useMemo(
    () => kunciTerpilih.filter((k) => bentuk.has(k)).map((k) => ({ kunci: k, fitur: bentuk.get(k) })),
    [kunciGabung, bentuk] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Pertanyaan NOP PBB di kotak bidang: di dalam kartu bila hanya satu bidang.
  const isianNopObjek = nopObjek && v.bidang.length > 0 && (
    <div className={"fk-nib-nopobjek" + (v.bidang.length === 1 ? " is-dalam" : "")} data-qid={nopObjek.qid}>
      <span className="fk-tabnop-judul">
        NOP objek{nopObjek.wajib && <span className="fk-star">*</span>}
      </span>
      <NopInput value={nopObjek.value} onChange={nopObjek.onChange} invalid={nopObjek.invalid} isiEpbb={nopObjek.isiEpbb} />
      {nopObjek.galat && <span className="fk-err">{nopObjek.galat}</span>}
    </div>
  );

  const usulanKunci = usulan ? kunciBidang(usulan.kodeWilayah, usulan.nib) : "";
  const tampilUsulan = usulan && !kunciTerpilih.includes(usulanKunci);
  const luas = totalLuas(v.bidang);

  return (
    <div className={"fk-nib" + (invalid ? " is-invalid" : "")}>
      {/* Urutan: usulan, tombol, peta / ketik NIB, lalu kartu bidang. Bidang yang diketuk muncul
          di bawah peta, jadi peta tidak bergeser dan isian NOP objek langsung di bawahnya. */}
      {tampilUsulan && (
        <div className="fk-nib-usulan">
          <span>
            Titik Lokasi berada di bidang <b>NIB {nibLengkap(usulan.kodeWilayah, usulan.nib)}</b>
            {[usulan.tipeHak, Number.isFinite(usulan.luasPeta) && formatLuas(usulan.luasPeta)].filter(Boolean).length > 0 &&
              ` (${[usulan.tipeHak, Number.isFinite(usulan.luasPeta) && formatLuas(usulan.luasPeta)].filter(Boolean).join(", ")})`}
            .
          </span>
          <button type="button" className="fk-mini" onClick={pakaiUsulan}>
            {v.bidang.length ? "Tambahkan" : "Pakai bidang ini"}
          </button>
        </div>
      )}

      <div className="fk-lokasi-aksi">
        <button
          type="button"
          className={petaBuka ? "fk-btn-ghost is-on" : "fk-btn-ghost"}
          onClick={() => setPetaBuka((b) => !b)}
          aria-expanded={petaBuka}
        >
          {petaBuka ? "Tutup peta" : "Pilih di peta"}
        </button>
        <button
          type="button"
          className={ketikBuka ? "fk-btn-ghost is-on" : "fk-btn-ghost"}
          onClick={() => setKetikBuka((b) => !b)}
          aria-expanded={ketikBuka}
        >
          Ketik NIB dari sertifikat
        </button>
      </div>

      {petaBuka &&
        (persil.ringkasan && !persil.ada ? (
          <p className="fk-hint-kecil">Belum ada persil BPN di aplikasi. Admin bisa mengimpornya dari Peta Sensus → Lapisan.</p>
        ) : (
          <Suspense
            fallback={
              <div className="fk-lokasi-cari" role="status">
                <span className="fk-spinner" aria-hidden="true" />
                <span>Memuat peta…</span>
              </div>
            }
          >
            <PetaBidang
              persil={persil.peta}
              titik={titik}
              terpilih={terpilihBerbentuk}
              fokus={fokus}
              onKetuk={ketuk}
              mencari={mencari}
            />
          </Suspense>
        ))}

      {ketikBuka && (
        <KetikNib
          sudah={kunciTerpilih}
          onPilih={(b, p) => {
            // Bidang sudah dipilih: kotak ketik NIB ditutup supaya kotak bidang tidak ramai.
            setKetikBuka(false);
            if (tambah(b)) {
              if (p?.fitur) simpanBentuk(kunciBidang(b.kode, b.nib), p.fitur);
              if (p?.batas) setFokus((f) => ({ batas: p.batas, ke: (f?.ke || 0) + 1 }));
            }
          }}
        />
      )}

      {v.bidang.length > 0 && (
        <ul className="fk-nib-daftar">
          {v.bidang.map((b) => {
            const k = kunciBidang(b.kode, b.nib);
            const rinci = [b.tipeHak, Number.isFinite(b.luas) && `luas peta ${formatLuas(b.luas)}`, b.kelurahan && `Kel. ${b.kelurahan}`].filter(Boolean);
            return (
              <li className="fk-nib-item" key={k}>
                {/* Tombol lepas di baris judul, bukan kolom sendiri: isian NOP di bawahnya memakai seluruh lebar kartu. */}
                <div className="fk-nib-kepala">
                  <div className="fk-nib-utama">
                    <strong>NIB {nibLengkap(b.kode, b.nib)}</strong>
                    <span className="fk-nib-sumber">{b.sumber === "sertifikat" ? "Dari sertifikat" : "Dari peta"}</span>
                  </div>
                  <button type="button" className="fk-telepon-hapus fk-nib-lepas" onClick={() => lepas(k)} aria-label={`Lepas bidang NIB ${nibLengkap(b.kode, b.nib)}`}>
                    ✕
                  </button>
                </div>
                {rinci.length > 0 && <div className="fk-nib-rinci">{rinci.join(" · ")}</div>}
                {b.diPeta === false && (
                  <div className="fk-nib-peringatan">Tidak ada di peta BPN. NIB tetap dicatat dari sertifikat.</div>
                )}
                {v.bidang.length === 1 && isianNopObjek}
                {isiNop[k] && (
                  <NopBidang
                    bidang={{ kunci: k, kode: b.kode, nib: b.nib }}
                    isi={isiNop[k]}
                    setIsi={(isi) => setIsiNop((m) => ({ ...m, [k]: isi }))}
                    luasBpn={Number.isFinite(b.luas) ? b.luas : null}
                    formulir
                    nopIni={nopIni}
                    kecuali={entriId}
                    bolehTambah={b.diPeta !== false && (!nopObjek || Boolean(nopIni))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {v.bidang.length > 1 && (
        <span className="fk-hint-kecil">
          {v.bidang.length} bidang{luas !== null && ` · total luas peta ${formatLuas(luas)}`}
        </span>
      )}

      {v.bidang.length > 1 && isianNopObjek}

      {v.bidang.length === 0 && (
        <div className="fk-nib-status">
          <span className="fk-wilayah-cap">Bila tidak ada NIB</span>
          <ChoiceGroup
            tipe="radio"
            options={Object.values(STATUS_TANAH)}
            value={STATUS_TANAH[v.status] || ""}
            onChange={(label) =>
              onChange({ bidang: [], status: Object.keys(STATUS_TANAH).find((k) => STATUS_TANAH[k] === label) || "" })
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * Ketik NIB dari sertifikat, lalu cari di data BPN. NIB lengkap 13 digit yang
 * tidak ada di peta tetap bisa dicatat; NIB 5 digit dipilih dari kelurahan
 * yang punya nomor itu.
 *
 * sudah   : kunci bidang yang sudah terpilih
 * onPilih : (bidang, persil | null) => void
 */
function KetikNib({ sudah, onPilih }) {
  const [ketikan, setKetikan] = useState("");
  const [hasil, setHasil] = useState(null); // null | { daftar, lengkap: { kode, nib } | null }
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const digit = ketikan.replace(/\D/g, "");
  const cari = async () => {
    if (!digit) return;
    setSibuk(true);
    setGalat("");
    try {
      const daftar = await api.cariPersil(digit);
      setHasil({ daftar: daftar || [], lengkap: bacaNibLengkap(digit) });
    } catch (e) {
      setGalat(e.status === 0 ? "Tidak ada koneksi." : e.message);
      setHasil(null);
    } finally {
      setSibuk(false);
    }
  };

  const pilih = (b, p = null) => {
    onPilih(b, p);
    setKetikan("");
    setHasil(null);
  };

  return (
    <div className="fk-nib-ketik">
      <div className="fk-digit-baris">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="fk-input fk-digit-in"
          value={formatKetikanNib(ketikan)}
          placeholder="17.11.74.02.03612"
          aria-label="NIB dari sertifikat"
          onChange={(e) => {
            setKetikan(e.target.value.replace(/\D/g, "").slice(0, 13));
            setHasil(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              cari();
            }
          }}
        />
        <button type="button" className="fk-btn fk-digit-aksi" onClick={cari} disabled={!digit || sibuk}>
          {sibuk ? "Mencari…" : "Cari"}
        </button>
      </div>
      <span className="fk-hint-kecil">NIB lengkap 13 digit seperti di sertifikat, atau 5 digit nomor bidangnya saja.</span>
      {galat && <span className="fk-err">{galat}</span>}

      {hasil && hasil.daftar.length > 0 && (
        <ul className="fk-nib-hasil">
          {hasil.daftar.map((p) => {
            const k = kunciBidang(p.kodeWilayah, p.nib);
            const ada = sudah.includes(k);
            return (
              <li key={p.id}>
                <span>
                  <b>NIB {p.nibLengkap || p.nib}</b>
                  <span className="fk-nib-rinci">
                    {[p.tipeHak, Number.isFinite(p.luasPeta) && formatLuas(p.luasPeta), p.kelurahan && `Kel. ${p.kelurahan}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <button type="button" className="fk-mini" disabled={ada} onClick={() => pilih(bidangDariPersil(p, "sertifikat"), p)}>
                  {ada ? "Sudah dipilih" : "Pilih"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasil && hasil.daftar.length === 0 && (
        <div className="fk-nib-usulan">
          {hasil.lengkap ? (
            <>
              <span>
                NIB {formatKetikanNib(digit)} tidak ada di peta BPN yang tersimpan. Catat tetap, bila NIB ini benar sesuai
                sertifikat?
              </span>
              <button
                type="button"
                className="fk-mini"
                disabled={sudah.includes(kunciBidang(hasil.lengkap.kode, hasil.lengkap.nib))}
                onClick={() =>
                  pilih({
                    kode: hasil.lengkap.kode,
                    nib: hasil.lengkap.nib,
                    sumber: "sertifikat",
                    diPeta: false,
                    tipeHak: "",
                    luas: null,
                    kelurahan: "",
                    kecamatan: "",
                  })
                }
              >
                Catat NIB ini
              </button>
            </>
          ) : (
            <span>NIB tidak ditemukan. Ketik NIB lengkap 13 digit seperti di sertifikat.</span>
          )}
        </div>
      )}
    </div>
  );
}
