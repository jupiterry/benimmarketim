// Siparişler ekranı için kurye listesi (GET /delivery/admin/couriers). Ekran açılınca bir kez yüklenir;
// kurye ekleme / düzenleme Teslimat bölgeleri ekranındadır. Hata ekranı bozmaz: atama ve filtre gizlenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "../../lib/axios";
import { rememberCouriers } from "./shared";

const normalize = (list) => (Array.isArray(list) ? list : [])
  .filter((c) => c && c._id && c.name)
  .map((c) => ({ _id: String(c._id), name: String(c.name), phone: String(c.phone || ""), active: c.active !== false }));

export default function useCouriers() {
  const [couriers, setCouriers] = useState([]);
  const [status, setStatus] = useState("loading");
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const { data } = await axios.get("/delivery/admin/couriers");
      if (!aliveRef.current) return;
      const list = normalize(data?.couriers);
      rememberCouriers(list);
      setCouriers(list);
      setStatus("ready");
    } catch {
      if (aliveRef.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  const active = useMemo(() => couriers.filter((c) => c.active), [couriers]);
  return { couriers, active, status, reload: load };
}
