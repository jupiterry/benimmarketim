import { useEffect, useState } from "react";
import axios from "../../lib/axios";
import { DELIVERY_LABELS } from "./couponUtils";

// Kupon ekranları için teslimat bölgeleri (GET /delivery/admin/zones). Liste tüm kupon
// bileşenleri arasında paylaşılır; çekmece her açıldığında yeniden istenmez.
let cache = null;
let pending = null;

// Bölge listesi alınamazsa (ör. eski backend) yurtlar yine seçilebilir kalsın.
const FALLBACK_ZONES = Object.entries(DELIVERY_LABELS).map(([id, name], index) => ({
  _id: id, name, type: "yurt", enabled: true, sortOrder: index, legacyPoint: id,
}));

const loadZones = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = axios.get("/delivery/admin/zones")
      .then(({ data }) => {
        const zones = Array.isArray(data?.zones) ? data.zones : [];
        cache = { zones: zones.length ? zones : FALLBACK_ZONES, fallback: !zones.length };
        return cache;
      })
      .catch(() => ({ zones: FALLBACK_ZONES, fallback: true }))
      .finally(() => { pending = null; });
  }
  return pending;
};

export const useDeliveryZones = () => {
  const [state, setState] = useState(() => (cache ? { ...cache, loaded: true } : { zones: FALLBACK_ZONES, fallback: true, loaded: false }));
  useEffect(() => {
    let alive = true;
    loadZones().then((result) => { if (alive) setState({ ...result, loaded: true }); });
    return () => { alive = false; };
  }, []);
  return state;
};

// Kuponun bütün bölge hedefleri: eski deliveryPoints (yurt kodları = yurt bölgesi kimliği) + deliveryZones.
export const couponZoneIds = (coupon = {}) => [
  ...new Set([...(coupon.deliveryPoints || []), ...(coupon.deliveryZones || [])].map(String).filter(Boolean)),
];

export const LEGACY_POINT_IDS = Object.keys(DELIVERY_LABELS);

export const zoneNameMap = (zones = []) => {
  const map = { ...DELIVERY_LABELS };
  for (const zone of zones) map[String(zone._id ?? zone.id)] = zone.name;
  return map;
};
