// Detay çekmecesinin "Teslimat adresi" bölümü: yalnızca adrese teslim siparişlerde çizilir (yurt siparişi
// bugünkü gibi görünür). Bölge, mahalle + sokak / bina, kat · daire, tarif; müşteri konumu varsa "Konum: haritada aç"
// (koordinatla), "Haritada aç" (konum varsa koordinat, yoksa "<mahalle> <sokak> <bina no>, <bölge>, Devrek" araması) ve
// "Adresi kopyala". Teslimat ücreti rozeti başlıkta; Devrek sınırı yüklenmeden alınan siparişte "Alan doğrulanmadı" rozeti.
import { useId } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Copy, Home, Map as MapIcon, MapPin, Navigation } from "lucide-react";
import { copyText, deliveryFeeLabel, orderAddressLines, orderDeliveryFee, orderMapsLink } from "../shared";
import { isAreaUnverified, orderLocation } from "../../../lib/orderTools";

const coordText = (value) => Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 5, maximumFractionDigits: 5 });

export default function DeliveryAddress({ order }) {
  const headId = useId();
  const address = orderAddressLines(order);
  if (!address) return null;
  const maps = orderMapsLink(order);
  const fee = orderDeliveryFee(order);
  const location = orderLocation(order);
  const unverified = isAreaUnverified(order);
  const locationLink = location ? `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}` : null;
  const copy = async () => {
    const text = [
      address.oneLine,
      address.directions ? `Tarif: ${address.directions}` : "",
      locationLink ? `Konum: ${locationLink}` : "",
    ].filter(Boolean).join("\n");
    if (await copyText(text)) toast.success("Adres kopyalandı");
    else toast.error("Adres kopyalanamadı");
  };

  return (
    <section className="so-d-section so-d-addr" aria-labelledby={headId}>
      <div className="so-d-section-head">
        <h3 id={headId} className="so-d-h">
          <Home aria-hidden="true" />
          Teslimat adresi
          {address.zone && <span className="so-d-h-meta">· {address.zone}</span>}
        </h3>
        <span className="so-d-addr-badges">
          {unverified && (
            <span className="ui-badge ui-badge--warn so-d-addr-unverified"
              title="Sipariş, Devrek teslimat sınırı yüklenmeden alındı; konumun sınır içinde olduğu denetlenmedi">
              <AlertTriangle aria-hidden="true" />Alan doğrulanmadı
            </span>
          )}
          <span className={`ui-badge ${fee > 0 ? "ui-badge--info" : "ui-badge--ok"} so-d-addr-fee`} title="Siparişe kilitli teslimat ücreti">
            {fee > 0 ? `Teslimat ${deliveryFeeLabel(order)}` : "Ücretsiz teslimat"}
          </span>
        </span>
      </div>
      <div className="so-d-addr-card">
        <div className="so-d-addr-lines">
          {address.street && <p className="so-d-addr-street">{address.street}</p>}
          {(address.building || address.unit) && (
            <p className="so-d-addr-sub">{[address.building, address.unit].filter(Boolean).join(" · ")}</p>
          )}
          {!address.street && !address.building && <p className="so-d-addr-street">{address.oneLine || "Adres bilgisi yok"}</p>}
          {address.directions && (
            <p className="so-d-addr-dir"><Navigation aria-hidden="true" /><span>{address.directions}</span></p>
          )}
          {locationLink && (
            <p className="so-d-addr-dir so-d-addr-loc">
              <MapPin aria-hidden="true" />
              <span>
                Konum:{" "}
                <a href={locationLink} target="_blank" rel="noopener noreferrer" title="Müşterinin haritada işaretlediği nokta">haritada aç</a>
                <span className="so-d-addr-coords ui-num"> ({coordText(location.lat)}, {coordText(location.lng)})</span>
              </span>
            </p>
          )}
        </div>
        <div className="so-d-addr-actions">
          {maps && (
            <a className="ui-btn ui-btn--sm so-d-addr-map" href={maps} target="_blank" rel="noopener noreferrer"
              title={location ? "Müşterinin seçtiği konumu Google Haritalar'da aç" : "Adresi Google Haritalar'da ara"}>
              <MapIcon aria-hidden="true" />Haritada aç
            </a>
          )}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={copy} title="Adresi, tarifi ve konumu kopyala">
            <Copy aria-hidden="true" />Kopyala
          </button>
        </div>
      </div>
    </section>
  );
}
