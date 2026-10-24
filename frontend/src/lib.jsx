import { createContext, useContext, useEffect, useRef, useState } from "react";
export const PortalContext = createContext(null);
export const usePortal = () => useContext(PortalContext);
export const HEADS = ["igst", "cgst", "sgst", "cess"];
export const money = (n) =>
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const total = (obj) =>
  HEADS.reduce((n, h) => n + Number(obj?.[h] || 0), 0);
export const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
export const periodLabel = (period) =>
  new Date(`${period}-01T12:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Other Territory",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Outside India",
  "Other State",
];
export const SECTIONS = [
  ["B2B", "4A, 4B, 6B, 6C", "B2B, SEZ, DE Invoices"],
  ["B2CL", "5A, 5B", "B2C (Large) Invoices"],
  ["EXP", "6A", "Exports Invoices"],
  ["B2CS", "7", "B2C (Others)"],
  ["NIL", "8A, 8B, 8C, 8D", "Nil Rated Supplies"],
  ["CDNR", "9B", "Credit / Debit Notes (Registered)"],
  ["CDNUR", "9B", "Credit / Debit Notes (Unregistered)"],
  ["AT", "11A(1), 11A(2)", "Tax Liability (Advances Received)"],
  ["TXP", "11B(1), 11B(2)", "Adjustment of Advances"],
  ["HSN", "12", "HSN-wise summary of outward supplies"],
  ["DOCS", "13", "Documents Issued"],
  ["ECO", "14, 15", "Supplies through E-Commerce Operators"],
  ["B2BA", "9A", "Amended B2B Invoices"],
  ["B2CLA", "9A", "Amended B2C (Large) Invoices"],
  ["EXPA", "9A", "Amended Exports Invoices"],
  ["CDNRA", "9C", "Amended Credit / Debit Notes (Registered)"],
  ["CDNURA", "9C", "Amended Credit / Debit Notes (Unregistered)"],
  ["ATA", "11A", "Amended Tax Liability (Advances)"],
  ["TXPA", "11B", "Amended Adjustment of Advances"],
  ["B2CSA", "10", "Amended B2C (Others)"],
  ["ECOA", "14A, 15A", "Amended E-Commerce Supplies"],
];
export const REG_TABS = [
  ["business", "Business Details"],
  ["promoters", "Promoter / Partners"],
  ["signatory", "Authorized Signatory"],
  ["representative", "Authorized Representative"],
  ["principal", "Principal Place of Business"],
  ["additional", "Additional Places of Business"],
  ["goods", "Goods and Services"],
  ["state", "State Specific Information"],
  ["aadhaar", "Aadhaar Authentication"],
  ["verification", "Verification"],
];
export function Btn({ children, tone = "primary", onClick, ...props }) {
  const [busy, setBusy] = useState(false);
  const ctx = usePortal();
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`btn ${tone} ${props.className || ""}`}
      onClick={
        onClick
          ? async (e) => {
              setBusy(true);
              ctx?.setError("");
              try {
                await onClick(e);
              } catch (error) {
                ctx?.setError(error.message);
              } finally {
                setBusy(false);
              }
            }
          : undefined
      }
    >
      {busy ? "PLEASE WAIT…" : children}
    </button>
  );
}
export function Field({ label, required, help, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span>
        {label}
        {required && <b className="required"> ●</b>}
      </span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}
export function Input({ label, required, help, ...props }) {
  return (
    <Field label={label} required={required} help={help}>
      <input {...props} required={required} />
    </Field>
  );
}
export function Select({ label, options, required, help, ...props }) {
  return (
    <Field label={label} required={required} help={help}>
      <select {...props} required={required}>
        <option value="">Select</option>
        {options.map((o) => (
          <option
            key={Array.isArray(o) ? o[0] : o}
            value={Array.isArray(o) ? o[0] : o}
          >
            {Array.isArray(o) ? o[1] : o}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Panel({ title, children, className = "", extra }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {extra}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
export function Crumbs({ items = [] }) {
  const { go, user } = usePortal();
  return (
    <div className="breadcrumbs">
      <button onClick={() => go(user ? "dashboard" : "home")}>
        {user ? "Dashboard" : "Home"}
      </button>
      {items.map((i, n) => (
        <span key={n}>
          ›{" "}
          {Array.isArray(i) ? (
            <button onClick={() => go(i[1])}>{i[0]}</button>
          ) : (
            i
          )}
        </span>
      ))}
    </div>
  );
}
export function TaxpayerBar() {
  const { active, w } = usePortal();
  return (
    <div className="taxpayer-bar">
      <span>
        GSTIN - <b>{active.state.taxpayer.gstin}</b>
      </span>
      <span>
        Legal Name - <b>{active.state.taxpayer.legalName}</b>
      </span>
      <span>
        FY -{" "}
        <b>
          {Number(w.period.slice(5)) >= 4
            ? `${w.period.slice(0, 4)}-${Number(w.period.slice(0, 4)) + 1}`
            : `${Number(w.period.slice(0, 4)) - 1}-${w.period.slice(0, 4)}`}
        </b>
      </span>
      <span>
        Return Period - <b>{periodLabel(w.period)}</b>
      </span>
    </div>
  );
}
export function Table({ columns, children, empty, count }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {count === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                {empty || "No records found."}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
export function HeadTable({ rows }) {
  return (
    <Table
      columns={[
        "Description",
        "Integrated Tax (₹)",
        "Central Tax (₹)",
        "State/UT Tax (₹)",
        "Cess (₹)",
      ]}
    >
      {rows.map(([name, values]) => (
        <tr key={name}>
          <td>{name}</td>
          {HEADS.map((h) => (
            <td className="number" key={h}>
              {money(values?.[h])}
            </td>
          ))}
        </tr>
      ))}
    </Table>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  const { error } = usePortal();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-body">
        {error && (
          <div className="modal-error" role="alert">
            {error}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
export function Signing({ title, onSubmit, onClose }) {
  const [form, setForm] = useState({
    declaration: false,
    signatory: "",
    method: "EVC",
    otp: "",
  });
  const [sent, setSent] = useState(false);
  const { active } = usePortal();
  return (
    <Modal title={title} onClose={onClose}>
      <label className="check-line">
        <input
          type="checkbox"
          checked={form.declaration}
          onChange={(e) => setForm({ ...form, declaration: e.target.checked })}
        />
        I hereby solemnly affirm and declare that the information given herein
        is true and correct to the best of my knowledge and belief.
      </label>
      <Select
        label="Authorized Signatory"
        required
        value={form.signatory}
        onChange={(e) => setForm({ ...form, signatory: e.target.value })}
        options={[active.state.taxpayer.legalName]}
      />
      <Select
        label="Filing method"
        value={form.method}
        onChange={(e) => setForm({ ...form, method: e.target.value })}
        options={["EVC", "DSC"]}
      />
      {!sent ? (
        <Btn
          disabled={!form.declaration || !form.signatory}
          onClick={() => setSent(true)}
        >
          {form.method === "EVC" ? "SEND OTP" : "SELECT CERTIFICATE"}
        </Btn>
      ) : (
        <>
          <p className="info">
            {form.method === "EVC"
              ? "Verification OTP"
              : "Certificate verification code"}
            : <b>123456</b>
          </p>
          <Input
            label="Verification code"
            required
            value={form.otp}
            onChange={(e) => setForm({ ...form, otp: e.target.value })}
            maxLength={6}
          />
          <div className="actions">
            <Btn tone="secondary" onClick={onClose}>
              CANCEL
            </Btn>
            <Btn
              onClick={async () => {
                await onSubmit(form);
                onClose();
              }}
            >
              VERIFY & FILE
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}
export function ReturnPreview({ type, onClose }) {
  const { active, w, p } = usePortal();
  const data = type === "GSTR-1" ? p.gstr1 : p.gstr3b;
  return (
    <Modal
      title={`${type} — ${data.status === "Filed" ? "Filed Return" : "Draft Preview"}`}
      wide
      onClose={onClose}
    >
      <div className="print-sheet">
        <h2>FORM {type}</h2>
        <p>{periodLabel(w.period)}</p>
        <TaxpayerBar />
        <p>
          Status: <b>{data.status}</b>
          {data.arn && (
            <>
              {" "}
              · ARN: <b>{data.arn}</b>
            </>
          )}
        </p>
        <HeadTable
          rows={
            type === "GSTR-1"
              ? [
                  [
                    "Tax on outward supplies",
                    p.gstr1.summary?.taxes || w.summary.taxes,
                  ],
                ]
              : [
                  [
                    "Outward tax",
                    p.gstr3b.tables["3.1"]?.taxes ||
                      (w.outwardSummary || w.summary).taxes,
                  ],
                  [
                    "Eligible ITC",
                    p.gstr3b.tables["4"]?.taxes || w.eligibleItc,
                  ],
                  ["Liability discharged", p.gstr3b.offset?.liability],
                ]
          }
        />
        <p>Taxable value: ₹ {money(w.summary.taxable)}</p>
        <p>{active.state.taxpayer.legalName}</p>
      </div>
      <div className="actions">
        <Btn tone="secondary" onClick={onClose}>
          CLOSE
        </Btn>
        <Btn onClick={() => window.print()}>PRINT / SAVE AS PDF</Btn>
      </div>
    </Modal>
  );
}
export function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
