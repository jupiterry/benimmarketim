// Pilot kullanıcı seçici: müşterileri sunucuda arar (GET /users/search; ad, e-posta, telefon — Türkçe duyarsız);
// seçilenler çip olarak görünür. Tüm müşteri listesi indirilmez; yalnızca yazılan sorgu için en fazla 8 sonuç gelir.
// stats (pilot karnesinden, kullanıcı kimliği → adres siparişleri) verilirse çipte iletişim bilgisinin altında
// "3 sipariş · son: dün · 1 teslim edilemedi" satırı da görünür.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import axios from "../../lib/axios";
import { initials, timeAgo, useDebounced } from "../admin/ui";
import { num } from "./shared";

const MAX_RESULTS = 8;

/** Çipteki pilot sonucu satırı: kullanıcının adrese teslimat siparişleri */
const ChipStats = ({ stat, now }) => {
  if (!stat?.orders) return <span className="dz-sub dz-pilot-stat ui-truncate">Henüz adres siparişi yok</span>;
  return (
    <span className="dz-sub dz-pilot-stat ui-truncate">
      {num(stat.orders)} sipariş{stat.lastAt ? ` · son: ${timeAgo(stat.lastAt, now)}` : ""}
      {stat.failed > 0 && <span className="dz-pilot-failed"> · {num(stat.failed)} teslim edilemedi</span>}
    </span>
  );
};

const PilotPicker = ({ pilotUsers, busyId, onAdd, onRemove, disabled, stats = null, now = Date.now() }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState({ q: "", users: [], error: false });
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const listId = useId();
  const pilotIds = useMemo(() => new Set(pilotUsers.map((u) => String(u._id))), [pilotUsers]);
  const term = useDebounced(query.trim(), 250);

  // Sunucu araması (gecikmeli); eski yanıtlar iptal edilir. Pilotlar sonuçlardan çıkarılır.
  const excludeParam = useMemo(() => [...pilotIds].slice(0, 100).join(","), [pilotIds]);
  useEffect(() => {
    if (!term) { setFound({ q: "", users: [], error: false }); setSearching(false); return undefined; }
    const controller = new AbortController();
    setSearching(true);
    axios.get("/users/search", { params: { q: term, limit: MAX_RESULTS, exclude: excludeParam || undefined }, signal: controller.signal })
      .then(({ data }) => setFound({ q: term, users: Array.isArray(data?.users) ? data.users : [], error: false }))
      .catch(() => { if (!controller.signal.aborted) setFound({ q: term, users: [], error: true }); })
      .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    return () => controller.abort();
  }, [term, excludeParam]);

  const pending = query.trim() !== found.q || searching;
  const results = useMemo(
    () => (found.q && found.q === query.trim() ? found.users.filter((u) => !pilotIds.has(String(u._id))).slice(0, MAX_RESULTS) : []),
    [found, query, pilotIds],
  );
  useEffect(() => { setActive((i) => Math.min(i, Math.max(0, results.length - 1))); }, [results.length]);

  const pick = (user) => {
    if (!user) return;
    onAdd(user);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { if (open && results[active]) { e.preventDefault(); pick(results[active]); } }
    else if (e.key === "Escape" && (query || open)) { e.stopPropagation(); e.preventDefault(); setQuery(""); setOpen(false); }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="dz-pilot" id="dz-pilot">
      <div className="dz-pilot-head">
        <span className="dz-pilot-title" id={`${listId}-label`}>Pilot kullanıcılar <span className="ui-count">{pilotUsers.length}</span></span>
      </div>
      <div className="dz-combo">
        <label className="ui-search dz-combo-search">
          {searching ? <Loader2 className="ui-spin" /> : <Search />}
          <input ref={inputRef} id="dz-pilot-search" type="search" className="ui-field" placeholder="Müşteri ara: ad, e-posta ya da telefon" value={query}
            role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-labelledby={`${listId}-label`}
            aria-activedescendant={showList && results[active] ? `${listId}-${results[active]._id}` : undefined}
            disabled={disabled} data-esc-clear="1"
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown} />
        </label>
        {showList && (
          <ul className="dz-combo-list" id={listId} role="listbox" aria-label="Eşleşen müşteriler">
            {results.length === 0 ? (
              <li className="dz-combo-empty" role="presentation">{pending ? "Aranıyor…" : found.error ? "Arama yapılamadı. Bağlantıyı kontrol edip tekrar yazın." : "Eşleşen müşteri yok"}</li>
            ) : results.map((u, i) => (
              <li key={u._id} id={`${listId}-${u._id}`} role="option" aria-selected={i === active} className="dz-combo-item"
                onMouseDown={(e) => { e.preventDefault(); pick(u); }} onMouseEnter={() => setActive(i)}>
                <span className="ui-avatar dz-avatar" aria-hidden="true">{initials(u.name)}</span>
                <span className="dz-combo-text">
                  <span className="ui-truncate">{u.name || "İsimsiz müşteri"}</span>
                  <span className="dz-sub ui-truncate">{[u.email, u.phone].filter(Boolean).join(" · ") || "İletişim bilgisi yok"}</span>
                </span>
                <UserPlus aria-hidden="true" className="dz-combo-add" />
              </li>
            ))}
          </ul>
        )}
      </div>
      {pilotUsers.length > 0 ? (
        <ul className="dz-pilot-list" aria-label="Pilot kullanıcılar">
          {pilotUsers.map((u) => (
            <li key={u._id} className="dz-pilot-chip" data-stats={stats ? "true" : undefined}
              data-failed={stats?.get(String(u._id))?.failed > 0 || undefined}>
              <span className="ui-avatar dz-avatar" aria-hidden="true">{initials(u.name)}</span>
              <span className="dz-pilot-text">
                <span className="ui-truncate">{u.name || "İsimsiz müşteri"}</span>
                <span className="dz-sub ui-truncate">{u.phone || u.email || ""}</span>
                {stats && <ChipStats stat={stats.get(String(u._id))} now={now} />}
              </span>
              <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => onRemove(u)} disabled={disabled || busyId === String(u._id)}
                aria-label={`${u.name || "Kullanıcı"} pilottan çıkar`} title="Pilottan çıkar">
                {busyId === String(u._id) ? <Loader2 className="ui-spin" /> : <X />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ui-hint dz-pilot-empty">Henüz pilot kullanıcı yok. Kendi hesabınızı ve birkaç güvendiğiniz müşteriyi ekleyerek başlayın.</p>
      )}
    </div>
  );
};

export default PilotPicker;
