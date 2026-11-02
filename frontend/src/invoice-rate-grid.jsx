import {
  RETURN_RATES,
  changeRateCell,
  invoiceRateRows,
  invoiceTaxContext,
  lineTaxes,
  rateTotals,
} from "./return-entry.mjs";
import { money } from "./lib";
import { RateGuideLink } from "./rate-guide";

export function InvoiceRateGrid({
  invoice,
  homeState,
  onChange,
  disabled = false,
}) {
  const context = invoiceTaxContext(invoice, homeState);
  const rows = invoiceRateRows(invoice, context);
  const totals = rateTotals(invoice, homeState);
  const heads = context.interstate
    ? [["igst", "Integrated tax (₹)"]]
    : [
        ["cgst", "Central tax (₹)"],
        ["sgst", "State/UT tax (₹)"],
      ];
  const input = (row, field, value, readOnly = false) => (
    <input
      aria-label={`${row.rate}% ${field === "taxable" ? "Taxable value" : field === "cess" ? "Cess" : heads.find(([key]) => key === field)?.[1]}`}
      type="number"
      min="0"
      max="1000000000000"
      step="0.01"
      inputMode="decimal"
      value={value}
      readOnly={readOnly}
      disabled={disabled || (field !== "taxable" && row.taxable === "")}
      onChange={(event) =>
        onChange(
          changeRateCell(
            invoice,
            homeState,
            row.rate,
            field,
            event.target.value,
          ),
        )
      }
    />
  );
  return (
    <section className="portal-rate-grid" aria-label="Item details by tax rate">
      <h3>Item details</h3>
      <div className="table-scroll">
        <table className="editable-table fixed-rate-table">
          <thead>
            <tr>
              <th rowSpan="2" scope="col">
                Rate (%)
              </th>
              <th rowSpan="2" scope="col">
                Taxable value (₹) <b className="required">*</b>
              </th>
              <th colSpan={heads.length + 1} scope="colgroup">
                Amount of Tax
              </th>
            </tr>
            <tr>
              {heads.map(([key, label]) => (
                <th scope="col" key={key}>
                  {label}
                </th>
              ))}
              <th scope="col">Cess (₹)</th>
            </tr>
          </thead>
          <tbody>
            {RETURN_RATES.map((rate) => {
              const row = rows.find((item) => item.rate === rate) || {
                rate,
                taxable: "",
                cess: "",
              };
              const taxes = lineTaxes(row, context);
              const used = row.taxable !== "";
              return (
                <tr key={rate} className={used ? "rate-row-entered" : ""}>
                  <th scope="row">{rate}%</th>
                  <td>{input(row, "taxable", row.taxable)}</td>
                  {heads.map(([head]) => (
                    <td key={head}>
                      {input(
                        row,
                        head,
                        used ? taxes[head] : "",
                        context.withoutPayment,
                      )}
                    </td>
                  ))}
                  <td>
                    {input(
                      row,
                      "cess",
                      context.withoutPayment
                        ? used
                          ? 0
                          : ""
                        : (row.cess ?? ""),
                      context.withoutPayment,
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="number">{money(totals.taxable)}</td>
              {heads.map(([head]) => (
                <td className="number" key={head}>
                  {money(totals.taxes[head])}
                </td>
              ))}
              <td className="number">{money(totals.taxes.cess)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <RateGuideLink date={invoice.date} />
    </section>
  );
}
