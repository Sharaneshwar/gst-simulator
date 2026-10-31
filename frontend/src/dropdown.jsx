import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export function Dropdown({
  options = [],
  value = "",
  onChange,
  disabled = false,
  required = false,
  placeholder = "Select",
  id,
  name,
  className = "",
  searchable = true,
  ...props
}) {
  const generatedId = useId(),
    controlId = id || generatedId;
  const button = useRef(null),
    popup = useRef(null),
    search = useRef(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(-1),
    [position, setPosition] = useState({
      position: "fixed",
      visibility: "hidden",
    });
  const label = props["aria-label"] || "option";
  const items = useMemo(
    () =>
      options.map((o) =>
        Array.isArray(o)
          ? { value: String(o[0]), label: String(o[1]) }
          : typeof o === "object"
            ? { ...o, value: String(o.value), label: String(o.label) }
            : { value: String(o), label: String(o) },
      ),
    [options],
  );
  const selected = items.find((o) => o.value === String(value ?? ""));
  const filtered = items.filter((o) =>
    `${o.label} ${o.description || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const showSearch = searchable && items.length > 6;
  const show = (text = "") => {
    if (!disabled) {
      setQuery(text);
      setOpen(true);
    }
  };
  const close = (restore = false) => {
    setOpen(false);
    if (restore) button.current?.focus();
  };
  const choose = (item) => {
    if (!item || item.disabled) return;
    onChange?.({
      target: { value: item.value, name },
      currentTarget: { value: item.value, name },
    });
    close(true);
  };
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const index = filtered.findIndex(
      (o) => !o.disabled && o.value === String(value ?? ""),
    );
    setActive(index >= 0 ? index : filtered.findIndex((o) => !o.disabled));
  }, [open, query, value]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) {
        setOpen(false);
        return;
      }
      const width = Math.min(Math.max(r.width, 260), innerWidth - 24);
      const above =
        innerHeight - r.bottom < 220 && r.top > innerHeight - r.bottom;
      setPosition({
        position: "fixed",
        visibility: "visible",
        width,
        left: Math.max(12, Math.min(r.left, innerWidth - width - 12)),
        ...(above
          ? { bottom: innerHeight - r.top + 4 }
          : { top: r.bottom + 4 }),
        maxHeight: Math.max(
          140,
          Math.min(360, (above ? r.top : innerHeight - r.bottom) - 16),
        ),
      });
    };
    const outside = (e) => {
      if (
        !button.current?.contains(e.target) &&
        !popup.current?.contains(e.target)
      )
        close();
    };
    place();
    if (showSearch) search.current?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => {
    if (!open || active < 0 || position.visibility !== "visible") return;
    const option = document.getElementById(`${controlId}-option-${active}`),
      list = option?.closest(".portal-select-options");
    if (!option || !list) return;
    const row = option.getBoundingClientRect(),
      box = list.getBoundingClientRect();
    if (row.top < box.top) list.scrollTop += row.top - box.top;
    else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom;
  }, [open, active, position.visibility]);
  const keys = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      close(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (!open) {
        show();
        return;
      }
      const enabled = filtered
        .map((o, i) => (o.disabled ? -1 : i))
        .filter((i) => i >= 0);
      let next = enabled.indexOf(active);
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = enabled.length - 1;
      else
        next = Math.max(
          0,
          Math.min(enabled.length - 1, next + (e.key === "ArrowDown" ? 1 : -1)),
        );
      setActive(enabled[next] ?? -1);
      return;
    }
    if (
      open &&
      (e.key === "Enter" || (e.key === " " && e.target === button.current))
    ) {
      e.preventDefault();
      choose(filtered[active]);
    }
  };
  return (
    <div className={`portal-select ${className}`}>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
          disabled={disabled}
        />
      )}
      <button
        {...props}
        id={controlId}
        ref={button}
        type="button"
        className="portal-select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${controlId}-list` : undefined}
        aria-required={required || undefined}
        aria-activedescendant={
          open && !showSearch && active >= 0
            ? `${controlId}-option-${active}`
            : undefined
        }
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          keys(e);
          if (
            !open &&
            e.key.length === 1 &&
            e.key !== " " &&
            !e.ctrlKey &&
            !e.metaKey &&
            showSearch
          ) {
            e.preventDefault();
            show(e.key);
          }
        }}
      >
        <span className={selected ? "" : "placeholder"}>
          {selected?.label || placeholder}
        </span>
        <span className="select-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="portal-select-popup"
            style={position}
            onKeyDown={keys}
          >
            {showSearch && (
              <div className="portal-select-search">
                <input
                  ref={search}
                  aria-label={`Search ${label}`}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={`${controlId}-list`}
                  aria-activedescendant={
                    active >= 0 ? `${controlId}-option-${active}` : undefined
                  }
                  autoComplete="off"
                  placeholder="Type to search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <div
              className="portal-select-options"
              role="listbox"
              id={`${controlId}-list`}
              aria-label={`${label} options`}
            >
              {!filtered.length && (
                <p className="select-empty" role="status">
                  No matching options
                </p>
              )}
              {filtered.map((o, i) => (
                <div
                  key={o.value}
                  id={`${controlId}-option-${i}`}
                  role="option"
                  aria-selected={o.value === String(value ?? "")}
                  aria-disabled={o.disabled || undefined}
                  className={`portal-select-option ${active === i ? "active" : ""} ${o.disabled ? "disabled" : ""}`}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  <span className="select-option-content">
                    <span>{o.label}</span>
                    {o.description && <small>{o.description}</small>}
                  </span>
                  <span aria-hidden="true" className="select-tick">
                    {o.value === String(value ?? "") ? "✓" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>,
          button.current?.closest("dialog") || document.body,
        )}
    </div>
  );
}
