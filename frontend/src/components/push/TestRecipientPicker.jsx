import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, Search, Smartphone, Undo2, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../lib/axios";
import { InlineLoading, Skeleton, initials, useDebounced } from "../admin/ui";
import "../../styles/test-recipient.css";

const MIN_QUERY = 2;
const EMPTY_RESULTS = { loading: false, error: "", users: [], q: "" };

// Hesabın test bildirimi alıp alamayacağına dair kısa durum (sunucudaki hasPushTarget kuralı)
const statusOf = (person) => {
  if (!person) return null;
  if (person.pushEnabled === false) return { tone: "danger", text: "Bildirimler kapalı" };
  return person.hasPushTarget ? { tone: "ok", text: "Bildirim alabilir" } : { tone: "warn", text: "Telefonda oturum yok" };
};

/** Düğme metnindeki alıcı adı: "Test gönder · Benim Marketim". Uzun ad düğmeyi taşırmasın diye kısaltılır. */
export function RecipientTag({ name }) {
  if (!name) return null;
  return <span className="tr-tag" title={name}>· {name}</span>;
}

/**
 * "Test alıcısı" seçici: test bildirimlerinin gideceği hesabı gösterir, aranıp değiştirilir ya da "Kendim"e döner.
 * state: useTestRecipient() nesnesi (Bildirim gönder ekranı iki sekmeye aynı nesneyi verir).
 * compact: dar yan sütun (tek seferlik bildirimin gönderim kartı) için sıkı düzen.
 */
