// "Son gönderimler": her gerçek gönderimde kaç kişiye gittiği ve bildirimi alanların sonraki 24 / 72 saatte verdiği
// siparişler. Sonuçlar görünen sayfa için tek istekle alınır (GET /notifications/broadcasts/results?ids=…);
// pencere dolmadan "ölçülüyor" gösterilir. Sayılar "bildirimden sonra sipariş veren"dir, bildirimin etkisi değildir.
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, RotateCcw, TrendingUp } from "lucide-react";
import axios from "../../lib/axios";
import { CUSTOM_AUDIENCE, TEST_AUDIENCE, describeResult, formatWhen, historyState } from "./broadcastShared";

const formatDate = (value) => new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const measurable = (item) => item.sent && item.audience !== TEST_AUDIENCE;

export default function BroadcastHistory({ items, loading, audiences, zones, onReuse }) {
  const [results, setResults] = useState({ key: "", map: {}, error: false });
  // Yalnızca ölçülebilen (gönderilmiş, deneme olmayan) satırlar sorulur; liste değişmedikçe istek yinelenmez
  const key = useMemo(() => items.filter(measurable).map((item) => item._id).join(","), [items]);
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    axios.get("/notifications/broadcasts/results", { params: { ids: key } })
      .then(({ data }) => { if (!cancelled) setResults({ key, map: data.results || {}, error: false }); })
      // Hata olursa önceki sayılar ekranda kalır; yalnızca yeni satırlar "alınamadı" görünür
      .catch(() => { if (!cancelled) setResults((current) => ({ key, map: current.map, error: true })); });
    return () => { cancelled = true; };
  }, [key]);
  const ready = results.key === key;

  const audienceLabel = (item) => {
    // "custom": Müşteriler ekranından seçili kişilere ya da bir süzgece uyanlara gönderilen bildirim
    if (item.audience === CUSTOM_AUDIENCE) return "Seçili müşteriler";
    if (item.audience !== TEST_AUDIENCE) return audiences.find((entry) => entry.id === item.audience)?.label || item.audience;
    const to = item.testRecipient?.name || item.testRecipient?.email;
    return to ? `Alıcı: ${to}` : "Alıcı: gönderen yönetici"; // "Deneme" rozeti ayrıca gösterilir
  };

  return (
    <section className="ui-panel" aria-label="Gönderim geçmişi">
      <div className="ui-panel-head">
        <h2>Son gönderimler</h2>
      </div>
      {items.length ? (
        <>
          <ol className="push-history">
            {items.map((item) => {
              const state = historyState(item);
              const zone = item.zone ? zones.find((entry) => entry.id === item.zone)?.label || item.zone : "";
              // Liste yenilenirken önceki sayılar görünmeye devam eder (yeni satır gelene kadar "yükleniyor")
              const result = measurable(item) ? describeResult(results.map[item._id]) : null;
              // Gönderildiyse kaç kişiye gittiği; gönderilemediyse (varsa) kaç kişinin hedeflendiği
              const reached = item.sent ? `${item.targetedCount || 0} kişiye gitti` : item.targetedCount > 0 ? `${item.targetedCount} kişi hedeflendi` : "";
              return (
                <li key={item._id} className="push-history-item" data-state={state.tone}>
                  <div className="ui-grow">
                    <h3 className="ui-wrap-anywhere">{item.title}</h3>
                    <p className="ui-wrap-anywhere">{item.body}</p>
                    <div className="push-history-meta">
                      <span className={`ui-badge ${state.badge}`}>{state.label}</span>
                      {item.audience === TEST_AUDIENCE && <span className="ui-badge ui-badge--info">Deneme</span>}
                      <span>{audienceLabel(item)}</span>
                      {zone && <span className="ui-badge">{zone}</span>}
                      <span>{formatDate(item.at || item.sentAt || item.createdAt)}{item.sentBy?.name ? ` · ${item.sentBy.name}` : ""}</span>
                      {item.scheduledFor && <span className="pbx-planned" title={`Planlanan zaman: ${formatWhen(item.scheduledFor)}`}><CalendarClock aria-hidden="true" />Planlı gönderim</span>}
                    </div>
                    {reached && (
                      <p className="pbx-result" data-pending={result?.pending ? "true" : undefined} title={result?.title}>
                        {measurable(item) && <TrendingUp aria-hidden="true" />}
                        <span>
                          {reached}{item.unreachableCount ? ` (${item.unreachableCount} kişinin kayıtlı cihazı yok)` : ""}
                          {measurable(item) && (result ? ` · ${result.text}` : !ready ? " · sonuç yükleniyor…" : results.error ? " · sonuç alınamadı" : "")}
                        </span>
                      </p>
                    )}
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost pbx-reuse" onClick={() => onReuse(item)}>
                      <RotateCcw />Bu metni yeniden kullan
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="ui-hint pbx-result-note">
            Sipariş sayıları, bildirimi alan müşterilerin bildirimden sonraki 24 ve 72 saatte verdiği (iptal edilmemiş) siparişlerdir; tutar bu siparişlerin ürün toplamıdır. Siparişin bildirim sayesinde verildiği anlamına gelmez.
          </p>
        </>
      ) : <div className="ui-empty">{loading ? "Yükleniyor…" : "Henüz toplu bildirim gönderilmedi."}</div>}
    </section>
  );
}
