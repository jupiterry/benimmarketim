// "Pilot karnesi": pilot başlangıcından bu yana adrese teslimat siparişleri. Plan ölçütleri (söz verilen sürede
// teslim ≥ %90, "adres bulunamadı" < %3), teslim süresi, sepet, teslimat ücreti, puanlar, teyitler, alanı
// doğrulanmamış siparişler, mahalleler ve son sorunlu siparişler (tıklayınca Siparişler'de açılır).
import { useId } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, Gauge, MapPinOff, PackageCheck, Receipt, ShoppingBag, Star, Timer, Truck,
} from "lucide-react";
import { KpiCard, KpiGrid, Skeleton, compactMoney, formatDate, money, timeAgo, usePref } from "../admin/ui";
import { num } from "./shared";
import { minutesText, num1, openOrder, openOrdersPreset, percentText, shareOf } from "./readiness";

const LOW_SAMPLE = 10;

const emptyText = (mode, startedAt) => {
  if (mode !== "off") return "Henüz adrese teslimat siparişi yok. İlk sipariş geldiğinde sonuçlar burada görünür.";
  return startedAt
    ? "Adrese teslimat şu an kapalı ve pilot başladığından beri adres siparişi gelmedi. Pilotu yeniden açıp gerçek bir siparişle deneyin."
    : "Pilot henüz başlamadı. Pilotu açıp kendi hesabınızla gerçek bir sipariş verin; sonuçlar burada görünür.";
};

const Facts = ({ pilot, now, leaveTo }) => {
  const { callbacks, failed, neighborhoods, zones } = pilot;
  const moreHoods = Math.max(0, pilot.neighborhoodCount - neighborhoods.length);
  return (
    <dl className="dz-karne-facts">
      <dt>Teyit</dt>
      <dd>
        {callbacks.needed ? (
          <>
            <span className={callbacks.pending ? "dz-fact-warn" : undefined}>{num(callbacks.pending)} bekliyor</span>
            {" · "}{num(callbacks.confirmed)} teyit edildi
            {callbacks.pending > 0 && (
              <button type="button" className="dz-fact-link" onClick={() => leaveTo(() => openOrdersPreset("callback"))}>
                Bekleyenleri aç<ChevronRight aria-hidden="true" />
              </button>
            )}
          </>
        ) : "Teyit gereken sipariş olmadı"}
      </dd>

      <dt>Alan doğrulanmadı</dt>
      <dd>
        {pilot.areaUnverified
          ? <span className="dz-fact-warn">{num(pilot.areaUnverified)} sipariş sınır yüklenmeden alındı</span>
          : "Yok"}
      </dd>

      <dt>Teslim edilemedi</dt>
      <dd>
        {failed.total ? (
          <span className="dz-fact-chips">
            {failed.byReason.map((row) => (
              <span key={row.code} className="ui-badge ui-badge--danger">{row.label} · {num(row.count)}</span>
            ))}
          </span>
        ) : "Yok"}
      </dd>

      <dt>Mahalleler</dt>
      <dd>
        {neighborhoods.length ? (
          <span className="dz-fact-chips">
            {neighborhoods.map((row) => (
              <span key={row.name} className="ui-badge" title={`${row.orders} sipariş · ${row.delivered} teslim · ${row.cancelled} iptal`}>
                {row.name} · {num(row.orders)}
              </span>
            ))}
            {moreHoods > 0 && <span className="dz-fact-more">ve {num(moreHoods)} mahalle daha</span>}
          </span>
        ) : "Mahalle bilgisi yok"}
      </dd>

      {zones.length > 1 && (
        <>
          <dt>Bölgeler</dt>
          <dd>
            <span className="dz-fact-chips">
              {zones.map((row) => <span key={row.id} className="ui-badge">{row.name} · {num(row.orders)}</span>)}
            </span>
          </dd>
        </>
      )}

      {pilot.lastOrderAt && (
        <>
          <dt>Son sipariş</dt>
          <dd>{timeAgo(pilot.lastOrderAt, now)}</dd>
        </>
      )}
    </dl>
  );
};

