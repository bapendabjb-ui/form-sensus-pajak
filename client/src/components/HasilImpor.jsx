const formatAngka = (n) => Number(n || 0).toLocaleString("id-ID");

/**
 * Ringkasan hasil impor. Item yang dilewati & ditolak ditampilkan lengkap
 * dengan posisinya di berkas supaya pengguna bisa langsung membuka berkasnya
 * dan memperbaiki yang perlu - laporan "12 gagal" tanpa penunjuk tidak menolong.
 *
 * `hasil` = { dibaca, ditambahkan, dilewati[], ditolak[] }, tiap masalah
 * berbentuk { baris, nama, alasan }.
 */
export default function HasilImpor({
  hasil,
  onTutup,
  satuan = "baris",
  labelLewati = "sudah terdaftar",
  penanda = (m) => `Baris ${m.baris}`,
}) {
  if (!hasil) return null;
  const { dibaca, ditambahkan, dilewati = [], ditolak = [] } = hasil;
  const masalah = [...ditolak, ...dilewati];

  return (
    <div className="fk-impor-hasil">
      <div className="fk-impor-ringkas">
        <span>
          <strong>{formatAngka(dibaca)}</strong> {satuan} dibaca
        </span>
        <span className="is-tambah">
          <strong>{formatAngka(ditambahkan)}</strong> ditambahkan
        </span>
        {dilewati.length > 0 && (
          <span>
            <strong>{formatAngka(dilewati.length)}</strong> {labelLewati}
          </span>
        )}
        {ditolak.length > 0 && (
          <span className="is-tolak">
            <strong>{formatAngka(ditolak.length)}</strong> tidak bisa dibaca
          </span>
        )}
        <button type="button" className="fk-mini" onClick={onTutup}>
          Tutup
        </button>
      </div>

      {masalah.length > 0 && (
        <ul className="fk-impor-daftar">
          {masalah.map((m, i) => (
            <li key={`${m.baris}-${i}`}>
              <span className="fk-impor-baris">{penanda(m)}</span>
              <span className="fk-impor-nama">{m.nama || "(tanpa nama)"}</span>
              <span className="fk-impor-alasan">{m.alasan}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
