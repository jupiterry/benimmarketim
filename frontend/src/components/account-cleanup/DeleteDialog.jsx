// Toplu hesap silme penceresi: onay ("SİL" yazdırarak) → 50'şerlik parçalarla silme (ilerleme + Durdur) → sonuç özeti.
// Sunucu her kimliği yeniden doğrular; atlananlar nedenleriyle raporlanır. Siparişler hiçbir durumda silinmez.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, ShieldCheck, StopCircle, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { money } from "../admin/ui";
import { CONFIRM_WORD, DELETE_CHUNK, errorMessage, isConfirmWord, num, skipLabel } from "./shared";

const SEGMENT_LABEL = { inactive: "pasif", never: "etkinlik kaydı olmayan" };
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

const Tile = ({ label, value, tone, note }) => (
  <div className="ac-tile" data-tone={tone}>
    <span className="ac-tile-label">{label}</span>
    <strong className="ac-tile-value ui-num">{value}</strong>
    {note && <span className="ac-tile-note">{note}</span>}
  </div>
);

/** Atlananları nedene göre say: [{ reason, count }] (çoktan aza) */
const groupSkipped = (skipped) => {
  const map = new Map();
  for (const s of skipped) map.set(s.reason, (map.get(s.reason) || 0) + 1);
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
};

const EMPTY_RUN = { processed: 0, deleted: [], skipped: [], ordersPreserved: 0, chunk: 0, chunks: 0, total: 0, stopped: false, error: null, remaining: [] };

/**
 * Props: ids (silinecek kimlikler), segment, months, preserved ({ orders, revenue, withOrders } | null: seçimin
 * sunucudan gelen satır verileriyle kesin bilinen sipariş toplamı; withOrders bilinmiyorsa null),
 * target ({ name, email, phone } | null: tek hesap silinirken kim olduğu), onClose(result).
 */
