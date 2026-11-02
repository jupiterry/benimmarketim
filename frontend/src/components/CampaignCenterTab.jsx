// Kampanya merkezi: yayındaki ve önümüzdeki 14 gündeki bütün kampanyalar tek ekranda; flaş indirim ve haftalık
// fırsatların satışı, cirosu ve verdiği indirimle. Veri: GET /api/campaigns/overview (yalnızca yönetici).
// Durumlar ("bugün bitiyor", "planlı") sayfa açık kaldıkça sunucu saatine göre yeniden hesaplanır; 5 dakikadan eski
// veri, ekrana dönülünce sessizce yenilenir. Satırlar ilgili ekranı açar (ürün çekmecesi için HANDOFF.product).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarRange, Hourglass, Info, Megaphone, Percent, RefreshCw, TrendingUp } from "lucide-react";
import axios from "../lib/axios";
import {
  EmptyState, KpiCard, KpiGrid, PageHeader, SkeletonCards, SkeletonRows, Tabs, compactMoney, money, useNow, usePref,
} from "./admin/ui";
import CampaignAttention from "./campaigns/CampaignAttention";
import CampaignCalendar from "./campaigns/CampaignCalendar";
import CampaignList from "./campaigns/CampaignList";
import { SECTION_LABELS, TYPE_ORDER, capNote, clock, count, endingWhen, isLive, statusOf, toMs } from "./campaigns/campaignUtils";
import "../styles/campaign-center.css";

const STALE_MS = 5 * 60 * 1000;
const VIEW_PREF = "admin-campaigns-view";
/** Dikkat listesinin dayandığı bölümler; biri yüklenemezse "her şey yolunda" denmez */
const ATTENTION_SOURCES = ["flash", "weekly", "coupon", "coupon_request", "mission"];
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const errorText = (error) =>
  error?.response?.data?.message || "Kampanya merkezi yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.";
/** Cümle sonu noktası (sunucu mesajları noktasız gelebilir) */
const sentence = (text) => (/[.!?]$/.test(String(text).trim()) ? String(text).trim() : `${String(text).trim()}.`);

