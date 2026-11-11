import {
  PortalDate,
  ProcessingRecords,
  IrpDetails,
  FeesCalculator,
} from "./advanced-pages";
import { RateSelect } from "./rate-guide";
import { HsnSearch } from "./hsn-search";
import { InvoiceRateGrid } from "./invoice-rate-grid";
import {
  GRID_SECTIONS,
  invoiceTaxContext,
  rateTotals,
  resetTaxOverrides,
  itcNet,
} from "./return-entry.mjs";
import {
  GST_STATES,
  GST_STATE_OPTIONS,
  stateFromGstin,
} from "./gst-states.mjs";
import { ledgerStatement, ledgerCsv } from "./ledger-view.mjs";
import { EwayReturnImport } from "./eway-return-import";
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
  OtpResend,
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
  const [searched, setSearched] = useState(false);
  const monthOptions = Array.from(
    { length: 3 },
    (_, i) => (((quarter - 1) * 3 + i + 3) % 12) + 1,
  );
  const isIff = w.returnInfo?.isIff,
    qrmp = w.filingFrequency === "QRMP";
  const selectedPeriod = `${month < 4 ? year + 1 : year}-${String(month).padStart(2, "0")}`;
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
          <Btn
            tone="secondary"
            onClick={async () => {
              if (w.period !== selectedPeriod)
                await mutate("period", { period: selectedPeriod });
              go("supplier-data");
            }}
          >
            UPLOAD PURCHASE DATA
          </Btn>
        </div>
      </Panel>
      {searched && (
        <>
          <TaxpayerBar />
          <PortalDate key={w.period} />
          <div className="actions">
            <Btn tone="secondary" onClick={() => go("ims")}>
              INVOICE MANAGEMENT SYSTEM
            </Btn>
            <Btn tone="secondary" onClick={() => go("masters")}>
              MY MASTERS
            </Btn>
          </div>
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

export function Gstr1({ summaryView = false }) {
  const { p, w, go, mutate } = usePortal();
  const returnInvoices = w.gstr1Invoices || p.invoices;
  const isIff = w.returnInfo?.isIff;
  const summaryNeedsUpdate =
    !p.gstr1.summary || p.gstr1.summaryRevision !== p.gstr1.revision;
  const [amendments, setAmendments] = useState(false);
  const [preview, setPreview] = useState(false);
  const [signing, setSigning] = useState(false);
  const [nil, setNil] = useState(false);
  if (summaryView)
    return (
      <div className="container">
        <Crumbs
          items={[
            ["Returns", "returns"],
            ["GSTR-1", "gstr1"],
            "Consolidated summary",
          ]}
        />
        <h1>{isIff ? "IFF" : "GSTR-1"} — Consolidated summary</h1>
        <TaxpayerBar />
        {summaryNeedsUpdate && (
          <p className="info" role="status">
            Generate the latest GSTR-1 summary before filing.
          </p>
        )}
        <Panel title="Summary of outward supplies">
          <Table
            columns={[
              "Table",
              "Description",
              "No. of Records",
              "Taxable Value (₹)",
              "Integrated Tax (₹)",
              "Central Tax (₹)",
              "State/UT Tax (₹)",
              "Cess (₹)",
            ]}
          >
            {SECTIONS.map(([key, code, label]) => {
              const records = returnInvoices.filter(
                (row) => row.section === key,
              );
              return records.length ? (
                <tr key={key}>
                  <td>{code}</td>
                  <td>{label}</td>
                  <td>{records.length}</td>
                  <td className="number">
                    {money(
                      records.reduce(
                        (sum, row) => sum + Number(row.taxable || 0),
                        0,
                      ),
                    )}
                  </td>
                  {HEADS.map((head) => (
                    <td className="number" key={head}>
                      {money(
                        records.reduce(
                          (sum, row) => sum + Number(row.taxes?.[head] || 0),
                          0,
                        ),
                      )}
                    </td>
                  ))}
                </tr>
              ) : null;
            })}
          </Table>
          <HeadTable rows={[["Total tax liability", p.gstr1.summary?.taxes]]} />
        </Panel>
        <div className="actions">
          <Btn tone="secondary" onClick={() => go("gstr1")}>
            BACK
          </Btn>
          <Btn
            disabled={summaryNeedsUpdate || p.gstr1.status === "Filed"}
            onClick={() => setSigning(true)}
          >
            FILE STATEMENT
          </Btn>
        </div>
        {signing && (
          <Signing
            title={`File ${isIff ? "IFF" : "GSTR-1"}`}
            purpose="gstr1-file"
            onClose={() => setSigning(false)}
            onSubmit={async (form) => {
              await mutate("gstr1/file", { ...form, nil });
              go("gstr1");
              setSigning(false);
            }}
          />
        )}
      </div>
    );
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
      <IrpDetails />
      <ProcessingRecords />
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
              onClick={() => go("gstr1/summary")}
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
  const { p, w, active, mutate, go, api } = usePortal();
  const definition = SECTIONS.find(([key]) => key === section);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [processTab, setProcessTab] = useState("Processed");
  const [hiddenColumns, setHiddenColumns] = useState({});
  const [hsnScope, setHsnScope] = useState("Registered");
  const [importEwb, setImportEwb] = useState(false);
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
    supplyCategory: "Regular",
    urType: "B2CL",
    recipientType: hsnScope,
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
  const rows = (w.gstr1Invoices || p.invoices).filter(
    (i) =>
      i.section === section &&
      (section !== "HSN" ||
        w.period < "2025-05" ||
        (i.recipientType || "Registered") === hsnScope) &&
      (!recipient || i.gstin === recipient) &&
      `${i.number} ${i.gstin} ${i.recipient}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const rowLocked = (row) =>
    locked ||
    Object.entries(w.periods).some(
      ([period, data]) =>
        period !== w.period &&
        data.gstr1.status === "Filed" &&
        data.invoices.some((invoice) => invoice.id === row.id),
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
  const useRateGrid = GRID_SECTIONS.includes(section);
  const recipientView = ["B2B", "CDNR"].includes(section) && recipient === null;
  const groups = [...new Set(rows.map((row) => row.gstin))].map((gstin) => {
    const documents = rows.filter((row) => row.gstin === gstin);
    return {
      gstin,
      name: documents.find((row) => row.recipient)?.recipient || "—",
      documents,
    };
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice(
    (Math.min(page, pageCount) - 1) * pageSize,
    Math.min(page, pageCount) * pageSize,
  );
  const set = (key, value) =>
    setEditing((old) => {
      let next = { ...old, [key]: value };
      if (
        [
          "place",
          "exportType",
          "supplyCategory",
          "urType",
          "reverseCharge",
          "intraStateIgst",
          "differential",
          "taxable",
          "rate",
        ].includes(key)
      ) {
        if (key === "reverseCharge" && !value) next.intraStateIgst = false;
        if (key === "place" && value !== active.state.taxpayer.state)
          next.intraStateIgst = false;
        next = resetTaxOverrides(next);
        if (section !== "HSN") delete next.reportedTaxes;
      }
      if (key === "gstin") {
        const state = stateFromGstin(value);
        if (value.length === 15 && state)
          next = resetTaxOverrides({
            ...next,
            place: state,
            intraStateIgst: false,
          });
        const known = [
          ...(w.masters?.parties || []).map((party) => ({
            ...party,
            recipient: party.name,
          })),
          ...p.invoices,
        ].find((row) => row.gstin === value && row.recipient);
        if (known) next.recipient = known.recipient;
      }
      return next;
    });
  const startEntry = (gstin = recipient) =>
    setEditing({
      ...empty(),
      ...(gstin
        ? {
            gstin,
            recipient:
              [
                ...(w.masters?.parties || []).map((party) => ({
                  ...party,
                  recipient: party.name,
                })),
                ...p.invoices,
              ].find((row) => row.gstin === gstin)?.recipient || "",
            place: stateFromGstin(gstin) || active.state.taxpayer.state,
          }
        : {}),
    });
  const tax = editing
    ? editing.items?.length
      ? editing.items.reduce(
          (n, i) => n + (Number(i.taxable || 0) * Number(i.rate || 0)) / 100,
          0,
        )
      : (Number(editing.taxable || 0) * Number(editing.rate || 0)) / 100
    : 0;
  const interstate = editing
    ? invoiceTaxContext(editing, active.state.taxpayer.state).interstate
    : false;
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], ["GSTR-1", "gstr1"], title]} />
      <h1>
        {code} - {title}
      </h1>
      <TaxpayerBar />
      <ProcessingRecords section={section} onTabChange={setProcessTab} />
      {section === "HSN" && (
        <div className="actions">
          <Btn
            tone="secondary"
            disabled={locked}
            onClick={async () => {
              if (
                window.confirm(
                  "Replace the current HSN summary with active e-invoice item data?",
                )
              )
                await mutate("gstr1/import-hsn", { confirm: true });
            }}
          >
            IMPORT HSN DATA FROM E-INVOICES
          </Btn>
        </div>
      )}
      {!locked &&
        !editing &&
        ["B2B", "B2CL", "EXP", "B2CS"].includes(section) && (
          <div className="actions">
            <Btn tone="secondary" onClick={() => setImportEwb(true)}>
              IMPORT EWB DATA
            </Btn>
          </div>
        )}
      {section === "HSN" && w.period >= "2025-05" && !editing && (
        <div className="tabs" aria-label="HSN supply category">
          {[
            ["Registered", "B2B Supplies"],
            ["Unregistered", "B2C Supplies"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={hsnScope === value ? "active" : ""}
              onClick={() => {
                setHsnScope(value);
                setPage(1);
                setQuery("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Panel
        className={`${editing && useRateGrid ? "invoice-entry" : ""} ${processTab !== "Processed" ? "hidden-processed-records" : ""}`}
        title={
          editing
            ? `${editing.id ? "Edit" : "Add"} Details`
            : recipientView
              ? "Recipient wise count"
              : "Document wise details"
        }
        extra={
          !editing &&
          !locked && (
            <Btn onClick={() => startEntry()}>
              {recipientView ? "ADD RECORD" : "ADD DETAILS"}
            </Btn>
          )
        }
      >
        {editing ? (
          <>
            <p className="mandatory">
              <b className="required">●</b> indicates mandatory fields
            </p>
            {registered && (
              <div className="invoice-supply-options">
                {[
                  ["DeemedExport", "Deemed Exports"],
                  ["SEZWP", "SEZ Supplies with payment"],
                  ["SEZWOP", "SEZ Supplies without payment"],
                ].map(([value, label]) => (
                  <label className="check-line" key={value}>
                    <input
                      type="checkbox"
                      checked={editing.supplyCategory === value}
                      onChange={(event) =>
                        set(
                          "supplyCategory",
                          event.target.checked ? value : "Regular",
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={editing.reverseCharge || false}
                    onChange={(event) =>
                      set("reverseCharge", event.target.checked)
                    }
                  />
                  Supply attracts reverse charge
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    disabled={
                      !editing.reverseCharge ||
                      editing.place !== active.state.taxpayer.state
                    }
                    checked={editing.intraStateIgst || false}
                    onChange={(event) =>
                      set("intraStateIgst", event.target.checked)
                    }
                  />
                  Intra-State supplies attracting IGST
                </label>
              </div>
            )}
            {(useRateGrid || section.startsWith("B2CS")) && (
              <label className="check-line differential-option">
                <input
                  type="checkbox"
                  checked={editing.differential || false}
                  onChange={(event) =>
                    set("differential", event.target.checked)
                  }
                />
                Is the supply eligible to be taxed at a differential percentage
                (%) of the existing rate of tax, as notified by the Government?
              </label>
            )}
            {section === "HSN" && (
              <Select
                label="Product Name (My Master)"
                options={(w.masters?.products || []).map((product) => [
                  product.id,
                  product.name,
                ])}
                value={
                  (w.masters?.products || []).find(
                    (product) => product.name === editing.productName,
                  )?.id || ""
                }
                onChange={(e) => {
                  const product = w.masters.products.find(
                    (product) => product.id === e.target.value,
                  );
                  if (product)
                    setEditing((old) => ({
                      ...old,
                      hsn: product.hsn,
                      uqc: product.uqc,
                      rate: product.rate,
                      productName: product.name,
                    }));
                }}
              />
            )}
            <div className="form-grid">
              {registered && (
                <Input
                  label="GSTIN/UIN of Recipient"
                  required
                  value={editing.gstin}
                  onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                  onBlur={async () => {
                    const gstin = editing.gstin;
                    if (gstin.length !== 15 || !api) return;
                    try {
                      const result = await api(
                        `/portal/taxpayers?query=${encodeURIComponent(gstin)}`,
                      );
                      const found = result.taxpayers.find(
                        (row) => row.gstin === gstin,
                      );
                      if (found)
                        setEditing((old) =>
                          old?.gstin === gstin
                            ? { ...old, recipient: found.legalName }
                            : old,
                        );
                    } catch {
                      /* Keep manual names available for a dummy recipient outside the local master. */
                    }
                  }}
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
              {!["B2CS", "HSN", "DOCS"].includes(section) && (
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
                  maxLength={aggregate ? 30 : 16}
                  onChange={(e) => set("number", e.target.value)}
                  help={
                    !aggregate
                      ? "Maximum 16 characters: letters, numbers, / and -."
                      : undefined
                  }
                />
              )}
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
                  min={
                    ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                      ? undefined
                      : "0"
                  }
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
                    options={GST_STATE_OPTIONS}
                  />
                )
              )}
              {section.startsWith("CDNUR") && (
                <Select
                  label="Type"
                  required
                  value={editing.urType || "B2CL"}
                  options={[
                    ["B2CL", "B2CL"],
                    ["EXPWP", "Exports with payment"],
                    ["EXPWOP", "Exports without payment"],
                  ]}
                  onChange={(event) => set("urType", event.target.value)}
                />
              )}
              {(useRateGrid || section.startsWith("B2CS")) && (
                <Input
                  label="Supply Type"
                  readOnly
                  value={interstate ? "Inter-State" : "Intra-State"}
                />
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
                            ? `HSN ${record.code}${w.period >= "2025-05" ? (hsnScope === "Registered" ? " B2B" : " B2C") : ""}`
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
                    min={
                      ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                        ? undefined
                        : "0"
                    }
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
                    min={
                      ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                        ? undefined
                        : "0"
                    }
                    required
                    value={editing.issued}
                    onChange={(e) => set("issued", e.target.value)}
                  />
                  <Input
                    label="Cancelled"
                    type="number"
                    min={
                      ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                        ? undefined
                        : "0"
                    }
                    value={editing.cancelled}
                    onChange={(e) => set("cancelled", e.target.value)}
                  />
                </>
              ) : !useRateGrid ? (
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
                    min={
                      ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                        ? undefined
                        : "0"
                    }
                    readOnly={Boolean(editing.items?.length)}
                    value={editing.taxable}
                    onChange={(e) => set("taxable", e.target.value)}
                  />
                  {section !== "NIL" && (
                    <>
                      <RateSelect
                        label="Rate (%)"
                        portal
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
                        min={
                          ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                            ? undefined
                            : "0"
                        }
                        value={editing.cess}
                        onChange={(e) => set("cess", e.target.value)}
                      />
                    </>
                  )}
                </>
              ) : null}
            </div>
            <InvoiceExtraFields
              section={section}
              editing={editing}
              setEditing={setEditing}
            />
            {useRateGrid && (
              <InvoiceRateGrid
                invoice={editing}
                homeState={active.state.taxpayer.state}
                onChange={setEditing}
              />
            )}
            {section.startsWith("B2CS") ? (
              <div className="form-grid">
                {(interstate
                  ? [["igst", "Integrated Tax (₹)"]]
                  : [
                      ["cgst", "Central Tax (₹)"],
                      ["sgst", "State/UT Tax (₹)"],
                    ]
                ).map(([head, label]) => (
                  <Input
                    key={head}
                    label={label}
                    required
                    type="number"
                    step="0.01"
                    min={
                      ["B2CS", "B2CSA", "ATA", "TXPA"].includes(section)
                        ? undefined
                        : "0"
                    }
                    value={
                      editing.reportedTaxes?.[head] ??
                      rateTotals(editing, active.state.taxpayer.state).taxes[
                        head
                      ]
                    }
                    onChange={(event) =>
                      set("reportedTaxes", {
                        ...editing.reportedTaxes,
                        [head]: event.target.value,
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              !useRateGrid &&
              !["NIL", "DOCS", "HSN"].includes(section) && (
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
              )
            )}
            <div className="actions">
              <Btn tone="secondary" onClick={() => setEditing(null)}>
                BACK
              </Btn>
              <Btn
                onClick={async () => {
                  const invoice = useRateGrid
                    ? {
                        ...editing,
                        ...rateTotals(editing, active.state.taxpayer.state),
                        items: editing.items || [
                          {
                            rate: editing.rate,
                            taxable: editing.taxable,
                            cess: editing.cess,
                          },
                        ],
                      }
                    : { ...editing };
                  if (section === "B2CS")
                    invoice.number ||= `B2CS-${Object.entries(GST_STATES).find(([, state]) => state === editing.place)?.[0] || "POS"}-${editing.rate}${editing.differential ? "-D" : ""}`;
                  if (section === "DOCS")
                    invoice.number ||= `Documents ${editing.documentType || "1"}`;
                  if (section === "HSN")
                    invoice.number ||= `HSN ${editing.hsn}${w.period >= "2025-05" ? (hsnScope === "Registered" ? " B2B" : " B2C") : ""}`;
                  if (useRateGrid && !Number(invoice.taxable))
                    throw Error(
                      "Enter a taxable value against at least one rate in Item details.",
                    );
                  await mutate("invoice/save", { invoice });
                  setEditing({
                    ...empty(),
                    ...(registered
                      ? {
                          gstin: editing.gstin,
                          recipient: editing.recipient,
                          place: editing.place,
                        }
                      : {}),
                  });
                }}
              >
                SAVE
              </Btn>
            </div>
          </>
        ) : (
          <>
            {registered && (
              <div className="tabs" aria-label="Invoice records">
                <button
                  className={recipientView ? "active" : ""}
                  onClick={() => {
                    setRecipient(null);
                    setPage(1);
                  }}
                >
                  Recipient wise count
                </button>
                <button
                  className={!recipientView ? "active" : ""}
                  onClick={() => {
                    setRecipient("");
                    setPage(1);
                  }}
                >
                  Document wise details
                </button>
              </div>
            )}
            <div className="table-toolbar">
              <span>
                Total Records: <b>{rows.length}</b>
              </span>
              <Input
                label="Search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search records"
              />
            </div>
            {recipientView ? (
              <Table
                columns={[
                  "Recipient GSTIN/UIN",
                  "Trade/Legal Name",
                  "Processed Records",
                  "Total Invoice Value (₹)",
                  "Add Invoice",
                ]}
                count={groups.length}
              >
                {groups.map((group) => (
                  <tr key={group.gstin}>
                    <td>{group.gstin}</td>
                    <td>{group.name}</td>
                    <td>
                      <button
                        className="link"
                        onClick={() => {
                          setRecipient(group.gstin);
                          setPage(1);
                          setQuery("");
                        }}
                      >
                        {group.documents.length}
                      </button>
                    </td>
                    <td className="number">
                      {money(
                        group.documents.reduce(
                          (sum, row) => sum + Number(row.invoiceValue || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td>
                      <Btn
                        tone="secondary"
                        disabled={locked}
                        onClick={() => startEntry(group.gstin)}
                      >
                        +
                      </Btn>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <>
                {recipient && (
                  <p className="info">
                    Recipient GSTIN/UIN: <b>{recipient}</b>
                  </p>
                )}
                {section !== "DOCS" && (
                  <details className="column-visibility">
                    <summary>Display/Hide Columns</summary>
                    <div className="actions">
                      {[
                        ["date", "Date"],
                        ["value", "Total Value"],
                        ["taxable", "Taxable Value"],
                        ["tax", "Tax"],
                        ["source", "Source"],
                      ].map(([key, label]) => (
                        <label className="check-line" key={key}>
                          <input
                            type="checkbox"
                            checked={!hiddenColumns[key]}
                            onChange={(e) =>
                              setHiddenColumns((old) => ({
                                ...old,
                                [key]: !e.target.checked,
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </details>
                )}
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
                          ...(!hiddenColumns.date ? ["Date"] : []),
                          ...(!hiddenColumns.value ? ["Total Value (₹)"] : []),
                          ...(!hiddenColumns.taxable
                            ? ["Taxable Value (₹)"]
                            : []),
                          ...(!hiddenColumns.tax ? ["Tax (₹)"] : []),
                          ...(!hiddenColumns.source ? ["Source"] : []),
                          "Actions",
                        ]
                  }
                  count={rows.length}
                >
                  {visibleRows.map((row) => (
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
                          {!hiddenColumns.date && <td>{row.date || "—"}</td>}
                          {!hiddenColumns.value && (
                            <td className="number">
                              {money(row.invoiceValue)}
                            </td>
                          )}
                          {!hiddenColumns.taxable && (
                            <td className="number">{money(row.taxable)}</td>
                          )}
                          {!hiddenColumns.tax && (
                            <td className="number">
                              {money(total(row.taxes))}
                            </td>
                          )}
                          {!hiddenColumns.source && (
                            <td>
                              {row.source || "Manual"}
                              {row.irn && (
                                <small className="break-all">
                                  IRN: {row.irn}
                                </small>
                              )}
                              {row.irnCancelled && (
                                <small>IRN cancelled — review amendment</small>
                              )}
                            </td>
                          )}
                        </>
                      )}
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${row.number}`}
                          disabled={rowLocked(row)}
                          title={
                            rowLocked(row)
                              ? "Filed records cannot be edited"
                              : "Edit document"
                          }
                          onClick={() => setEditing({ ...row })}
                        >
                          ✎
                        </button>
                        <button
                          className="icon-button delete"
                          aria-label={`Delete ${row.number}`}
                          disabled={rowLocked(row)}
                          title={
                            rowLocked(row)
                              ? "Filed records cannot be deleted"
                              : "Delete document"
                          }
                          onClick={() => setRemoving(row)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
                <div className="portal-pagination">
                  <Select
                    label="Records Per Page"
                    value={pageSize}
                    options={[10, 20, 50]}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  />
                  <span>
                    {rows.length
                      ? (Math.min(page, pageCount) - 1) * pageSize + 1
                      : 0}
                    –
                    {Math.min(
                      Math.min(page, pageCount) * pageSize,
                      rows.length,
                    )}{" "}
                    of {rows.length}
                  </span>
                  <Btn
                    tone="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    PREVIOUS
                  </Btn>
                  <Btn
                    tone="secondary"
                    disabled={page >= pageCount}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    NEXT
                  </Btn>
                </div>
              </>
            )}
          </>
        )}
      </Panel>
      <div className="actions">
        <Btn
          tone="secondary"
          onClick={() => {
            if (editing) setEditing(null);
            else if (recipient) {
              setRecipient(null);
              setQuery("");
              setPage(1);
            } else go("gstr1");
          }}
        >
          {editing
            ? "BACK TO RECORDS"
            : recipient
              ? "BACK TO RECIPIENT WISE COUNT"
              : "BACK TO GSTR-1"}
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
      {importEwb && (
        <EwayReturnImport
          section={section}
          onClose={() => setImportEwb(false)}
        />
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
    ["c", "(C) Net ITC Available (A) − (B)"],
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
export function Gstr3bTableEditor({ table, onClose }) {
  const { p, w, mutate, go } = usePortal();
  const [rows, setRows] = useState(() => {
    const saved = p.gstr3b.tables[table] || w.draft3b?.[table];
    if (saved?.rows) {
      const result = structuredClone(saved.rows);
      if (table === "4")
        for (const key of ["a1", "a2"]) {
          result[key] = {
            ...result[key],
            taxes: { ...result[key]?.taxes, cgst: 0, sgst: 0 },
          };
        }
      return result;
    }
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
    <Panel
      title={`${table} — ${TABLES_3B.find(([key]) => key === table)[1]}`}
      className="gstr3b-table-page"
    >
      {table === "5.1" && <FeesCalculator onApplied={() => go("gstr3b")} />}
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
            {ROWS_3B[table].map(([key, label]) =>
              key === "c" ? (
                <tr className="table-calculated-total" key={key}>
                  <th scope="row">{label}</th>
                  {HEADS.map((head) => (
                    <td className="number" key={head}>
                      <output aria-label={`Net ITC ${names[head]}`}>
                        {money(itcNet(rows)[head])}
                      </output>
                    </td>
                  ))}
                </tr>
              ) : (
                <tr key={key}>
                  <td>{label}</td>
                  {fields.map((f) => (
                    <td key={f}>
                      <input
                        aria-label={`${label} ${names[f]}`}
                        type="number"
                        min={
                          ["3.1", "3.1.1", "4"].includes(table)
                            ? undefined
                            : "0"
                        }
                        step="0.01"
                        disabled={
                          (table === "5.1" &&
                            key === "latefee" &&
                            !!p.gstr3b.charges) ||
                          (table === "3.1" &&
                            ["c", "e"].includes(key) &&
                            f !== "taxable") ||
                          (table === "4" &&
                            ["a1", "a2"].includes(key) &&
                            ["cgst", "sgst"].includes(f))
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
              ),
            )}
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
          BACK
        </Btn>
        <Btn
          onClick={async () => {
            await mutate("gstr3b/save", { table, rows, nil: false });
            onClose();
          }}
        >
          CONFIRM
        </Btn>
      </div>
    </Panel>
  );
}
export function Gstr3b({ tableRoute = null, paymentRoute = false }) {
  const { p, w, mutate, go } = usePortal();
  const table = TABLES_3B.some(([key]) => key === tableRoute)
    ? tableRoute
    : null;
  const payment = paymentRoute;
  const setPayment = (value) => go(value ? "gstr3b/payment" : "gstr3b");
  const [confirmPayment, setConfirmPayment] = useState(false);
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
    go(`gstr3b/table/${key}`);
  }
  if (table && !locked)
    return (
      <div className="container">
        <Crumbs
          items={[
            ["Returns", "returns"],
            ["GSTR-3B", "gstr3b"],
            `${table} ${TABLES_3B.find(([key]) => key === table)?.[1]}`,
          ]}
        />
        <TaxpayerBar />
        <Gstr3bTableEditor
          key={table}
          table={table}
          onClose={() => go("gstr3b")}
        />
      </div>
    );
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
          {w.paymentPlan.negativeLiability && (
            <HeadTable
              rows={[
                [
                  "Adjustment of negative liability — Other than reverse charge",
                  w.paymentPlan.negativeLiability.used.outward,
                ],
                [
                  "Adjustment — Reverse charge",
                  w.paymentPlan.negativeLiability.used.reverseCharge,
                ],
                [
                  "Adjustment — Supplies u/s 9(5)",
                  w.paymentPlan.negativeLiability.used.eco95,
                ],
              ]}
            />
          )}
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
          {TABLES_3B.map(([key, name]) => {
            const data = p.gstr3b.tables[key] || w.draft3b?.[key];
            const taxes =
              data?.taxes ||
              (key === "3.1"
                ? (w.outwardSummary || w.summary).taxes
                : key === "4"
                  ? w.eligibleItc
                  : {});
            const netTaxes =
              key === "4" && data?.rows ? itcNet(data.rows) : taxes;
            const figures =
              key === "3.2"
                ? [
                    ["Taxable Value (₹)", data?.taxable || 0],
                    ["Integrated Tax (₹)", taxes.igst],
                  ]
                : key === "5"
                  ? [
                      ["Inter-State supplies (₹)", taxes.igst],
                      ["Intra-State supplies (₹)", taxes.cgst],
                    ]
                  : [
                      ["Integrated Tax (₹)", netTaxes.igst],
                      ["Central Tax (₹)", netTaxes.cgst],
                      ["State/UT Tax (₹)", netTaxes.sgst],
                      ["CESS (₹)", netTaxes.cess],
                    ];
            return (
              <button
                className="gstr3b-tile"
                key={key}
                onClick={() => edit(key)}
              >
                <h2>
                  {key} {name}
                </h2>
                <div className="gstr3b-tile-figures">
                  {figures.map(([label, value]) => (
                    <span key={label}>
                      {label}
                      <b>{money(value)}</b>
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
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
              onClick={() => setConfirmPayment(true)}
            >
              PROCEED TO PAYMENT
            </Btn>
          </>
        )}
      </div>
      {confirmPayment && (
        <Modal
          title="Proceed to Payment"
          onClose={() => setConfirmPayment(false)}
        >
          <p>
            Please verify the details declared in GSTR-3B before proceeding.
            Once the liability is offset, the return details cannot be changed.
          </p>
          <div className="actions">
            <Btn tone="secondary" onClick={() => setConfirmPayment(false)}>
              CANCEL
            </Btn>
            <Btn
              onClick={() => {
                setConfirmPayment(false);
                setPayment(true);
              }}
            >
              PROCEED
            </Btn>
          </div>
        </Modal>
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
  const { w, go } = usePortal();
  const [tab, setTab] = useState("cash");
  const [category, setCategory] = useState("tax");
  const today = new Date().toISOString().slice(0, 10);
  const [dates, setDates] = useState({
    from: w.ledger.at(-1)?.date.slice(0, 10) || `${today.slice(0, 7)}-01`,
    to: today,
  });
  const [applied, setApplied] = useState(dates);
  const statement = ledgerStatement(
    w,
    tab,
    applied.from,
    applied.to,
    tab === "cash" ? category : "tax",
  );
  const rows = statement.rows;
  return (
    <div className="container">
      <Crumbs items={["Services", "Ledgers"]} />
      <h1>Electronic Ledgers</h1>
      <TaxpayerBar />
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("pmt09")}>
          FILE GST PMT-09 FOR TRANSFER OF AMOUNT
        </Btn>
        <Btn tone="secondary" onClick={() => go("negative-liability")}>
          NEGATIVE LIABILITY STATEMENT
        </Btn>
      </div>
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
      <Panel title="Select Period">
        <div className="filter-row">
          {tab === "cash" && (
            <Select
              label="Minor Head"
              options={[
                ["tax", "Tax"],
                ["interest", "Interest"],
                ["penalty", "Penalty"],
                ["fee", "Fee"],
                ["others", "Others"],
              ]}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          )}
          <Input
            label="From"
            type="date"
            value={dates.from}
            onChange={(event) =>
              setDates((old) => ({ ...old, from: event.target.value }))
            }
          />
          <Input
            label="To"
            type="date"
            value={dates.to}
            onChange={(event) =>
              setDates((old) => ({ ...old, to: event.target.value }))
            }
          />
          <Btn
            onClick={() => {
              if (!dates.from || !dates.to || dates.from > dates.to)
                throw Error("Select a valid From and To date range.");
              setApplied(dates);
            }}
          >
            GO
          </Btn>
        </div>
      </Panel>
      <Panel title="Balance Details">
        <HeadTable
          rows={[
            ...(tab !== "liability"
              ? [
                  ["Opening Balance", statement.opening],
                  ["Closing Balance", statement.closing],
                ]
              : []),
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
            ...(tab !== "liability" ? ["Balance (₹)"] : []),
          ]}
          count={rows.length}
        >
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{dateLabel(e.date)}</td>
              <td>{e.reference}</td>
              <td>{e.type}</td>
              <td>{periodLabel(e.period)}</td>
              <td className="number">{money(total(e.debitAmounts))}</td>
              <td className="number">{money(total(e.creditAmounts))}</td>
              {tab !== "liability" && (
                <td className="number">{money(total(e.balance))}</td>
              )}
            </tr>
          ))}
        </Table>
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() =>
              (() => {
                const blob = new Blob(["\uFEFF" + ledgerCsv(statement)], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob),
                  link = document.createElement("a");
                link.href = url;
                link.download = `ledger-${tab}${tab === "cash" ? "-" + category : ""}-${applied.from}-${applied.to}.csv`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })()
            }
          >
            DOWNLOAD (CSV)
          </Btn>
          <Btn tone="secondary" onClick={() => window.print()}>
            PRINT / SAVE AS PDF
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

export function Challans({ viewRoute = "" }) {
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
  const creating = viewRoute === "create";
  const setCreating = (value) => go(value ? "challans/create" : "challans");
  const selected =
    w.challans.find((challan) => challan.id === viewRoute) || null;
  const setSelected = (challan) =>
    go(challan ? `challans/${challan.id}` : "challans");
  const [bank, setBank] = useState("");
  const [amounts, setAmounts] = useState({
    ...(w.paymentPlan.taxShortfall || w.paymentPlan.shortfall),
  });
  const [mode, setMode] = useState("E-Payment");
  const [otherDeposits, setOtherDeposits] = useState(
    w.paymentPlan.minorShortfall || {},
  );
  const [instrument, setInstrument] = useState("Cash");
  const [fixedBasis, setFixedBasis] = useState(null);
  const [utr, setUtr] = useState("");
  const categories = ["tax", "interest", "penalty", "fee", "others"];
  const deposits = { tax: amounts, ...otherDeposits };
  const grandTotal = categories.reduce(
    (sum, category) => sum + total(deposits[category]),
    0,
  );
  const expires =
    selected &&
    new Date(
      selected.expiresAt ||
        new Date(selected.createdAt).valueOf() + 15 * 86400000,
    );
  const payable =
    selected && selected.status !== "Paid" && Date.now() < expires.valueOf();
  const online = !selected || selected.mode === "E-Payment";

  return (
    <div className="container">
      <Crumbs
        items={[
          "Services",
          "Payments",
          ...(creating
            ? ["Create Challan"]
            : selected
              ? ["Challan Details"]
              : ["Challan History"]),
        ]}
      />
      {(creating || selected) && <TaxpayerBar />}
      {!creating && !selected && (
        <>
          <Panel
            title="Challan History"
            extra={
              <Btn
                onClick={() => {
                  setAmounts({
                    ...(w.paymentPlan.taxShortfall || w.paymentPlan.shortfall),
                  });
                  setOtherDeposits(w.paymentPlan.minorShortfall || {});
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
                  <td>
                    {c.status === "Paid"
                      ? c.status
                      : Date.now() >=
                          new Date(
                            c.expiresAt ||
                              new Date(c.createdAt).valueOf() + 15 * 86400000,
                          ).valueOf()
                        ? "Expired"
                        : c.status}
                  </td>
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
        </>
      )}
      {creating && (
        <Panel title="Create Challan">
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
            {reason === "Monthly payment for quarterly return" && (
              <Select
                label="Challan Type"
                value={challanType}
                options={["Self-assessment basis", "Fixed sum basis"]}
                onChange={(e) => setChallanType(e.target.value)}
              />
            )}
            <Input
              label="Payment Period"
              value={periodLabel(w.period)}
              readOnly
            />
          </div>
          {challanType === "Fixed sum basis" && (
            <div className="info">
              <Btn
                tone="secondary"
                onClick={async () => {
                  const result = await mutate("challan/fixed-sum");
                  setFixedBasis(result.fixedSum);
                  setAmounts(result.fixedSum.amounts);
                  setOtherDeposits({});
                }}
              >
                CALCULATE FIXED SUM
              </Btn>
              {fixedBasis && (
                <p>
                  {fixedBasis.percentage}% of cash tax paid for{" "}
                  {fixedBasis.basisPeriod}.{" "}
                  {total(fixedBasis.amounts) === 0
                    ? "No deposit is required on this basis."
                    : "Review the calculated amounts below."}
                </p>
              )}
            </div>
          )}
          <h3>Details of Deposit</h3>
          <Table
            columns={[
              "Tax Head",
              "Tax (₹)",
              "Interest (₹)",
              "Penalty (₹)",
              "Fee (₹)",
              "Others (₹)",
            ]}
            count={HEADS.length}
          >
            {HEADS.map((head) => (
              <tr key={head}>
                <td>
                  {head === "sgst" ? "State / UT Tax" : head.toUpperCase()}
                </td>
                {categories.map((category) => (
                  <td key={category}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      label={`${head.toUpperCase()} — ${category}`}
                      value={deposits[category]?.[head] || ""}
                      onChange={(e) =>
                        category === "tax"
                          ? setAmounts((old) => ({
                              ...old,
                              [head]: e.target.value,
                            }))
                          : setOtherDeposits((old) => ({
                              ...old,
                              [category]: {
                                ...old[category],
                                [head]: e.target.value,
                              },
                            }))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          <p>
            Total Challan Amount: <b>₹ {money(grandTotal)}</b>
          </p>
          <fieldset className="payment-modes">
            <legend>
              Payment Modes <b className="required">*</b>
            </legend>
            {["E-Payment", "NEFT / RTGS", "Over the Counter"].map((value) => (
              <label className="check-line" key={value}>
                <input
                  type="radio"
                  name="payment-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {value}
              </label>
            ))}
          </fieldset>
          {mode !== "E-Payment" && (
            <div className="form-grid">
              <Select
                label={
                  mode === "NEFT / RTGS" ? "Remitting Bank" : "Name of Bank"
                }
                required
                options={[
                  "State Bank of India",
                  "Bank of Baroda",
                  "Punjab National Bank",
                  "HDFC Bank",
                  "ICICI Bank",
                ]}
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
              {mode === "Over the Counter" && (
                <Select
                  label="Type of Instrument"
                  value={instrument}
                  options={["Cash", "Cheque", "Demand Draft"]}
                  onChange={(e) => setInstrument(e.target.value)}
                />
              )}
            </div>
          )}
          <div className="actions">
            <Btn tone="secondary" onClick={() => setCreating(false)}>
              CANCEL
            </Btn>
            <Btn
              onClick={async () => {
                const result = await mutate("challan/create", {
                  amounts,
                  deposits,
                  bank,
                  instrument,
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
        </Panel>
      )}
      {selected && (
        <Panel
          title={
            selected.status === "Paid" ? "Payment Receipt" : "Challan Details"
          }
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
            <HeadTable
              rows={categories.map((category) => [
                category[0].toUpperCase() + category.slice(1),
                selected.deposits?.[category] ||
                  (category === "tax" ? selected.amounts : {}),
              ])}
            />
            <p>
              Payment Mode: <b>{selected.mode}</b> · Valid until:{" "}
              <b>{dateLabel(expires)}</b>
            </p>
            {!online && (
              <p>
                Bank: <b>{selected.bank}</b>
                {selected.instrument && (
                  <> · Instrument: {selected.instrument}</>
                )}
              </p>
            )}
            {selected.mode === "NEFT / RTGS" && (
              <div className="remittance-mandate">
                <h3>NEFT / RTGS Mandate</h3>
                <p>
                  Beneficiary: GST Collection Account · Reference / CPIN:{" "}
                  <b>{selected.cpin}</b>
                </p>
                <p>
                  Remit the challan amount through the selected bank, then link
                  the bank's UTR against this CPIN.
                </p>
              </div>
            )}
            <p>
              Total Amount: <b>₹ {money(selected.total)}</b>
            </p>
            <p>
              Status:{" "}
              <b>
                {!payable && selected.status !== "Paid"
                  ? "Expired"
                  : selected.status}
              </b>
            </p>
            {selected.cin && (
              <p>
                CIN: <b>{selected.cin}</b>
              </p>
            )}
          </div>
          {payable && online && (
            <Select
              label="Select Bank"
              required
              value={bank}
              options={["State Bank of India", "National Bank", "City Bank"]}
              onChange={(e) => setBank(e.target.value)}
            />
          )}
          {payable && online && (
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
          {payable && online && (!bank || !terms || (bankStep && !bankOtp)) && (
            <p className="info" id="challan-payment-requirement" role="status">
              {!bank
                ? "Select a bank to continue."
                : !terms
                  ? "Accept the terms and conditions to continue."
                  : "Select CONFIRM PAYMENT to receive the payment OTP."}
            </p>
          )}
          {payable && !online && (
            <div className="offline-payment-status">
              {selected.mode === "NEFT / RTGS" &&
                (!selected.utr ? (
                  <>
                    <Input
                      label="Unique Transaction Number (UTR)"
                      value={utr}
                      onChange={(e) => setUtr(e.target.value)}
                      maxLength="22"
                    />
                    <div className="actions">
                      <Btn
                        tone="secondary"
                        onClick={() =>
                          setUtr(`BANK${String(Date.now()).padStart(18, "0")}`)
                        }
                      >
                        USE SAMPLE UTR
                      </Btn>
                      <Btn
                        disabled={!utr}
                        onClick={async () => {
                          await mutate("challan/link-utr", {
                            id: selected.id,
                            utr,
                          });
                        }}
                      >
                        LINK UTR
                      </Btn>
                    </div>
                  </>
                ) : (
                  <p>
                    Linked UTR: <b>{selected.utr}</b>
                  </p>
                ))}
              <p>
                {selected.mode === "Over the Counter"
                  ? "Print this challan and deposit Cash / Cheque / Demand Draft at the selected bank."
                  : "The linked UTR is awaiting bank confirmation."}
              </p>
              <Btn
                disabled={selected.mode === "NEFT / RTGS" && !selected.utr}
                onClick={async () => {
                  await mutate("challan/check-status", { id: selected.id });
                }}
              >
                CHECK PAYMENT STATUS
              </Btn>
            </div>
          )}
          <div className="actions">
            <Btn tone="secondary" onClick={() => window.print()}>
              PRINT
            </Btn>
            {payable && online && (
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
        </Panel>
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
