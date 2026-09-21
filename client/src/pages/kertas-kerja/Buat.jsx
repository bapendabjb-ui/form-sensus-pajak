/* Wizard membuat kertas kerja: nomor otomatis + pemilihan tim petugas. */

import { useEffect, useState } from "react";
import * as api from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { PageHead, Panel, Loading, ErrorBox } from "../../components/Ui.jsx";
import PetugasTim from "../../components/PetugasTim.jsx";
import { navigate, kembali } from "../../lib/router.js";
import { urlKk } from "./bersama.js";

export function BuatKertasKerja() {
  const toast = useToast();
  const [nomor, setNomor] = useState("—");
  const [petugas, setPetugas] = useState([]);
  const [tim, setTim] = useState([null]);
  const [galatTim, setGalatTim] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [membuat, setMembuat] = useState(false);

  useEffect(() => {
    let batal = false;
    Promise.all([api.nomorBerikutnya(), api.listPetugas()])
      .then(([n, p]) => {
        if (batal) return;
        setNomor(n.nomor);
        setPetugas(p);
      })
      .catch((e) => !batal && setError(e.message))
      .finally(() => !batal && setLoading(false));
    return () => {
      batal = true;
    };
  }, []);

  const buat = async () => {
    const ids = tim.filter(Boolean);
    if (!ids.length) {
      setGalatTim("Pilih minimal satu petugas.");
      return;
    }

    setMembuat(true);
    try {
      const kk = await api.createKertasKerja(ids);
      toast(`Kertas kerja ${kk.nomor} dibuat. Silakan isi data per formulir.`);
      // replace: tombol Kembali dari kertas kerja tidak kembali ke layar "buat".
      navigate(urlKk(kk.id), { replace: true });
    } catch (e) {
      toast(e.message, true);
      setMembuat(false);
    }
  };

  if (loading) return <Loading label="Menyiapkan kertas kerja..." />;
  if (error) return <ErrorBox>{error}</ErrorBox>;

  return (
    <>
      <PageHead
        title="Buat Kertas Kerja"
        sub="Tentukan tim petugas."
      />

      <Panel>
        <div className="fk-wiz-body">
          <div>
            <span className="fk-opts-cap"><strong>Nomor Kertas Kerja</strong></span>
            <div className="fk-nomor-big">{nomor}</div>
          </div>

          <div className="fk-divider" />

          <PetugasTim
            petugas={petugas}
            value={tim}
            onChange={(v) => {
              setTim(v);
              setGalatTim("");
            }}
            onPetugasBaru={(p) =>
              setPetugas((list) => [...list, p].sort((a, b) => a.nama.localeCompare(b.nama, "id")))
            }
            galat={galatTim}
          />
        </div>
      </Panel>

      <div className="fk-form-actions fk-sticky-actions">
        <button type="button" className="fk-btn-ghost" onClick={() => kembali("/kertas-kerja")}>
          Batal
        </button>
        <button type="button" className="fk-btn" onClick={buat} disabled={membuat}>
          {membuat ? "Membuat..." : "Buat kertas kerja"}
        </button>
      </div>
    </>
  );
}
