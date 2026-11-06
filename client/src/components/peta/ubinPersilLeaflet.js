import L from "leaflet";
import { gambarUbinPersil, siapkanUbin } from "../../lib/persilBpn.js";

/**
 * Persil BPN sebagai ubin kanvas Leaflet (lib/persilBpn.js gambarUbinPersil).
 * `cfg` dan `jenis` dibaca saat ubin dibuat; berganti -> redraw(). Dipakai
 * Peta Sensus (SebaranLeaflet) dan pemilih bidang (BidangLeaflet).
 */
export const LapisanUbinPersil = L.GridLayer.extend({
  createTile(koordinat, selesai) {
    const ubin = siapkanUbin(L.DomUtil.create("canvas", "fk-persil-ubin"));
    if (!this.cfg) {
      Promise.resolve().then(() => selesai(null, ubin));
      return ubin;
    }
    gambarUbinPersil(ubin, koordinat, this.cfg, this.jenis, () => !this._map).then(
      () => selesai(null, ubin),
      (e) => selesai(e, ubin)
    );
    return ubin;
  },
});

/** Pasang / gambar ulang / lepas lapisan ubin persil; `simpan` = { ubin, kunci } milik pemanggil. */
export function aturUbinPersil(m, simpan, cfg, jenis) {
  const kunciBaru = cfg ? `${cfg.kunci}|${jenis}` : "";
  if (kunciBaru === simpan.kunci) return;
  simpan.kunci = kunciBaru;
  simpan.ubin.cfg = cfg;
  simpan.ubin.jenis = jenis;
  if (!cfg) simpan.ubin.remove();
  else if (!m.hasLayer(simpan.ubin)) simpan.ubin.addTo(m);
  else simpan.ubin.redraw();
}
