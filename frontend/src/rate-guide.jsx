import { useState } from "react";
import { Dropdown, Input, Modal, Select, money, usePortal } from "./lib";
import {
  RATE_REFERENCE,
  RATE_SOURCES,
  rateInfo,
  findRates,
} from "./rate-reference.mjs";

export function RateSelect({
  label = "GST Rate (%)",
  value,
  onChange,
  date,
  compact = false,
  portal = false,
  ...props
}) {
  const ctx = usePortal(),
    [guide, setGuide] = useState(false);
  const selectedDate = date || `${ctx?.w?.period || "2026-10"}-01`;
  const selected = rateInfo(value, selectedDate);
  const options = RATE_REFERENCE.map((row) => ({
    value: row.rate,
    label: portal ? `${row.rate}%` : `${row.rate}% — ${row.title}`,
    description: portal ? undefined : row.area,
  }));
  return (
    <div className={`rate-select ${compact ? "compact" : ""}`}>
      {compact ? (
        <Dropdown
          {...props}
          aria-label={props["aria-label"] || label}
          value={value}
          options={options}
          onChange={onChange}
        />
      ) : (
        <Select
          {...props}
          label={label}
          value={value}
          options={options}
          onChange={onChange}
        />
      )}
      {!compact && !portal && selected && (
        <p className="rate-selection-help">
          {selected.area}
          <span>{selected.periodNote}</span>
        </p>
      )}
      <button
        type="button"
        className="link rate-guide-link"
        onClick={() => setGuide(true)}
      >
        VIEW ALL RATES &amp; THEIR USES
      </button>
      {guide && (
        <RateGuide date={selectedDate} onClose={() => setGuide(false)} />
      )}
    </div>
  );
}

export function RateGuideLink({ date }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="link rate-guide-link"
        onClick={() => setOpen(true)}
      >
        VIEW ALL RATES &amp; THEIR USES
      </button>
      {open && <RateGuide date={date} onClose={() => setOpen(false)} />}
    </>
  );
}

function RateGuide({ date, onClose }) {
  const [query, setQuery] = useState(""),
    [base, setBase] = useState("1000");
  const amount = Number(base),
    validAmount = base !== "" && Number.isFinite(amount) && amount >= 0;
  const rows = findRates(query);
  return (
    <Modal title="GST rates and where they apply" wide onClose={onClose}>
      <div className="rate-guide">
        <p className="rate-guide-context">
          Invoice / reference date: <strong>{date}</strong>. All 13 rate choices
          supported by this portal are explained below, including historical and
          special-purpose entries.
        </p>
        <p>
          The rate depends on the exact goods/service description, conditions
          and date. An HSN/SAC heading alone can contain more than one rate.
        </p>
        <div className="form-grid">
          <Input
            label="Find a rate or area"
            placeholder="e.g. gold, bricks, housing or 18%"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Input
            label="Example taxable value (₹)"
            type="number"
            min="0"
            step="0.01"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </div>
        <p className="rate-base-note">
          Tax examples apply the percentage to the taxable base you enter. For
          housing, distinguish the notified rate on the construction base from
          the effective rate on total consideration. Cess is separate.
        </p>
        <div className="rate-guide-list">
          {rows.map((row) => {
            const info = rateInfo(row.rate, date);
            return (
              <article key={row.rate} className="rate-guide-card">
                <div className="rate-pill">{row.rate}%</div>
                <div>
                  <h3>{row.title}</h3>
                  <p>
                    <strong>Where it applies:</strong> {row.area}
                  </p>
                  <p>{row.detail}</p>
                  <p className="rate-period-note">{info.periodNote}</p>
                  <div className="rate-split">
                    <span>
                      Intra-State: {info.cgst}% CGST + {info.sgst}% SGST
                    </span>
                    <span>Inter-State: {info.igst}% IGST</span>
                    <strong>
                      {validAmount
                        ? `Tax on ₹${money(amount)}: ₹${money((amount * row.rate) / 100)}`
                        : "Enter a valid taxable value to see the example."}
                    </strong>
                  </div>
                  <div className="rate-source-links">
                    {row.sources.map((key) => (
                      <a
                        key={key}
                        href={RATE_SOURCES[key].url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {RATE_SOURCES[key].title} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!rows.length && <p role="status">No matching rate or area.</p>}
        <p className="rate-guide-checked">
          Reference sources checked 27 October 2026. This guide explains the
          available choices; use the applicable notification for a specific
          transaction.
        </p>
      </div>
    </Modal>
  );
}
