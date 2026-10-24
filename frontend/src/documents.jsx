import { useState } from "react";
import {
  Btn,
  Crumbs,
  Input,
  Modal,
  Panel,
  Select,
  Table,
  dateLabel,
  money,
  usePortal,
} from "./lib";

export function Documents({ kind }) {
  const { w, p, active, mutate } = usePortal();
  const [page, setPage] = useState("list");
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [form, setForm] = useState({
    invoiceId: "",
    dispatch: "",
    destination: "",
    distance: "",
    vehicle: "",
    transporter: "",
    mode: "Road",
  });
  const eway = kind === "eway";
  const title = eway ? "e-Way Bill System" : "e-Invoice System";
  const docs = w.documents[kind];
  const invoice = p.invoices.find((i) => i.id === form.invoiceId);
  const change = (key, value) => setForm({ ...form, [key]: value });
  return (
    <div className="container document-portal">
      <Crumbs items={["Services", title]} />
      <header className="document-header">
        <div>
          <h1>{title}</h1>
          <span>
            {active.state.taxpayer.legalName} · GSTIN:{" "}
            {active.state.taxpayer.gstin}
          </span>
        </div>
        <span>{eway ? "Movement of Goods" : "Invoice Registration"}</span>
      </header>
      <div className="document-layout">
        <aside>
          {[
            ["list", eway ? "e-Way Bill" : "e-Invoice"],
            ["generate", eway ? "Generate New" : "Generate IRN"],
          ].map(([key, name]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => setPage(key)}
            >
              {name}
              <span>›</span>
            </button>
          ))}
        </aside>
        <div>
          {page === "list" ? (
            <Panel
              title={eway ? "Generated e-Way Bills" : "Registered Invoices"}
              extra={
                <Btn onClick={() => setPage("generate")}>GENERATE NEW</Btn>
              }
            >
              <Table
                columns={[
                  eway ? "EWB Number" : "Acknowledgement No.",
                  "Document No.",
                  "Generated On",
                  "Status",
                  "Action",
                ]}
                count={docs.length}
              >
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>{eway ? d.number : d.acknowledgement}</td>
                    <td>{d.invoice.number}</td>
                    <td>{dateLabel(d.createdAt)}</td>
                    <td>{d.status}</td>
                    <td>
                      <button className="link" onClick={() => setSelected(d)}>
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>
          ) : (
            <Panel
              title={
                eway
                  ? "Generate New e-Way Bill"
                  : "Generate Invoice Reference Number"
              }
            >
              <div className="form-grid">
                <Select
                  label="Document Number"
                  required
                  value={form.invoiceId}
                  options={p.invoices
                    .filter((i) => ["B2B", "B2CL", "EXP"].includes(i.section))
                    .map((i) => [
                      i.id,
                      `${i.number} — ${i.recipient || i.gstin}`,
                    ])}
                  onChange={(e) => change("invoiceId", e.target.value)}
                />
                <Input
                  label="Document Date"
                  readOnly
                  value={invoice?.date || ""}
                />
                <Input
                  label="From GSTIN"
                  readOnly
                  value={active.state.taxpayer.gstin}
                />
                <Input
                  label="To GSTIN"
                  readOnly
                  value={invoice?.gstin || "URP"}
                />
                <Input
                  label="Taxable Value (₹)"
                  readOnly
                  value={money(invoice?.taxable)}
                />
                <Input
                  label="Total Invoice Value (₹)"
                  readOnly
                  value={money(invoice?.invoiceValue)}
                />
                {eway && (
                  <>
                    <Input
                      label="Dispatch From"
                      required
                      value={form.dispatch}
                      onChange={(e) => change("dispatch", e.target.value)}
                    />
                    <Input
                      label="Ship To / Destination"
                      required
                      value={form.destination}
                      onChange={(e) => change("destination", e.target.value)}
                    />
                    <Input
                      label="Approximate Distance (KM)"
                      required
                      type="number"
                      min="1"
                      value={form.distance}
                      onChange={(e) => change("distance", e.target.value)}
                    />
                    <Select
                      label="Mode"
                      value={form.mode}
                      options={["Road", "Rail", "Air", "Ship"]}
                      onChange={(e) => change("mode", e.target.value)}
                    />
                    <Input
                      label="Transporter ID / Name"
                      value={form.transporter}
                      onChange={(e) => change("transporter", e.target.value)}
                    />
                    <Input
                      label="Vehicle Number"
                      required
                      value={form.vehicle}
                      onChange={(e) =>
                        change("vehicle", e.target.value.toUpperCase())
                      }
                      placeholder="KA01AB1234"
                    />
                  </>
                )}
              </div>
              <div className="actions">
                <Btn tone="secondary" onClick={() => setPage("list")}>
                  CANCEL
                </Btn>
                <Btn
                  onClick={async () => {
                    const result = await mutate("documents/create", {
                      kind,
                      ...form,
                    });
                    setSelected(result.document);
                    setPage("list");
                  }}
                >
                  {eway ? "SUBMIT" : "GENERATE IRN"}
                </Btn>
              </div>
            </Panel>
          )}
        </div>
      </div>
      {selected && (
        <Modal
          title={eway ? "e-Way Bill Details" : "e-Invoice Details"}
          wide
          onClose={() => {
            setSelected(null);
            setAction("");
          }}
        >
          <div className="print-sheet">
            <h2>{eway ? "e-Way Bill" : "Invoice Registration"}</h2>
            <dl className="details-list">
              <dt>{eway ? "e-Way Bill No." : "Acknowledgement No."}</dt>
              <dd>{eway ? selected.number : selected.acknowledgement}</dd>
              {!eway && (
                <>
                  <dt>IRN</dt>
                  <dd className="break-all">{selected.irn}</dd>
                </>
              )}
              <dt>Generated On</dt>
              <dd>{dateLabel(selected.createdAt)}</dd>
              <dt>Document Number</dt>
              <dd>{selected.invoice.number}</dd>
              <dt>Supplier GSTIN</dt>
              <dd>{active.state.taxpayer.gstin}</dd>
              <dt>Recipient GSTIN</dt>
              <dd>{selected.invoice.gstin || "URP"}</dd>
              <dt>Invoice Value</dt>
              <dd>₹ {money(selected.invoice.invoiceValue)}</dd>
              {eway && (
                <>
                  <dt>Vehicle Number</dt>
                  <dd>{selected.vehicle}</dd>
                  <dt>Dispatch / Destination</dt>
                  <dd>
                    {selected.dispatch} → {selected.destination}
                  </dd>
                  <dt>Distance</dt>
                  <dd>{selected.distance} KM</dd>
                </>
              )}
              <dt>Status</dt>
              <dd>{selected.status}</dd>
            </dl>
          </div>
          {action === "cancel" && (
            <Select
              label="Cancellation Reason"
              required
              value={reason}
              options={[
                "Duplicate",
                "Order Cancelled",
                "Data Entry Mistake",
                "Others",
              ]}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          {action === "vehicle" && (
            <Input
              label="New Vehicle Number"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value.toUpperCase())}
            />
          )}
          <div className="actions">
            <Btn tone="secondary" onClick={() => window.print()}>
              PRINT
            </Btn>
            {selected.status !== "Cancelled" && !action && (
              <>
                {eway && (
                  <Btn tone="secondary" onClick={() => setAction("vehicle")}>
                    UPDATE VEHICLE
                  </Btn>
                )}
                <Btn tone="danger" onClick={() => setAction("cancel")}>
                  CANCEL {eway ? "EWB" : "IRN"}
                </Btn>
              </>
            )}
            {action && (
              <Btn
                onClick={async () => {
                  await mutate("documents/update", {
                    kind,
                    id: selected.id,
                    action,
                    reason,
                    vehicle,
                  });
                  setSelected(null);
                  setAction("");
                }}
              >
                CONFIRM
              </Btn>
            )}
            <Btn
              tone="secondary"
              onClick={() => {
                setSelected(null);
                setAction("");
              }}
            >
              CLOSE
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
