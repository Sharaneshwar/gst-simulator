import { useState } from "react";
import { Btn, Input, Panel, Select, Table, money, usePortal } from "./lib";
import { GST_STATE_OPTIONS } from "./gst-states.mjs";
const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(Error("Unable to read workbook."));
    reader.readAsDataURL(file);
  });
export function ExcelImport({ target = "sales" }) {
  const { w, api, mutate, go } = usePortal();
  const [gstins, setGstins] = useState({}),
    [numbers, setNumbers] = useState({});
  const [receipt, setReceipt] = useState(null),
    [fileKey, setFileKey] = useState(0);
  const [file, setFile] = useState(null),
    [payload, setPayload] = useState(null),
    [preview, setPreview] = useState(null),
    [places, setPlaces] = useState({}),
    [reviewed, setReviewed] = useState(false),
    [dirty, setDirty] = useState(false);
  const reset = (chosen) => {
    setFile(chosen);
    setReceipt(null);
    setPayload(null);
    setPreview(null);
    setPlaces({});
    setGstins({});
    setNumbers({});
    setReviewed(false);
    setDirty(false);
  };
  const inspect = async () => {
    if (!file || !/\.xlsx$/i.test(file.name) || file.size > 6000000)
      throw Error("Select an .xlsx file smaller than 6 MB.");
    const next = {
      name: file.name,
      base64: payload?.base64 || (await readBase64(file)),
      target,
      places,
      gstins,
      numbers,
      period: w.period,
    };
    const result = await api("/workspace/excel/preview", next);
    setPayload(next);
    setPreview({ ...result.preview, period: w.period });
    setReviewed(false);
    setDirty(false);
  };
  const outdated = dirty || preview?.period !== w.period;
  return (
    <Panel title="Import Tally Excel (.xlsx)">
      <p>
        Upload a Purchase Register, Sales Register or Date / Particulars / Debit
        / Credit Day Book export. Preview the destination and tax amounts before
        importing. Purchases appear in Supplier Return Data and GSTR-2A/2B;
        sales appear in GSTR-1.
      </p>
      <p className="muted">
        Use Date, Supplier / Party Name, Supplier Invoice No. / Invoice No.,
        GSTIN/UIN, Purchase / Sales / Taxable Value, and GST rate or separate
        tax-amount columns. Totals are skipped. Mixed-rate invoice rows are
        consolidated. Standard ledger vouchers are grouped by voucher number;
        non-GST payment/journal vouchers are reported separately. Save legacy
        .xls files as .xlsx first.
      </p>
      <Input
        key={fileKey}
        label="Select Excel workbook"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => reset(e.target.files[0])}
      />
      <div className="actions">
        <Btn tone="secondary" disabled={!file} onClick={inspect}>
          PREVIEW EXCEL
        </Btn>
      </div>
      {receipt && (
        <div className="info" role="status">
          <b>Import complete.</b> {receipt.purchases} purchase documents and{" "}
          {receipt.sales} outward documents saved.
          <div className="actions">
            {!!receipt.purchases && (
              <Btn tone="secondary" onClick={() => go("supplier-data")}>
                VIEW IMPORTED PURCHASES
              </Btn>
            )}
            {!!receipt.sales && (
              <Btn tone="secondary" onClick={() => go("gstr1")}>
                VIEW GSTR-1
              </Btn>
            )}
          </div>
        </div>
      )}
      {preview && (
        <div className="excel-preview">
          <h3>Import preview — {preview.period}</h3>
          <p>
            {preview.totals.records} rows • Taxable value ₹
            {money(preview.totals.taxable)} • GST and cess ₹
            {money(preview.totals.tax)}
          </p>
          {preview.skippedSheets.length > 0 && (
            <p role="status">
              Sheets without a supported table:{" "}
              {preview.skippedSheets.join(", ")}
            </p>
          )}
          {!!preview.skippedVouchers?.length && (
            <p role="status">
              {preview.skippedVouchers.length} payment/journal voucher(s)
              skipped because they are not GST supply entries.
            </p>
          )}
          {preview.errors.map((error, i) => (
            <p className="error" key={i}>
              {error.sheet}, row {error.row}: {error.message}
            </p>
          ))}
          <Table
            columns={[
              "Source / Destination",
              "Document",
              "Party",
              "Taxable / Rate",
              "Tax amounts",
              "Place of Supply",
              "Validation",
            ]}
            count={preview.rows.length}
          >
            {preview.rows.map((row) => (
              <tr key={row.sourceKey}>
                <td>
                  {row.sheet}, row {row.row}
                  <br />
                  <b>
                    {row.target === "purchases"
                      ? "Inward supplies"
                      : "GSTR-1 outward supplies"}
                  </b>
                </td>
                <td>
                  {row.number ? (
                    <Input
                      label={`Invoice number — row ${row.row}`}
                      value={numbers[row.sourceKey] ?? row.number}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNumbers((old) => ({
                          ...old,
                          ...Object.fromEntries(
                            (row.sourceKeys || [row.sourceKey]).map((key) => [
                              key,
                              value,
                            ]),
                          ),
                        }));
                        setDirty(true);
                        setReviewed(false);
                      }}
                    />
                  ) : (
                    "—"
                  )}
                  <br />
                  {row.date}
                </td>
                <td>
                  {row.name}
                  {row.number && (
                    <Input
                      label={`GSTIN — row ${row.row}`}
                      value={gstins[row.sourceKey] ?? row.gstin ?? ""}
                      placeholder={
                        row.target === "sales"
                          ? "GSTIN or URP"
                          : "Supplier GSTIN"
                      }
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setGstins((old) => ({
                          ...old,
                          ...Object.fromEntries(
                            (row.sourceKeys || [row.sourceKey]).map((key) => [
                              key,
                              value,
                            ]),
                          ),
                        }));
                        setDirty(true);
                        setReviewed(false);
                      }}
                    />
                  )}
                </td>
                <td>
                  ₹{money(row.taxable)}
                  <br />
                  {typeof row.rate === "number"
                    ? `${row.rate}%`
                    : row.rate || "—"}
                </td>
                <td>
                  {Object.entries(row.taxes || {}).map(([head, value]) => (
                    <div key={head}>
                      {head.toUpperCase()}: ₹{money(value)}
                    </div>
                  ))}
                </td>
                <td>
                  {row.number && (
                    <Select
                      label={`POS — row ${row.row}`}
                      options={GST_STATE_OPTIONS}
                      value={places[row.sourceKey] || row.place || ""}
                      onChange={(e) => {
                        setPlaces((old) => ({
                          ...old,
                          ...Object.fromEntries(
                            (row.sourceKeys || [row.sourceKey]).map((key) => [
                              key,
                              e.target.value,
                            ]),
                          ),
                        }));
                        setDirty(true);
                        setReviewed(false);
                      }}
                    />
                  )}
                </td>
                <td>
                  {row.error && <p className="error">{row.error}</p>}
                  {row.warnings.map((warning, i) => (
                    <p key={i}>{warning}</p>
                  ))}
                  {!row.error && !row.warnings.length && "Ready"}
                </td>
              </tr>
            ))}
          </Table>
          {outdated && (
            <p className="info" role="status">
              The period or preview inputs changed. Preview Excel again before
              importing.
            </p>
          )}
          {preview.warningCount > 0 && (
            <label className="check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I reviewed the destinations, inferred rates, Place of Supply and
              warnings.
            </label>
          )}
          {!preview.canImport && (
            <p className="info">
              Correct the errors in the workbook or Place of Supply, then
              preview again. No entries have been saved.
            </p>
          )}
          <div className="actions">
            <Btn
              disabled={
                !preview.canImport ||
                outdated ||
                (!!preview.warningCount && !reviewed)
              }
              onClick={async () => {
                await mutate("excel/import", {
                  ...payload,
                  fingerprint: preview.fingerprint,
                  reviewed,
                });
                const counts = {
                  purchases: preview.rows.filter(
                    (row) => row.target === "purchases",
                  ).length,
                  sales: preview.rows.filter((row) => row.target === "sales")
                    .length,
                };
                reset(null);
                setReceipt(counts);
                setFileKey((old) => old + 1);
              }}
            >
              IMPORT {preview.rows.length} RECORDS
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}
