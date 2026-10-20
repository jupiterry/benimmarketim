// Teslimat bölümü: yurt/teslimat noktaları — ad, açık/kapalı ve nokta saatleri.
import { MapPin } from "lucide-react";
import { useConfirm } from "../ConfirmModal";
import { Field, HoursTimeline, Input, SectionHead, StatusPill, Switch, TimeField, useSettingsForm } from "./fields";
import { DELIVERY_POINT_KEYS, DELIVERY_POINT_META, clock } from "./settingsModel";

export default function DeliverySection() {
  const form = useSettingsForm();
  const { confirm } = useConfirm();
  const { draft } = form;
  const openCount = DELIVERY_POINT_KEYS.filter((key) => draft.deliveryPoints[key].enabled).length;

  const togglePoint = async (key, next) => {
    const point = draft.deliveryPoints[key];
    const others = DELIVERY_POINT_KEYS.filter((k) => k !== key && draft.deliveryPoints[k].enabled).length;
    if (!next && others === 0) {
      const ok = await confirm({
        title: "Son teslimat noktası kapatılıyor",
        message: `${point.name} kapanınca açık nokta kalmaz; mağaza fiilen kapanır ve müşteriler sipariş veremez. Devam edilsin mi?`,
        confirmText: "Noktayı kapat",
        cancelText: "Vazgeç",
        type: "danger",
      });
      if (!ok) return;
    }
    form.update(`deliveryPoints.${key}.enabled`, next);
  };

  return (
    <div className="stg-section">
      <section className="ui-panel">
        <SectionHead
          icon={MapPin}
          title="Teslimat noktaları"
          description="Müşteri sipariş verirken bu noktalardan birini seçer. Kapalı nokta uygulamada seçilemez; o noktaya gelen sipariş reddedilir."
          aside={<StatusPill tone={openCount === 0 ? "danger" : openCount < DELIVERY_POINT_KEYS.length ? "warn" : "ok"}>{openCount}/{DELIVERY_POINT_KEYS.length} nokta açık</StatusPill>}
        />
        <div className="ui-panel-body stg-points">
          {DELIVERY_POINT_KEYS.map((key) => {
            const point = draft.deliveryPoints[key];
            const base = `deliveryPoints.${key}`;
            return (
              <article key={key} className="stg-point" data-on={point.enabled} data-changed={[...form.changed].some((p) => p.startsWith(`${base}.`))}>
                <header className="stg-point-head">
                  <span className="stg-point-icon"><MapPin /></span>
                  <div className="stg-point-title">
                    <strong>{point.name || DELIVERY_POINT_META[key].defaultName}</strong>
                    <span>{DELIVERY_POINT_META[key].hint}</span>
                  </div>
                  <div className="stg-point-switch">
                    <StatusPill tone={point.enabled ? "ok" : "danger"}>{point.enabled ? "Açık" : "Kapalı"}</StatusPill>
                    <Switch checked={point.enabled} onChange={(next) => togglePoint(key, next)} label={`${point.name} teslimatını aç/kapat`} />
                  </div>
                </header>
                <div className="stg-point-body">
                  <Field path={`${base}.name`} label="Nokta adı" hint="Uygulamada ve siparişlerde bu adla görünür.">
                    <Input path={`${base}.name`} maxLength={60} aria-label={`${DELIVERY_POINT_META[key].defaultName} adı`} />
                  </Field>
                  <div className="stg-hours stg-hours--sm">
                    <Field label="Nokta açılış" paths={[`${base}.startHour`, `${base}.startMinute`]}>
                      <TimeField hourPath={`${base}.startHour`} minutePath={`${base}.startMinute`} label={`${point.name} açılış saati`} />
                    </Field>
                    <span className="stg-hours-sep" aria-hidden="true">→</span>
                    <Field label="Nokta kapanış" paths={[`${base}.endHour`, `${base}.endMinute`]}>
                      <TimeField hourPath={`${base}.endHour`} minutePath={`${base}.endMinute`} label={`${point.name} kapanış saati`} />
                    </Field>
                  </div>
                  <HoursTimeline compact startHour={point.startHour} startMinute={point.startMinute} endHour={point.endHour} endMinute={point.endMinute} label={`${point.name} saatleri`} />
                  <p className="ui-hint">
                    Nokta saatleri bilgi amaçlıdır ({clock(point.startHour, point.startMinute)}–{clock(point.endHour, point.endMinute)}); sipariş alımı Sipariş bölümündeki genel çalışma saatlerine göre yapılır.
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
