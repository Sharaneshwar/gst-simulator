import { RATE_REFERENCE } from "./rate-reference.mjs";

export const RETURN_RATES = RATE_REFERENCE.map(({ rate }) => rate);
export const GRID_SECTIONS = [
  "B2B",
  "B2BA",
  "B2CL",
  "B2CLA",
  "EXP",
  "EXPA",
  "CDNR",
  "CDNRA",
  "CDNUR",
  "CDNURA",
];
export const roundAmount = (n) =>
  Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const zeroTaxes = () => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });

export function invoiceTaxContext(invoice, homeState) {
  const exports =
    invoice.section?.startsWith("EXP") ||
    (invoice.section?.startsWith("CDNUR") && invoice.urType?.startsWith("EXP"));
  return {
    interstate:
      exports ||
      invoice.intraStateIgst ||
      invoice.supplyCategory?.startsWith("SEZ") ||
      invoice.place !== homeState,
    withoutPayment:
      (exports &&
        (invoice.exportType === "Without payment of tax" ||
          invoice.urType === "EXPWOP")) ||
      invoice.supplyCategory === "SEZWOP",
    differential: invoice.differential ? 0.65 : 1,
  };
}

export function lineTaxes(line, context) {
  if (context.withoutPayment) return zeroTaxes();
  const tax = roundAmount(
    (Number(line.taxable || 0) *
      Number(line.rate || 0) *
      context.differential) /
      100,
  );
  const central = roundAmount(tax / 2);
  return {
    igst: context.interstate ? tax : 0,
    cgst: context.interstate ? 0 : central,
    sgst: context.interstate ? 0 : roundAmount(tax - central),
    cess: roundAmount(line.cess),
    ...line.taxes,
  };
}

// Older single-rate records and offline files open in the same fixed-rate grid.
// Coalesce repeated rates from imported item lists without dropping tax overrides.
export function invoiceRateRows(invoice, context) {
  const source = invoice.items?.length
    ? invoice.items
    : Number(invoice.taxable) || Number(invoice.cess)
      ? [
          {
            rate: Number(invoice.rate || 0),
            taxable: invoice.taxable,
            cess: invoice.cess,
          },
        ]
      : [];
  const grouped = new Map();
  for (const line of source) {
    const rate = Number(line.rate);
    if (!grouped.has(rate)) grouped.set(rate, { ...line, rate });
    else {
      const previous = grouped.get(rate);
      const taxes = lineTaxes(line, context),
        oldTaxes = lineTaxes(previous, context);
      grouped.set(rate, {
        rate,
        taxable: roundAmount(Number(previous.taxable) + Number(line.taxable)),
        cess: roundAmount(Number(previous.cess || 0) + Number(line.cess || 0)),
        taxes: Object.fromEntries(
          Object.keys(taxes).map((head) => [
            head,
            roundAmount(Number(oldTaxes[head] || 0) + Number(taxes[head] || 0)),
          ]),
        ),
      });
    }
  }
  return [...grouped.values()].sort((a, b) => a.rate - b.rate);
}

export function changeRateCell(invoice, homeState, rate, field, value) {
  const context = invoiceTaxContext(invoice, homeState);
  const rows = invoiceRateRows(invoice, context);
  const line = rows.find((row) => row.rate === rate) || {
    rate,
    taxable: "",
    cess: "",
  };
  let changed;
  if (field === "taxable") {
    // A taxable-value change recalculates all heads, just like the portal.
    changed = {
      rate,
      taxable: value,
      cess: value === "" ? "" : line.cess || "",
    };
  } else if (field === "cess") {
    changed = {
      ...line,
      cess: value,
      ...(line.taxes
        ? { taxes: { ...line.taxes, cess: Number(value || 0) } }
        : {}),
    };
  } else
    changed = {
      ...line,
      taxes: { ...lineTaxes(line, context), [field]: value },
    };
  const next = rows.filter((row) => row.rate !== rate);
  if (changed.taxable !== "" || Number(changed.cess)) next.push(changed);
  return {
    ...invoice,
    items: next.sort((a, b) => a.rate - b.rate),
    taxable: roundAmount(
      next.reduce((n, row) => n + Number(row.taxable || 0), 0),
    ),
    cess: roundAmount(next.reduce((n, row) => n + Number(row.cess || 0), 0)),
  };
}

export function rateTotals(invoice, homeState) {
  const context = invoiceTaxContext(invoice, homeState);
  return invoiceRateRows(invoice, context).reduce(
    (out, row) => {
      out.taxable = roundAmount(out.taxable + Number(row.taxable || 0));
      const taxes = lineTaxes(row, context);
      for (const head of Object.keys(out.taxes))
        out.taxes[head] = roundAmount(
          out.taxes[head] + Number(taxes[head] || 0),
        );
      return out;
    },
    { taxable: 0, taxes: zeroTaxes() },
  );
}

export function resetTaxOverrides(invoice) {
  return {
    ...invoice,
    items: invoice.items?.map(({ taxes, ...line }) => line),
  };
}

export function itcNet(rows) {
  return Object.fromEntries(
    ["igst", "cgst", "sgst", "cess"].map((head) => [
      head,
      roundAmount(
        ["a1", "a2", "a3", "a4", "a5"].reduce(
          (n, key) => n + Number(rows[key]?.taxes?.[head] || 0),
          0,
        ) -
          ["b1", "b2"].reduce(
            (n, key) => n + Number(rows[key]?.taxes?.[head] || 0),
            0,
          ),
      ),
    ]),
  );
}
