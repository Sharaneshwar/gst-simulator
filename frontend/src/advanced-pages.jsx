import { RecomputeStatement } from "./statement-refresh";
import { useEffect, useRef, useState } from "react";
import {
  Btn,
  Crumbs,
  HEADS,
  HeadTable,
  Input,
  Modal,
  Panel,
  Select,
  Signing,
  Spinner,
  Table,
  TaxpayerBar,
  dateLabel,
  download,
  money,
  total,
  usePortal,
} from "./lib";
import { GST_STATE_OPTIONS, stateFromGstin } from "./gst-states.mjs";
import { InvoiceRateGrid } from "./invoice-rate-grid";
import { HsnSearch } from "./hsn-search";
const RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
const CATEGORIES = ["tax", "interest", "penalty", "fee", "others"];

export function PortalDate() {
  const { w, mutate } = usePortal();
  const [date, setDate] = useState(w.portalDate || "");
  return (
    <div className="portal-date-control">
      <Input
        label="Processing date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        help="Used for reporting deadlines, statement generation and interest calculation."
      />
      <Btn
        tone="secondary"
        disabled={!date || date === w.portalDate}
        onClick={() => mutate("calendar/date", { date })}
      >
        APPLY DATE
      </Btn>
    </div>
  );
}

export function Ecommerce({ section }) {
  const { w, p, active, mutate, go } = usePortal();
  const base = section.endsWith("A") ? section.slice(0, -1) : section,
    amended = section.endsWith("A"),
    disclosure = base === "ECO";
  const options =
    w.ecoOptions?.[base] ||
    (disclosure
      ? [
          ["52", "Liable to collect tax u/s 52 (TCS)"],
          ["95", "Liable to pay tax u/s 9(5)"],
        ]
      : [
          ["B2B", "Registered to Registered"],
          ["B2C", "Registered to Unregistered"],
          ["URP2B", "Unregistered to Registered"],
          ["URP2C", "Unregistered to Unregistered"],
        ]);
  const [bucket, setBucket] = useState(options[0][0]),
    [form, setForm] = useState(null),
    [query, setQuery] = useState(""),
    [originalPeriod, setOriginalPeriod] = useState(""),
    [originalNumber, setOriginalNumber] = useState("");
  const aggregate = disclosure || ["B2C", "URP2C"].includes(bucket);
  const locked =
    p.gstr1.status === "Filed" ||
    (w.filingFrequency === "QRMP" &&
      w.periods[w.returnInfo?.end]?.gstr1.status === "Filed");
  const rows = (w.gstr1Invoices || p.invoices).filter(
    (i) =>
      i.section === section &&
      (i.ecoBucket || "52") === bucket &&
      JSON.stringify([
        i.number,
        i.gstin,
        i.supplierGstin,
        i.recipientGstin,
        i.operatorGstin,
      ])
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const title = `${disclosure ? "14" : "15"}${amended ? "A" : ""} — ${disclosure ? "Supplies made through ECO" : "Supplies u/s 9(5)"}`;
  const empty = () => ({
    section,
    ecoBucket: bucket,
    operatorGstin: "",
    supplierGstin: "",
    recipientGstin: "",
    supplierState: active.state.taxpayer.state,
    place: active.state.taxpayer.state,
    number: "",
    date: `${w.period}-01`,
    taxable: "",
    rate: 18,
    reportedTaxes: Object.fromEntries(HEADS.map((h) => [h, 0])),
    supplyCategory: "Regular",
  });
  const field = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const earlier = Object.entries(w.periods).filter(
    ([period, data]) => period < w.period && data.gstr1.status === "Filed",
  );
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], ["GSTR-1", "gstr1"], title]} />
      <h1>{title}</h1>
      <TaxpayerBar />
      <div className="tabs">
        {options.map(([key, label]) => (
          <button
            key={key}
            className={bucket === key ? "active" : ""}
            onClick={() => {
              setBucket(key);
              setForm(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {disclosure && (
        <p className="info">
          These disclosures are shown separately in the consolidated statement
          and do not add to the supplier’s outward tax liability.
        </p>
      )}
      {amended && aggregate && !disclosure && (
        <p className="info">
          To change Place of Supply, amend the original POS to zero and save it
          first. Find the original again, choose the new POS and save the new
          values.
        </p>
      )}
      {amended && !form && (
        <Panel title="Find Original Record">
          <div className="form-grid">
            <Select
              label="Original Month / Quarter"
              options={earlier.map(([period]) => period)}
              value={originalPeriod}
              onChange={(e) => setOriginalPeriod(e.target.value)}
            />
            <Input
              label={
                disclosure
                  ? "GSTIN of e-commerce operator"
                  : "Original Document No. / Supplier GSTIN / POS"
              }
              value={originalNumber}
              onChange={(e) => setOriginalNumber(e.target.value)}
            />
          </div>
          <Btn
            disabled={locked || !originalPeriod || !originalNumber}
            onClick={() => {
              const original = w.periods[originalPeriod]?.invoices.find(
                (i) =>
                  i.section === base &&
                  (i.ecoBucket || "52") === bucket &&
                  [
                    i.number,
                    i.operatorGstin,
                    i.supplierGstin,
                    i.place,
                  ].includes(originalNumber.trim()),
              );
              if (!original)
                throw Error(
                  "No matching record in that filed return and supply tab.",
                );
              setForm({
                ...original,
                id: undefined,
                section,
                ecoBucket: bucket,
                originalId: original.id,
                originalNumber: original.number,
                originalPeriod,
                reportedTaxes: { ...original.taxes },
              });
            }}
          >
            AMEND RECORD
          </Btn>
        </Panel>
      )}
      <Panel
        title={
          form
            ? form.id
              ? "Edit Details"
              : "Add Details"
            : "Processed Records"
        }
      >
        {!form ? (
          <>
            <div className="filter-row">
              <Input
                label="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {!amended && (
                <Btn disabled={locked} onClick={() => setForm(empty())}>
                  ADD RECORD
                </Btn>
              )}
            </div>
            <Table
              columns={[
                disclosure ? "ECO GSTIN" : "Supplier / Recipient",
                "Document / POS",
                "Net value (₹)",
                ...HEADS.map((h) => h.toUpperCase()),
                "Actions",
              ]}
              count={rows.length}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.operatorGstin || row.gstin || row.supplierGstin}
                    <br />
                    {row.recipientGstin}
                  </td>
                  <td>{aggregate ? row.place : row.number}</td>
                  <td>{money(row.taxable)}</td>
                  {HEADS.map((h) => (
                    <td key={h}>{money(row.taxes?.[h])}</td>
                  ))}
                  <td>
                    <Btn
                      tone="secondary"
                      disabled={locked}
                      onClick={() =>
                        setForm({ ...row, reportedTaxes: { ...row.taxes } })
                      }
                    >
                      EDIT
                    </Btn>
                    <Btn
                      tone="danger"
                      disabled={locked}
                      onClick={() => mutate("invoice/delete", { id: row.id })}
                    >
                      DELETE
                    </Btn>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        ) : (
          <>
            <div className="form-grid">
              {disclosure ? (
                <Input
                  label="GSTIN of e-commerce operator"
                  required
                  value={form.operatorGstin || form.gstin || ""}
                  onChange={(e) =>
                    field("operatorGstin", e.target.value.toUpperCase())
                  }
                />
              ) : (
                <>
                  {["B2B", "B2C"].includes(bucket) ? (
                    <Input
                      label="Supplier GSTIN/UIN"
                      required
                      value={form.supplierGstin || ""}
                      onChange={(e) =>
                        field("supplierGstin", e.target.value.toUpperCase())
                      }
                    />
                  ) : (
                    <Select
                      label="Supplier State / UT"
                      options={GST_STATE_OPTIONS}
                      value={form.supplierState || active.state.taxpayer.state}
                      onChange={(e) => field("supplierState", e.target.value)}
                    />
                  )}
                  {["B2B", "URP2B"].includes(bucket) && (
                    <Input
                      label="Recipient GSTIN/UIN"
                      required
                      value={form.recipientGstin || ""}
                      onChange={(e) =>
                        field("recipientGstin", e.target.value.toUpperCase())
                      }
                    />
                  )}
                  <Select
                    label="Place of Supply"
                    required
                    options={GST_STATE_OPTIONS}
                    value={form.place}
                    onChange={(e) => field("place", e.target.value)}
                  />
                  <Select
                    label="Supply Category"
                    options={[
                      ["Regular", "Regular"],
                      ["DeemedExport", "Deemed Exports"],
                      ["SEZWP", "SEZ supplies with payment"],
                      ["SEZWOP", "SEZ supplies without payment"],
                    ]}
                    value={form.supplyCategory || "Regular"}
                    onChange={(e) => field("supplyCategory", e.target.value)}
                  />
                </>
              )}
              {!aggregate && (
                <>
                  <Input
                    label="Document number"
                    required
                    value={form.number}
                    maxLength="16"
                    onChange={(e) => field("number", e.target.value)}
                  />
                  <Input
                    label="Document date"
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => field("date", e.target.value)}
                  />
                  <Input
                    label="Total value of supplies made (₹)"
                    type="number"
                    min="0"
                    value={form.invoiceValue ?? ""}
                    onChange={(e) => field("invoiceValue", e.target.value)}
                  />
                </>
              )}
              {aggregate && (
                <>
                  <Input
                    label="Net value of supplies (₹)"
                    required
                    type="number"
                    step=".01"
                    value={form.taxable}
                    onChange={(e) => field("taxable", e.target.value)}
                  />
                  {!disclosure && (
                    <Select
                      label="Rate (%)"
                      options={RATES}
                      value={form.rate}
                      onChange={(e) => field("rate", Number(e.target.value))}
                    />
                  )}
                </>
              )}
            </div>
            {aggregate ? (
              <div className="form-grid">
                {HEADS.map((h) => (
                  <Input
                    key={h}
                    label={`${h.toUpperCase()} (₹)`}
                    type="number"
                    step=".01"
                    value={form.reportedTaxes?.[h] ?? form.taxes?.[h] ?? 0}
                    onChange={(e) =>
                      field("reportedTaxes", {
                        ...(form.reportedTaxes || form.taxes),
                        [h]: e.target.value,
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <InvoiceRateGrid
                invoice={form}
                homeState={
                  stateFromGstin(form.supplierGstin) ||
                  form.supplierState ||
                  active.state.taxpayer.state
                }
                onChange={setForm}
                disabled={locked}
              />
            )}
            <div className="actions">
              <Btn
                disabled={locked}
                onClick={async () => {
                  await mutate("eco/save", {
                    invoice: { ...form, section, ecoBucket: bucket },
                  });
                  setForm(null);
                }}
              >
                SAVE
              </Btn>
              <Btn tone="secondary" onClick={() => setForm(null)}>
                CANCEL
              </Btn>
            </div>
          </>
        )}
      </Panel>
      <Btn tone="secondary" onClick={() => go("gstr1")}>
        BACK TO GSTR-1
      </Btn>
    </div>
  );
}

export function IMS() {
  const { w, p, mutate, go } = usePortal();
  const [status, setStatus] = useState("All"),
    [type, setType] = useState("All"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState([]),
    [action, setAction] = useState(null),
    [remark, setRemark] = useState(""),
    [reductions, setReductions] = useState({});
  const all = w.imsRecords || [],
    locked = ["Offset", "Filed"].includes(p.gstr3b.status);
  const rows = all.filter(
    (r) =>
      (status === "All" || r.imsAction === status) &&
      (type === "All" || (r.documentType || "Invoice") === type) &&
      `${r.number} ${r.gstin} ${r.supplier}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const chosen = all.filter((r) => selected.includes(r.id));
  return (
    <div className="container">
      <Crumbs
        items={[
          "Services",
          ["Returns", "returns"],
          "Invoice Management System",
        ]}
      />
      <h1>Invoice Management System</h1>
      <TaxpayerBar />
      <div className="tabs">
        {["All", "No Action", "Accepted", "Rejected", "Pending"].map(
          (value) => (
            <button
              key={value}
              className={value === status ? "active" : ""}
              onClick={() => setStatus(value)}
            >
              {value} (
              {value === "All"
                ? all.length
                : all.filter((r) => r.imsAction === value).length}
              )
            </button>
          ),
        )}
      </div>
      {w.gstr2bRefreshBlocked && (
        <p className="info" role="status">
          {w.gstr2bRefreshBlocked}
        </p>
      )}
      {w.gstr2bStale && (
        <p className="info" role="status">
          IMS changes are not yet reflected in GSTR-2B. Recompute the statement
          before proceeding to GSTR-3B.
        </p>
      )}
      <Panel title="Inward Supplies">
        <div className="filter-row">
          <Input
            label="Search Supplier / Document"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            label="Document Type"
            options={["All", "Invoice", "Credit Note", "Debit Note"]}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </div>
        <Table
          columns={[
            "Select",
            "Supplier / GSTIN",
            "Document / Period",
            "Taxable (₹)",
            "GST (₹)",
            "Supplier Status",
            "IMS Action",
            "Remarks / Availability",
          ]}
          count={rows.length}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  aria-label={`Select ${r.number}`}
                  type="checkbox"
                  disabled={locked || !!r.itcReason || r.reverseCharge}
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, r.id]
                        : old.filter((id) => id !== r.id),
                    )
                  }
                />
              </td>
              <td>
                {r.supplier}
                <br />
                {r.gstin}
              </td>
              <td>
                {r.number}
                <br />
                {r.documentType || "Invoice"} · {r.sourcePeriod}
              </td>
              <td>{money(r.taxable)}</td>
              <td>{money(total(r.taxes))}</td>
              <td>
                {r.supplierFiled === false ? (
                  <>
                    <span>Saved</span>
                    <Btn
                      tone="secondary"
                      disabled={locked}
                      onClick={() => mutate("ims/supplier-filed", { id: r.id })}
                    >
                      REFRESH SUPPLIER FILING
                    </Btn>
                  </>
                ) : (
                  "Filed"
                )}
              </td>
              <td>{r.imsAction}</td>
              <td>
                {r.itcReason ||
                  (r.reverseCharge
                    ? "Reverse charge — outside IMS actions"
                    : r.imsRemark || "—")}
                {r.pendingThrough && (
                  <small>Pending through {r.pendingThrough}</small>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <div className="actions">
          {[
            ["Accepted", "ACCEPT"],
            ["Rejected", "REJECT"],
            ["Pending", "PENDING"],
            ["No Action", "RESET ACTION"],
          ].map(([value, label]) => (
            <Btn
              key={value}
              tone={value === "Rejected" ? "danger" : "secondary"}
              disabled={locked || !selected.length}
              onClick={() => {
                setAction(value);
                setReductions(
                  Object.fromEntries(
                    chosen
                      .filter((r) => r.documentType === "Credit Note")
                      .map((r) => [r.id, { ...r.taxes }]),
                  ),
                );
              }}
            >
              {label}
            </Btn>
          ))}
          <RecomputeStatement />
          <Btn tone="secondary" onClick={() => go("gstr2b")}>
            VIEW GSTR-2B
          </Btn>
          <Btn
            tone="secondary"
            onClick={() => download("ims-records.json", all)}
          >
            DOWNLOAD DETAILS
          </Btn>
        </div>
      </Panel>
      {action && (
        <Modal
          title={`${action} — ${chosen.length} selected records`}
          onClose={() => setAction(null)}
        >
          <p>Review the selected documents before saving this action.</p>
          {["Rejected", "Pending"].includes(action) && (
            <Input
              label="Remarks"
              value={remark}
              maxLength="500"
              onChange={(e) => setRemark(e.target.value)}
            />
          )}
          {action === "Accepted" &&
            chosen
              .filter((r) => r.documentType === "Credit Note")
              .map((r) => (
                <Panel
                  key={r.id}
                  title={`${r.number} — Amount of ITC to be reduced`}
                >
                  <p>
                    Enter only the ITC requiring reduction. Enter zero where
                    credit was already reversed or never availed.
                  </p>
                  <div className="form-grid">
                    {HEADS.map((h) => (
                      <Input
                        key={h}
                        label={`${h.toUpperCase()} (₹)`}
                        type="number"
                        min="0"
                        max={r.taxes[h]}
                        step=".01"
                        value={reductions[r.id]?.[h] ?? r.taxes[h]}
                        onChange={(e) =>
                          setReductions((old) => ({
                            ...old,
                            [r.id]: { ...old[r.id], [h]: e.target.value },
                          }))
                        }
                      />
                    ))}
                  </div>
                </Panel>
              ))}
          <div className="actions">
            <Btn
              onClick={async () => {
                await mutate("ims/action", {
                  ids: selected,
                  action,
                  remark,
                  reductions,
                });
                setAction(null);
                setSelected([]);
              }}
            >
              SAVE ACTION
            </Btn>
            <Btn tone="secondary" onClick={() => setAction(null)}>
              CANCEL
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function CashTransfer() {
  const { w, active, mutate, go } = usePortal();
  const empty = () => ({
    fromHead: "igst",
    fromCategory: "tax",
    toHead: "cgst",
    toCategory: "tax",
    amount: "",
  });
  const [form, setForm] = useState(empty),
    [rows, setRows] = useState(w.pmt09Draft?.rows || []),
    [preview, setPreview] = useState(null),
    [signing, setSigning] = useState(false),
    [selected, setSelected] = useState(null);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const balanceTable = (balances, title) => (
    <Panel title={title}>
      <Table
        columns={["Minor Head", ...HEADS.map((h) => h.toUpperCase())]}
        count={5}
      >
        {CATEGORIES.map((c) => (
          <tr key={c}>
            <td>{c[0].toUpperCase() + c.slice(1)}</td>
            {HEADS.map((h) => (
              <td key={h}>{money(balances?.[c]?.[h])}</td>
            ))}
          </tr>
        ))}
      </Table>
    </Panel>
  );
  return (
    <div className="container">
      <Crumbs items={["Services", ["Ledgers", "ledgers"], "File GST PMT-09"]} />
      <h1>GST PMT-09 — Transfer of amount within the same GSTIN</h1>
      <TaxpayerBar />
      {balanceTable(
        w.cashBalances,
        "Cash Ledger Balance — Available for Transfer",
      )}
      {balanceTable(
        preview?.updated || w.cashBalances,
        "Cash Ledger Balance — Preview of Updated Balance",
      )}
      <Panel title="Add Record">
        <div className="form-grid">
          {[
            [
              "fromHead",
              "Transfer from — Major Head",
              HEADS.map((h) => [h, h.toUpperCase()]),
            ],
            ["fromCategory", "Transfer from — Minor Head", CATEGORIES],
            [
              "toHead",
              "Transfer to — Major Head",
              HEADS.map((h) => [h, h.toUpperCase()]),
            ],
            ["toCategory", "Transfer to — Minor Head", CATEGORIES],
          ].map(([key, label, options]) => (
            <Select
              key={key}
              label={label}
              value={form[key]}
              options={options}
              onChange={(e) => set(key, e.target.value)}
            />
          ))}
          <Input
            label="Amount (₹)"
            type="number"
            min=".01"
            step=".01"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </div>
        <Btn
          onClick={async () => {
            const next = [...rows, form];
            const result = await mutate("pmt09/save", { rows: next });
            setRows(result.preview.rows);
            setPreview(result.preview);
            setForm(empty());
          }}
        >
          SAVE
        </Btn>
      </Panel>
      <Panel title="Processed Records">
        <Table
          columns={["From", "To", "Amount (₹)", "Actions"]}
          count={rows.length}
        >
          {rows.map((r, index) => (
            <tr key={r.id || index}>
              <td>
                {r.fromHead.toUpperCase()} / {r.fromCategory}
              </td>
              <td>
                {r.toHead.toUpperCase()} / {r.toCategory}
              </td>
              <td>{money(r.amount)}</td>
              <td>
                <Btn
                  tone="danger"
                  onClick={async () => {
                    const next = rows.filter((_, i) => i !== index);
                    if (!next.length) {
                      await mutate("pmt09/clear");
                      setRows([]);
                      setPreview(null);
                    } else {
                      const result = await mutate("pmt09/save", { rows: next });
                      setRows(result.preview.rows);
                      setPreview(result.preview);
                    }
                  }}
                >
                  DELETE
                </Btn>
              </td>
            </tr>
          ))}
        </Table>
        <div className="actions">
          <Btn disabled={!rows.length} onClick={() => setSigning(true)}>
            PROCEED TO FILE
          </Btn>
          <Btn tone="secondary" onClick={() => go("ledgers")}>
            BACK TO CASH LEDGER
          </Btn>
        </div>
      </Panel>
      <Panel title="Filed GST PMT-09">
        <Table
          columns={["ARN", "Filed On", "Records", "Actions"]}
          count={w.pmt09Files?.length || 0}
        >
          {(w.pmt09Files || []).map((file) => (
            <tr key={file.id}>
              <td>{file.arn}</td>
              <td>{dateLabel(file.filedAt)}</td>
              <td>{file.rows.length}</td>
              <td>
                <Btn tone="secondary" onClick={() => setSelected(file)}>
                  VIEW
                </Btn>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      {signing && (
        <Signing
          title="File GST PMT-09"
          purpose="pmt09-file"
          onClose={() => setSigning(false)}
          onSubmit={async (form) => {
            const result = await mutate("pmt09/file", form);
            setSigning(false);
            setRows([]);
            setPreview(null);
            setSelected(result.filed);
          }}
        />
      )}
      {selected && (
        <Modal title="Filed GST PMT-09" wide onClose={() => setSelected(null)}>
          <div className="print-sheet">
            <h2>FORM GST PMT-09</h2>
            <p>
              GSTIN: <b>{active.state.taxpayer.gstin}</b>
            </p>
            <p>
              ARN: <b>{selected.arn}</b> · Filed: {dateLabel(selected.filedAt)}
            </p>
            <Table
              columns={["From", "To", "Amount (₹)"]}
              count={selected.rows.length}
            >
              {selected.rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.fromHead.toUpperCase()} / {r.fromCategory}
                  </td>
                  <td>
                    {r.toHead.toUpperCase()} / {r.toCategory}
                  </td>
                  <td>{money(r.amount)}</td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="actions">
            <Btn onClick={() => window.print()}>PRINT / SAVE PDF</Btn>
            <Btn tone="secondary" onClick={() => setSelected(null)}>
              CLOSE
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Masters() {
  const { w, mutate, go } = usePortal();
  const [kind, setKind] = useState("products"),
    [form, setForm] = useState(null),
    [query, setQuery] = useState(""),
    [file, setFile] = useState(null);
  const rows = (w.masters?.[kind] || []).filter((r) =>
    JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
  );
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <div className="container">
      <Crumbs
        items={[["Returns", "returns"], ["GSTR-1", "gstr1"], "My Masters"]}
      />
      <h1>My Masters</h1>
      <TaxpayerBar />
      <div className="tabs">
        {[
          ["products", "Product Master"],
          ["parties", "Supplier / Recipient Master"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={kind === key ? "active" : ""}
            onClick={() => {
              setKind(key);
              setForm(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <Panel title={form ? "Master Details" : "Saved Masters"}>
        {form ? (
          <>
            <div className="form-grid">
              <Input
                label={
                  kind === "products"
                    ? "Product Name"
                    : "Supplier / Recipient Name"
                }
                required
                value={form.name || ""}
                onChange={(e) => set("name", e.target.value)}
              />
              {kind === "parties" ? (
                <>
                  <Input
                    label="GSTIN"
                    value={form.gstin || ""}
                    onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                  />
                  <Select
                    label="Registration Type"
                    value={form.registrationType || "Regular"}
                    options={["Regular", "TCS", "Composition", "UIN", "SEZ"]}
                    onChange={(e) => set("registrationType", e.target.value)}
                  />
                </>
              ) : (
                <>
                  <HsnSearch
                    value={form.hsn || ""}
                    onChange={(v) => set("hsn", v)}
                    onSelect={(entry) =>
                      setForm((old) => ({
                        ...old,
                        hsn: entry.code,
                        description: entry.description,
                      }))
                    }
                  />
                  <Input
                    label="Description"
                    value={form.description || ""}
                    onChange={(e) => set("description", e.target.value)}
                  />
                  <Select
                    label="Rate (%)"
                    options={RATES}
                    value={form.rate ?? 18}
                    onChange={(e) => set("rate", Number(e.target.value))}
                  />
                  <Select
                    label="UQC"
                    options={
                      w.ewayMasters?.units || [
                        "NOS",
                        "KGS",
                        "MTR",
                        "PCS",
                        "OTH",
                      ]
                    }
                    value={form.uqc || "NOS"}
                    onChange={(e) => set("uqc", e.target.value)}
                  />
                </>
              )}
            </div>
            <div className="actions">
              <Btn
                onClick={async () => {
                  await mutate("masters/save", { kind, record: form });
                  setForm(null);
                }}
              >
                SAVE
              </Btn>
              <Btn tone="secondary" onClick={() => setForm(null)}>
                CANCEL
              </Btn>
            </div>
          </>
        ) : (
          <>
            <div className="filter-row">
              <Input
                label="Search Masters"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Btn onClick={() => setForm({})}>ADD RECORD</Btn>
            </div>
            <Table
              columns={[
                "Name",
                kind === "products" ? "HSN / UQC / Rate" : "GSTIN / Type",
                "Actions",
              ]}
              count={rows.length}
            >
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    {kind === "products"
                      ? `${r.hsn} / ${r.uqc} / ${r.rate}%`
                      : `${r.gstin} / ${r.registrationType}`}
                  </td>
                  <td>
                    <Btn tone="secondary" onClick={() => setForm(r)}>
                      EDIT
                    </Btn>
                    <Btn
                      tone="danger"
                      onClick={() =>
                        mutate("masters/delete", { kind, id: r.id })
                      }
                    >
                      DELETE
                    </Btn>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Panel>
      <Panel title="Download / Upload My Masters">
        <Input
          label="Prepared master JSON"
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() => download("my-masters.json", w.masters)}
          >
            DOWNLOAD MY MASTERS
          </Btn>
          <Btn
            tone="secondary"
            onClick={() =>
              download("master-template.json", {
                products: [
                  {
                    name: "Practice product",
                    hsn: "8471",
                    rate: 18,
                    uqc: "NOS",
                  },
                ],
                parties: [
                  {
                    name: "Practice supplier",
                    gstin: "27ABCDE1234F1Z0",
                    registrationType: "Regular",
                  },
                ],
              })
            }
          >
            DOWNLOAD TEMPLATE
          </Btn>
          <Btn
            disabled={!file}
            onClick={async () => {
              if (file.size > 6000000)
                throw Error("Choose a file smaller than 6 MB.");
              await mutate("masters/import", { data: await file.text() });
              setFile(null);
            }}
          >
            UPLOAD MY MASTERS
          </Btn>
        </div>
      </Panel>
      <InstructorMasters />
      <Btn tone="secondary" onClick={() => go("gstr1")}>
        BACK TO GSTR-1
      </Btn>
    </div>
  );
}

export function ProcessingRecords({ section, onTabChange }) {
  const { w, p, active, mutate, api, setError } = usePortal();
  const [tab, setTab] = useState("Processed"),
    [editing, setEditing] = useState(null);
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const pending = (p.processingJobs || []).filter(
    (j) => j.status === "Processing",
  );
  const errors = (p.processingJobs || [])
    .flatMap((j) => j.errors || [])
    .filter(
      (e) =>
        !e.resolvedAt && !e.discardedAt && (!section || e.section === section),
    );
  const queued = pending
    .flatMap((j) => j.rows || [])
    .filter((r) => !section || r.section === section);
  useEffect(() => {
    if (!pending.length) return;
    let stop = false,
      timer;
    const poll = async () => {
      try {
        await mutateRef.current(
          "processing/refresh",
          { period: w.period },
          { background: true, quiet: true },
        );
      } catch (error) {
        if (!stop) setError(error.message);
      }
      if (!stop) timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 1200);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [w.period, pending.map((j) => j.id).join(":")]);
  const update = (key, value) =>
    setEditing((old) => ({
      ...old,
      invoice: { ...old.invoice, [key]: value },
    }));
  return (
    <section className="processing-records">
      <div className="tabs">
        {[
          ["Processed", "Processed Records"],
          ["Pending", `Processing Records (${queued.length})`],
          ["Errors", `Errored Records (${errors.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key);
              onTabChange?.(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "Pending" && (
        <Panel title="Processing Records">
          {pending.length > 0 && (
            <Spinner label="Processing uploaded records" />
          )}
          <Table
            columns={["Section", "Document Number", "Status"]}
            count={queued.length}
          >
            {queued.map((row, index) => (
              <tr key={index}>
                <td>{row.section}</td>
                <td>{row.number}</td>
                <td>Processing</td>
              </tr>
            ))}
          </Table>
          <Btn tone="secondary" onClick={() => mutate("processing/refresh")}>
            REFRESH
          </Btn>
        </Panel>
      )}
      {tab === "Errors" && (
        <Panel title="Errored Records">
          <Table
            columns={["Document / Recipient", "Error Description", "Action"]}
            count={errors.length}
          >
            {errors.map((error) => (
              <tr key={error.id}>
                <td>
                  {error.number}
                  <br />
                  {error.gstin}
                </td>
                <td>{error.error}</td>
                <td>
                  <Btn
                    tone="secondary"
                    onClick={() =>
                      setEditing({
                        id: error.id,
                        invoice: {
                          ...error.input,
                          place:
                            error.input.place || active.state.taxpayer.state,
                        },
                      })
                    }
                  >
                    CORRECT
                  </Btn>
                  <Btn
                    tone="danger"
                    onClick={() =>
                      mutate("processing/correct", {
                        id: error.id,
                        discard: true,
                      })
                    }
                  >
                    DELETE
                  </Btn>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
      {editing && (
        <Modal
          title="Correct Errored Record"
          wide
          onClose={() => setEditing(null)}
        >
          <div className="form-grid">
            <Input
              label="Document Number"
              value={editing.invoice.number || ""}
              onChange={(e) => update("number", e.target.value)}
            />
            <Input
              label="Document Date"
              type="date"
              value={editing.invoice.date || ""}
              onChange={(e) => update("date", e.target.value)}
            />
            <Input
              label="Recipient GSTIN"
              value={editing.invoice.gstin || ""}
              onChange={(e) => update("gstin", e.target.value.toUpperCase())}
            />
            <Input
              label="Recipient Name"
              value={editing.invoice.recipient || ""}
              onChange={(e) => update("recipient", e.target.value)}
            />
            <Select
              label="Place of Supply"
              options={GST_STATE_OPTIONS}
              value={editing.invoice.place}
              onChange={(e) => update("place", e.target.value)}
            />
            {!editing.invoice.items?.length && (
              <>
                <Input
                  label="Taxable Value (₹)"
                  type="number"
                  min="0"
                  value={editing.invoice.taxable ?? ""}
                  onChange={(e) => update("taxable", e.target.value)}
                />
                <Select
                  label="Rate (%)"
                  options={RATES}
                  value={editing.invoice.rate ?? 18}
                  onChange={(e) => update("rate", Number(e.target.value))}
                />
              </>
            )}
            {editing.invoice.section === "HSN" && (
              <>
                <HsnSearch
                  value={editing.invoice.hsn || ""}
                  onChange={(v) => update("hsn", v)}
                  onSelect={(entry) => update("hsn", entry.code)}
                />
                <Input
                  label="Quantity"
                  type="number"
                  min="0"
                  value={editing.invoice.quantity ?? ""}
                  onChange={(e) => update("quantity", e.target.value)}
                />
                <Input
                  label="UQC"
                  value={editing.invoice.uqc || "NOS"}
                  onChange={(e) => update("uqc", e.target.value)}
                />
              </>
            )}
            {editing.invoice.section === "DOCS" && (
              <>
                <Input
                  label="Total Issued"
                  type="number"
                  min="0"
                  value={editing.invoice.issued ?? 0}
                  onChange={(e) => update("issued", e.target.value)}
                />
                <Input
                  label="Cancelled"
                  type="number"
                  min="0"
                  value={editing.invoice.cancelled ?? 0}
                  onChange={(e) => update("cancelled", e.target.value)}
                />
              </>
            )}
          </div>
          {editing.invoice.items?.length > 0 && (
            <InvoiceRateGrid
              invoice={editing.invoice}
              homeState={active.state.taxpayer.state}
              onChange={(invoice) => setEditing((old) => ({ ...old, invoice }))}
            />
          )}
          <div className="actions">
            <Btn
              onClick={async () => {
                await mutate("processing/correct", {
                  id: editing.id,
                  invoice: editing.invoice,
                });
                setEditing(null);
              }}
            >
              SAVE CORRECTION
            </Btn>
            <Btn tone="secondary" onClick={() => setEditing(null)}>
              CANCEL
            </Btn>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function IrpDetails() {
  const { w, p, mutate, go } = usePortal();
  const [show, setShow] = useState(false),
    [syncError, setSyncError] = useState("");
  const syncRef = useRef(mutate);
  syncRef.current = mutate;
  useEffect(() => {
    syncRef
      .current("gstr1/sync-irn", {}, { background: true, quiet: true })
      .then(() => setSyncError(""))
      .catch((error) =>
        setSyncError(
          error.message ||
            "E-invoice refresh failed. Try refreshing the details again.",
        ),
      );
  }, [w.period]);
  const records = (w.documents.einvoice || []).filter(
    (doc) => doc.invoice?.date.slice(0, 7) === w.period,
  );
  return (
    <div className="irp-details">
      {syncError && (
        <p className="error" role="alert">
          {syncError}
        </p>
      )}
      <div className="actions">
        <Btn tone="secondary" onClick={() => mutate("gstr1/sync-irn")}>
          REFRESH E-INVOICE DETAILS
        </Btn>
        <Btn tone="secondary" onClick={() => setShow(!show)}>
          E-INVOICE DOWNLOAD HISTORY / STATUS
        </Btn>
        <Btn tone="secondary" onClick={() => go("masters")}>
          MY MASTERS
        </Btn>
      </div>
      {show && (
        <Panel title="E-Invoice Details">
          <Table
            columns={["Document", "IRN", "Available From", "GSTR-1 Status"]}
            count={records.length}
          >
            {records.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.invoice.number}</td>
                <td className="break-all">{doc.irn}</td>
                <td>{doc.irpAvailableOn || "—"}</td>
                <td>
                  {doc.irpSyncStatus || "Awaiting synchronization"}
                  <small>{doc.irpError}</small>
                </td>
              </tr>
            ))}
          </Table>
          <Btn
            tone="secondary"
            onClick={async () => {
              const result = await mutate("gstr1/export-irn");
              const bytes = Uint8Array.from(atob(result.base64), (c) =>
                c.charCodeAt(0),
              );
              const url = URL.createObjectURL(
                new Blob([bytes], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `e-invoices-${w.period}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            DOWNLOAD DETAILS FROM E-INVOICES (EXCEL)
          </Btn>
        </Panel>
      )}
    </div>
  );
}

export function FeesCalculator({ onApplied }) {
  const { w, mutate } = usePortal();
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(w.portalDate || ""),
    [turnover, setTurnover] = useState(w.taxProfile?.turnover ?? ""),
    [minimum, setMinimum] = useState({}),
    [result, setResult] = useState(null);
  const calculate = async (apply) => {
    const data = await mutate("fees/calculate", {
      filingDate: date,
      turnover,
      minimumCash: minimum,
      apply,
    });
    setResult(data.calculation);
    if (apply) {
      setOpen(false);
      onApplied?.();
    }
  };
  return (
    <>
      <Btn tone="secondary" onClick={() => setOpen(true)}>
        RE-COMPUTE INTEREST
      </Btn>
      {open && (
        <Modal
          title="Re-compute Interest and Late Fee"
          wide
          onClose={() => setOpen(false)}
        >
          <div className="form-grid">
            <Input
              label="Filing Date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setResult(null);
              }}
            />
            <Input
              label="Previous Financial Year Aggregate Turnover (₹)"
              required
              type="number"
              min="0"
              value={turnover}
              onChange={(e) => {
                setTurnover(e.target.value);
                setResult(null);
              }}
            />
            {HEADS.map((h) => (
              <Input
                key={h}
                label={`Minimum cash balance since due date — ${h.toUpperCase()} (₹)`}
                type="number"
                min="0"
                step=".01"
                value={minimum[h] || ""}
                onChange={(e) => {
                  setMinimum((old) => ({ ...old, [h]: e.target.value }));
                  setResult(null);
                }}
              />
            ))}
          </div>
          <p>
            Review the calculated amounts and applicable notified extensions or
            waivers before confirming.
          </p>
          {result && (
            <>
              <p>
                Due date: <b>{result.dueDate}</b> · Days late:{" "}
                <b>{result.daysLate}</b>
              </p>
              <HeadTable
                rows={[
                  ["Interest", result.interest],
                  ["Late Fee", result.latefee],
                ]}
              />
            </>
          )}
          <div className="actions">
            <Btn
              disabled={!date || turnover === ""}
              onClick={() => calculate(false)}
            >
              CALCULATE
            </Btn>
            <Btn disabled={!result} onClick={() => calculate(true)}>
              CONFIRM
            </Btn>
            <Btn tone="secondary" onClick={() => setOpen(false)}>
              CANCEL
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

export function InstructorMasters() {
  const { user, w, mutate } = usePortal();
  const [due, setDue] = useState(w.dueDateOverrides?.[w.period] || ""),
    [waiver, setWaiver] = useState(!!w.lateFeeWaivers?.[w.period]),
    [interestWaiver, setInterestWaiver] = useState(
      !!w.interestWaivers?.[w.period],
    ),
    [annualYear, setAnnualYear] = useState(""),
    [annualDate, setAnnualDate] = useState(""),
    [file, setFile] = useState(null);
  if (user?.role !== "instructor") return null;
  return (
    <>
      <Panel title="Filing Calendar — Instructor Settings">
        <p>
          Use notified due-date extensions or waivers for the exercise’s
          selected tax period. An annual-return filing date also limits
          amendments for that financial year.
        </p>
        <div className="form-grid">
          <Input
            label="Extended GSTR-3B Due Date"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <Input
            label="Annual Return Financial Year (starting year)"
            type="number"
            value={annualYear}
            onChange={(e) => setAnnualYear(e.target.value)}
          />
          <Input
            label="Annual Return Filed On"
            type="date"
            value={annualDate}
            onChange={(e) => setAnnualDate(e.target.value)}
          />
          <label className="check-line">
            <input
              type="checkbox"
              checked={waiver}
              onChange={(e) => setWaiver(e.target.checked)}
            />
            Notified late-fee waiver applies to this exercise
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              checked={interestWaiver}
              onChange={(e) => setInterestWaiver(e.target.checked)}
            />
            Notified interest waiver applies to this exercise
          </label>
        </div>
        <Btn
          onClick={() =>
            mutate("returns/preferences", {
              dueDate: due || undefined,
              waiver,
              interestWaiver,
              ...(annualYear && annualDate
                ? { annualYear, annualFiled: annualDate }
                : {}),
            })
          }
        >
          SAVE CALENDAR SETTINGS
        </Btn>
      </Panel>
      <Panel title="Registration Jurisdiction Masters">
        <p>
          The default directory provides labelled training jurisdictions. Import
          verified state/centre mappings for an exercise when exact locations
          are required.
        </p>
        <Input
          label="Jurisdiction master JSON"
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() =>
              download("jurisdiction-template.json", {
                rows: [
                  {
                    state: "Maharashtra",
                    district: "Nashik",
                    pincode: "422001",
                    stateJurisdiction: "Training Circle",
                    ward: "Training Ward 1",
                    commissionerate: "Training Commissionerate",
                    division: "Training Division",
                    range: "Training Range 1",
                  },
                ],
              })
            }
          >
            DOWNLOAD TEMPLATE
          </Btn>
          <Btn
            disabled={!file}
            onClick={async () => {
              if (file.size > 6000000)
                throw Error("Choose a file smaller than 6 MB.");
              await mutate("registration/jurisdiction-master", {
                data: await file.text(),
              });
              setFile(null);
            }}
          >
            UPLOAD JURISDICTION MASTER
          </Btn>
        </div>
      </Panel>
    </>
  );
}

export function NegativeLiability() {
  const { w, go } = usePortal();
  const categories = [
    ["outward", "Other than reverse charge"],
    ["reverseCharge", "Reverse charge"],
    ["eco95", "Supplies u/s 9(5)"],
  ];
  return (
    <div className="container">
      <Crumbs
        items={[
          "Services",
          ["Ledgers", "ledgers"],
          "Negative Liability Statement",
        ]}
      />
      <h1>Negative Liability Statement</h1>
      <TaxpayerBar />
      <Panel title="Balance Available for Adjustment">
        <HeadTable
          rows={categories.map(([key, label]) => [
            label,
            w.negativeLiability?.[key],
          ])}
        />
      </Panel>
      <Panel title="Adjustment History">
        <Table
          columns={[
            "Tax Period",
            "Date",
            "Category",
            "Added (₹)",
            "Adjusted (₹)",
            "Closing Balance (₹)",
          ]}
          count={(w.negativeLiabilityHistory || []).length}
        >
          {(w.negativeLiabilityHistory || []).flatMap((entry, index) =>
            categories.map(([key, label]) => (
              <tr key={`${index}:${key}`}>
                <td>{entry.period}</td>
                <td>{dateLabel(entry.date)}</td>
                <td>{label}</td>
                <td>{money(total(entry.added?.[key]))}</td>
                <td>{money(total(entry.used?.[key]))}</td>
                <td>{money(total(entry.after?.[key]))}</td>
              </tr>
            )),
          )}
        </Table>
      </Panel>
      <div className="actions">
        <Btn tone="secondary" onClick={() => window.print()}>
          PRINT / SAVE PDF
        </Btn>
        <Btn tone="secondary" onClick={() => go("ledgers")}>
          BACK TO LEDGERS
        </Btn>
      </div>
    </div>
  );
}
