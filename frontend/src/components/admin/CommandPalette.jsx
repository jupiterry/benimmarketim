import { useState, useEffect, useRef, useMemo } from "react";
import { Search, ArrowUpRight, X } from "lucide-react";
import { adminMenuGroups } from "./adminNavigation";

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  currentTab,
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialog = useRef(null);
  const input = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const commands = useMemo(
    () =>
      adminMenuGroups.flatMap((group) =>
        group.items.map((item) => ({ ...item, group: group.title })),
      ),
    [],
  );
  const filtered = commands.filter((item) =>
    `${item.label} ${item.group}`
      .toLocaleLowerCase("tr-TR")
      .includes(query.toLocaleLowerCase("tr-TR")),
  );
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setQuery("");
    setSelectedIndex(0);
    input.current?.focus();
    const key = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const items = dialog.current?.querySelectorAll("input, button");
        if (!items?.length) return;
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items[items.length - 1].focus();
        }
        if (
          !event.shiftKey &&
          document.activeElement === items[items.length - 1]
        ) {
          event.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [isOpen]);
  useEffect(() => {
    dialog.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  if (!isOpen) return null;
  const select = (id) => {
    onNavigate(id);
    onClose();
  };
  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Panelde ara"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette-input-wrapper">
          <Search size={21} />
          <input
            ref={input}
            className="command-palette-input"
            placeholder="Nereye gitmek istersiniz?"
            aria-label="Yönetim bölümü ara"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex(
                  (i) =>
                    (i + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) %
                    (filtered.length || 1),
                );
              }
              if (e.key === "Enter" && filtered[selectedIndex]) {
                e.preventDefault();
                select(filtered[selectedIndex].id);
              }
            }}
          />
          <button
            className="studio-icon-button"
            onClick={onClose}
            aria-label="Aramayı kapat"
          >
            <X size={19} />
          </button>
        </div>
        <div className="command-palette-results">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              data-selected={i === selectedIndex}
              className={`command-palette-item ${i === selectedIndex ? "is-selected" : ""}`}
              onClick={() => select(item.id)}
            >
              <item.icon size={19} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.group}</small>
              </span>
              {item.id === currentTab ? (
                <small>Şu an buradasınız</small>
              ) : (
                <ArrowUpRight size={16} />
              )}
            </button>
          ))}
          {!filtered.length && (
            <div className="studio-empty">
              <Search size={28} />
              <strong>Sonuç bulunamadı</strong>
              <p>Başka bir bölüm adıyla aramayı deneyin.</p>
            </div>
          )}
        </div>
        <footer>
          <span>
            ↑ ↓ Gezin <span>↵ Aç</span>
          </span>
          <span>Esc ile kapat</span>
        </footer>
      </section>
    </div>
  );
}
