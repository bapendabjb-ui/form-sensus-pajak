import { PERSIL_ZOOM_MIN, gambarUbinPersil, siapkanUbin } from "../../lib/persilBpn.js";

/**
 * Persil BPN sebagai lapisan ubin di atas peta dasar Google
 * (google.maps.OverlayMapType): Google meminta ubin yang terlihat, tiap ubin
 * digambar ke kanvas (lib/persilBpn.js). Berganti pilihan / jenis peta =
 * lapisan baru. Dipakai Peta Sensus (SebaranGoogle) dan pemilih bidang (BidangGoogle).
 *
 * @param {object} lib    google.maps
 * @param {object} cfg    usePersilBpn().peta
 * @param {string} jenis  "peta" | "satelit"
 */
export function lapisanUbinPersil(lib, cfg, jenis) {
  return {
    tileSize: new lib.Size(256, 256),
    minZoom: PERSIL_ZOOM_MIN,
    maxZoom: 22,
    name: "Persil BPN",
    getTile(koordinat, zoom, dokumen) {
      const ubin = siapkanUbin(dokumen.createElement("canvas"));
      if (zoom >= PERSIL_ZOOM_MIN) {
        gambarUbinPersil(ubin, { x: koordinat.x, y: koordinat.y, z: zoom }, cfg, jenis, () => ubin.dilepas).catch(() => {
          // Petak gagal dimuat: ubinnya kosong, keterangan galat tampil di atas peta.
        });
      }
      return ubin;
    },
    releaseTile(ubin) {
      ubin.dilepas = true;
    },
  };
}

/** Pasang / ganti lapisan ubin persil di peta `m`; `simpan` = { ubin, kunci } milik pemanggil. */
export function pasangUbinPersil(lib, m, simpan, cfg, jenis) {
  const kunciBaru = cfg ? `${cfg.kunci}|${jenis}` : "";
  if (kunciBaru === simpan.kunci) return;
  const daftar = m.overlayMapTypes;
  const i = simpan.ubin ? daftar.getArray().indexOf(simpan.ubin) : -1;
  if (i >= 0) daftar.removeAt(i);
  simpan.ubin = cfg ? lapisanUbinPersil(lib, cfg, jenis) : null;
  if (simpan.ubin) daftar.push(simpan.ubin);
  simpan.kunci = kunciBaru;
}
