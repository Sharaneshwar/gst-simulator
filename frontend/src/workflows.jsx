import { Dropdown } from "./dropdown";
import { RateSelect } from "./rate-guide";
import { useState } from "react";
import {
  Btn,
  Crumbs,
  Input,
  Modal,
  Panel,
  Select,
  Table,
  TaxpayerBar,
  HEADS,
  STATES,
  money,
  total,
  dateLabel,
  download,
  usePortal,
} from "./lib";

export function OfflineReturn({ type = "GSTR-1" }) {
  const { w, p, active, mutate, go } = usePortal();
  const [file, setFile] = useState(null);
  const three = type === "GSTR-3B",
    locked = three
      ? ["Filed", "Offset"].includes(p.gstr3b.status)
      : p.gstr1.status === "Filed";
  const history = p.uploads.filter((x) => (x.type || "GSTR-1") === type);
  const template = {
    gstin: active.state.taxpayer.gstin,
    fp: w.period.slice(5) + w.period.slice(0, 4),
    ...(three
      ? {
          sup_details: {
            osup_det: { txval: 1000, iamt: 0, camt: 90, samt: 90, csamt: 0 },
            osup_zero: {},
            osup_nil_exmp: {},
            isup_rev: {},
            osup_nongst: {},
          },
          inter_sup: { unreg_details: [], comp_details: [], uin_details: [] },
          itc_elg: {
            itc_avl: [{ ty: "OTH", iamt: 0, camt: 45, samt: 45, csamt: 0 }],
            itc_rev: [],
          },
          inward_sup: { isup_details: [{ ty: "GST", inter: 0, intra: 0 }] },
        }
      : {
          invoices: [
            {
              section: "B2B",
              number: "NEW-001",
              date: `${w.period}-15`,
              gstin: "27AABCL1234A1Z9",
              recipient: "Example Buyer",
              place: active.state.taxpayer.state,
              items: [{ taxable: 1000, rate: 18, cess: 0 }],
            },
          ],
        }),
  };
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], `${type} — Prepare Offline`]} />
      <TaxpayerBar />
      <Panel title="Offline Upload and Download">
        <p>
          {three
            ? "Upload your GSTR-3B utility JSON, then verify each table before proceeding to payment."
            : "Upload GSTR-1 utility JSON or invoice-template JSON. Review the processed records and error report before filing."}
        </p>
        {locked && (
          <p className="info" id="offline-upload-requirement" role="status">
            {type} is locked because it has been{" "}
            {three && p.gstr3b.status === "Offset" ? "offset" : "filed"}.
            Uploads cannot change this return. Select another return period to
            enter new records.
          </p>
        )}
        {!locked && !file && (
          <p className="muted" id="offline-upload-requirement">
            Select a JSON file to enable UPLOAD.
          </p>
        )}
        <Input
          label="Select JSON file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() => download(`${type}-template.json`, template)}
          >
            DOWNLOAD TEMPLATE
          </Btn>
          <Btn
            disabled={!file || locked}
            aria-describedby={
              !file || locked ? "offline-upload-requirement" : undefined
            }
            onClick={async () => {
              if (file.size > 6000000)
                throw Error("Select a file smaller than 6 MB.");
              await mutate(three ? "gstr3b/upload" : "upload", {
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
          count={history.length}
        >
          {history.map((u) => (
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
                    Download {u.errors.length} errors
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
          BACK TO FILE RETURNS
        </Btn>
        <Btn onClick={() => go(three ? "gstr3b" : "gstr1")}>
          VIEW PROCESSED DATA
        </Btn>
      </div>
    </div>
  );
}

export function SupplierStatement({ type }) {
  const { p, w, go, active } = usePortal();
  const [section, setSection] = useState("Invoice"),
    [supplier, setSupplier] = useState(""),
    [selected, setSelected] = useState(null);
  const is2b = type === "gstr2b",
    title = is2b ? "GSTR-2B" : "GSTR-2A";
  const documents = p.purchases.filter(
    (i) => !is2b || i.includedIn2b !== false,
  );
  const rows = documents.filter(
    (i) => section === "All" || (i.documentType || "Invoice") === section,
  );
  const suppliers = Object.values(
    rows.reduce((a, i) => {
      a[i.gstin] ||= {
        gstin: i.gstin,
        name: i.supplier,
        count: 0,
        taxable: 0,
        taxes: {},
      };
      const s = a[i.gstin];
      s.count++;
      s.taxable += i.taxable;
      HEADS.forEach((h) => (s.taxes[h] = (s.taxes[h] || 0) + i.taxes[h]));
      return a;
    }, {}),
  );
  const available = documents
    .filter((i) => i.match === "Matched")
    .reduce((a, i) => {
      HEADS.forEach(
        (h) =>
          (a[h] =
            (a[h] || 0) +
            (i.documentType === "Credit Note" ? -1 : 1) * i.taxes[h]),
      );
      return a;
    }, {});
  return (
    <div className="container">
      <Crumbs items={[["Returns", "returns"], title]} />
      <h1>
        {title} — {is2b ? "Auto-drafted ITC Statement" : "Auto Drafted Details"}
      </h1>
      <TaxpayerBar />
      {is2b && (
        <Panel title="ITC Summary">
          <Table columns={["Details", ...HEADS.map((h) => h.toUpperCase())]}>
            <tr>
              <td>ITC available</td>
              {HEADS.map((h) => (
                <td key={h}>{money(available[h])}</td>
              ))}
            </tr>
          </Table>
        </Panel>
      )}
      <div className="tabs">
        {["Invoice", "Credit Note", "Debit Note", "All"].map((k) => (
          <button
            key={k}
            className={section === k ? "active" : ""}
            onClick={() => {
              setSection(k);
              setSupplier("");
            }}
          >
            {k === "Invoice" ? "B2B INVOICES" : k.toUpperCase()}
          </button>
        ))}
      </div>
      <Panel
        title={
          supplier ? "B2B Invoices — Supplier Details" : "Supplier Details"
        }
      >
        {supplier ? (
          <>
            <Table
              columns={[
                "Invoice / Note No.",
                "Document Date",
                "Invoice Value",
                "Taxable Value",
                ...HEADS.map((h) => h.toUpperCase()),
                "Action",
              ]}
              count={rows.filter((i) => i.gstin === supplier).length}
            >
              {rows
                .filter((i) => i.gstin === supplier)
                .map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button className="link" onClick={() => setSelected(i)}>
                        {i.number}
                      </button>
                    </td>
                    <td>{dateLabel(i.date)}</td>
                    <td>
                      {money(i.invoiceValue || i.taxable + total(i.taxes))}
                    </td>
                    <td>{money(i.taxable)}</td>
                    {HEADS.map((h) => (
                      <td key={h}>{money(i.taxes[h])}</td>
                    ))}
                    <td>
                      <button className="link" onClick={() => setSelected(i)}>
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))}
            </Table>
            <div className="actions">
              <Btn tone="secondary" onClick={() => setSupplier("")}>
                BACK TO SUPPLIERS
              </Btn>
            </div>
          </>
        ) : (
          <Table
            columns={[
              "GSTIN of Supplier",
              "Trade / Legal Name",
              "Documents",
              "Taxable Value",
              ...HEADS.map((h) => h.toUpperCase()),
            ]}
            count={suppliers.length}
          >
            {suppliers.map((i) => (
              <tr key={i.gstin}>
                <td>
                  <button className="link" onClick={() => setSupplier(i.gstin)}>
                    {i.gstin}
                  </button>
                </td>
                <td>{i.name}</td>
                <td>{i.count}</td>
                <td>{money(i.taxable)}</td>
                {HEADS.map((h) => (
                  <td key={h}>{money(i.taxes[h])}</td>
                ))}
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <div className="actions">
        <Btn tone="secondary" onClick={() => go("returns")}>
          BACK TO DASHBOARD
        </Btn>
        <Btn
          onClick={() =>
            download(`${title}-${w.period}.json`, {
              gstin: active.state.taxpayer.gstin,
              period: w.period,
              documents,
            })
          }
        >
          DOWNLOAD JSON
        </Btn>
        <Btn tone="secondary" onClick={() => window.print()}>
          PRINT / SAVE AS PDF
        </Btn>
      </div>
      {selected && (
        <Modal title="Invoice Details" wide onClose={() => setSelected(null)}>
          <dl className="details-list">
            {[
              ["Supplier GSTIN", selected.gstin],
              ["Supplier Name", selected.supplier],
              ["Document Number", selected.number],
              ["Document Date", dateLabel(selected.date)],
              ["Document Type", selected.documentType || "Invoice"],
              [
                "Place of Supply",
                selected.place || active.state.taxpayer.state,
              ],
              [
                "Invoice Value",
                money(
                  selected.invoiceValue ||
                    selected.taxable + total(selected.taxes),
                ),
              ],
              ["Taxable Value", money(selected.taxable)],
              ["Rate", `${selected.rate || 0}%`],
              ["ITC Status", selected.match],
              ...(selected.itcReason
                ? [["ITC availability reason", selected.itcReason]]
                : []),
              ["Reported On", dateLabel(selected.reportedOn || selected.date)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <Table columns={HEADS.map((h) => h.toUpperCase())}>
            <tr>
              {HEADS.map((h) => (
                <td key={h}>{money(selected.taxes[h])}</td>
              ))}
            </tr>
          </Table>
          <Btn onClick={() => setSelected(null)}>BACK</Btn>
        </Modal>
      )}
    </div>
  );
}

export function PurchaseData() {
  const { w, p, active, mutate, go } = usePortal();
  const empty = () => ({
    number: "",
    date: `${w.period}-01`,
    gstin: "",
    supplier: "",
    place: active.state.taxpayer.state,
    taxable: "",
    rate: 18,
    documentType: "Invoice",
    includedIn2b: true,
    match: "Matched",
  });
  const [form, setForm] = useState(empty),
    [file, setFile] = useState(null);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  return (
    <div className="container">
      <Crumbs items={[["Downloads", "downloads"], "Supplier Return Data"]} />
      <h1>Supplier Return Data</h1>
      <TaxpayerBar />
      <Panel title="Load inward supply documents">
        <p>
          Load supplier-reported documents for the selected month. They appear
          in GSTR-2A and, when included, GSTR-2B.
        </p>
        <Input
          label="Supplier JSON file"
          type="file"
          accept=".json"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <div className="actions">
          <Btn
            tone="secondary"
            onClick={() =>
              download("supplier-data-template.json", {
                gstin: active.state.taxpayer.gstin,
                fp: w.period.slice(5) + w.period.slice(0, 4),
                purchases: [
                  {
                    ...empty(),
                    gstin: "27AABCL1234A1Z9",
                    supplier: "Example Supplier",
                    number: "PUR-001",
                    taxable: 1000,
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
                throw Error("Select a JSON file smaller than 6 MB.");
              await mutate("purchases/upload", { data: await file.text() });
              setFile(null);
            }}
          >
            UPLOAD JSON
          </Btn>
        </div>
      </Panel>
      <Panel
        title={form.id ? "Edit Supplier Document" : "Add Supplier Document"}
      >
        <div className="form-grid">
          {[
            ["gstin", "Supplier GSTIN"],
            ["supplier", "Supplier Name"],
            ["number", "Invoice / Note Number"],
            ["date", "Document Date", "date"],
            ["taxable", "Taxable Value", "number"],
            ["rate", "GST Rate (%)", "number"],
          ].map(([k, l, t]) =>
            k === "rate" ? (
              <RateSelect
                key={k}
                label={l}
                required
                value={form[k]}
                date={form.date}
                onChange={(e) => set(k, e.target.value)}
              />
            ) : (
              <Input
                key={k}
                label={l}
                required
                type={t || "text"}
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            ),
          )}
          <Select
            label="Place of Supply"
            value={form.place}
            options={STATES}
            onChange={(e) => set("place", e.target.value)}
          />
          <Select
            label="Document Type"
            options={["Invoice", "Credit Note", "Debit Note"]}
            value={form.documentType}
            onChange={(e) => set("documentType", e.target.value)}
          />
          <Select
            label="ITC Status"
            options={["Matched", "Requires Review", "Ineligible"]}
            value={form.match}
            onChange={(e) => set("match", e.target.value)}
          />
          <label className="check-line">
            <input
              type="checkbox"
              checked={form.includedIn2b}
              onChange={(e) => set("includedIn2b", e.target.checked)}
            />
            Include in this month's GSTR-2B
          </label>
        </div>
        <div className="actions">
          <Btn
            onClick={async () => {
              const { taxes, ...purchase } = form;
              await mutate("purchases/save", { purchase });
              setForm(empty());
            }}
          >
            SAVE DOCUMENT
          </Btn>
          <Btn tone="secondary" onClick={() => setForm(empty())}>
            CLEAR
          </Btn>
        </div>
      </Panel>
      <Panel title="Loaded Documents">
        <Table
          columns={[
            "Supplier",
            "Document",
            "Type",
            "Taxable Value",
            "GSTR-2B",
            "Action",
          ]}
          count={p.purchases.length}
        >
          {p.purchases.map((i) => (
            <tr key={i.id}>
              <td>{i.supplier}</td>
              <td>{i.number}</td>
              <td>{i.documentType || "Invoice"}</td>
              <td>{money(i.taxable)}</td>
              <td>
                {i.includedIn2b === false ? "Excluded" : "Included"} · {i.match}
                {i.itcReason && <small>{i.itcReason}</small>}
              </td>
              <td>
                <button
                  className="link"
                  onClick={() =>
                    setForm({
                      ...empty(),
                      ...i,
                      documentType: i.documentType || "Invoice",
                      includedIn2b: i.includedIn2b !== false,
                    })
                  }
                >
                  EDIT
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="actions">
        <Btn onClick={() => go("gstr2a")}>VIEW GSTR-2A</Btn>
        <Btn onClick={() => go("gstr2b")}>VIEW GSTR-2B</Btn>
      </div>
    </div>
  );
}

export function Interstate3b({ onClose }) {
  const { p, w, mutate } = usePortal();
  const [rows, setRows] = useState(
    p.gstr3b.tables["3.2"]?.states || w.draft3b?.["3.2"]?.states || [],
  );
  const change = (i, k, v) =>
    setRows((old) => old.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <Modal title="3.2 — Inter-State Supplies" wide onClose={onClose}>
      <div className="table-scroll">
        <table className="editable-table">
          <thead>
            <tr>
              <th>Recipient Category</th>
              <th>Place of Supply</th>
              <th>Taxable Value (₹)</th>
              <th>Integrated Tax (₹)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <Dropdown
                    aria-label="Recipient category"
                    value={r.category}
                    onChange={(e) => change(i, "category", e.target.value)}
                    options={[
                      ["unregistered", "Unregistered Persons"],
                      ["composition", "Composition Taxable Persons"],
                      ["uin", "UIN Holders"],
                    ]}
                  />
                </td>
                <td>
                  <Dropdown
                    aria-label="Place of supply"
                    value={r.place}
                    onChange={(e) => change(i, "place", e.target.value)}
                    options={[["", "Select"], ...STATES]}
                  />
                </td>
                <td>
                  <input
                    aria-label="Taxable value"
                    type="number"
                    min="0"
                    value={r.taxable}
                    onChange={(e) => change(i, "taxable", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label="Integrated tax"
                    type="number"
                    min="0"
                    value={r.taxes.igst}
                    onChange={(e) =>
                      change(i, "taxes", { igst: e.target.value })
                    }
                  />
                </td>
                <td>
                  <button
                    className="link"
                    onClick={() => setRows(rows.filter((_, n) => n !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <Btn
          tone="secondary"
          onClick={() =>
            setRows([
              ...rows,
              {
                category: "unregistered",
                place: "",
                taxable: 0,
                taxes: { igst: 0 },
              },
            ])
          }
        >
          ADD DETAILS
        </Btn>
        <Btn
          onClick={async () => {
            await mutate("gstr3b/save", {
              table: "3.2",
              rows: { states: rows },
            });
            onClose();
          }}
        >
          CONFIRM
        </Btn>
        <Btn tone="secondary" onClick={onClose}>
          BACK
        </Btn>
      </div>
    </Modal>
  );
}

export function InvoiceExtraFields({ section, editing, setEditing }) {
  const { w, p } = usePortal();
  const [lookup, setLookup] = useState(""),
    [lookupYear, setLookupYear] = useState("2022");
  const set = (k, v) => setEditing((x) => ({ ...x, [k]: v }));
  const items = editing.items || [];
  const setItem = (i, k, v) =>
    setEditing((old) => {
      const updated = old.items.map((r, n) => (n === i ? { ...r, [k]: v } : r));
      return {
        ...old,
        items: updated,
        taxable: updated.reduce((n, r) => n + Number(r.taxable), 0),
      };
    });
  return (
    <>
      {section.endsWith("A") && (
        <Panel title="Find Original Document">
          <div className="form-grid">
            <Input
              label="Financial Year (starting year)"
              type="number"
              value={lookupYear}
              onChange={(e) => setLookupYear(e.target.value)}
            />
            <Input
              label="Original Invoice / Note Number"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
            />
          </div>
          <Btn
            tone="secondary"
            onClick={() => {
              const found = Object.entries(w.periods)
                .filter(
                  ([period, d]) =>
                    period < w.period &&
                    d.gstr1.status === "Filed" &&
                    Number(period.slice(0, 4)) -
                      (Number(period.slice(5)) < 4 ? 1 : 0) ===
                      Number(lookupYear),
                )
                .flatMap(([period, d]) =>
                  d.invoices.map((i) => ({ ...i, period })),
                )
                .find(
                  (i) =>
                    i.number === lookup && i.section === section.slice(0, -1),
                );
              if (!found)
                throw Error(
                  "No matching document found in a filed return for that financial year.",
                );
              setEditing({
                ...found,
                id: undefined,
                section,
                originalNumber: found.number,
                originalPeriod: found.period,
              });
            }}
          >
            AMEND RECORD
          </Btn>
        </Panel>
      )}
      <div className="form-grid">
        {section.startsWith("EXP") &&
          [
            ["portCode", "Port Code", "text"],
            ["shippingBillNumber", "Shipping Bill Number", "text"],
            ["shippingBillDate", "Shipping Bill Date", "date"],
          ].map(([k, l, t]) => (
            <Input
              key={k}
              label={l}
              type={t}
              value={editing[k] || ""}
              onChange={(e) => set(k, e.target.value)}
            />
          ))}
        {section === "NIL" && (
          <>
            <Select
              label="Supply Category"
              value={editing.nilType || "Nil Rated"}
              options={["Nil Rated", "Exempt", "Non-GST"]}
              onChange={(e) => set("nilType", e.target.value)}
            />
            <Select
              label="Recipient Type"
              value={editing.recipientType || "Registered"}
              options={["Registered", "Unregistered"]}
              onChange={(e) => set("recipientType", e.target.value)}
            />
            <Select
              label="Supply Type"
              value={editing.supplyType || "Intra-state"}
              options={["Intra-state", "Inter-state"]}
              onChange={(e) => set("supplyType", e.target.value)}
            />
          </>
        )}
        {section === "HSN" &&
          HEADS.map((h) => (
            <Input
              key={h}
              label={`${h.toUpperCase()} (₹)`}
              type="number"
              min="0"
              value={editing.reportedTaxes?.[h] || 0}
              onChange={(e) =>
                set("reportedTaxes", {
                  ...editing.reportedTaxes,
                  [h]: e.target.value,
                })
              }
            />
          ))}
        {section === "DOCS" && (
          <Select
            label="Nature of Document"
            value={editing.documentType || "1"}
            options={[
              ["1", "Invoices for outward supplies"],
              ["2", "Invoices for inward supply from unregistered persons"],
              ["3", "Revised Invoice"],
              ["4", "Debit Note"],
              ["5", "Credit Note"],
              ["6", "Receipt Voucher"],
              ["7", "Payment Voucher"],
              ["8", "Refund Voucher"],
              ["9", "Delivery Challan — Job Work"],
              ["10", "Delivery Challan — Others"],
            ]}
            onChange={(e) => set("documentType", e.target.value)}
          />
        )}
      </div>
      {![
        "NIL",
        "DOCS",
        "HSN",
        "B2CS",
        "B2CSA",
        "AT",
        "ATA",
        "TXP",
        "TXPA",
        "ECO",
        "ECOA",
      ].includes(section) && (
        <div className="rate-editor">
          <h3>Tax Rate Details</h3>
          {items.length ? (
            <>
              <div className="table-scroll">
                <table className="editable-table">
                  <thead>
                    <tr>
                      <th>Rate (%)</th>
                      <th>Taxable Value (₹)</th>
                      <th>Cess (₹)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <RateSelect
                            compact
                            aria-label="Tax rate"
                            value={r.rate}
                            date={editing.date}
                            onChange={(e) => setItem(i, "rate", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            aria-label="Taxable amount"
                            type="number"
                            min="0"
                            value={r.taxable}
                            onChange={(e) =>
                              setItem(i, "taxable", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label="Cess"
                            type="number"
                            min="0"
                            value={r.cess || 0}
                            onChange={(e) => setItem(i, "cess", e.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            className="link"
                            onClick={() => {
                              const next = items.filter((_, n) => n !== i);
                              setEditing((old) => ({
                                ...old,
                                items: next,
                                taxable: next.length
                                  ? next.reduce(
                                      (n, r) => n + Number(r.taxable),
                                      0,
                                    )
                                  : old.taxable,
                              }));
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Btn
                tone="secondary"
                onClick={() =>
                  set("items", [...items, { rate: 18, taxable: 0, cess: 0 }])
                }
              >
                ADD TAX RATE
              </Btn>
            </>
          ) : (
            <Btn
              tone="secondary"
              onClick={() =>
                set("items", [
                  {
                    rate: editing.rate || 18,
                    taxable: editing.taxable || 0,
                    cess: editing.cess || 0,
                  },
                ])
              }
            >
              ENTER MULTIPLE TAX RATES
            </Btn>
          )}
        </div>
      )}
    </>
  );
}

export function NilSupplies() {
  const { p, w, mutate, go } = usePortal();
  const scopes = [
      ["Inter-state", "Registered"],
      ["Intra-state", "Registered"],
      ["Inter-state", "Unregistered"],
      ["Intra-state", "Unregistered"],
    ],
    types = ["Nil Rated", "Exempt", "Non-GST"];
  const [rows, setRows] = useState(() =>
    scopes.flatMap(([supplyType, recipientType]) =>
      types.map((nilType) => ({
        supplyType,
        recipientType,
        nilType,
        taxable: p.invoices
          .filter(
            (i) =>
              i.section === "NIL" &&
              (i.supplyType || "Intra-state") === supplyType &&
              (i.recipientType || "Registered") === recipientType &&
              (i.nilType || "Nil Rated") === nilType,
          )
          .reduce((n, i) => n + i.taxable, 0),
      })),
    ),
  );
  const locked =
    p.gstr1.status === "Filed" ||
    (w.filingFrequency === "QRMP" &&
      w.periods[w.returnInfo.end]?.gstr1.status === "Filed");
  return (
    <div className="container">
      <Crumbs
        items={[
          ["Returns", "returns"],
          ["GSTR-1", "gstr1"],
          "Nil Rated Supplies",
        ]}
      />
      <h1>8A, 8B, 8C, 8D — Nil Rated Supplies</h1>
      <TaxpayerBar />
      <Panel title="Nil Rated, Exempted and Non-GST Supplies">
        {locked && (
          <p className="info">
            These records are read-only because GSTR-1 for this period or
            quarter has already been filed.
          </p>
        )}
        <div className="table-scroll">
          <table className="editable-table">
            <thead>
              <tr>
                <th>Description</th>
                {types.map((t) => (
                  <th key={t}>{t} Supplies (₹)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scopes.map(([s, r], n) => (
                <tr key={n}>
                  <td>
                    {s} supplies to {r.toLowerCase()} persons
                  </td>
                  {types.map((t, j) => (
                    <td key={t}>
                      <input
                        type="number"
                        min="0"
                        aria-label={`${s} ${r} ${t}`}
                        disabled={locked}
                        value={rows[n * 3 + j].taxable}
                        onChange={(e) =>
                          setRows((old) =>
                            old.map((row, i) =>
                              i === n * 3 + j
                                ? { ...row, taxable: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="actions">
          <Btn tone="secondary" onClick={() => go("gstr1")}>
            BACK
          </Btn>
          {!locked && (
            <Btn
              onClick={async () => {
                await mutate("nil/save", { rows });
                go("gstr1");
              }}
            >
              SAVE
            </Btn>
          )}
        </div>
      </Panel>
    </div>
  );
}
