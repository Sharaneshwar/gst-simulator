import { useEffect, useState } from "react";
import {
  Btn,
  Crumbs,
  Field,
  HEADS,
  HeadTable,
  Input,
  Modal,
  MONTHS,
  Panel,
  ReturnPreview,
  SECTIONS,
  STATES,
  Select,
  Signing,
  Table,
  TaxpayerBar,
  dateLabel,
  download,
  money,
  periodLabel,
  total,
  usePortal,
} from "./lib";

export function ReturnsDashboard() {
  const { w, p, mutate, go } = usePortal();
  const initialYear =
    Number(w.period.slice(0, 4)) - (Number(w.period.slice(5)) < 4 ? 1 : 0);
  const [year, setYear] = useState(initialYear);
  const [quarter, setQuarter] = useState(
    Math.floor(((Number(w.period.slice(5)) + 8) % 12) / 3) + 1,
  );
  const [month, setMonth] = useState(Number(w.period.slice(5)));
  const [searched, setSearched] = useState(true);
  const monthOptions = Array.from(
    { length: 3 },
    (_, i) => (((quarter - 1) * 3 + i + 3) % 12) + 1,
  );
  const tiles = [
    [
      "Details of outward supplies of goods or services",
      "GSTR-1",
      p.gstr1.status,
      "gstr1",
      "offline",
    ],
    ["Auto Drafted Details (For view only)", "GSTR-2A", "Available", "gstr2a"],
    ["Auto-drafted ITC Statement", "GSTR-2B", "Available", "gstr2b"],
    ["Monthly Return", "GSTR-3B", p.gstr3b.status, "gstr3b"],
  ];
  return (
    <div className="container">
      <Crumbs items={["Returns"]} />
      <Panel title="File Returns">
        <p>Select the financial year, quarter and return filing period.</p>
        <div className="filter-row">
          <Select
            label="Financial Year"
            value={year}
            options={[2025, 2026, 2027].map((y) => [y, `${y}-${y + 1}`])}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setSearched(false);
            }}
          />
          <Select
            label="Quarter"
            value={quarter}
            options={[
              [1, "Quarter 1 (Apr - Jun)"],
              [2, "Quarter 2 (Jul - Sep)"],
              [3, "Quarter 3 (Oct - Dec)"],
              [4, "Quarter 4 (Jan - Mar)"],
            ]}
            onChange={(e) => {
              const q = Number(e.target.value);
              setQuarter(q);
              setMonth((((q - 1) * 3 + 3) % 12) + 1);
              setSearched(false);
            }}
          />
          <Select
            label="Period (Month)"
            value={month}
            options={monthOptions.map((m) => [m, MONTHS[m - 1]])}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setSearched(false);
            }}
          />
          <Btn
            onClick={async () => {
              await mutate("period", {
                period: `${month < 4 ? year + 1 : year}-${String(month).padStart(2, "0")}`,
              });
              setSearched(true);
            }}
          >
            SEARCH
          </Btn>
        </div>
      </Panel>
      {searched && (
        <>
          <TaxpayerBar />
          <div className="return-tiles">
            {tiles.map(([label, name, status, path, offline]) => (
              <section className="return-card" key={name}>
                <div className="return-card-heading">{label}</div>
                <div className="return-card-body">
                  <h2>{name}</h2>
                  <p>
                    Return period: <b>{periodLabel(w.period)}</b>
                  </p>
                  <p>
                    Status:{" "}
                    <b className={status === "Filed" ? "green" : ""}>
                      {status}
                    </b>
                  </p>
                  <div className="tile-buttons">
                    <Btn onClick={() => go(path)}>
                      {name.startsWith("GSTR-2")
                        ? "VIEW"
                        : status === "Filed"
                          ? "VIEW FILED RETURN"
                          : "PREPARE ONLINE"}
                    </Btn>
                    {offline && (
                      <Btn
                        tone="secondary"
                        disabled={status === "Filed"}
                        onClick={() => go(offline)}
                      >
                        PREPARE OFFLINE
                      </Btn>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Gstr1() {
  const { p, w, go, mutate } = usePortal();
  const [amendments, setAmendments] = useState(false);
  const [preview, setPreview] = useState(false);
  const [signing, setSigning] = useState(false);
  const [nil, setNil] = useState(false);
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], "GSTR-1"]} />
      <div className="page-title">
        <h1>GSTR-1 — Details of outward supplies of goods or services</h1>
        <button className="link" onClick={() => go("help")}>
          Help
        </button>
      </div>
      <TaxpayerBar />
      <div className="return-status">
        <span>
          Status:{" "}
          <b className={p.gstr1.status === "Filed" ? "green" : ""}>
            {p.gstr1.status}
          </b>
        </span>
        {p.gstr1.arn && (
          <span>
            ARN: <b>{p.gstr1.arn}</b> · Filed on {dateLabel(p.gstr1.filedAt)}
          </span>
        )}
      </div>
      {p.gstr1.status !== "Filed" && (
        <Panel title="File Nil GSTR-1">
          <label className="check-line">
            <input
              type="checkbox"
              checked={nil}
              disabled={p.invoices.length > 0}
              onChange={(e) => setNil(e.target.checked)}
            />
            File Nil GSTR-1 (no outward supplies in this period)
          </label>
        </Panel>
      )}
      <div className="tabs">
        <button
          className={!amendments ? "active" : ""}
          onClick={() => setAmendments(false)}
        >
          ADD RECORD DETAILS
        </button>
        <button
          className={amendments ? "active" : ""}
          onClick={() => setAmendments(true)}
        >
          AMEND RECORD DETAILS
        </button>
      </div>
      <div className="section-tiles">
        {SECTIONS.filter(([key]) =>
          amendments ? key.endsWith("A") : !key.endsWith("A"),
        ).map(([key, code, title]) => {
          const rows = p.invoices.filter((i) => i.section === key);
          return (
            <button
              className="section-tile"
              key={key}
              onClick={() => go(`gstr1/${key}`)}
            >
              <strong>
                {code} - {title}
              </strong>
              <span className="section-count">{rows.length}</span>
              <span>
                Total Taxable Value (₹){" "}
                <b>{money(rows.reduce((n, i) => n + Number(i.taxable), 0))}</b>
              </span>
            </button>
          );
        })}
      </div>
      {p.gstr1.summary && (
        <Panel title="Consolidated Summary">
          <HeadTable rows={[["Total tax liability", p.gstr1.summary.taxes]]} />
          <p>
            Number of records: {p.gstr1.summary.documents} · Taxable value: ₹{" "}
            {money(p.gstr1.summary.taxable)}
          </p>
        </Panel>
      )}
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("returns")}>
          BACK
        </Btn>
        <Btn tone="secondary" onClick={() => setPreview(true)}>
          PREVIEW
        </Btn>
        {p.gstr1.status !== "Filed" && (
          <>
            <Btn onClick={() => mutate("gstr1/summary")}>GENERATE SUMMARY</Btn>
            <Btn
              disabled={
                !p.gstr1.summary || p.gstr1.summaryRevision !== p.gstr1.revision
              }
              onClick={() => setSigning(true)}
            >
              PROCEED TO FILE / SUMMARY
            </Btn>
          </>
        )}
      </div>
      {preview && (
        <ReturnPreview type="GSTR-1" onClose={() => setPreview(false)} />
      )}
      {signing && (
        <Signing
          title="File GSTR-1"
          purpose="gstr1-file"
          onClose={() => setSigning(false)}
          onSubmit={(form) => mutate("gstr1/file", { ...form, nil })}
        />
      )}
    </div>
  );
}

export function Gstr1Section({ section }) {
  const { p, w, active, mutate, go } = usePortal();
  const definition = SECTIONS.find(([key]) => key === section);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [query, setQuery] = useState("");
  const empty = () => ({
    section,
    number: "",
    date: `${w.period}-01`,
    recipient: "",
    gstin: "",
    place: active.state.taxpayer.state,
    rate: "18",
    taxable: "",
    cess: "0",
    noteType: "Credit Note",
    exportType: "With payment of tax",
    originalNumber: "",
    originalPeriod: "",
    hsn: "",
    quantity: "",
    uqc: "NOS",
    issued: "",
    cancelled: "",
    supplyType: "Intra-state",
  });
  if (!definition)
    return (
      <div className="container">
        <Crumbs items={["GSTR-1"]} />
        <Panel title="Section not found">
          <Btn onClick={() => go("gstr1")}>BACK</Btn>
        </Panel>
      </div>
    );
  const [, code, title] = definition;
  const locked = p.gstr1.status === "Filed";
  const rows = p.invoices.filter(
    (i) =>
      i.section === section &&
      `${i.number} ${i.gstin} ${i.recipient}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const aggregate = [
    "B2CS",
    "B2CSA",
    "NIL",
    "AT",
    "ATA",
    "TXP",
    "TXPA",
    "HSN",
    "DOCS",
    "ECO",
    "ECOA",
  ].includes(section);
  const registered = ["B2B", "B2BA", "CDNR", "CDNRA"].includes(section);
  const set = (key, value) => setEditing((old) => ({ ...old, [key]: value }));
  const tax = editing
    ? (Number(editing.taxable || 0) * Number(editing.rate || 0)) / 100
    : 0;
  const interstate =
    editing?.place !== active.state.taxpayer.state || section.startsWith("EXP");
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], ["GSTR-1", "gstr1"], title]} />
      <h1>
        {code} - {title}
      </h1>
      <TaxpayerBar />
      <Panel
        title={
          editing
            ? `${editing.id ? "Edit" : "Add"} Details`
            : "Processed Records"
        }
        extra={
          !editing &&
          !locked && <Btn onClick={() => setEditing(empty())}>ADD DETAILS</Btn>
        }
      >
        {editing ? (
          <>
            <p className="mandatory">
              <b className="required">●</b> indicates mandatory fields
            </p>
            <div className="form-grid">
              {registered && (
                <Input
                  label="GSTIN/UIN of Recipient"
                  required
                  value={editing.gstin}
                  onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                  maxLength={15}
                />
              )}
              {!aggregate && (
                <Input
                  label="Recipient Name"
                  value={editing.recipient}
                  onChange={(e) => set("recipient", e.target.value)}
                />
              )}
              {section.endsWith("A") && (
                <>
                  <Input
                    label="Original Document / Record Number"
                    required
                    value={editing.originalNumber}
                    onChange={(e) => set("originalNumber", e.target.value)}
                  />
                  <Input
                    label="Original Return Period"
                    type="month"
                    value={editing.originalPeriod}
                    onChange={(e) => set("originalPeriod", e.target.value)}
                  />
                </>
              )}
              <Input
                label={
                  section === "DOCS"
                    ? "Nature of Document"
                    : aggregate
                      ? "Description / Reference"
                      : section.startsWith("CDN")
                        ? "Note Number"
                        : "Invoice Number"
                }
                required
                value={editing.number}
                onChange={(e) => set("number", e.target.value)}
              />
              {!aggregate && (
                <Input
                  label={
                    section.startsWith("CDN") ? "Note Date" : "Invoice Date"
                  }
                  type="date"
                  required
                  value={editing.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              )}
              {section.startsWith("CDN") && (
                <Select
                  label="Note Type"
                  required
                  value={editing.noteType}
                  onChange={(e) => set("noteType", e.target.value)}
                  options={["Credit Note", "Debit Note"]}
                />
              )}
              {!aggregate && (
                <Input
                  label="Invoice / Note Value (₹)"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.invoiceValue ?? ""}
                  onChange={(e) => set("invoiceValue", e.target.value)}
                  help="Enter the total document value including tax."
                />
              )}
              {section.startsWith("EXP") ? (
                <Select
                  label="Export Type"
                  required
                  value={editing.exportType}
                  onChange={(e) => set("exportType", e.target.value)}
                  options={["With payment of tax", "Without payment of tax"]}
                />
              ) : (
                section !== "DOCS" && (
                  <Select
                    label="Place of Supply (POS)"
                    required
                    value={editing.place}
                    onChange={(e) => set("place", e.target.value)}
                    options={STATES}
                  />
                )
              )}
              {section === "HSN" && (
                <>
                  <Input
                    label="HSN / SAC"
                    required
                    value={editing.hsn}
                    onChange={(e) => set("hsn", e.target.value)}
                  />
                  <Select
                    label="UQC"
                    value={editing.uqc}
                    options={["NOS", "KGS", "MTR", "LTR", "OTH"]}
                    onChange={(e) => set("uqc", e.target.value)}
                  />
                  <Input
                    label="Total Quantity"
                    type="number"
                    min="0"
                    value={editing.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                  />
                </>
              )}
              {section === "DOCS" ? (
                <>
                  <Input
                    label="Serial Number From"
                    value={editing.fromSerial || ""}
                    onChange={(e) => set("fromSerial", e.target.value)}
                  />
                  <Input
                    label="Serial Number To"
                    value={editing.toSerial || ""}
                    onChange={(e) => set("toSerial", e.target.value)}
                  />
                  <Input
                    label="Total Number"
                    type="number"
                    min="0"
                    required
                    value={editing.issued}
                    onChange={(e) => set("issued", e.target.value)}
                  />
                  <Input
                    label="Cancelled"
                    type="number"
                    min="0"
                    value={editing.cancelled}
                    onChange={(e) => set("cancelled", e.target.value)}
                  />
                </>
              ) : (
                <>
                  <Input
                    label={
                      section === "NIL"
                        ? "Nil / Exempt / Non-GST Supply Value (₹)"
                        : "Taxable Value (₹)"
                    }
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={editing.taxable}
                    onChange={(e) => set("taxable", e.target.value)}
                  />
                  {section !== "NIL" && (
                    <>
                      <Select
                        label="Rate (%)"
                        required
                        value={editing.rate}
                        onChange={(e) => set("rate", e.target.value)}
                        options={[
                          0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40,
                        ]}
                      />
                      <Input
                        label="Cess Amount (₹)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editing.cess}
                        onChange={(e) => set("cess", e.target.value)}
                      />
                    </>
                  )}
                </>
              )}
              {registered && (
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={editing.reverseCharge || false}
                    onChange={(e) => set("reverseCharge", e.target.checked)}
                  />
                  Supply attracts reverse charge
                </label>
              )}
            </div>
            {!["NIL", "DOCS", "HSN"].includes(section) && (
              <HeadTable
                rows={[
                  [
                    "Calculated tax",
                    {
                      igst: interstate ? tax : 0,
                      cgst: interstate ? 0 : tax / 2,
                      sgst: interstate ? 0 : tax / 2,
                      cess: editing.cess,
                    },
                  ],
                ]}
              />
            )}
            <div className="actions">
              <Btn tone="secondary" onClick={() => setEditing(null)}>
                CANCEL
              </Btn>
              <Btn
                onClick={async () => {
                  await mutate("invoice/save", { invoice: editing });
                  setEditing(null);
                }}
              >
                SAVE
              </Btn>
            </div>
          </>
        ) : (
          <>
            <div className="table-toolbar">
              <span>
                Total Records: <b>{rows.length}</b>
              </span>
              <Input
                label="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search records"
              />
            </div>
            <Table
              columns={
                section === "DOCS"
                  ? [
                      "Nature of Document",
                      "Total Issued",
                      "Cancelled",
                      "Net Issued",
                      "Actions",
                    ]
                  : [
                      registered ? "GSTIN / Recipient" : "Reference",
                      "Invoice / Note Number",
                      "Date",
                      "Taxable Value (₹)",
                      "Tax (₹)",
                      "Actions",
                    ]
              }
              count={rows.length}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  {section === "DOCS" ? (
                    <>
                      <td>{row.number}</td>
                      <td>{row.issued}</td>
                      <td>{row.cancelled}</td>
                      <td>{row.issued - row.cancelled}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        {row.gstin || row.place}
                        <small>{row.recipient}</small>
                      </td>
                      <td>
                        {row.number}
                        {row.originalNumber && (
                          <small>Amends: {row.originalNumber}</small>
                        )}
                      </td>
                      <td>{row.date || "—"}</td>
                      <td className="number">{money(row.taxable)}</td>
                      <td className="number">{money(total(row.taxes))}</td>
                    </>
                  )}
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${row.number}`}
                      disabled={locked}
                      onClick={() => setEditing({ ...row })}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button delete"
                      aria-label={`Delete ${row.number}`}
                      disabled={locked}
                      onClick={() => setRemoving(row)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Panel>
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("gstr1")}>
          BACK TO GSTR-1
        </Btn>
      </div>
      {removing && (
        <Modal title="Delete Document" onClose={() => setRemoving(null)}>
          <p>
            Delete <b>{removing.number}</b> from this return?
          </p>
          <div className="actions">
            <Btn tone="secondary" onClick={() => setRemoving(null)}>
              CANCEL
            </Btn>
            <Btn
              tone="danger"
              onClick={async () => {
                await mutate("invoice/delete", { id: removing.id });
                setRemoving(null);
              }}
            >
              DELETE
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function OfflineUpload() {
  const { w, p, active, mutate, go } = usePortal();
  const [file, setFile] = useState(null);
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], "GSTR-1 — Prepare Offline"]} />
      <TaxpayerBar />
      <Panel title="Upload">
        <p>Upload the JSON file generated from your returns offline utility.</p>
        <Input
          label="Select JSON file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() =>
              download("GSTR1-template.json", {
                gstin: active.state.taxpayer.gstin,
                fp: w.period.slice(5) + w.period.slice(0, 4),
                invoices: [
                  {
                    section: "B2B",
                    number: "NEW-001",
                    date: `${w.period}-15`,
                    gstin: "29AABCL1234A1Z9",
                    place: active.state.taxpayer.state,
                    taxable: 1000,
                    rate: 18,
                  },
                ],
              })
            }
          >
            DOWNLOAD TEMPLATE
          </Btn>
          <Btn
            disabled={!file || p.gstr1.status === "Filed"}
            onClick={async () => {
              if (file.size > 750000)
                throw new Error("Select a JSON file smaller than 750 KB.");
              await mutate("upload", {
                name: file.name,
                data: await file.text(),
              });
              setFile(null);
            }}
          >
            UPLOAD
          </Btn>
        </div>
      </Panel>
      <Panel title="Upload History">
        <Table
          columns={[
            "File Name",
            "Uploaded On",
            "Status",
            "Processed Records",
            "Error Report",
          ]}
          count={p.uploads.length}
        >
          {p.uploads.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{dateLabel(u.at)}</td>
              <td>{u.status}</td>
              <td>{u.accepted}</td>
              <td>
                {u.errors.length ? (
                  <button
                    className="link"
                    onClick={() => download(`${u.name}-errors.json`, u.errors)}
                  >
                    Download {u.errors.length} errors ↓
                  </button>
                ) : (
                  "No errors"
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("returns")}>
          BACK
        </Btn>
        <Btn onClick={() => go("gstr1")}>VIEW PROCESSED DATA</Btn>
      </div>
    </div>
  );
}

export function Gstr2({ type }) {
  const { p, w, active, go } = usePortal();
  const [tab, setTab] = useState("available");
  const title = type === "gstr2a" ? "GSTR-2A" : "GSTR-2B";
  const rows = p.purchases.filter(
    (i) =>
      tab === "all" ||
      (tab === "available" ? i.match === "Matched" : i.match !== "Matched"),
  );
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], title]} />
      <h1>
        {title} —{" "}
        {type === "gstr2a"
          ? "Auto Drafted Details"
          : "Auto-drafted ITC Statement"}
      </h1>
      <TaxpayerBar />
      <div className="info">
        This statement is for viewing supplier-reported details. Input tax
        credit is declared in GSTR-3B.
      </div>
      <Panel title="ITC Summary">
        <HeadTable
          rows={[
            ["ITC Available", w.eligibleItc],
            [
              "ITC requiring review",
              p.purchases
                .filter((i) => i.match !== "Matched")
                .reduce(
                  (n, i) =>
                    Object.fromEntries(
                      HEADS.map((h) => [h, n[h] + i.taxes[h]]),
                    ),
                  Object.fromEntries(HEADS.map((h) => [h, 0])),
                ),
            ],
          ]}
        />
      </Panel>
      <div className="tabs">
        {[
          ["available", "ITC AVAILABLE"],
          ["review", "ITC REQUIRING REVIEW"],
          ["all", "ALL DOCUMENTS"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Panel title="B2B — Inward Supplies from Registered Persons">
        <Table
          columns={[
            "GSTIN of Supplier",
            "Trade / Legal Name",
            "Invoice Number",
            "Taxable Value (₹)",
            "Integrated Tax (₹)",
            "Central Tax (₹)",
            "State/UT Tax (₹)",
          ]}
          count={rows.length}
        >
          {rows.map((i) => (
            <tr key={i.id}>
              <td>{i.gstin}</td>
              <td>{i.supplier}</td>
              <td>{i.number}</td>
              <td className="number">{money(i.taxable)}</td>
              {HEADS.slice(0, 3).map((h) => (
                <td key={h} className="number">
                  {money(i.taxes[h])}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("returns")}>
          BACK
        </Btn>
        <Btn
          onClick={() =>
            download(`${title}-${w.period}.json`, {
              gstin: active.state.taxpayer.gstin,
              period: w.period,
              documents: p.purchases,
            })
          }
        >
          DOWNLOAD JSON
        </Btn>
      </div>
    </div>
  );
}

const TABLES_3B = [
  ["3.1", "Tax on outward and reverse charge inward supplies"],
  ["3.1.1", "Supplies notified under section 9(5)"],
  ["3.2", "Inter-state supplies"],
  ["4", "Eligible ITC"],
  ["5", "Exempt, nil and Non-GST inward supplies"],
  ["5.1", "Interest and Late fee"],
];
const ROWS_3B = {
  3.1: [
    [
      "a",
      "(a) Outward taxable supplies (other than zero rated, nil rated and exempted)",
    ],
    ["b", "(b) Outward taxable supplies (zero rated)"],
    ["c", "(c) Other outward supplies (Nil rated, exempted)"],
    ["d", "(d) Inward supplies (liable to reverse charge)"],
    ["e", "(e) Non-GST outward supplies"],
  ],
  "3.1.1": [
    [
      "a",
      "(i) Taxable supplies on which electronic commerce operator pays tax u/s 9(5)",
    ],
    [
      "b",
      "(ii) Taxable supplies made by registered person through electronic commerce operator",
    ],
  ],
  3.2: [
    ["unregistered", "Supplies made to Unregistered Persons"],
    ["composition", "Supplies made to Composition Taxable Persons"],
    ["uin", "Supplies made to UIN holders"],
  ],
  4: [
    ["a1", "(A)(1) Import of goods"],
    ["a2", "(A)(2) Import of services"],
    ["a3", "(A)(3) Inward supplies liable to reverse charge"],
    ["a4", "(A)(4) Inward supplies from ISD"],
    ["a5", "(A)(5) All other ITC"],
    ["b1", "(B)(1) ITC Reversed — Rules 38, 42, 43 and section 17(5)"],
    ["b2", "(B)(2) ITC Reversed — Others"],
    ["d1", "(D)(1) ITC reclaimed which was reversed earlier"],
    ["d2", "(D)(2) Ineligible ITC under section 16(4) and POS restrictions"],
  ],
  5: [
    [
      "exempt",
      "From a supplier under composition scheme, exempt and nil rated supply",
    ],
    ["nongst", "Non-GST supply"],
  ],
  5.1: [
    ["interest", "Interest"],
    ["latefee", "Late Fee"],
  ],
};
function Gstr3bTableEditor({ table, onClose }) {
  const { p, w, mutate } = usePortal();
  const [rows, setRows] = useState(() => {
    const saved = p.gstr3b.tables[table];
    if (saved?.rows) return structuredClone(saved.rows);
    const result = Object.fromEntries(
      ROWS_3B[table].map(([key]) => [
        key,
        { taxable: 0, taxes: Object.fromEntries(HEADS.map((h) => [h, 0])) },
      ]),
    );
    if (table === "3.1")
      result.a = {
        taxable: saved?.taxable ?? (w.outwardSummary || w.summary).taxable,
        taxes: saved?.taxes || { ...(w.outwardSummary || w.summary).taxes },
      };
    if (table === "4")
      result.a5 = { taxable: 0, taxes: saved?.taxes || { ...w.eligibleItc } };
    return result;
  });
  const valueChange = (key, field, value) =>
    setRows((old) => ({
      ...old,
      [key]:
        field === "taxable"
          ? { ...old[key], taxable: value }
          : { ...old[key], taxes: { ...old[key].taxes, [field]: value } },
    }));
  const fields =
    table === "5"
      ? ["igst", "cgst"]
      : table === "3.2"
        ? ["taxable", "igst"]
        : ["4", "5.1"].includes(table)
          ? HEADS
          : ["taxable", ...HEADS];
  const names = {
    taxable: "Total Taxable Value (₹)",
    igst: table === "5" ? "Inter-State Supplies (₹)" : "Integrated Tax (₹)",
    cgst: table === "5" ? "Intra-State Supplies (₹)" : "Central Tax (₹)",
    sgst: "State/UT Tax (₹)",
    cess: "Cess (₹)",
  };
  return (
    <Modal
      title={`${table} — ${TABLES_3B.find(([key]) => key === table)[1]}`}
      wide
      onClose={onClose}
    >
      <div className="table-scroll">
        <table className="editable-table">
          <thead>
            <tr>
              <th>Nature of Supplies</th>
              {fields.map((f) => (
                <th key={f}>{names[f]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS_3B[table].map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                {fields.map((f) => (
                  <td key={f}>
                    <input
                      aria-label={`${label} ${names[f]}`}
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={
                        table === "3.1" &&
                        ["c", "e"].includes(key) &&
                        f !== "taxable"
                      }
                      value={
                        f === "taxable"
                          ? rows[key]?.taxable || 0
                          : rows[key]?.taxes[f] || 0
                      }
                      onChange={(e) => valueChange(key, f, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table === "4" && (
        <p className="info">
          Net ITC available = (A) ITC Available − (B) ITC Reversed. Disclosure
          rows in (D) do not add to available credit.
        </p>
      )}
      <div className="actions">
        <Btn tone="secondary" onClick={onClose}>
          CANCEL
        </Btn>
        <Btn
          onClick={async () => {
            await mutate("gstr3b/save", { table, rows, nil: false });
            onClose();
          }}
        >
          CONFIRM / SAVE
        </Btn>
      </div>
    </Modal>
  );
}
export function Gstr3b() {
  const { p, w, mutate, go } = usePortal();
  const [table, setTable] = useState(null);
  const [payment, setPayment] = useState(false);
  const [preview, setPreview] = useState(false);
  const [signing, setSigning] = useState(false);
  const [nil, setNil] = useState(p.gstr3b.nil || false);
  const locked = ["Offset", "Filed"].includes(p.gstr3b.status);
  const canNil = !p.invoices.length && !p.purchases.length;
  const plan = p.gstr3b.offset || w.paymentPlan;
  function edit(key) {
    setTable(key);
  }
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], "GSTR-3B"]} />
      <h1>GSTR-3B — Monthly Return</h1>
      <TaxpayerBar />
      <div className="return-status">
        Status:{" "}
        <b className={p.gstr3b.status === "Filed" ? "green" : ""}>
          {p.gstr3b.status}
        </b>
        {p.gstr3b.arn && <span>ARN: {p.gstr3b.arn}</span>}
      </div>
      {!locked && (
        <Panel title="Return Details">
          <label className="check-line">
            <input
              type="checkbox"
              disabled={!canNil}
              checked={nil}
              onChange={(e) => setNil(e.target.checked)}
            />
            Do you want to file Nil return?
          </label>
          {!canNil && (
            <p className="muted">
              Nil filing is unavailable because this period contains outward or
              inward supplies.
            </p>
          )}
        </Panel>
      )}
      {payment || locked ? (
        <Panel title="6.1 — Payment of Tax">
          <HeadTable
            rows={[
              ["Tax liability", plan.liability],
              [
                "Available ITC (including current period)",
                plan.availableCredit || w.credit,
              ],
              ["Credit to be utilised", plan.creditUsed],
              ["Cash to be utilised", plan.cashUsed],
              ["Available cash balance", w.cash],
              ["Additional cash required", locked ? {} : plan.shortfall],
            ]}
          />
          <div className="actions">
            {!locked && (
              <>
                <Btn tone="secondary" onClick={() => setPayment(false)}>
                  BACK TO RETURN
                </Btn>
                <Btn tone="secondary" onClick={() => go("challans")}>
                  CREATE CHALLAN
                </Btn>
                <Btn onClick={() => mutate("gstr3b/offset")}>
                  MAKE PAYMENT / POST CREDIT TO LEDGER
                </Btn>
              </>
            )}
            {p.gstr3b.status === "Offset" && (
              <Btn onClick={() => setSigning(true)}>PROCEED TO FILE</Btn>
            )}
            {p.gstr3b.status === "Filed" && (
              <Btn onClick={() => setPreview(true)}>VIEW FILED RETURN</Btn>
            )}
          </div>
        </Panel>
      ) : (
        <div className="gstr3b-tiles">
          {TABLES_3B.map(([key, name]) => (
            <button className="gstr3b-tile" key={key} onClick={() => edit(key)}>
              <h2>
                {key} {name}
              </h2>
              <span>
                Taxable Value (₹)
                <b>
                  {money(
                    p.gstr3b.tables[key]?.taxable ??
                      (key === "3.1"
                        ? (w.outwardSummary || w.summary).taxable
                        : 0),
                  )}
                </b>
              </span>
              <span>
                Total Tax (₹)
                <b>
                  {money(
                    total(
                      p.gstr3b.tables[key]?.taxes ||
                        (key === "3.1"
                          ? (w.outwardSummary || w.summary).taxes
                          : key === "4"
                            ? w.eligibleItc
                            : {}),
                    ),
                  )}
                </b>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("returns")}>
          BACK
        </Btn>
        <Btn tone="secondary" onClick={() => setPreview(true)}>
          PREVIEW DRAFT GSTR-3B
        </Btn>
        {!locked && !payment && (
          <>
            <Btn onClick={() => mutate("gstr3b/save", { nil })}>
              SAVE GSTR-3B
            </Btn>
            <Btn disabled={!p.gstr3b.saved} onClick={() => setPayment(true)}>
              PROCEED TO PAYMENT
            </Btn>
          </>
        )}
      </div>
      {table && (
        <Gstr3bTableEditor table={table} onClose={() => setTable(null)} />
      )}
      {preview && (
        <ReturnPreview type="GSTR-3B" onClose={() => setPreview(false)} />
      )}
      {signing && (
        <Signing
          title="File GSTR-3B"
          purpose="gstr3b-file"
          onClose={() => setSigning(false)}
          onSubmit={(form) => mutate("gstr3b/file", form)}
        />
      )}
    </div>
  );
}

export function Ledgers() {
  const { w } = usePortal();
  const [tab, setTab] = useState("cash");
  const rows = w.ledger.filter((e) =>
    tab === "credit"
      ? e.type === "ITC credited" || e.creditDebit
      : tab === "cash"
        ? e.type === "Cash deposit" || e.debit
        : e.type === "Liability offset",
  );
  return (
    <div className="container">
      <Crumbs items={["Services", "Ledgers"]} />
      <h1>Electronic Ledgers</h1>
      <div className="tabs">
        {[
          ["cash", "Electronic Cash Ledger"],
          ["credit", "Electronic Credit Ledger"],
          ["liability", "Electronic Liability Register"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </div>
      <Panel title="Balance Details">
        <HeadTable
          rows={[
            [
              "Available balance",
              tab === "cash"
                ? w.cash
                : tab === "credit"
                  ? w.credit
                  : Object.fromEntries(
                      HEADS.map((h) => [
                        h,
                        Object.values(w.periods)
                          .filter((p) => !p.gstr3b.offset)
                          .reduce(
                            (n, p) =>
                              n +
                              Number(p.gstr3b.tables["3.1"]?.taxes?.[h] || 0),
                            0,
                          ),
                      ]),
                    ),
            ],
          ]}
        />
      </Panel>
      <Panel title="Transaction Details">
        <Table
          columns={[
            "Date",
            "Reference Number",
            "Description",
            "Return Period",
            "Debit (₹)",
            "Credit (₹)",
          ]}
          count={rows.length}
        >
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{dateLabel(e.date)}</td>
              <td>{e.reference}</td>
              <td>{e.type}</td>
              <td>{periodLabel(e.period)}</td>
              <td className="number">
                {money(total(tab === "credit" ? e.creditDebit : e.debit))}
              </td>
              <td className="number">{money(total(e.credit))}</td>
            </tr>
          ))}
        </Table>
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() =>
              download(`ledger-${tab}.json`, {
                balances: tab === "credit" ? w.credit : w.cash,
                entries: rows,
              })
            }
          >
            DOWNLOAD
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

export function Challans() {
  const { w, active, mutate, go } = usePortal();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [bank, setBank] = useState("");
  const [amounts, setAmounts] = useState({ ...w.paymentPlan.shortfall });
  const [mode, setMode] = useState("E-Payment");
  return (
    <div className="container">
      <Crumbs items={["Services", "Payments"]} />
      <Panel
        title="Challan History"
        extra={<Btn onClick={() => setCreating(true)}>CREATE CHALLAN</Btn>}
      >
        <Table
          columns={[
            "CPIN",
            "Created On",
            "Total Amount (₹)",
            "Payment Mode",
            "Status",
            "Action",
          ]}
          count={w.challans.length}
        >
          {w.challans.map((c) => (
            <tr key={c.id}>
              <td>{c.cpin}</td>
              <td>{dateLabel(c.createdAt)}</td>
              <td className="number">{money(c.total)}</td>
              <td>{c.mode}</td>
              <td>{c.status}</td>
              <td>
                <button className="link" onClick={() => setSelected(c)}>
                  {c.status === "Paid" ? "VIEW RECEIPT" : "PAY / VIEW"}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("gstr3b")}>
          BACK TO GSTR-3B
        </Btn>
      </div>
      {creating && (
        <Modal title="Create Challan" wide onClose={() => setCreating(false)}>
          <p>
            GSTIN: <b>{active.state.taxpayer.gstin}</b>
          </p>
          <div className="form-grid">
            {HEADS.map((h) => (
              <Input
                key={h}
                type="number"
                label={`${h === "sgst" ? "State / UT Tax" : h.toUpperCase()} — Tax (₹)`}
                min="0"
                step="0.01"
                value={amounts[h]}
                onChange={(e) =>
                  setAmounts({ ...amounts, [h]: e.target.value })
                }
              />
            ))}
          </div>
          <p>
            Total Challan Amount: <b>₹ {money(total(amounts))}</b>
          </p>
          <Select
            label="Payment Mode"
            required
            value={mode}
            options={["E-Payment", "NEFT / RTGS", "Over the Counter"]}
            onChange={(e) => setMode(e.target.value)}
          />
          <div className="actions">
            <Btn tone="secondary" onClick={() => setCreating(false)}>
              CANCEL
            </Btn>
            <Btn
              onClick={async () => {
                const result = await mutate("challan/create", {
                  amounts,
                  mode,
                });
                setCreating(false);
                setSelected(result.challan);
              }}
            >
              GENERATE CHALLAN
            </Btn>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal
          title={
            selected.status === "Paid" ? "Payment Receipt" : "Challan Details"
          }
          wide
          onClose={() => setSelected(null)}
        >
          <div className="print-sheet">
            <h2>GST PMT-06</h2>
            <p>
              CPIN: <b>{selected.cpin}</b>
            </p>
            <p>GSTIN: {active.state.taxpayer.gstin}</p>
            <HeadTable rows={[["Tax", selected.amounts]]} />
            <p>
              Total Amount: <b>₹ {money(selected.total)}</b>
            </p>
            <p>
              Status: <b>{selected.status}</b>
            </p>
            {selected.cin && (
              <p>
                CIN: <b>{selected.cin}</b>
              </p>
            )}
          </div>
          {selected.status !== "Paid" && (
            <Select
              label="Select Bank"
              required
              value={bank}
              options={["State Bank", "National Bank", "City Bank"]}
              onChange={(e) => setBank(e.target.value)}
            />
          )}
          <div className="actions">
            <Btn tone="secondary" onClick={() => window.print()}>
              PRINT
            </Btn>
            {selected.status !== "Paid" && (
              <Btn
                disabled={!bank}
                onClick={async () => {
                  const result = await mutate("challan/pay", {
                    id: selected.id,
                  });
                  setSelected(result.challan);
                }}
              >
                MAKE PAYMENT
              </Btn>
            )}
            <Btn tone="secondary" onClick={() => setSelected(null)}>
              CLOSE
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function FiledReturns() {
  const { w, mutate } = usePortal();
  const [preview, setPreview] = useState(null);
  const rows = Object.entries(w.periods).flatMap(([period, p]) =>
    [
      ["GSTR-1", p.gstr1],
      ["GSTR-3B", p.gstr3b],
    ]
      .filter(([, r]) => r.status === "Filed")
      .map(([type, r]) => ({ period, type, ...r })),
  );
  return (
    <div className="container">
      <Crumbs items={["Returns", "View Filed Returns"]} />
      <Panel title="View Filed Returns">
        <Table
          columns={[
            "Return Type",
            "Return Period",
            "Date of Filing",
            "ARN",
            "Action",
          ]}
          count={rows.length}
        >
          {rows.map((r) => (
            <tr key={r.period + r.type}>
              <td>{r.type}</td>
              <td>{periodLabel(r.period)}</td>
              <td>{dateLabel(r.filedAt)}</td>
              <td>{r.arn}</td>
              <td>
                <Btn
                  tone="secondary"
                  onClick={async () => {
                    await mutate("period", { period: r.period });
                    setPreview(r.type);
                  }}
                >
                  VIEW RETURN
                </Btn>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      {preview && (
        <ReturnPreview type={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
