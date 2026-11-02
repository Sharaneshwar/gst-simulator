import { useState } from "react";
import { Btn, Input, Modal, Table, dateLabel, money, usePortal } from "./lib";

export function EwayReturnImport({ section, onClose }) {
  const { w, active, mutate } = usePortal();
  const [ids, setIds] = useState([]),
    [errors, setErrors] = useState([]),
    [search, setSearch] = useState("");
  const periods =
    w.filingFrequency === "QRMP" && w.returnInfo?.isEnd
      ? w.returnInfo.periods
      : [w.period];
  const eligible = w.documents.eway.filter(
    (doc) =>
      doc.status === "Active" &&
      doc.supplyType === "Outward" &&
      doc.documentType === "Tax Invoice" &&
      doc.seller?.gstin === active.state.taxpayer.gstin &&
      periods.includes(doc.invoice.date.slice(0, 7)),
  );
  const rows = eligible.filter((doc) =>
    `${doc.number} ${doc.invoice.number} ${doc.invoice.gstin}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Modal title={`Import EWB Data — ${section}`} wide onClose={onClose}>
      <p>
        Outward e-way bills generated for this taxpayer and return period are
        listed below. Select records to import, then review their details before
        filing.
      </p>
      <Input
        label="Search e-way bills"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Table
        columns={[
          "Select",
          "E-Way Bill No.",
          "Invoice No.",
          "Invoice Date",
          "Recipient GSTIN",
          "Total Invoice Value (₹)",
        ]}
        count={rows.length}
      >
        {rows.map((doc) => (
          <tr key={doc.id}>
            <td>
              <input
                aria-label={`Select e-way bill ${doc.number}`}
                type="checkbox"
                checked={ids.includes(doc.id)}
                onChange={(event) =>
                  setIds((old) =>
                    event.target.checked
                      ? [...old, doc.id]
                      : old.filter((id) => id !== doc.id),
                  )
                }
              />
            </td>
            <td>{doc.number}</td>
            <td>{doc.invoice.number}</td>
            <td>{dateLabel(doc.invoice.date)}</td>
            <td>{doc.invoice.gstin}</td>
            <td className="number">{money(doc.invoice.invoiceValue)}</td>
          </tr>
        ))}
      </Table>
      {errors.length > 0 && (
        <div className="import-errors" role="alert">
          <h3>Records requiring attention</h3>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>
                {error.number || `Record ${error.row}`}: {error.error}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions">
        <Btn tone="secondary" onClick={onClose}>
          BACK
        </Btn>
        <Btn
          disabled={!ids.length}
          onClick={async () => {
            const result = await mutate("gstr1/import-ewb", { section, ids });
            setErrors(result.errors || []);
            setIds([]);
            if (!result.errors?.length) onClose();
          }}
        >
          IMPORT SELECTED RECORDS
        </Btn>
      </div>
    </Modal>
  );
}