const Problems = ({ problems, now, leaveTo }) => (
  <div className="dz-karne-problems">
    <h4 className="dz-karne-h">Son sorunlu siparişler</h4>
    {problems.length ? (
      <ul className="dz-problems">
        {problems.map((row) => (
          <li key={row.orderId}>
            <button type="button" className="dz-problem" data-kind={row.kind} onClick={() => leaveTo(() => openOrder(row.orderId))}
              aria-label={`${row.code} siparişini aç: ${row.reason}`}>
              <span className="dz-problem-code ui-num">{row.code}</span>
              <span className="dz-problem-main">
                <span className="dz-problem-reason">{row.reason}</span>
                {row.note && <span className="dz-problem-note">“{row.note}”</span>}
                <span className="dz-problem-meta">
                  {[row.neighborhood || row.zoneName, row.at ? timeAgo(row.at, now) : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ChevronRight className="dz-problem-go" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    ) : <p className="dz-karne-none">Sorunlu sipariş yok.</p>}
  </div>
);

/** confirmLeave: Siparişler'e geçmeden önce (kaydedilmemiş bölge kartı varsa) sorar; false → geçilmez */
const PilotReport = ({ pilot, pilotError, mode, loading, now, confirmLeave }) => {
  const [open, setOpen] = usePref("dz-karne-open", true);
  const leaveTo = async (go) => {
    if (confirmLeave && !(await confirmLeave())) return;
    go();
  };
  const bodyId = useId();
  const hasData = Boolean(pilot?.orders);
  const ordersText = pilot?.orders ? `${num(pilot.orders)} sipariş` : "";
  const sub = pilot
    ? (pilot.startedAt
      ? `Başlangıç: ${formatDate(pilot.startedAt, { year: "numeric" })}${pilot.startedAtSource === "firstOrder" ? " (ilk adres siparişi)" : ""} · ${ordersText || "henüz sipariş yok"}`
      : ordersText || (mode === "off" ? "Henüz başlamadı" : "Henüz adres siparişi yok"))
    : loading ? "Hesaplanıyor…" : "Sonuçlar okunamadı";

  return (
    <section className="dz-karne" aria-labelledby={`${bodyId}-title`} aria-busy={loading || undefined}>
      <div className="dz-sec-head">
        <h3 className="dz-sec-h">
          <button type="button" className="dz-sec-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
            <span className="dz-sec-icon" data-state="info"><Gauge aria-hidden="true" /></span>
            <span className="dz-sec-titles">
              <span className="dz-sec-title" id={`${bodyId}-title`}>Pilot karnesi</span>
              <span className="dz-sec-sub">{sub}</span>
            </span>
            <ChevronDown className="dz-sec-chevron" aria-hidden="true" />
          </button>
        </h3>
      </div>

      <div id={bodyId} className="dz-sec-body" hidden={!open}>
        {!pilot ? (
          loading ? (
            <div className="dz-karne-skel" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={74} radius={10} />)}
            </div>
          ) : (
            <p className="dz-inline-warn" role="alert"><AlertTriangle aria-hidden="true" />{pilotError || "Pilot sonuçları şu an hesaplanamadı. Biraz sonra yenileyin."}</p>
          )
        ) : !hasData ? (
          <p className="dz-karne-empty">{emptyText(mode, pilot.startedAt)}</p>
        ) : (
          <>
            <p className="dz-ready-hint">Pilot başlangıcından bu yana tüm adrese teslimat siparişleri. Hedefler Devrek teslimat planındaki pilot bitiş ölçütleridir.</p>
            <KpiGrid className="dz-karne-kpis">
              <KpiCard icon={ShoppingBag} label="Sipariş" value={num(pilot.orders)}
                note={`${num(pilot.customers)} müşteri${pilot.active ? ` · ${num(pilot.active)} aktif` : ""}`} />
              <KpiCard icon={PackageCheck} label="Teslim edildi" value={num(pilot.delivered)} tone={pilot.delivered ? "ok" : undefined}
                note={`${percentText(shareOf(pilot.delivered, pilot.orders))} · ${num(pilot.cancelled)} iptal`} />
              <KpiCard icon={Timer} label="Teslim süresi" value={minutesText(pilot.deliveryMinutes.median)}
                note={pilot.deliveryMinutes.count
                  ? `ortanca${pilot.deliveryMinutes.p90 !== null ? ` · %90'ı ${minutesText(pilot.deliveryMinutes.p90)} içinde` : ""}`
                  : "Henüz teslim yok"} />
              <KpiCard icon={Gauge} label="Zamanında teslim" value={percentText(pilot.onTime.rate)}
                tone={pilot.onTime.rate === null ? undefined : pilot.onTime.rate >= pilot.onTime.target ? "ok" : "warn"}
                note={pilot.onTime.rate !== null
                  ? `söz verilen sürede ${num(pilot.onTime.within)}/${num(pilot.onTime.measured)} · hedef ≥ %${num(pilot.onTime.target)}`
                  : pilot.deliveryMinutes.count ? "Bölgenin tahmini süresi yazılı değil ya da dakikaya çevrilemiyor" : "Henüz teslim yok"} />
              <KpiCard icon={MapPinOff} label="Adres bulunamadı" value={percentText(pilot.addressNotFound.rate)}
                tone={pilot.addressNotFound.rate === null ? undefined : pilot.addressNotFound.rate < pilot.addressNotFound.target ? "ok" : "danger"}
                note={pilot.addressNotFound.attempts
                  ? `${num(pilot.addressNotFound.count)}/${num(pilot.addressNotFound.attempts)} teslim denemesi · hedef < %${num(pilot.addressNotFound.target)}`
                  : "Henüz teslim denemesi yok"} />
              <KpiCard icon={Receipt} label="Ortalama sepet" value={pilot.averageBasket === null ? "—" : money(pilot.averageBasket)}
                note={`Ürün cirosu ${compactMoney(pilot.revenue)}`} />
              <KpiCard icon={Truck} label="Teslimat ücreti" value={money(pilot.deliveryFeeRevenue)} note="İptaller hariç" />
              <KpiCard icon={Star} label="Müşteri puanı" tone={pilot.feedback.low ? "warn" : undefined}
                value={pilot.feedback.averageRating === null ? "—" : `${num1(pilot.feedback.averageRating)} / 5`}
                note={pilot.feedback.responses
                  ? [
                    pilot.feedback.rated ? `${num(pilot.feedback.rated)} puan` : `${num(pilot.feedback.responses)} yanıt`,
                    pilot.feedback.averageDeliveryRating !== null ? `teslimat ${num1(pilot.feedback.averageDeliveryRating)}` : "",
                    pilot.feedback.low ? `${num(pilot.feedback.low)} düşük` : "",
                  ].filter(Boolean).join(" · ")
                  : "Henüz değerlendirme yok"} />
            </KpiGrid>
            {(pilot.delivered > 0 && pilot.delivered < LOW_SAMPLE) && (
              <p className="dz-karne-note">Az sayıda teslim var ({num(pilot.delivered)}); oranlar henüz yön göstermeyebilir.</p>
            )}
            {pilot.deliveryMinutes.capped && (
              <p className="dz-karne-note">Teslim süreleri en yeni {num(pilot.deliveryMinutes.count)} teslimattan hesaplandı.</p>
            )}
            <div className="dz-karne-details">
              <Facts pilot={pilot} now={now} leaveTo={leaveTo} />
              <Problems problems={pilot.problems} now={now} leaveTo={leaveTo} />
            </div>
            <p className="dz-karne-note">Düşük puan: {num(pilot.feedback.lowThreshold)} yıldız ve altı (ürün ya da teslimat) veya 👎. Söz verilen süre, bölgenin şu anki tahmini süresinin üst sınırıdır.</p>
          </>
        )}
      </div>
    </section>
  );
};

export default PilotReport;