export default function DeleteDialog({ ids, segment, months, preserved, target, onClose }) {
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  const [phase, setPhase] = useState("confirm"); // confirm | running | done
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState(EMPTY_RUN);
  const [stopping, setStopping] = useState(false);
  const runRef = useRef(EMPTY_RUN);
  const total = ids.length;
  const ready = isConfirmWord(typed);

  const close = useCallback(() => {
    if (phase === "running") return;
    onClose?.(phase === "done" ? runRef.current : null);
  }, [phase, onClose]);
  const closeRef = useRef(close);
  closeRef.current = close;

  // Odak: açılınca onay kutusuna, kapanınca açan öğeye döner. Esc yalnızca silme sürmüyorken kapatır.
  useEffect(() => {
    mountedRef.current = true;
    const prev = document.activeElement;
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => {
      mountedRef.current = false;
      stopRef.current = true; // ekran kapanırsa gönderilen parça bitince durur
      if (prev && prev !== document.body && prev.isConnected) prev.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  // Silme sürerken sayfadan ayrılmadan önce uyar
  useEffect(() => {
    if (phase !== "running") return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);
  // Faz değişince odak anlamlı düğmeye geçer
  useEffect(() => {
    if (phase === "confirm") return;
    requestAnimationFrame(() => dialogRef.current?.querySelector("[data-autofocus]")?.focus({ preventScroll: true }));
  }, [phase]);

  const update = (patch) => {
    runRef.current = { ...runRef.current, ...patch };
    if (mountedRef.current) setRun(runRef.current);
  };

  const start = async (queue, carry = EMPTY_RUN) => {
    stopRef.current = false;
    setStopping(false);
    const chunks = Math.ceil(queue.length / DELETE_CHUNK);
    runRef.current = { ...carry, total: carry.processed + queue.length, chunk: 0, chunks, stopped: false, error: null, remaining: queue };
    setRun(runRef.current);
    setPhase("running");
    for (let i = 0; i < queue.length; i += DELETE_CHUNK) {
      if (stopRef.current) {
        update({ stopped: true, remaining: queue.slice(i) });
        break;
      }
      const part = queue.slice(i, i + DELETE_CHUNK);
      update({ chunk: i / DELETE_CHUNK + 1 });
      try {
        const res = await axios.post("/account-cleanup/delete", { userIds: part, segment, months });
        const deleted = Array.isArray(res.data?.deleted) ? res.data.deleted : [];
        const skipped = Array.isArray(res.data?.skipped) ? res.data.skipped : [];
        const cur = runRef.current;
        update({
          processed: cur.processed + part.length,
          deleted: [...cur.deleted, ...deleted],
          skipped: [...cur.skipped, ...skipped],
          ordersPreserved: cur.ordersPreserved + (Number(res.data?.ordersPreserved) || 0),
          remaining: queue.slice(i + part.length),
        });
      } catch (error) {
        update({ error: errorMessage(error, "Silme isteği başarısız oldu"), remaining: queue.slice(i) });
        break;
      }
    }
    const result = runRef.current;
    if (mountedRef.current) {
      setPhase("done");
      setStopping(false);
    }
    // Yeşil bildirim yalnızca tam biten işlemde; yarıda kalan / durdurulan işlemde silinmeyen hesap sayısı da yazılır
    // (ekrandan ayrılınca pencere kapanır, bildirim tek geri bildirim olur)
    const left = result.remaining.length;
    const done = num(result.deleted.length);
    if (result.error) {
      toast.error(result.deleted.length ? `${done} hesap silindi · ${num(left)} hesap silinmedi (işlem yarıda kaldı)` : result.error, { duration: 7000 });
    } else if (result.stopped && left > 0) {
      toast(`${done} hesap silindi · ${num(left)} hesap silinmedi (${mountedRef.current ? "durduruldu" : "ekrandan ayrıldınız"})`, { duration: 7000 });
    } else if (result.deleted.length) {
      toast.success(`${done} hesap silindi · ${num(result.ordersPreserved)} sipariş korundu`);
    }
    if (!mountedRef.current) onClose?.(result);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!ready || phase !== "confirm") return;
    start(ids);
  };
  const stop = () => {
    stopRef.current = true;
    setStopping(true);
  };

  const pct = run.total ? Math.round((run.processed / run.total) * 100) : 0;
  const skippedGroups = groupSkipped(run.skipped);
  const remaining = run.remaining.length;
  const doneTone = run.error ? "danger" : run.stopped || run.skipped.length ? "warn" : "ok";

  // Tek hesapta kim silindiği açıkça yazılır (yanlış satıra tıklayan fark edebilsin); ad/iletişim yedekleri CleanupRow ile aynı
  const single = total === 1 && target ? target : null;
  const segmentText = `${SEGMENT_LABEL[segment] || ""} hesap`.trim();
  const subtitle = single
    ? [[single.email, single.phone].filter(Boolean).join(" · ") || "İletişim bilgisi yok", segmentText, `kesim ${months} ay`].join(" · ")
    : `${num(total)} ${segmentText} · kesim ${months} ay`;

  let title;
  if (phase === "confirm") title = single ? `${single.name || "İsimsiz müşteri"} hesabı kalıcı olarak silinecek` : `${num(total)} hesap kalıcı olarak silinecek`;
  else if (phase === "running") title = "Hesaplar siliniyor…";
  else if (run.error) title = run.deleted.length ? `${num(run.deleted.length)} hesap silindi, işlem yarıda kaldı` : "Silme tamamlanamadı";
  else if (run.stopped) title = `Durduruldu · ${num(run.deleted.length)} hesap silindi`;
  else title = `${num(run.deleted.length)} hesap silindi`;
  const HeadIcon = phase === "confirm" ? Trash2 : phase === "running" ? Loader2 : doneTone === "ok" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="ui-modal-backdrop ac-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form ref={dialogRef} className="ui-modal ac-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={descId} aria-busy={phase === "running"} onSubmit={submit} data-phase={phase}>
        <div className="ui-modal-header ac-modal-head">
          <span className="ac-modal-icon" data-tone={phase === "done" ? doneTone : phase === "running" ? "info" : "danger"} aria-hidden="true">
            <HeadIcon className={phase === "running" ? "ui-spin" : undefined} />
          </span>
          <div className="ac-modal-title">
            <h2 id={titleId}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={close} disabled={phase === "running"} aria-label="Kapat"><X /></button>
        </div>

        <div className="ui-modal-body ac-modal-body">
          {phase === "confirm" && (
            <>
              <div className="ac-tiles">
                <Tile label="Silinecek hesap" value={num(total)} tone="danger" />
                <Tile label="Korunacak sipariş" tone="ok"
                  value={preserved ? num(preserved.orders) : "Tümü"}
                  note={preserved ? (preserved.orders ? `${preserved.withOrders != null ? `${num(preserved.withOrders)} hesapta · ` : ""}${money(preserved.revenue)}` : "Seçilenlerin siparişi yok") : "Kesin sayı sonunda raporlanır"} />
              </div>
              <div className="ac-keep" id={descId}>
                <div className="ac-keep-col" data-tone="danger">
                  <h3><Trash2 aria-hidden="true" />Silinir</h3>
                  <ul>
                    <li>Hesap, giriş bilgileri ve oturumlar</li>
                    <li>Sohbetler, kayıtlı sepetler, fotokopi dosyaları</li>
                    <li>Kişiye özel kuponlar ve davet kayıtları</li>
                  </ul>
                </div>
                <div className="ac-keep-col" data-tone="ok">
                  <h3><ShieldCheck aria-hidden="true" />Korunur</h3>
                  <ul>
                    <li>Tüm siparişler ve ciro raporları (“Silinmiş hesap” olarak)</li>
                    <li>Geri bildirimler ve memnuniyet raporu</li>
                    <li>İşlem kaydı: kim, ne zaman, kaç hesap</li>
                  </ul>
                </div>
              </div>
              <div className="ui-banner ui-banner--danger ac-modal-banner" role="note">
                <AlertTriangle aria-hidden="true" />
                <span>Bu işlem <strong>geri alınamaz</strong>. Sunucu her hesabı silmeden önce yeniden kontrol eder; bu arada geri gelen ya da sipariş veren müşteriler atlanır.</span>
              </div>
              <div className="ac-confirm-field">
                <label htmlFor={inputId} className="ui-label">Onaylamak için <strong className="ac-word">{CONFIRM_WORD}</strong> yazın</label>
                <input id={inputId} ref={inputRef} className="ui-field ac-confirm-input" value={typed} onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} placeholder={CONFIRM_WORD}
                  aria-invalid={typed && !ready ? "true" : undefined} data-ok={ready || undefined} />
              </div>
            </>
          )}

          {phase !== "confirm" && (
            <div className="ac-run" id={descId}>
              <div className="ac-run-bar">
                <div className="ac-progress" role="progressbar" aria-label="Silme ilerlemesi" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.processed}
                  aria-valuetext={`${num(run.processed)} / ${num(run.total)} hesap işlendi`} data-tone={phase === "done" ? doneTone : undefined}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="ac-run-meta ui-num">
                  <span><strong>{num(run.processed)}</strong> / {num(run.total)} işlendi</span>
                  <span>%{pct}</span>
                </div>
                {phase === "running" && (
                  <p className="ac-run-step ui-hint">
                    {stopping ? "Gönderilen parça bitince duracak…" : `Parça ${num(run.chunk)} / ${num(run.chunks)} gönderiliyor (${DELETE_CHUNK}'şer hesap). Pencereyi kapatmayın.`}
                  </p>
                )}
              </div>
              <div className="ac-tiles ac-tiles--3" aria-live="polite">
                <Tile label="Silinen" value={num(run.deleted.length)} tone="ok" />
                <Tile label="Atlanan" value={num(run.skipped.length)} tone={run.skipped.length ? "warn" : undefined} />
                <Tile label="Korunan sipariş" value={num(run.ordersPreserved)} tone="info" />
              </div>
              {phase === "done" && skippedGroups.length > 0 && (
                <div className="ac-skips">
                  <h3>Atlanan hesaplar</h3>
                  <ul>
                    {skippedGroups.map((g) => (
                      <li key={g.reason}><span className="ui-badge ui-badge--warn ui-num">{num(g.count)}</span>{skipLabel(g.reason)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {phase === "done" && run.stopped && remaining > 0 && (
                <div className="ui-banner ui-banner--info ac-modal-banner" role="status">
                  <StopCircle aria-hidden="true" />
                  <span>Siz durdurdunuz. Kalan <strong className="ui-num">{num(remaining)}</strong> hesap silinmedi ve seçili kalacak.</span>
                </div>
              )}
              {phase === "done" && run.error && (
                <div className="ui-banner ui-banner--danger ac-modal-banner" role="alert">
                  <AlertTriangle aria-hidden="true" />
                  <span>{run.error}. <strong className="ui-num">{num(remaining)}</strong> hesap işlenemedi; tekrar deneyebilirsiniz.</span>
                </div>
              )}
              {phase === "done" && run.deleted.length > 0 && (
                <p className="ac-run-note"><PackageCheck aria-hidden="true" />Silinen hesapların siparişleri raporlarda “Silinmiş hesap” olarak duruyor.</p>
              )}
            </div>
          )}
        </div>

        <div className="ui-modal-footer ac-modal-foot">
          {phase === "confirm" && (
            <>
              <button type="button" className="ui-btn" onClick={close}>Vazgeç</button>
              <button type="submit" className="ui-btn ui-btn--danger" disabled={!ready}><Trash2 />{num(total)} hesabı sil</button>
            </>
          )}
          {phase === "running" && (
            <button type="button" className="ui-btn" onClick={stop} disabled={stopping} data-autofocus><StopCircle />{stopping ? "Durduruluyor…" : "Durdur"}</button>
          )}
          {phase === "done" && (
            <>
              {remaining > 0 && (
                <button type="button" className="ui-btn ui-btn--danger" onClick={() => start(run.remaining, runRef.current)}>
                  <Trash2 />Kalan {num(remaining)} hesabı sil
                </button>
              )}
              <button type="button" className="ui-btn ui-btn--primary" onClick={close} data-autofocus>Kapat</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
