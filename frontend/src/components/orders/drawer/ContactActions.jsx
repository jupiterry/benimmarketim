// Detay çekmecesinin "İletişim" bölümü (C24): "Ara" (tel:), WhatsApp bölünmüş düğmesi (ana kısım duruma
// göre mesaj, ok kısmı hazır şablonlar) ve "Özeti kopyala". Numara Teslimat bölümünde yazılı; başlıkta tekrarlanmaz
// (özet kartında da kısa Ara / WhatsApp düğmeleri var). Müşteri metinleri yalnızca shared.js'ten gelir;
// silinmiş hesaplarda selamlama adsızdır ("Merhaba,"). Numara geçerli bir TR numarası değilse WhatsApp pasiftir.
import { useId } from "react";
import { ChevronDown, Copy, MessageCircle, Phone } from "lucide-react";
import { formatPhoneTR } from "../../../lib/orderTools";
import { MenuButton } from "../atoms";
import { WHATSAPP_TEMPLATES, buildWhatsAppLink, customerPhone, telHref } from "../shared";

const PREVIEW_MAX = 74;
/** Menüde mesajın özü: her şablonda aynı olan selamlama atlanır, iki satıra sığacak kadar gösterilir */
const preview = (text) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim().replace(/^Merhaba[^,]{0,40},\s*/, "");
  return clean.length > PREVIEW_MAX ? `${clean.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : clean;
};
const openLink = (href) => {
  if (href) window.open(href, "_blank", "noopener,noreferrer");
};

export default function ContactActions({ order, changes = [], onCopySummary }) {
  const headId = useId();
  const phone = customerPhone(order);
  const tel = telHref(order);
  const ctx = { changes };
  const statusLink = buildWhatsAppLink(order, "status", ctx);
  const templates = WHATSAPP_TEMPLATES.filter((t) => t.id !== "status").map((t) => {
    const enabled = t.enabled(order, ctx);
    return {
      id: t.id,
      label: t.label,
      icon: MessageCircle,
      disabled: !enabled,
      description: enabled ? preview(t.build(order, ctx)) : "Bu oturumda üründe değişiklik yapılmadı",
      title: t.hint,
      onSelect: () => openLink(buildWhatsAppLink(order, t.id, ctx)),
    };
  });

  return (
    <section className="so-d-section so-d-contact" aria-labelledby={headId}>
      <div className="so-d-section-head">
        <h3 id={headId} className="so-d-h">
          <Phone aria-hidden="true" />
          İletişim
        </h3>
      </div>
      <div className="so-d-contact-row">
        {tel ? (
          <a className="ui-btn so-d-call" href={tel} title={`${formatPhoneTR(phone)} numarasını ara`}>
            <Phone aria-hidden="true" />Ara
          </a>
        ) : (
          <button type="button" className="ui-btn so-d-call" disabled title="Telefon numarası yok">
            <Phone aria-hidden="true" />Ara
          </button>
        )}

        <div className="so-d-split" role="group" aria-label="WhatsApp">
          {statusLink ? (
            <a className="ui-btn so-d-split-main" href={statusLink} target="_blank" rel="noopener noreferrer"
              title="Duruma göre WhatsApp mesajı (w)">
              <MessageCircle aria-hidden="true" />WhatsApp
            </a>
          ) : (
            <button type="button" className="ui-btn so-d-split-main" disabled title="Telefon numarası tanınmadı">
              <MessageCircle aria-hidden="true" />WhatsApp
            </button>
          )}
          <MenuButton
            label="Hazır WhatsApp mesajları"
            menuLabel="Hazır WhatsApp mesajları"
            icon={ChevronDown}
            iconOnly
            align="end"
            className="so-d-split-caret"
            menuClassName="so-d-wa-menu"
            disabled={!statusLink}
            title={statusLink ? "Hazır mesajlar" : "Telefon numarası tanınmadı"}
            items={[{ type: "label", label: "Hazır mesajlar" }, ...templates]}
          />
        </div>

        <button type="button" className="ui-btn so-d-copy" onClick={() => onCopySummary?.(order)} title="Kurye için sipariş özetini kopyala (c)">
          <Copy aria-hidden="true" />Özeti kopyala
        </button>
      </div>
    </section>
  );
}
