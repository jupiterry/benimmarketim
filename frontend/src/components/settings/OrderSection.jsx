// Sipariş bölümü: mağaza açık/kapalı anahtarı, çalışma saatleri (tek aralık, haftalık gösterim),
// minimum sipariş tutarı ve sunucu önbelleği.
import { useState } from "react";
import { Clock, DatabaseZap, Power, ShoppingBag, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { useConfirm } from "../ConfirmModal";
import { useNow } from "../admin/ui";
import { Field, HoursTimeline, Input, Row, SectionHead, StatusPill, Switch, TimeField, useSettingsForm } from "./fields";
import { DELIVERY_POINT_KEYS, clock, describeRange, formatDuration, isWithinSchedule } from "./settingsModel";

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function OrderSection() {
  const form = useSettingsForm();
  const { confirm } = useConfirm();
  const now = useNow(30000);
  const [refreshing, setRefreshing] = useState(false);
  const { draft } = form;

  // "Mağaza kapalı" (storeClosed): yurtlar ve adrese teslimat (Devrek) dahil hiçbir sipariş alınmaz.
  // Bölgelerin kendi açık/kapalı durumu değişmez; mağaza açılınca her bölge eski durumuna döner.
  const storeOpen = !draft.storeClosed;
  const storePaths = ["storeClosed"];
  const anyDormOpen = DELIVERY_POINT_KEYS.some((key) => draft.deliveryPoints[key].enabled);
  const toggleStore = async (next) => {
    if (!next) {
      const ok = await confirm({
        title: "Mağazayı kapat",
        message: "Sipariş alımı tamamen durur: yurtlara ve adrese teslimata (Devrek) sipariş verilemez. Bölgelerin kendi ayarları değişmez. Değişiklik, Kaydet'e basınca geçerli olur.",
        confirmText: "Mağazayı kapat",
        cancelText: "Vazgeç",
        type: "danger",
      });
      if (!ok) return;
    }
    form.update("storeClosed", !next);
  };

  const range = describeRange(draft.orderStartHour, draft.orderStartMinute, draft.orderEndHour, draft.orderEndMinute);
  const withinHours = isWithinSchedule({ startHour: draft.orderStartHour, startMinute: draft.orderStartMinute, endHour: draft.orderEndHour, endMinute: draft.orderEndMinute }, new Date(now));
  const liveTone = !storeOpen ? "danger" : withinHours ? "ok" : "warn";
  const liveText = !storeOpen ? "Mağaza kapalı" : withinHours ? "Şu an sipariş alınıyor" : "Şu an saat dışı";

  const refreshCache = async () => {
    try {
      setRefreshing(true);
      const { data } = await axios.get("/settings/refresh-cache");
      toast.success(`Önbellek yenilendi · ${data?.cache?.readableTime || "sunucu saatleri güncel"}`);
    } catch {
      toast.error("Önbellek yenilenemedi");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="stg-section">
      <section className="ui-panel">
        <SectionHead
          icon={ShoppingBag}
          title="Sipariş alımı"
          description="Mağazanın genel durumu. Kapalıyken uygulama ve site sipariş kabul etmez."
          aside={<StatusPill tone={liveTone}>{liveText}</StatusPill>}
        />
        <div className="ui-panel-body">
          <div className="stg-hero" data-on={storeOpen} data-changed={storePaths.some((p) => form.changed.has(p))}>
            <span className="stg-hero-icon"><Power /></span>
            <div className="stg-hero-text">
              <strong>{storeOpen ? "Mağaza açık" : "Mağaza kapalı"}</strong>
              <span>
                {storeOpen
                  ? (anyDormOpen
                    ? "Sipariş alınıyor. Kapatınca yurtlar ve adrese teslimat (Devrek) birlikte durur."
                    : "Mağaza açık ama iki yurt noktası da kapalı. Yurtları Teslimat bölümünden açabilirsiniz.")
                  : "Hiçbir bölgeye sipariş alınmıyor: yurtlar ve adrese teslimat (Devrek) durdu. Açınca her bölge kendi ayarına döner."}
              </span>
            </div>
            <Switch size="lg" tone={storeOpen ? "ok" : "danger"} checked={storeOpen} onChange={toggleStore} label="Sipariş alımını aç/kapat" />
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <SectionHead
          icon={Clock}
          title="Çalışma saatleri"
          description="Siparişler yalnızca bu aralıkta alınır (Türkiye saati). Bitiş saati başlangıçtan küçükse aralık ertesi güne sarkar."
          aside={<span className="stg-range-summary ui-mono">{clock(draft.orderStartHour, draft.orderStartMinute)} – {clock(draft.orderEndHour, draft.orderEndMinute)}{range.overnight && <small> ertesi gün</small>}</span>}
        />
        <div className="ui-panel-body stg-stack">
          <div className="stg-hours">
            <Field label="Açılış" paths={["orderStartHour", "orderStartMinute"]}>
              <TimeField hourPath="orderStartHour" minutePath="orderStartMinute" label="Açılış saati" />
            </Field>
            <span className="stg-hours-sep" aria-hidden="true">→</span>
            <Field label="Kapanış" paths={["orderEndHour", "orderEndMinute"]} hint={range.allDay ? "00:00–00:00: tüm gün açık" : `Günde ${formatDuration(range.duration)} sipariş alınır`}>
              <TimeField hourPath="orderEndHour" minutePath="orderEndMinute" label="Kapanış saati" />
            </Field>
          </div>
          <HoursTimeline startHour={draft.orderStartHour} startMinute={draft.orderStartMinute} endHour={draft.orderEndHour} endMinute={draft.orderEndMinute} now={now} />
          <div className="stg-week" aria-label="Haftalık görünüm">
            {DAYS.map((day) => (
              <div key={day} className="stg-week-day" data-open={storeOpen}>
                <span className="stg-week-name">{day}</span>
                <HoursTimeline compact startHour={draft.orderStartHour} startMinute={draft.orderStartMinute} endHour={draft.orderEndHour} endMinute={draft.orderEndMinute} label={`${day} çizelgesi`} />
                <span className="stg-week-hours ui-mono">{storeOpen ? `${clock(draft.orderStartHour, draft.orderStartMinute)}–${clock(draft.orderEndHour, draft.orderEndMinute)}` : "Kapalı"}</span>
              </div>
            ))}
          </div>
          <p className="ui-hint">Haftanın her günü aynı aralık geçerlidir; gün bazlı farklı saat bu sürümde tanımlanamaz.</p>
        </div>
      </section>

      <section className="ui-panel">
        <SectionHead icon={Wallet} title="Minimum sipariş tutarı" description="Bu tutarın altındaki sepetler sipariş aşamasında reddedilir." />
        <div className="ui-panel-body stg-stack">
          <Field path="minimumOrderAmount" label="Tutar" hint="0 girilirse alt sınır uygulanmaz.">
            <div className="ui-field-prefix stg-amount">
              <Input path="minimumOrderAmount" type="number" min="0" step="10" inputMode="decimal" aria-label="Minimum sipariş tutarı" parse={(v) => (v === "" ? "" : Number(v))} />
              <span>₺</span>
            </div>
          </Field>
          <div className="stg-chips" role="group" aria-label="Hazır tutarlar">
            {[0, 150, 200, 250, 300, 400].map((amount) => (
              <button key={amount} type="button" className="ui-btn ui-btn--sm" aria-pressed={draft.minimumOrderAmount === amount} onClick={() => form.update("minimumOrderAmount", amount)}>
                {amount === 0 ? "Sınır yok" : `₺${amount}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <SectionHead icon={DatabaseZap} title="Sunucu önbelleği" description="Saat ayarları kaydedilince önbellek kendiliğinden yenilenir; uygulama eski saatleri gösteriyorsa elle yenileyin." />
        <div className="ui-panel-body">
          <Row title="Sipariş saatleri önbelleği" description="Sunucudaki saat önbelleğini temizler ve yeniden doldurur.">
            <button type="button" className="ui-btn" onClick={refreshCache} disabled={refreshing}>
              <DatabaseZap className={refreshing ? "ui-spin" : ""} />{refreshing ? "Yenileniyor…" : "Önbelleği yenile"}
            </button>
          </Row>
        </div>
      </section>
    </div>
  );
}