export default function TestRecipientPicker({ state, compact = false }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(EMPTY_RESULTS);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  const optionRefs = useRef([]);
  const debounced = useDebounced(query.trim(), 250);

  // GET /api/users/search?q=&limit=8 → { users: [{ _id, name, email, phone, role }] }
  useEffect(() => {
    if (!open) return undefined;
    if (debounced.length < MIN_QUERY) {
      setResults({ ...EMPTY_RESULTS, q: debounced });
      return undefined;
    }
    let cancelled = false;
    setResults((current) => ({ ...current, loading: true, error: "" }));
    axios.get("/users/search", { params: { q: debounced, limit: 8 } })
      .then(({ data }) => {
        if (!cancelled) setResults({ loading: false, error: "", users: Array.isArray(data?.users) ? data.users : [], q: debounced });
      })
      .catch((error) => {
        if (!cancelled) setResults({ loading: false, error: error.response?.data?.message || "Arama yapılamadı. Tekrar deneyin.", users: [], q: debounced });
      });
    return () => { cancelled = true; };
  }, [debounced, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY_RESULTS);
    if (restoreFocus) requestAnimationFrame(() => toggleRef.current?.focus());
  };

  const resetToSelf = async () => {
    if (state.saving) return;
    try {
      await state.save(null);
      toast.success("Testler artık size gidecek");
      close(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Test alıcısı kaydedilemedi");
    }
  };

  const choose = async (user) => {
    if (!user || state.saving) return;
    // Listede "Şu anki alıcı" işaretli satır: kaydetmeden kapanır. "Kendim" durumunda kendi kimliğini kaydetmek
    // alıcıyı sabitler ve öbür yöneticilerin testlerini de bu hesaba yönlendirir. Kayıtlı hesap silinmişse
    // kendini seçmek eski kaydı temizler ("Kendim" ile aynı).
    const current = !state.recipient ? state.self?._id === user._id : state.recipient._id === user._id;
    if (current) {
      if (!state.recipient && state.missing) resetToSelf();
      else close();
      return;
    }
    try {
      await state.save(user._id);
      toast.success(`Testler artık ${user.name || user.email || user.phone || "seçili"} hesabına gidecek`);
      close();
    } catch (error) {
      toast.error(error.response?.data?.message || "Test alıcısı kaydedilemedi");
    }
  };

  const focusOption = (index) => optionRefs.current[index]?.focus();
  const onInputKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" && results.users.length) {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Yalnızca yazılı metnin güncel sonucu seçilir (250 ms gecikmeli eski aramanın ilk sonucu değil)
      if (results.users.length && !results.loading && results.q === query.trim()) choose(results.users[0]);
    }
  };
  const onOptionKeyDown = (event, index) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(Math.min(index + 1, results.users.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else focusOption(index - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  if (!state.loaded) {
    if (state.error) {
      return (
        <div className="tr-picker" data-compact={compact}>
          <div className="tr-error" role="alert">
            <AlertTriangle aria-hidden="true" />
            <span className="tr-error-text">{state.error}</span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={state.load} disabled={state.loading}>Tekrar dene</button>
          </div>
        </div>
      );
    }
    return (
      <div className="tr-picker" data-compact={compact} aria-busy="true" aria-label="Test alıcısı yükleniyor">
        <Skeleton height={compact ? 38 : 44} radius={8} />
      </div>
    );
  }

  const isSelf = !state.recipient;
  const person = state.recipient || state.self;
  const status = statusOf(person);
  const name = isSelf
    ? (state.self?.name ? `${state.self.name} (siz)` : "Siz")
    : (person.name || person.email || person.phone || "Adsız hesap");
  const contact = person ? [person.email, person.phone].filter(Boolean).join(" · ") : "";
  const hint = state.missing
    ? "Seçtiğiniz hesap silinmiş; testler şimdilik size gidiyor. Başka bir hesap seçin ya da “Kendim” ile uyarıyı kaldırın."
    : status?.tone === "danger"
      ? "Bu hesapta bildirimler kapalı; test gönderilmez. Uygulamada bildirimleri açın ya da başka bir hesap seçin."
      : status?.tone === "warn"
        ? (isSelf
          ? "Bu hesapla mobil uygulamada oturum açıldığı görülmedi; test ulaşmaz. “Değiştir” ile telefonda kullandığınız hesabı seçin."
          : "Bu hesapla mobil uygulamada oturum açıldığı görülmedi; test ulaşmayabilir.")
        : "";
  const trimmed = query.trim();
  const pending = trimmed.length >= MIN_QUERY && (results.loading || results.q !== trimmed);
  const panelId = `${uid}-panel`;

  return (
    <div className="tr-picker" data-compact={compact} data-open={open}>
      <div className="tr-row">
        {!compact && <span className="tr-icon" aria-hidden="true"><Smartphone /></span>}
        <div className="tr-who">
          <span className="tr-label">Test alıcısı</span>
          <span className="tr-name-line">
            <strong className="tr-name" title={name}>{name}</strong>
            {status && <span className={`ui-badge ui-badge--${status.tone}`}>{status.text}</span>}
          </span>
          {contact && <span className="tr-contact" title={contact}>{contact}</span>}
        </div>
        <div className="tr-actions">
          <button ref={toggleRef} type="button" className="ui-btn ui-btn--sm" aria-expanded={open} aria-controls={panelId}
            onClick={() => (open ? close() : setOpen(true))} disabled={state.saving}>
            {open ? <X aria-hidden="true" /> : <UserRound aria-hidden="true" />}{open ? "Kapat" : "Değiştir"}
          </button>
          {(!isSelf || state.missing) && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={resetToSelf} disabled={state.saving}
              title="Testler giriş yaptığınız hesaba gitsin">
              <Undo2 aria-hidden="true" />Kendim
            </button>
          )}
        </div>
      </div>

      {hint && !open && (
        <p className="tr-hint" data-tone={state.missing ? "warn" : status?.tone}>
          <AlertTriangle aria-hidden="true" />{hint}
        </p>
      )}

      {open && (
        <div className="tr-panel" id={panelId}>
          <div className="ui-search">
            <Search aria-hidden="true" />
            <input ref={inputRef} className="ui-field" type="search" value={query} autoComplete="off" enterKeyHint="search"
              placeholder="Ad, e-posta ya da telefon" aria-label="Test alıcısı ara" aria-describedby={`${uid}-note`}
              onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKeyDown} />
          </div>
          <div id={`${uid}-note`} aria-live="polite">
            {trimmed.length < MIN_QUERY ? (
              <p className="tr-note">Telefonunda uygulamaya girilmiş ve bildirim izni verilmiş hesabı arayın (ör. mağaza telefonundaki hesap).</p>
            ) : results.error && !pending ? (
              <p className="tr-note" data-tone="danger" role="alert">{results.error}</p>
            ) : pending && !results.users.length ? (
              <p className="tr-note"><InlineLoading label="Aranıyor…" /></p>
            ) : !results.users.length ? (
              <p className="tr-note">“{trimmed}” ile eşleşen hesap yok.</p>
            ) : (
              <p className="tr-note tr-sr">{results.users.length} hesap bulundu</p>
            )}
          </div>
          {trimmed.length >= MIN_QUERY && results.users.length > 0 && (
            <ul className="tr-results" aria-label="Bulunan hesaplar" aria-busy={pending}>
              {results.users.map((user, index) => {
                const current = isSelf ? state.self?._id === user._id : state.recipient?._id === user._id;
                const sub = [user.email, user.phone].filter(Boolean).join(" · ");
                return (
                  <li key={user._id}>
                    <button type="button" className="tr-option" aria-current={current || undefined} disabled={state.saving}
                      ref={(element) => { optionRefs.current[index] = element; }}
                      onClick={() => choose(user)} onKeyDown={(event) => onOptionKeyDown(event, index)}>
                      <span className="ui-avatar tr-avatar" aria-hidden="true">{initials(user.name || user.email)}</span>
                      <span className="tr-option-text">
                        <span className="tr-option-name">
                          <span className="tr-option-title">{user.name || "Adsız hesap"}</span>
                          {user.role === "admin" && <span className="ui-badge ui-badge--info">Yönetici</span>}
                        </span>
                        {sub && <span className="tr-option-sub">{sub}</span>}
                      </span>
                      {current && <Check className="tr-option-check" aria-label="Şu anki alıcı" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
