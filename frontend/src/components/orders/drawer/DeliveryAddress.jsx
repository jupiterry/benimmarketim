// Detay çekmecesinin "Teslimat adresi" bölümü: yalnızca adrese teslim siparişlerde çizilir (yurt siparişi
// bugünkü gibi görünür). Bölge, sokak / bina, kat · daire, tarif; "Haritada aç" (konum varsa koordinat,
// yoksa "<sokak> <bina no>, <bölge>, Devrek" araması) ve "Adresi kopyala". Teslimat ücreti rozeti başlıkta.
import { useId } from "react";
import toast from "react-hot-toast";
import { Copy, Home, Map as MapIcon, Navigation } from "lucide-react";
import { copyText, deliveryFeeLabel, orderAddressLines, orderDeliveryFee, orderMapsLink } from "../shared";

export default function DeliveryAddress({ order }) {
  const headId = useId();
  const address = orderAddressLines(order);
  if (!address) return null;
  const maps = orderMapsLink(order);
  const fee = orderDeliveryFee(order);
  const hasLocation = Boolean(order?.deliveryAddress?.location);
  const copy = async () => {
    const text = [address.oneLine, address.directions ? `Tarif: ${address.directions}` : ""].filter(Boolean).join("\n");
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
        <span className={`ui-badge ${fee > 0 ? "ui-badge--info" : "ui-badge--ok"} so-d-addr-fee`} title="Siparişe kilitli teslimat ücreti">
          {fee > 0 ? `Teslimat ${deliveryFeeLabel(order)}` : "Ücretsiz teslimat"}
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
        </div>
        <div className="so-d-addr-actions">
          {maps && (
            <a className="ui-btn ui-btn--sm so-d-addr-map" href={maps} target="_blank" rel="noopener noreferrer"
              title={hasLocation ? "Müşterinin seçtiği konumu Google Haritalar'da aç" : "Adresi Google Haritalar'da ara"}>
              <MapIcon aria-hidden="true" />Haritada aç
            </a>
          )}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={copy} title="Adresi ve tarifi kopyala">
            <Copy aria-hidden="true" />Kopyala
          </button>
        </div>
      </div>
    </section>
  );
}
