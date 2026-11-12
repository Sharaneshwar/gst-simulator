import { ROWS_3B, TABLES_3B } from "./return-tables.mjs";
import { Spinner } from "./loading";
export {
  Spinner,
  Skeleton,
  InlineLoader,
  TableSkeleton,
  PageSkeleton,
  RequestProgress,
} from "./loading";
import { Dropdown } from "./dropdown";
export { Dropdown } from "./dropdown";
import { useEffect, useRef, useState } from "react";
import { usePortal } from "./portal-context";
export { PortalContext, usePortal } from "./portal-context";
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
  ["ECO", "14", "Supplies made through ECO"],
  ["ECO95", "15", "Supplies u/s 9(5)"],
  ["B2BA", "9A", "Amended B2B Invoices"],
  ["B2CLA", "9A", "Amended B2C (Large) Invoices"],
  ["EXPA", "9A", "Amended Exports Invoices"],
  ["CDNRA", "9C", "Amended Credit / Debit Notes (Registered)"],
  ["CDNURA", "9C", "Amended Credit / Debit Notes (Unregistered)"],
  ["ATA", "11A", "Amended Tax Liability (Advances)"],
  ["TXPA", "11B", "Amended Adjustment of Advances"],
  ["B2CSA", "10", "Amended B2C (Others)"],
  ["ECOA", "14A", "Amended Supplies made through ECO"],
  ["ECO95A", "15A", "Amended Supplies u/s 9(5)"],
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
export function Btn({
  children,
  tone = "primary",
  onClick,
  loading = false,
  ...props
}) {
  const [busy, setBusy] = useState(false);
  const ctx = usePortal();
  const pending = busy || loading;
  return (
    <button
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
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
      {pending && <Spinner />}
      {children}
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
      <Dropdown
        {...props}
        aria-label={props["aria-label"] || label}
        options={
          options.some((o) =>
            Array.isArray(o)
              ? String(o[0]) === ""
              : typeof o === "object"
                ? String(o.value) === ""
                : o === "",
          )
            ? options
            : [{ value: "", label: props.placeholder || "Select" }, ...options]
        }
        required={required}
      />
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
  if (active?.state.taxpayer.registrationRequired) return null;
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
  useEffect(() => {
    if (error && ref.current?.open) {
      const message = ref.current.querySelector(".modal-error");
      message?.focus({ preventScroll: true });
      message?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
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
          <div className="modal-error" role="alert" tabIndex={-1}>
            {error}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
export function OtpResend({ delivery, onResend }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(
    0,
    Math.ceil(((delivery?.resendAt || 0) - now) / 1000),
  );
  return (
    <Btn tone="secondary" disabled={seconds > 0} onClick={onResend}>
      {seconds ? `RESEND OTP IN ${seconds}s` : "RESEND OTP"}
    </Btn>
  );
}
export function Signing({ title, purpose, onSubmit, onClose }) {
  const { active, w, user, mutate } = usePortal();
  const recipient = user.email;
  const methods = (purpose === "registration-submit"
    ? w.registrationSigningMethods
    : w.filingSigningMethods) || ["EVC", "DSC"];
  const people =
    (purpose === "registration-submit"
      ? w.registrationSignatories
      : w.filingSignatories) || [];
  const [form, setForm] = useState({
    declaration: false,
    signatory: "",
    method: methods[0],
    email: recipient,
    otp: "",
    challengeId: "",
  });
  const [delivery, setDelivery] = useState(null);
  const signatoryName =
    purpose === "registration-submit"
      ? w.registration.tabs.signatory?.name || w.registration.partA.legalName
      : active.state.taxpayer.legalName;
  const send = async () => {
    const result = await mutate("signing/send", { purpose, ...form });
    setDelivery(result.otp);
    setForm((old) => ({
      ...old,
      challengeId: result.otp.challengeId,
      otp: "",
    }));
  };
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
        disabled={Boolean(delivery)}
        value={form.signatory}
        onChange={(e) => setForm({ ...form, signatory: e.target.value })}
        options={people.length ? people : [user.name || signatoryName]}
      />
      <Select
        label="Filing method"
        disabled={Boolean(delivery)}
        value={form.method}
        onChange={(e) => setForm({ ...form, method: e.target.value })}
        options={methods}
      />
      {methods.length === 1 && (
        <p className="info">
          This constitution of business requires DSC. Email verification
          completes the practice signing step.
        </p>
      )}
      <Input
        label="Email Address for OTP"
        type="email"
        required
        disabled={Boolean(delivery)}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        help="The verification code will be sent to this email address."
      />
      {!delivery && (!form.declaration || !form.signatory || !form.email) && (
        <p className="muted" id="signing-requirement" role="status">
          Select the declaration and authorized signatory, and enter an email
          address to enable SEND OTP.
        </p>
      )}
      {!delivery ? (
        <Btn
          aria-describedby={
            !form.declaration || !form.signatory || !form.email
              ? "signing-requirement"
              : undefined
          }
          disabled={!form.declaration || !form.signatory || !form.email}
          onClick={send}
        >
          SEND OTP
        </Btn>
      ) : (
        <>
          <p className="info">
            An OTP was emailed to <b>{delivery.recipient}</b>. It expires in 10
            minutes and can be used once.
          </p>
          <Input
            label="Verification code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={form.otp}
            onChange={(e) => setForm({ ...form, otp: e.target.value })}
            maxLength={6}
          />
          <OtpResend delivery={delivery} onResend={send} />
          {form.otp.length !== 6 && (
            <p className="muted" id="signing-otp-requirement" role="status">
              Enter the six-digit email OTP to enable VERIFY & FILE.
            </p>
          )}
          <div className="actions">
            <Btn tone="secondary" onClick={onClose}>
              CANCEL
            </Btn>
            <Btn
              disabled={!form.declaration || form.otp.length !== 6}
              aria-describedby={
                form.otp.length !== 6 ? "signing-otp-requirement" : undefined
              }
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
export function ReturnPreview({ type, onClose, systemGenerated = false }) {
  const { active, w, p } = usePortal();
  const data = type === "GSTR-1" ? p.gstr1 : p.gstr3b;
  const previewTables = {
    ...w.draft3b,
    ...(!systemGenerated ? p.gstr3b.tables : {}),
  };
  return (
    <Modal
      title={
        systemGenerated
          ? "System Generated GSTR-3B"
          : `${type} — ${data.status === "Filed" ? "Filed Return" : "Draft Preview"}`
      }
      wide
      onClose={onClose}
    >
      <div className="print-sheet">
        <h2>FORM {type}</h2>
        <p>{periodLabel(w.period)}</p>
        <TaxpayerBar />
        {systemGenerated && (
          <p>
            GSTR-1 source: {p.gstr1.status}. GSTR-2B:{" "}
            {p.gstr2b?.computedAt
              ? `Computed ${dateLabel(p.gstr2b.computedAt)}${w.gstr2bStale ? " (out of date)" : ""}`
              : "Not yet computed"}
            .
          </p>
        )}
        {systemGenerated && (
          <p className="info">
            System-computed figures from GSTR-1 and GSTR-2B, before your manual
            edits. Review the draft return separately before filing.
          </p>
        )}
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
                    (!systemGenerated && p.gstr3b.tables["3.1"]?.taxes) ||
                      w.draft3b?.["3.1"]?.taxes ||
                      (w.outwardSummary || w.summary).taxes,
                  ],
                  [
                    "Eligible ITC",
                    (!systemGenerated && p.gstr3b.tables["4"]?.taxes) ||
                      w.draft3b?.["4"]?.taxes ||
                      w.eligibleItc,
                  ],
                  ["Liability discharged", p.gstr3b.offset?.liability],
                ]
          }
        />
        {type === "GSTR-1"
          ? SECTIONS.map(([key, code, title]) => {
              const rows = (w.gstr1Invoices || p.invoices).filter(
                (i) => i.section === key,
              );
              if (!rows.length) return null;
              return (
                <section key={key}>
                  <h3>
                    {code} — {title}
                  </h3>
                  <Table
                    columns={[
                      "Document / Reference",
                      "Date",
                      "GSTIN / Category",
                      "Taxable / Supply Value",
                      ...HEADS.map((h) => h.toUpperCase()),
                    ]}
                    count={rows.length}
                  >
                    {rows.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.number}
                          {i.hsn ? ` · HSN ${i.hsn}` : ""}
                          {i.section === "DOCS"
                            ? ` · ${i.fromSerial}–${i.toSerial}; Issued ${i.issued}; Cancelled ${i.cancelled}`
                            : ""}
                        </td>
                        <td>{dateLabel(i.date)}</td>
                        <td>
                          {i.gstin ||
                            [i.recipientType, i.nilType]
                              .filter(Boolean)
                              .join(" · ") ||
                            i.place}
                        </td>
                        <td>{money(i.taxable)}</td>
                        {HEADS.map((h) => (
                          <td key={h}>{money(i.taxes[h])}</td>
                        ))}
                      </tr>
                    ))}
                  </Table>
                </section>
              );
            })
          : TABLES_3B.map(([key]) => [
              key,
              previewTables[key] || { rows: {} },
            ]).map(([key, table]) => (
              <section key={key}>
                <h3>
                  Table {key} — {TABLES_3B.find(([code]) => code === key)?.[1]}
                </h3>
                <Table
                  columns={[
                    "Particulars / Place of Supply",
                    "Taxable Value / Supplies",
                    ...HEADS.map((h) => h.toUpperCase()),
                  ]}
                >
                  {(key === "3.2" && table.states?.length
                    ? table.states.map((row) => [row.place, row])
                    : (ROWS_3B[key] || []).map(([code]) => [
                        code,
                        table.rows?.[code] || {
                          taxable: 0,
                          taxes: key === "4" && code === "c" ? table.taxes : {},
                        },
                      ])
                  ).map(([name, row]) => (
                    <tr key={name}>
                      <td>
                        {ROWS_3B[key]?.find(([code]) => code === name)?.[1] ||
                          name}
                      </td>
                      <td>{money(row.taxable)}</td>
                      {HEADS.map((h) => (
                        <td key={h}>{money(row.taxes?.[h])}</td>
                      ))}
                    </tr>
                  ))}
                </Table>
              </section>
            ))}
        <p>
          Taxable value: ₹{" "}
          {money(
            type === "GSTR-1" ? w.summary.taxable : w.outwardSummary.taxable,
          )}
        </p>
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
