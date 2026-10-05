/**
 * Baca koordinat yang ditempel petugas dari Google Maps - salinan
 * server/src/tautanPeta.js (bacaKoordinatTeks). Teks koordinat dan tautan
 * lengkap dibaca langsung di sini; tautan pendek maps.app.goo.gl dibuka server
 * karena browser tidak boleh membaca pengalihan ke domain lain.
 */

function sah(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function dariDms(derajat, menit, detik, arah) {
  const nilai = Number(derajat) + Number(menit || 0) / 60 + Number(detik || 0) / 3600;
  return /[SW]/i.test(arah) ? -nilai : nilai;
}

/** @returns {{ lat: number, lon: number } | null} */
export function bacaKoordinatTeks(teks) {
  let s = String(teks || "").trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    /* bukan teks ter-encode - pakai apa adanya */
  }

  // Titik penanda tempat lebih tepat daripada "@", yang hanya pusat tampilan peta.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  if (pin) return sah(Number(pin[1]), Number(pin[2]));

  const dms =
    /(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NS])[\s,]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([EW])/i.exec(s);
  if (dms) return sah(dariDms(dms[1], dms[2], dms[3], dms[4]), dariDms(dms[5], dms[6], dms[7], dms[8]));

  const pasangan = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(s);
  if (pasangan) return sah(Number(pasangan[1]), Number(pasangan[2]));

  return null;
}

/** Tautan pendek Google Maps (tombol Bagikan) yang perlu dibuka server? */
export function tautanPendek(teks) {
  try {
    const u = new URL(String(teks || "").trim());
    return u.protocol === "https:" && (u.hostname === "maps.app.goo.gl" || u.hostname === "goo.gl");
  } catch {
    return false;
  }
}
