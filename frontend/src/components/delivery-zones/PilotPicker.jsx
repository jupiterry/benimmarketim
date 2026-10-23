// Pilot kullanıcı seçici: müşteri listesinde (ad, e-posta, telefon) arar; seçilenler çip olarak görünür.
import { useId, useMemo, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { fold, initials } from "../admin/ui";

const MAX_RESULTS = 8;

const PilotPicker = ({ users, usersLoading, pilotUsers, busyId, onAdd, onRemove, onNeedUsers, disabled }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const pilotIds = useMemo(() => new Set(pilotUsers.map((u) => String(u._id))), [pilotUsers]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return [];
    const digits = query.replace(/\D/g, "");
    const out = [];
    for (const u of users || []) {
      if (pilotIds.has(String(u._id))) continue;
      const hay = fold(`${u.name || ""} ${u.email || ""}`);
      const phone = String(u.phone || "").replace(/\D/g, "");
      if (hay.includes(q) || (digits.length >= 3 && phone.includes(digits))) out.push(u);
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }, [query, users, pilotIds]);

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
    <div className="dz-pilot">
      <div className="dz-pilot-head">
        <span className="dz-pilot-title" id={`${listId}-label`}>Pilot kullanıcılar <span className="ui-count">{pilotUsers.length}</span></span>
      </div>
      <div className="dz-combo">
        <label className="ui-search dz-combo-search">
          {usersLoading ? <Loader2 className="ui-spin" /> : <Search />}
          <input ref={inputRef} type="search" className="ui-field" placeholder="Müşteri ara: ad, e-posta ya da telefon" value={query}
            role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" aria-labelledby={`${listId}-label`}
            aria-activedescendant={showList && results[active] ? `${listId}-${results[active]._id}` : undefined}
            disabled={disabled} data-esc-clear="1"
            onFocus={() => { setOpen(true); onNeedUsers?.(); }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown} />
        </label>
        {showList && (
          <ul className="dz-combo-list" id={listId} role="listbox" aria-label="Eşleşen müşteriler">
            {results.length === 0 ? (
              <li className="dz-combo-empty" role="presentation">{usersLoading ? "Müşteriler yükleniyor…" : "Eşleşen müşteri yok"}</li>
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
            <li key={u._id} className="dz-pilot-chip">
              <span className="ui-avatar dz-avatar" aria-hidden="true">{initials(u.name)}</span>
              <span className="dz-pilot-text">
                <span className="ui-truncate">{u.name || "İsimsiz müşteri"}</span>
                <span className="dz-sub ui-truncate">{u.phone || u.email || ""}</span>
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
