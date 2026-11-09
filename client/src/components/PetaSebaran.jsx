import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  useMesinPeta,
  PilihJenis,
  PetaMemuat,
  CatatanCadangan,
  IkonTitik,
  PenahanPeta,
  WARNA_STATUS,
  ContohLapisan,
  ContohPersil,
  TombolLokasiSaya,
  CatatanGpsKasar,
} from "./peta/bersama.jsx";
import { useLokasiSaya } from "../lib/useLokasiSaya.js";
import PanelBidang from "./peta/PanelBidang.jsx";
import { IkonLayarPenuh, IkonTutupPenuh } from "./Icons.jsx";
import { PERSIL_ZOOM_MIN, warnaDi, daftarStatusMode, LABEL_BELUM, warnaStatusBidang } from "../lib/persilBpn.js";

const SebaranGoogle = lazy(() => import("./peta/SebaranGoogle.jsx"));
const SebaranLeaflet = lazy(() => import("./peta/SebaranLeaflet.jsx"));

/** Keterangan persil di atas peta, menurut status dari mesin peta. */
const PESAN_PERSIL = {
  perbesar: `Perbesar peta (zoom ${PERSIL_ZOOM_MIN}+) untuk melihat persil BPN`,
  memuat: "Memuat persil BPN…",
  galat: "Persil BPN gagal dimuat. Geser peta untuk mencoba lagi.",
};

/**
 * Peta sebaran hasil sensus: banyak titik sekaligus, hanya untuk dilihat.
 *
 * Dipisah dari PetaLokasi karena tugasnya berbeda - PetaLokasi memilih satu
 * titik dan bisa digeser, peta ini menggambar seluruh titik dan tidak mengubah
 * data apa pun. Memakai peta Google bila tersedia, peta cadangan bila tidak.
 *
 * titik  : [{ entriId, lat, lon, judul, formulir, nomor, status, petugas, dicek, ... }]
 * onBuka : (titik) => void  - dipanggil saat tautan di balon diklik
 * onCek  : (titik) => void | null  - admin: tandai / buka "sudah dicek" dari balon
 * kunciPandang : pandangan dirapatkan ulang hanya bila nilai ini berganti
 * alat   : saringan halaman, digambar di awal bilah alat - ikut terbawa ke layar penuh
 * keterangan : teks ringkas di samping legenda, mis. jumlah titik
 * kosong : pesan di atas peta bila tidak ada titik; petanya tetap tampil
 *          supaya tata letak tidak melompat saat saringan diganti
 * lapisan : lapisan GIS yang menyala dan sudah termuat (lib/lapisanPeta.js useLapisanPeta().aktif)
 * persil : persil BPN yang menyala (lib/persilBpn.js usePersilBpn().peta), atau null
 * sorot  : bidang hasil cari NIB yang disorot (lihat peta/SebaranGoogle.jsx), atau null
 *
 * Keterangan bidang persil yang diketuk / dicari tampil di panel tetap di kiri atas
 * peta (peta/PanelBidang.jsx: tab NIB dan NOP), bukan balon: tidak ikut bergeser.
 *
 * Tombol "Lokasi saya" di kanan bawah (lib/useLokasiSaya.js, sama dengan peta di
 * formulir): titik biru posisi perangkat, supaya petugas tahu bidang mana yang ada di
 * dekatnya. GPS baru dipantau setelah tombolnya ditekan.
 */
