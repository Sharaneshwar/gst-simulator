import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Btn,
  Input,
  Modal,
  Select,
  Table,
  usePortal,
  InlineLoader,
  TableSkeleton,
} from "./lib";

// Shared by registration, HSN summaries and document line items. The list lives
// outside scrolling tables so suggestions stay usable on small screens.
export function HsnSearch({
  value = "",
  onChange,
  onSelect,
  type = "",
  registration = false,
  minimumDigits = 4,
  label = "Search HSN / SAC",
  ariaLabel,
  required = false,
  compact = false,
  placeholder = "Search by product / service name or code",
}) {
  const [browser, setBrowser] = useState(false);
  const { api } = usePortal();
  const apiRef = useRef(api);
  apiRef.current = api;
  const id = useId(),
    wrapper = useRef(null),
    input = useRef(null),
    menu = useRef(null);
  const [query, setQuery] = useState(value),
    [open, setOpen] = useState(false);
  const [results, setResults] = useState([]),
    [total, setTotal] = useState(0);
  const [active, setActive] = useState(-1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [position, setPosition] = useState({});
  useEffect(() => setQuery(value), [value]);
  const validQuery = /^\d+$/.test(query.trim())
    ? query.trim().length >= 2
    : query.trim().length >= 3;
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 360), innerWidth - 24);
      const below = innerHeight - rect.bottom;
      const above = below < 180 && rect.top > below;
      setPosition({
        position: "fixed",
        width,
        left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
        ...(above
          ? { bottom: innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        maxHeight: Math.max(
          140,
          Math.min(360, (above ? rect.top : below) - 16),
        ),
      });
    };
    const outside = (e) => {
      if (
        !wrapper.current?.contains(e.target) &&
        !menu.current?.contains(e.target)
      )
        setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    let current = true;
    setResults([]);
    setTotal(0);
    setActive(-1);
    setError("");
    if (!open || !validQuery) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          type,
          registration: registration ? "1" : "0",
          minDigits: String(minimumDigits),
        });
        const result = await apiRef.current("/masters/hsn?" + params);
        if (current) {
          setResults(result.results);
          setTotal(result.total);
        }
      } catch (e) {
        if (current) setError(e.message);
      } finally {
        if (current) setLoading(false);
      }
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open, type, registration, minimumDigits, validQuery]);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const select = (record) => {
    setQuery(record.code);
    setOpen(false);
    setActive(-1);
    onSelect(record);
  };
  const field = (
    <input
      ref={input}
      id={id}
      role="combobox"
      aria-label={ariaLabel || label}
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined}
      aria-activedescendant={
        open && active >= 0 ? `${id}-${active}` : undefined
      }
      aria-describedby={`${id}-help`}
      autoComplete="off"
      placeholder={placeholder}
      maxLength={120}
      required={required}
      value={query}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!menu.current?.contains(e.relatedTarget)) setOpen(false);
      }}
      onChange={(e) => {
        setQuery(e.target.value);
        onChange?.(e.target.value);
        setOpen(true);
      }}
      onKeyDown={(e) => {
        if (loading && e.key !== "Escape") return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setOpen(true);
          if (!results.length) {
            setActive(-1);
            return;
          }
          setActive((old) =>
            Math.max(
              0,
              Math.min(
                results.length - 1,
                old + (e.key === "ArrowDown" ? 1 : -1),
              ),
            ),
          );
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
        if (e.key === "Enter" && open) {
          e.preventDefault();
          const record = results[active >= 0 ? active : 0];
          if (record) select(record);
        }
      }}
    />
  );
  return (
    <div
      className={`hsn-search ${compact ? "hsn-search-compact" : ""}`}
      ref={wrapper}
    >
      {compact ? (
        field
      ) : (
        <label className="field" htmlFor={id}>
          <span>
            {label}
            {required && <b className="required"> ●</b>}
          </span>
          {field}
        </label>
      )}
      {!compact && (
        <button
          type="button"
          className="link hsn-browse"
          onClick={() => {
            setOpen(false);
            setBrowser(true);
          }}
        >
          VIEW HSN / SAC CODE LIST
        </button>
      )}
      {browser && (
        <HsnBrowser
          type={type}
          registration={registration}
          minimumDigits={minimumDigits}
          onClose={() => setBrowser(false)}
          onSelect={(record) => {
            select(record);
            setBrowser(false);
          }}
        />
      )}
      <span
        id={`${id}-help`}
        className={compact ? "sr-only" : "hsn-search-help"}
      >
        Enter at least 2 digits or 3 letters.
      </span>
      {open &&
        createPortal(
          <div ref={menu} className="hsn-suggestions" style={position}>
            <div className="hsn-search-status" role="status">
              {error ||
                (loading ? (
                  <InlineLoader label="Searching HSN and SAC codes" />
                ) : !validQuery ? (
                  "Search by code or description."
                ) : !total ? (
                  "No matching HSN / SAC codes found."
                ) : (
                  `${total} matching ${total === 1 ? "code" : "codes"}`
                ))}
            </div>
            <ul
              id={`${id}-list`}
              role="listbox"
              aria-label="HSN / SAC search results"
            >
              {loading && (
                <li role="presentation">
                  <TableSkeleton
                    columns={2}
                    rows={3}
                    label="Loading search results"
                  />
                </li>
              )}
              {!loading &&
                results.map((record, i) => (
                  <li
                    id={`${id}-${i}`}
                    key={record.code}
                    role="option"
                    aria-selected={active === i}
                    className={active === i ? "active" : ""}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select(record)}
                  >
                    <strong>{record.code}</strong>
                    <span>{record.description}</span>
                    <small>{record.type}</small>
                  </li>
                ))}
            </ul>
            {!loading && total > results.length && (
              <p className="hsn-search-status">
                Showing the first {results.length} matches. Enter a longer code
                or description to narrow your search.
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function RegistrationGoods({ values, onChange }) {
  const classify = (row) =>
    ["Goods", "Services"].includes(row.type)
      ? row.type
      : String(row.hsn).startsWith("99")
        ? "Services"
        : "Goods";
  const records = (values.records || (values.hsn ? [values] : [])).filter(
    (row) => row.hsn || row.description,
  );
  const [type, setType] = useState("Goods"),
    [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  const rows = records.filter((row) => classify(row) === type);
  const update = (next) =>
    onChange(next.length ? { ...next[0], records: next } : { records: [] });
  function add(record) {
    setError("");
    setSelected(record);
    if (records.some((row) => row.hsn === record.code)) {
      setError("This code has already been added.");
      return;
    }
    if (rows.length >= 5) {
      setError(
        `You can select up to five ${type.toLowerCase()}. Delete an entry to choose another.`,
      );
      return;
    }
    update([
      ...records,
      { hsn: record.code, description: record.description, type: record.type },
    ]);
  }
  return (
    <div className="registration-goods">
      <div
        className="tabs registration-supply-tabs"
        role="tablist"
        aria-label="Type of supply"
      >
        {["Goods", "Services"].map((kind) => (
          <button
            type="button"
            role="tab"
            aria-selected={type === kind}
            key={kind}
            className={type === kind ? "active" : ""}
            onClick={() => {
              setType(kind);
              setSelected(null);
              setError("");
            }}
          >
            {kind}{" "}
            <span>
              ({records.filter((row) => classify(row) === kind).length}/5)
            </span>
          </button>
        ))}
      </div>
      <h3 className="registration-supply-heading">
        {type === "Goods"
          ? "Details of Goods / Commodities supplied by the business"
          : "Details of Services offered by the Business"}
      </h3>
      <p className="registration-supply-note">
        Please specify top 5 {type === "Goods" ? "commodities" : "services"}.
      </p>
      <div className="registration-code-search">
        <HsnSearch
          key={type}
          value={selected?.code || ""}
          type={type}
          registration
          label={
            type === "Goods"
              ? "Search HSN Chapter by Name or Code"
              : "Search by Name or Code"
          }
          placeholder={
            type === "Goods"
              ? "Enter a product name or 4-digit HSN code"
              : "Enter a service name or SAC code"
          }
          onSelect={add}
        />
      </div>
      <p className="hsn-registration-help">
        You can search by{" "}
        {type === "Goods"
          ? "product name, for example cotton or washing machines"
          : "service name, for example consulting or construction"}
        . The code is shown with its description.
      </p>
      {error && (
        <p className="hsn-selection-error" role="alert">
          {error}
        </p>
      )}
      <Table
        columns={[
          "Sl No",
          type === "Goods" ? "HSN Code (4 digit)" : "SAC Code",
          type === "Goods" ? "Description of Goods" : "Description of Services",
          "Action",
        ]}
        count={rows.length}
      >
        {rows.map((row, index) => (
          <tr key={row.hsn}>
            <td>{index + 1}</td>
            <td>{row.hsn}</td>
            <td className="hsn-description">{row.description}</td>
            <td>
              <Btn
                tone="danger"
                onClick={() => {
                  update(records.filter((item) => item !== row));
                  if (selected?.code === row.hsn) setSelected(null);
                  setError("");
                }}
              >
                DELETE
              </Btn>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function HsnBrowser({ type, registration, minimumDigits, onSelect, onClose }) {
  const { api } = usePortal(),
    apiRef = useRef(api);
  apiRef.current = api;
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState(type),
    [page, setPage] = useState(0),
    [result, setResult] = useState({ results: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const valid =
    !query.trim() ||
    (/^\d+$/.test(query.trim())
      ? query.trim().length >= 2
      : query.trim().length >= 3);
  useEffect(() => {
    let current = true;
    setError("");
    setResult({ results: [], total: 0 });
    if (!valid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          type: kind,
          registration: registration ? "1" : "0",
          browse: "1",
          minDigits: String(minimumDigits),
          offset: String(page * 20),
        });
        const response = await apiRef.current("/masters/hsn?" + params);
        if (current) setResult(response);
      } catch (e) {
        if (current) setError(e.message);
      } finally {
        if (current) setLoading(false);
      }
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, kind, page, registration, minimumDigits, valid]);
  return (
    <Modal title="HSN / SAC Code Directory" wide onClose={onClose}>
      <div className="hsn-directory">
        <p>
          Choose by the description of your goods or services. You do not need
          to know the code.
        </p>
        <Input
          label="Search by Product / Service Name or Code"
          placeholder="e.g. cotton, consulting or 5208"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        {!type && (
          <Select
            label="Type"
            value={kind}
            options={[["", "Goods and Services"], "Goods", "Services"]}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          />
        )}
        <p role="status">
          {error ||
            (loading ? (
              <InlineLoader label="Loading HSN and SAC directory" />
            ) : !valid ? (
              "Enter at least 2 digits or 3 letters, or clear the search to browse."
            ) : (
              `${result.total} ${kind ? kind.toLowerCase() + " " : ""}codes`
            ))}
        </p>
        {loading ? (
          <TableSkeleton
            columns={3}
            rows={5}
            label="Loading HSN and SAC directory"
          />
        ) : (
          <Table
            columns={["HSN / SAC", "Description", "Action"]}
            count={result.results.length}
            empty="No matching codes found."
          >
            {result.results.map((record) => (
              <tr key={record.code}>
                <td>
                  <strong>{record.code}</strong>
                  <small>{record.type}</small>
                </td>
                <td className="hsn-description">{record.description}</td>
                <td>
                  <Btn onClick={() => onSelect(record)}>SELECT</Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="actions hsn-directory-pages">
          <Btn
            tone="secondary"
            disabled={loading || page === 0}
            onClick={() => setPage(page - 1)}
          >
            PREVIOUS
          </Btn>
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(result.total / 20))}
          </span>
          <Btn
            tone="secondary"
            disabled={loading || (page + 1) * 20 >= result.total}
            onClick={() => setPage(page + 1)}
          >
            NEXT
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