const CampaignCenterTab = ({ onNavigate }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [skew, setSkew] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);
  const [viewPref, setViewPref] = usePref(VIEW_PREF, "live");
  const view = viewPref === "calendar" ? "calendar" : "live";
  const tick = useNow(30000);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const loadedAtRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    busyRef.current = true;
    setLoading(true);
    try {
      const { data: body } = await axios.get("/campaigns/overview");
      if (id !== requestRef.current) return;
      if (!body?.success || !body.groups) throw new Error("Beklenmeyen yanıt");
      const serverNow = toMs(body.generatedAt);
      // Bilgisayarın saati yanlışsa durumlar yine sunucu saatine göre hesaplansın
      setSkew(Number.isFinite(serverNow) ? serverNow - Date.now() : 0);
      loadedAtRef.current = Date.now();
      setLoadedAt(loadedAtRef.current);
      setData(body);
      setError("");
    } catch (err) {
      if (id === requestRef.current) setError(errorText(err));
    } finally {
      if (id === requestRef.current) {
        busyRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestRef.current += 1; // ekrandan çıkınca geç gelen yanıt yok sayılır
    };
  }, [load]);

  // Uzun süre açık kalan ekran: sekmeye/pencereye dönünce veri 5 dakikadan eskiyse sessizce yenilenir
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || busyRef.current || !loadedAtRef.current) return;
      if (Date.now() - loadedAtRef.current > STALE_MS) load();
    };
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [load]);

  const now = tick + skew;
  const groups = data?.groups;
  const allItems = useMemo(() => (groups ? TYPE_ORDER.flatMap((type) => (Array.isArray(groups[type]) ? groups[type] : [])) : []), [groups]);
  const summary = useMemo(() => {
    let live = 0;
    let ending = 0;
    let upcoming = 0;
    let firstEnd = Infinity;
    for (const item of allItems) {
      const status = statusOf(item, now);
      if (isLive(status)) live += 1;
      if (status === "upcoming") upcoming += 1;
      if (status === "ending_today") {
        ending += 1;
        firstEnd = Math.min(firstEnd, toMs(item.endsAt));
      }
    }
    return { live, ending, upcoming, firstEnd };
  }, [allItems, now]);

  const last7 = data?.totals?.last7 || null;
  const last30 = data?.totals?.last30 || null;
  const revenue7 = last7 ? round2(last7.flash.revenue + last7.weekly.revenue) : null;
  const discount7 = last7 ? round2(last7.flash.discount + last7.weekly.discount) : null;
  const inferred7 = last7 ? last7.flash.inferredLines + last7.weekly.inferredLines : 0;
  const discount30 = last30 ? round2(last30.flash.discount + last30.weekly.discount) : null;
  const revenueTitle = last7
    ? `Son 7 gün: flaş indirimli satış ${money(last7.flash.revenue)}, haftalık fırsat satışı ${money(last7.weekly.revenue)}${inferred7 ? `; ${count(inferred7)} satır tahmini` : ""}`
    : "";
  const discountTitle = last7
    ? `Son 7 gün: flaş ${money(last7.flash.discount)}, haftalık ${money(last7.weekly.discount)}, kupon ${money(last7.coupon.discount)}${discount30 !== null ? `; son 30 günde flaş + haftalık ${money(discount30)}` : ""}`
    : "";

  const partial = (data?.partial || []).map((key) => SECTION_LABELS[key] || key);
  const notes = [
    ...capNote(data?.capped).map((text) => `${text} sınırlı.`),
    ...(data?.totals?.truncated || data?.performanceTruncated ? ["Sipariş sayısı çok yüksek olduğundan getiri en yeni 20.000 siparişe göre hesaplandı."] : []),
  ];
  const showCalendar = useCallback(() => setViewPref("calendar"), [setViewPref]);

  return (
    <div className="ui-page cc">
      <PageHeader
        title="Kampanya merkezi"
        description="Yayındaki ve önümüzdeki 14 gündeki kampanyalar; flaş indirim ve haftalık fırsatların satışı, cirosu ve verdiği indirimle."
        meta={data ? `${count(summary.live)} yayında` : undefined}
        actions={(
          <>
            {loadedAt > 0 && <span className="cc-updated ui-muted ui-text-xs">Güncellendi {clock(loadedAt + skew)}</span>}
            <button type="button" className="ui-btn" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "ui-spin" : ""} aria-hidden="true" />Yenile
            </button>
          </>
        )}
      />

      {!data && loading && (
        <>
          <SkeletonCards count={4} />
          <SkeletonRows rows={6} />
        </>
      )}

      {!data && !loading && error && (
        <section className="ui-panel">
          <EmptyState icon={AlertTriangle} title="Kampanya merkezi yüklenemedi" description={error}
            action={<button type="button" className="ui-btn ui-btn--primary" onClick={load}><RefreshCw aria-hidden="true" />Tekrar dene</button>} />
        </section>
      )}

      {data && (
        <>
          {error && (
            <div className="ui-banner ui-banner--danger cc-banner" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span className="ui-grow">Yenileme başarısız: {sentence(error)} Gösterilen bilgiler {clock(loadedAt + skew)} itibarıyladır.</span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={load} disabled={loading}>Tekrar dene</button>
            </div>
          )}
          {partial.length > 0 && (
            <div className="ui-banner ui-banner--warn cc-banner" role="status">
              <AlertTriangle aria-hidden="true" />
              <span className="ui-grow">Şu bölümler yüklenemedi: {partial.join(", ")}. Diğer bilgiler günceldir; birazdan yenilemeyi deneyin.</span>
            </div>
          )}

          <KpiGrid className="cc-kpis">
            <KpiCard icon={Megaphone} tone="brand" label="Yayında" value={count(summary.live)}
              note={summary.upcoming ? <><span>{count(summary.upcoming)} planlı</span><span>14 gün içinde</span></> : "planlı kampanya yok"} />
            <KpiCard icon={Hourglass} tone={summary.ending ? "warn" : undefined} label="Bugün biten" value={count(summary.ending)}
              note={summary.ending ? `ilki ${endingWhen(summary.firstEnd, now)}` : "bugün ve bu gece biten yok"} />
            <KpiCard icon={TrendingUp} tone="ok" label="Kampanyalı ciro" value={revenue7 === null ? "—" : compactMoney(revenue7)}
              note={last7 ? (
                <>
                  <span>son 7 gün{inferred7 ? " · tahmini dahil" : ""}</span>
                  <span title={revenueTitle}>flaş {compactMoney(last7.flash.revenue)}</span>
                  <span title={revenueTitle}>haftalık {compactMoney(last7.weekly.revenue)}</span>
                </>
              ) : "hesaplanamadı"} />
            <KpiCard icon={Percent} tone="info" label="Verilen indirim" value={discount7 === null ? "—" : compactMoney(discount7)}
              note={last7 ? (
                <>
                  <span>son 7 gün · flaş + haftalık</span>
                  {last7.coupon.discount > 0 && <span title={discountTitle}>+ {compactMoney(last7.coupon.discount)} kupon</span>}
                  {discount30 !== null && <span title={discountTitle}>30 günde {compactMoney(discount30)}</span>}
                </>
              ) : "hesaplanamadı"} />
          </KpiGrid>

          <CampaignAttention items={data.attention} now={now} onNavigate={onNavigate}
            incomplete={(data.partial || []).some((key) => ATTENTION_SOURCES.includes(key))} />

          <section className="ui-panel cc-panel" aria-label="Kampanyalar">
            <div className="cc-panel-head">
              <Tabs ariaLabel="Görünüm" value={view} onChange={setViewPref} tabs={[
                { value: "live", label: "Şimdi yayında", icon: Megaphone, count: summary.live },
                { value: "calendar", label: "Takvim · 14 gün", icon: CalendarRange, count: summary.upcoming || undefined },
              ]} />
            </div>
            <div className="cc-panel-body" role="tabpanel" aria-label={view === "calendar" ? "Takvim" : "Şimdi yayında"}>
              {view === "calendar" ? (
                <CampaignCalendar items={allItems} horizon={data.horizon} now={now} onNavigate={onNavigate} />
              ) : (
                <CampaignList groups={groups} now={now} onNavigate={onNavigate} upcomingCount={summary.upcoming} onShowCalendar={showCalendar} />
              )}
            </div>
          </section>

          <p className="cc-foot">
            <Info aria-hidden="true" />
            <span>
              Getiri iptal edilmemiş siparişlerden hesaplanır. Ciro, kampanya fiyatıyla satılan ürünlerin kupon öncesi tutarıdır;
              indirim, liste fiyatıyla ödenen fiyat arasındaki farktır. “Tahmini” yazan sonuçlarda, fiyat bilgisi kaydedilmeden önceki
              siparişler fiyatına göre eşleştirildi.{notes.length ? ` ${notes.join(" ")}` : ""}
            </span>
          </p>
        </>
      )}
    </div>
  );
};

export default CampaignCenterTab;