export default function PetaSebaran({
  titik = [],
  onBuka,
  onCek = null,
  kunciPandang,
  alat = null,
  keterangan = null,
  kosong = "",
  lapisan = [],
  persil = null,
  sorot = null,
}) {
  const [jenis, setJenis] = useState("peta");
  const [penuh, setPenuh] = useState(false);
  const [statusPersil, setStatusPersil] = useState("");
  // Bidang persil yang keterangannya tampil di panel kiri atas (dari mesin peta), atau null.
  const [bidang, setBidang] = useState(null);
  const panelRef = useRef(null);
  const mesin = useMesinPeta();
  const { saya, posisiPeta, terlaluKasar, pusatkan, keLokasiSaya, berhentiIkuti } = useLokasiSaya();
  const propsSaya = { posisiSaya: posisiPeta, pusatkan, onGeser: berhentiIkuti };

  // Layar penuh: Escape menutupnya, dan halaman di belakangnya tidak ikut bergulir.
  useEffect(() => {
    if (!penuh) return undefined;
    const saatTombol = (e) => e.key === "Escape" && setPenuh(false);
    document.addEventListener("keydown", saatTombol);
    const html = document.documentElement;
    const lama = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", saatTombol);
      html.style.overflow = lama;
    };
  }, [penuh]);

  let kanvas = (
    <div className="fk-peta is-sebaran">
      <PetaMemuat />
    </div>
  );
  if (mesin.jenis === "google") {
    kanvas = (
      <SebaranGoogle
        kunci={mesin.kunci}
        titik={titik}
        onBuka={onBuka}
        onCek={onCek}
        kunciPandang={kunciPandang}
        jenis={jenis}
        lapisan={lapisan}
        persil={persil}
        sorot={sorot}
        bidang={bidang}
        onBidang={setBidang}
        panelRef={panelRef}
        onStatusPersil={setStatusPersil}
        {...propsSaya}
      />
    );
  } else if (mesin.jenis === "leaflet") {
    kanvas = (
      <SebaranLeaflet
        titik={titik}
        onBuka={onBuka}
        onCek={onCek}
        kunciPandang={kunciPandang}
        jenis={jenis}
        lapisan={lapisan}
        persil={persil}
        sorot={sorot}
        bidang={bidang}
        onBidang={setBidang}
        panelRef={panelRef}
        onStatusPersil={setStatusPersil}
        {...propsSaya}
      />
    );
  }

  const labelPenuh = penuh ? "Tutup layar penuh" : "Layar penuh";

  // Legenda persil: kecamatan yang tampil, warnanya mengikuti jenis peta (jalan / satelit).
  const kecTampil = persil ? persil.kecamatan.filter((k) => !persil.tersembunyi.includes(k)) : [];
  const warnaKec = (k) => warnaDi(persil.warna, k, jenis);
  // Mode status sensus: jumlah bidang per status di legenda.
  const petaStatus = persil?.status || null;
  const jumlahStatus = useMemo(() => {
    const n = {};
    if (petaStatus) for (const s of petaStatus.values()) n[s] = (n[s] || 0) + 1;
    return n;
  }, [petaStatus]);

  return (
    <div className={"fk-peta-wadah is-sebaran" + (penuh ? " is-penuh" : "")}>
      <div className="fk-peta-alat">
        {alat}
        <div className="fk-peta-tombol">
          <PilihJenis jenis={jenis} onChange={setJenis} />
          <button
            type="button"
            className="fk-mini fk-peta-penuh"
            onClick={() => setPenuh((p) => !p)}
            aria-pressed={penuh}
            aria-label={labelPenuh}
            title={labelPenuh}
          >
            {penuh ? <IkonTutupPenuh /> : <IkonLayarPenuh />}
            <span className="fk-peta-penuh-teks">{labelPenuh}</span>
          </button>
        </div>
      </div>
      <div className="fk-peta-info">
        <div className="fk-peta-legenda">
          <span className="fk-legenda">
            <IkonTitik warna={WARNA_STATUS.selesai} /> Selesai
          </span>
          <span className="fk-legenda">
            <IkonTitik warna={WARNA_STATUS.draft} /> Draft
          </span>
          {titik.some((t) => t.dicek) && (
            <span className="fk-legenda">
              <IkonTitik warna={WARNA_STATUS.selesai} dicek /> Sudah dicek
            </span>
          )}
          {persil?.status && (
            <span className="fk-legenda-persil">
              <span className="fk-legenda">
                {persil.modeStatus === "terpadu" ? "Terintegrasi" : "NOP PBB"}
                <span className="fk-legenda-persil-titik">:</span>
              </span>
              {[...daftarStatusMode(persil.modeStatus), { kunci: "belum", label: LABEL_BELUM }].map((s) => (
                <span className="fk-legenda fk-legenda-status" key={s.kunci}>
                  <ContohLapisan warna={warnaStatusBidang(s.kunci, jenis)} /> {s.label}
                  {s.kunci !== "belum" && (
                    <span className="fk-legenda-jumlah">{(jumlahStatus[s.kunci] || 0).toLocaleString("id-ID")}</span>
                  )}
                </span>
              ))}
            </span>
          )}
          {!persil?.status && kecTampil.length > 0 && (
            <span className="fk-legenda-persil">
              <span className="fk-legenda">
                <ContohPersil warna={kecTampil.map(warnaKec)} /> Persil BPN
                <span className="fk-legenda-persil-titik">:</span>
              </span>
              {kecTampil.map((k) => (
                <span className="fk-legenda fk-legenda-kec" key={k}>
                  <ContohLapisan warna={warnaKec(k)} /> {k || "(tanpa kecamatan)"}
                </span>
              ))}
            </span>
          )}
          {lapisan.map((l) => (
            <span className="fk-legenda" key={l.id}>
              <ContohLapisan warna={l.warna} /> {l.nama}
            </span>
          ))}
        </div>
        {keterangan && <span className="fk-peta-keterangan">{keterangan}</span>}
      </div>
      <div className="fk-peta-bingkai">
        <PenahanPeta kelas="is-sebaran">
          <Suspense
            fallback={
              <div className="fk-peta is-sebaran">
                <PetaMemuat />
              </div>
            }
          >
            {kanvas}
          </Suspense>
        </PenahanPeta>
        {bidang && (
          <PanelBidang bidang={bidang} onTutup={() => setBidang(null)} panelRef={panelRef} />
        )}
        {kosong && !bidang && (
          <div className="fk-peta-kosong" role="status">
            {kosong}
          </div>
        )}
        {persil && PESAN_PERSIL[statusPersil] && (
          <div className={"fk-peta-persil" + (statusPersil === "galat" ? " is-galat" : "")} role="status">
            {PESAN_PERSIL[statusPersil]}
          </div>
        )}
        <TombolLokasiSaya saya={saya} onClick={keLokasiSaya} />
      </div>
      {terlaluKasar && <CatatanGpsKasar akurasi={saya.posisi.akurasi} />}
      {mesin.cadangan && <CatatanCadangan />}
    </div>
  );
}
