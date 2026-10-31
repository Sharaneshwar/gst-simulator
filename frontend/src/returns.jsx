import { RateSelect } from "./rate-guide";
import { HsnSearch } from "./hsn-search";
import { Interstate3b, InvoiceExtraFields } from "./workflows";
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
  const { w, p, mutate, go, setError } = usePortal();
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
  const isIff = w.returnInfo?.isIff,
    qrmp = w.filingFrequency === "QRMP";
  const tiles = [
    [
      "Details of outward supplies of goods or services",
      isIff ? "IFF" : "GSTR-1",
      p.gstr1.status,
      "gstr1",
      "offline",
    ],
    ["Auto Drafted Details (For view only)", "GSTR-2A", "Available", "gstr2a"],
    ["Auto-drafted ITC Statement", "GSTR-2B", "Available", "gstr2b"],
    ...(!isIff
      ? [
          [
            qrmp ? "Quarterly Return" : "Monthly Return",
            "GSTR-3B",
            p.gstr3b.status,
            "gstr3b",
            "offline3b",
          ],
        ]
      : []),
  ];
  return (
    <div className="container">
      <Crumbs items={["Returns"]} />
      <Panel title="File Returns">
        <p>Select the financial year, quarter and return filing period.</p>
        <div className="filter-row">
          <Select
            label="Return Filing Frequency"
            value={w.filingFrequency || "Monthly"}
            options={["Monthly", "QRMP"]}
            onChange={async (e) => {
              if (!e.target.value) return;
              try {
                await mutate("filing-frequency", {
                  frequency: e.target.value,
                  period: `${month < 4 ? year + 1 : year}-${String(month).padStart(2, "0")}`,
                });
                setSearched(true);
              } catch (error) {
                setError(error.message);
              }
            }}
          />
        </div>
        {qrmp && (
          <p className="info">
            {isIff
              ? "IFF is available for B2B invoices and registered notes. Make the monthly payment through PMT-06. GSTR-3B is filed at quarter end."
              : "Quarter-end GSTR-1 excludes supplies already filed through IFF. GSTR-3B includes the entire quarter."}
          </p>
        )}
        <div className="filter-row">
          <Select
            label="Financial Year"
            value={year}
            options={Array.from(
              { length: Math.max(8, new Date().getFullYear() - 2022 + 3) },
              (_, i) => 2022 + i,
            ).map((y) => [y, `${y}-${y + 1}`])}
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
          {isIff && (
            <div className="actions">
              <Btn onClick={() => go("challans")}>CREATE PMT-06 CHALLAN</Btn>
            </div>
          )}
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
  const returnInvoices = w.gstr1Invoices || p.invoices;
  const isIff = w.returnInfo?.isIff;
  const summaryNeedsUpdate =
    !p.gstr1.summary || p.gstr1.summaryRevision !== p.gstr1.revision;
  const [amendments, setAmendments] = useState(false);
  const [preview, setPreview] = useState(false);
  const [signing, setSigning] = useState(false);
  const [nil, setNil] = useState(false);
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], "GSTR-1"]} />
      <div className="page-title">
        <h1>
          {isIff
            ? "IFF — Invoice Furnishing Facility"
            : "GSTR-1 — Details of outward supplies of goods or services"}
        </h1>
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
              disabled={returnInvoices.length > 0}
              onChange={(e) => setNil(e.target.checked)}
            />
            File Nil GSTR-1 (no outward supplies in this period)
          </label>
          {returnInvoices.length > 0 && (
            <p className="muted">
              Nil filing is unavailable because this period contains outward
              supply records.
            </p>
          )}
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
        {SECTIONS.filter(
          ([key]) =>
            (amendments ? key.endsWith("A") : !key.endsWith("A")) &&
            (!isIff || ["B2B", "CDNR", "B2BA", "CDNRA"].includes(key)),
        ).map(([key, code, title]) => {
          const rows = returnInvoices.filter((i) => i.section === key);
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
      {p.gstr1.status !== "Filed" && summaryNeedsUpdate && (
        <p className="info" id="gstr1-filing-requirement" role="status">
          {p.gstr1.summary
            ? "Your summary is out of date. Select GENERATE SUMMARY again after editing records to enable filing."
            : "Select GENERATE SUMMARY to enable PROCEED TO FILE / SUMMARY."}
        </p>
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
              disabled={summaryNeedsUpdate}
              aria-describedby={
                summaryNeedsUpdate ? "gstr1-filing-requirement" : undefined
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
  const locked =
    p.gstr1.status === "Filed" ||
    (w.filingFrequency === "QRMP" &&
      w.periods[w.returnInfo.end]?.gstr1.status === "Filed");
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
    ? editing.items?.length
      ? editing.items.reduce(
          (n, i) => n + (Number(i.taxable || 0) * Number(i.rate || 0)) / 100,
          0,
        )
      : (Number(editing.taxable || 0) * Number(editing.rate || 0)) / 100
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
                  <HsnSearch
                    label="HSN / SAC"
                    required
                    value={editing.hsn}
                    onChange={(value) =>
                      setEditing((old) => ({
                        ...old,
                        hsn: value,
                        hsnDescription: "",
                      }))
                    }
                    onSelect={(record) =>
                      setEditing((old) => ({
                        ...old,
                        hsn: record.code,
                        hsnDescription: record.description,
                        number:
                          !old.number || old.number === `HSN ${old.hsn}`
                            ? `HSN ${record.code}`
                            : old.number,
                      }))
                    }
                  />
                  <Input
                    label="Description as per HSN / SAC"
                    value={editing.hsnDescription || ""}
                    readOnly
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
                    readOnly={Boolean(editing.items?.length)}
                    value={editing.taxable}
                    onChange={(e) => set("taxable", e.target.value)}
                  />
                  {section !== "NIL" && (
                    <>
                      <RateSelect
                        label="Rate (%)"
                        required
                        value={editing.rate}
                        disabled={Boolean(editing.items?.length)}
                        date={editing.date}
                        onChange={(e) => set("rate", e.target.value)}
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
            <InvoiceExtraFields
              section={section}
              editing={editing}
              setEditing={setEditing}
            />
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
    const saved = p.gstr3b.tables[table] || w.draft3b?.[table];
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
  if (table === "3.2") return <Interstate3b onClose={onClose} />;
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
  const canNil =
    !(w.gstr3bInvoices || p.invoices).length &&
    !(w.gstr3bPurchases || p.purchases).length &&
    !Object.values(p.gstr3b.tables).some(
      (t) => t.taxable > 0 || total(t.taxes) > 0,
    );
  const plan = p.gstr3b.offset || w.paymentPlan;
  if (w.returnInfo?.isIff)
    return (
      <div className="container">
        <Panel title="GSTR-3B">
          <p>
            GSTR-3B is available at quarter end. Use PMT-06 for the monthly
            payment.
          </p>
          <Btn onClick={() => go("returns")}>BACK TO RETURNS</Btn>
        </Panel>
      </div>
    );
  function edit(key) {
    setTable(key);
  }
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], "GSTR-3B"]} />
      <h1>
        GSTR-3B — {w.filingFrequency === "QRMP" ? "Quarterly" : "Monthly"}{" "}
        Return
      </h1>
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
          {!locked && p.gstr1.status !== "Filed" && (
            <div className="info" role="status">
              <p>
                File GSTR-1 for this period before making the GSTR-3B payment.
              </p>
              <Btn tone="secondary" onClick={() => go("gstr1")}>
                OPEN GSTR-1
              </Btn>
            </div>
          )}
          {!locked && total(plan.shortfall) > 0 && (
            <p className="info">
              Additional cash required: ₹ {money(total(plan.shortfall))}. Create
              and pay a challan for the shortfall, then return here to make
              payment.
            </p>
          )}
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
                    (p.gstr3b.tables[key] || w.draft3b?.[key])?.taxable ??
                      (key === "3.1"
                        ? (w.outwardSummary || w.summary).taxable
                        : 0),
                  )}
                </b>
              </span>
              <span>
                {key === "5" ? "Total Supplies (₹)" : "Total Tax (₹)"}
                <b>
                  {money(
                    total(
                      (p.gstr3b.tables[key] || w.draft3b?.[key])?.taxes ||
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
      {!locked && !payment && !p.gstr3b.saved && (
        <p className="info" id="gstr3b-payment-requirement" role="status">
          Select SAVE GSTR-3B to enable PROCEED TO PAYMENT.
        </p>
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
            <Btn
              disabled={!p.gstr3b.saved}
              aria-describedby={
                !p.gstr3b.saved ? "gstr3b-payment-requirement" : undefined
              }
              onClick={() => setPayment(true)}
            >
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
  const { w, active, user, mutate, go } = usePortal();
  const [reason, setReason] = useState(
    w.filingFrequency === "QRMP"
      ? "Monthly payment for quarterly return"
      : "Any other payment",
  );
  const [challanType, setChallanType] = useState("Self-assessment basis");
  const [bankStep, setBankStep] = useState(false),
    [terms, setTerms] = useState(false),
    [bankOtp, setBankOtp] = useState(null),
    [code, setCode] = useState("");
  const [paymentEmail, setPaymentEmail] = useState(user.email);
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
        extra={
          <Btn
            onClick={() => {
              setAmounts({ ...w.paymentPlan.shortfall });
              setCreating(true);
            }}
          >
            CREATE CHALLAN
          </Btn>
        }
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
                <button
                  className="link"
                  onClick={() => {
                    setSelected(c);
                    setBankStep(false);
                    setTerms(false);
                    setBankOtp(null);
                    setCode("");
                  }}
                >
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
            <Select
              label="Reason for Challan"
              value={reason}
              options={[
                "Monthly payment for quarterly return",
                "Any other payment",
              ]}
              onChange={(e) => setReason(e.target.value)}
            />
            <Select
              label="Challan Type"
              value={challanType}
              options={["Self-assessment basis", "Fixed sum basis"]}
              onChange={(e) => setChallanType(e.target.value)}
            />
            <Input
              label="Payment Period"
              value={periodLabel(w.period)}
              readOnly
            />
          </div>
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
                  reason,
                  challanType,
                });
                setBankStep(false);
                setTerms(false);
                setBankOtp(null);
                setCode("");
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
            <p>
              Reason: {selected.reason || "Any other payment"} · Challan Type:{" "}
              {selected.challanType || "Self-assessment basis"}
            </p>
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
              options={["State Bank of India", "National Bank", "City Bank"]}
              onChange={(e) => setBank(e.target.value)}
            />
          )}
          {selected.status !== "Paid" && (
            <>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                I accept the terms and conditions.
              </label>
              {bankStep && (
                <Panel title={`${bank} — Net Banking`}>
                  <p>Selected Account: Savings Account ·•••• 0000</p>
                  <p>Payment Amount: ₹ {money(selected.total)}</p>
                  <Input
                    label="Email Address for OTP"
                    type="email"
                    value={paymentEmail}
                    onChange={(e) => setPaymentEmail(e.target.value)}
                  />
                  {!bankOtp ? (
                    <Btn
                      onClick={async () => {
                        const result = await mutate("challan/otp", {
                          id: selected.id,
                          bank,
                          terms,
                          email: paymentEmail,
                        });
                        setBankOtp(result.otp);
                      }}
                    >
                      CONFIRM PAYMENT
                    </Btn>
                  ) : (
                    <>
                      <Input
                        label="OTP"
                        inputMode="numeric"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                      <OtpResend
                        delivery={bankOtp}
                        onResend={async () => {
                          const result = await mutate("challan/otp", {
                            id: selected.id,
                            bank,
                            terms,
                            email: paymentEmail,
                          });
                          setBankOtp(result.otp);
                          setCode("");
                        }}
                      />
                    </>
                  )}
                </Panel>
              )}
            </>
          )}
          {selected.status !== "Paid" &&
            (!bank || !terms || (bankStep && !bankOtp)) && (
              <p
                className="info"
                id="challan-payment-requirement"
                role="status"
              >
                {!bank
                  ? "Select a bank to continue."
                  : !terms
                    ? "Accept the terms and conditions to continue."
                    : "Select CONFIRM PAYMENT to receive the payment OTP."}
              </p>
            )}
          <div className="actions">
            <Btn tone="secondary" onClick={() => window.print()}>
              PRINT
            </Btn>
            {selected.status !== "Paid" && (
              <Btn
                disabled={!bank || !terms || (bankStep && !bankOtp)}
                aria-describedby={
                  !bank || !terms || (bankStep && !bankOtp)
                    ? "challan-payment-requirement"
                    : undefined
                }
                onClick={async () => {
                  if (!bankStep) {
                    setBankStep(true);
                    return;
                  }
                  const result = await mutate("challan/pay", {
                    id: selected.id,
                    challengeId: bankOtp.challengeId,
                    otp: code,
                  });
                  setSelected(result.challan);
                }}
              >
                {bankStep ? "VERIFY OTP & PAY" : "MAKE PAYMENT"}
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
