"use strict";
// Normalize the standard Date/Particulars/Vch Type/Vch No/Debit/Credit report.
// Ledger rows remain attached to their voucher; payment/journal vouchers are
// reported as skipped rather than misclassified as GST invoices.
const norm = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function normalize(
  sheet,
  { ExcelJS, value, date, date1904, masters = [], target = "sales" },
) {
  let header, cols;
  for (let i = 1; i <= Math.min(30, sheet.rowCount); i++) {
    const cells = sheet
      .getRow(i)
      .values.map((v) => norm(typeof v === "object" ? v?.text : v));
    const find = (...names) =>
      names.map((n) => cells.indexOf(n)).find((n) => n > 0) || 0;
    const c = {
      date: find("date"),
      name: find("particulars", "partyname"),
      type: find("vchtype", "vouchertype"),
      number: find("vchno", "voucherno", "vouchernumber"),
      debit: find("debit", "debitamount"),
      credit: find("credit", "creditamount"),
      gstin: find("gstin", "gstinuin"),
      supplierNumber: find("supplierinvoiceno", "supplierinvoicenumber"),
      pos: find("placeofsupply", "pos"),
    };
    if (c.date && c.name && c.type && c.number && (c.debit || c.credit)) {
      header = i;
      cols = c;
      break;
    }
  }
  if (!header) return [sheet];
  if (sheet.rowCount > 20000)
    throw Object.assign(
      Error("Use at most 20,000 source ledger rows per workbook."),
      { status: 400 },
    );
  const read = (r, key) => (cols[key] ? value(r.getCell(cols[key])) : null);
  const numeric = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(
      String(v)
        .replace(/[,₹\s]/g, "")
        .replace(/(Dr|Cr)$/i, ""),
    );
    if (!Number.isFinite(n)) throw Error("Ledger amount is not numeric.");
    return Math.abs(n);
  };
  const books = {},
    errors = [],
    skipped = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const block = current;
    current = null;
    try {
      const taxes = { igst: [], cgst: [], sgst: [], cess: [] },
        bases = [];
      for (const line of block.lines) {
        const head = Object.keys(taxes).find((h) =>
          line.label.toLowerCase().includes(h),
        );
        const m = /@\s*(\d+(?:\.\d+)?)\s*%?/.exec(line.label);
        if (head) {
          taxes[head].push({
            amount: line.amount,
            rate: m
              ? Number(m[1]) * (head === "cgst" || head === "sgst" ? 2 : 1)
              : null,
          });
          continue;
        }
        if (
          /round(?:ing)?\s*off|discount|freight|packing|additional.*cost/i.test(
            line.label,
          )
        ) {
          block.warnings.push(
            `Review ${line.label} against the source invoice total.`,
          );
          continue;
        }
        bases.push({
          taxable: line.amount,
          rate: m ? Number(m[1]) : null,
          label: line.label,
        });
      }
      if (!bases.length)
        throw Error(
          "No taxable purchase/sales ledger lines found for this voucher.",
        );
      const taxable = bases.reduce((n, r) => n + r.taxable, 0),
        taxTotal = ["igst", "cgst", "sgst"].reduce(
          (n, h) => n + taxes[h].reduce((a, b) => a + b.amount, 0),
          0,
        );
      const unknown = bases.filter((r) => r.rate === null);
      if (unknown.length) {
        const knownTotal = bases
            .filter((r) => r.rate !== null)
            .reduce((n, r) => n + (r.taxable * r.rate) / 100, 0),
          base = unknown.reduce((n, r) => n + r.taxable, 0);
        const effective = base ? ((taxTotal - knownTotal) * 100) / base : 0,
          rate = RATES.find((r) => Math.abs(r - effective) < 0.025);
        if (rate === undefined)
          throw Error(
            "Cannot infer the rate of an unlabelled mixed-rate ledger. Include @rate labels or use the flat invoice register.",
          );
        unknown.forEach((r) => (r.rate = rate));
        block.warnings.push(
          `GST rate ${rate}% inferred for unlabelled taxable ledger lines.`,
        );
      }
      if (bases.some((r) => !RATES.includes(r.rate)))
        throw Error("Unsupported GST rate in a taxable ledger label.");
      const groups = [];
      for (const line of bases) {
        let g = groups.find((g) => g.rate === line.rate);
        if (!g) {
          g = {
            rate: line.rate,
            taxable: 0,
            taxes: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          };
          groups.push(g);
        }
        g.taxable = round(g.taxable + line.taxable);
      }
      for (const [head, ledgers] of Object.entries(taxes)) {
        const unlabelled = ledgers.filter((l) => l.rate === null),
          pool = round(unlabelled.reduce((n, l) => n + l.amount, 0));
        for (const group of groups)
          group.taxes[head] = round(
            ledgers
              .filter((l) => l.rate === group.rate)
              .reduce((n, l) => n + l.amount, 0),
          );
        if (pool) {
          const uncovered = groups.filter(
            (g) => !ledgers.some((l) => l.rate === g.rate),
          );
          if (!uncovered.length)
            throw Error(
              `Both rate-specific and unlabelled ${head.toUpperCase()} ledger amounts overlap.`,
            );
          if (head === "cess") {
            let assigned = 0;
            for (const [index, g] of uncovered.entries()) {
              g.taxes[head] =
                index === uncovered.length - 1
                  ? round(pool - assigned)
                  : round((pool * g.taxable) / taxable);
              assigned += g.taxes[head];
            }
            block.warnings.push(
              "Cess allocated across taxable lines; review the allocation.",
            );
          } else {
            const expected = uncovered.reduce(
              (n, g) =>
                n + (g.taxable * g.rate) / (head === "igst" ? 100 : 200),
              0,
            );
            if (Math.abs(expected - pool) > 1)
              throw Error(
                `Unlabelled ${head.toUpperCase()} does not reconcile with taxable rate groups.`,
              );
            let assigned = 0;
            for (const [index, g] of uncovered.entries()) {
              g.taxes[head] =
                index === uncovered.length - 1
                  ? round(pool - assigned)
                  : round((g.taxable * g.rate) / (head === "igst" ? 100 : 200));
              assigned += g.taxes[head];
            }
          }
        }
      }
      for (const [head, ledgers] of Object.entries(taxes))
        if (
          Math.abs(
            ledgers.reduce((n, l) => n + l.amount, 0) -
              groups.reduce((n, g) => n + g.taxes[head], 0),
          ) > 0.01
        )
          throw Error(
            `${head.toUpperCase()} ledger amounts cannot be assigned to the taxable rate groups.`,
          );
      let output = books[block.target];
      if (!output) {
        const book = new ExcelJS.Workbook();
        output = book.addWorksheet(
          `${sheet.name.slice(0, 10)} ${block.target === "purchases" ? "Purchase" : "Sales"} Register`,
        );
        output._sourceName = sheet.name;
        output._sourceMeta = {};
        output._sourceId = sheet.id;
        output._normalizationWarnings = [];
        output.addRow([
          "Date",
          "Party Name",
          "Invoice No",
          "GSTIN/UIN",
          "Taxable Value",
          "Gross Total",
          "IGST",
          "CGST",
          "SGST",
          "Cess",
          "Place of Supply",
          "Document Type",
          "Rate",
        ]);
        books[block.target] = output;
      }
      const party = masters.find(
        (p) => p.name.toLowerCase() === block.name.toLowerCase(),
      );
      for (const [lineIndex, group] of groups.entries()) {
        output.addRow([
          block.date,
          block.name,
          block.number,
          block.gstin || party?.gstin || "",
          group.taxable,
          block.gross,
          ...["igst", "cgst", "sgst", "cess"].map((h) => group.taxes[h]),
          block.pos,
          block.documentType,
          group.rate,
        ]);
        output._sourceMeta[output.rowCount] = {
          row: block.row,
          key: `${sheet.id}:${block.row}:${lineIndex}`,
          sourceRows: [block.row, ...block.lines.map((l) => l.row)],
          warnings: block.warnings,
        };
      }
    } catch (e) {
      errors.push({ sheet: sheet.name, row: block.row, message: e.message });
    }
  };
  for (let index = header + 1; index <= sheet.rowCount; index++) {
    const r = sheet.getRow(index);
    if (!r.hasValues) continue;
    try {
      const dt = read(r, "date"),
        number = read(r, "number"),
        type = String(read(r, "type") || "").trim(),
        label = String(read(r, "name") || "").trim();
      if (dt && number && type) {
        flush();
        if (!/purchase|sales|credit\s*note|debit\s*note/i.test(type)) {
          skipped.push({ row: index, type });
          continue;
        }
        const purchase =
          /purchase|debit\s*note/i.test(type) ||
          (/purchase/i.test(sheet.name) && !/sales/i.test(type));
        current = {
          row: index,
          date: date(dt, date1904),
          number: String(read(r, "supplierNumber") || number),
          name: label,
          gstin: String(read(r, "gstin") || "")
            .trim()
            .toUpperCase(),
          pos: read(r, "pos"),
          target: purchase ? "purchases" : "sales",
          documentType: /credit\s*note|debit\s*note/i.test(type)
            ? "Credit Note"
            : "Invoice",
          gross: round(numeric(read(r, "debit")) + numeric(read(r, "credit"))),
          lines: [],
          warnings: [],
        };
        if (/debit\s*note/i.test(type))
          current.warnings.push(
            "Purchase-return debit voucher treated as an inward credit note. Verify the supplier's document before claiming ITC.",
          );
      } else if (
        current &&
        label &&
        !/^(?:grand\s*)?total\s*:?$/i.test(label)
      ) {
        const amount = round(
          numeric(read(r, "debit")) + numeric(read(r, "credit")),
        );
        if (amount) current.lines.push({ label, amount, row: index });
      }
    } catch (e) {
      errors.push({ sheet: sheet.name, row: index, message: e.message });
    }
  }
  flush();
  const outputs = Object.values(books);
  if (!outputs.length) {
    const book = new ExcelJS.Workbook();
    outputs.push(book.addWorksheet(sheet.name));
  }
  outputs[0]._normalizationErrors = errors;
  outputs[0]._skippedVouchers = skipped;
  return outputs;
}
module.exports = { normalize };
