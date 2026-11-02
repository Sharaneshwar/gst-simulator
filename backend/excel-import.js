"use strict";
const ExcelJS = require("exceljs");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const flow = require("./practice-workflows");
const tally = require("./tally-ledger");
const rules = require("./return-rules");
const RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fail = (message) => {
  const e = new Error(message);
  e.status = 400;
  throw e;
};
const norm = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const ALIASES = {
  date: ["date", "invoicedate", "supplierinvoicedate", "documentdate"],
  supplierDate: ["supplierinvoicedate"],
  number: [
    "supplierinvoiceno",
    "supplierinvoicenumber",
    "invoiceno",
    "invoicenumber",
    "documentno",
    "documentnumber",
    "billno",
  ],
  voucher: ["voucherno", "vouchernumber"],
  name: [
    "supplier",
    "suppliername",
    "partyname",
    "buyer",
    "buyername",
    "recipient",
    "recipientname",
    "particulars",
  ],
  gstin: ["gstinuin", "gstin", "suppliergstin", "buyergstin", "recipientgstin"],
  taxable: [
    "taxablevalue",
    "taxableamount",
    "assessablevalue",
    "purchase",
    "purchases",
    "sales",
    "sale",
    "value",
  ],
  gross: [
    "grosstotal",
    "invoicevalue",
    "invoiceamount",
    "totalinvoicevalue",
    "totalamount",
  ],
  rate: ["gstrate", "rate", "taxrate", "rateoftax"],
  place: ["placeofsupply", "pos", "posstate"],
  section: ["section", "gstr1section"],
  documentType: ["documenttype", "vouchertype"],
};
function value(cell) {
  let v = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("formula" in v || "sharedFormula" in v) {
      if (v.result === undefined)
        throw Error(
          "Formula has no cached result; recalculate and save the workbook in Excel first.",
        );
      v = v.result;
    } else if (v.richText) v = v.richText.map((t) => t.text).join("");
    else if (v.text !== undefined) v = v.text;
    else if (v.error) throw Error("Excel error in a required cell: " + v.error);
    else throw Error("Unsupported cell value.");
  }
  return v;
}
function amount(v, label, optional = false) {
  if (v === null || v === undefined || v === "") {
    if (optional) return 0;
    throw Error(`${label} is missing.`);
  }
  const n =
    typeof v === "number" ? v : Number(String(v).replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1e12)
    throw Error(`${label} must be a non-negative number.`);
  return round(n);
}
function date(v, date1904) {
  if (typeof v === "number")
    v = new Date(
      Date.UTC(1899, 11, 30) + (v + (date1904 ? 1462 : 0)) * 86400000,
    );
  if (v instanceof Date && !Number.isNaN(v.valueOf()))
    return v.toISOString().slice(0, 10);
  const text = String(v || "").trim();
  let match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (match)
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = /^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2}|\d{4})$/.exec(text);
  if (match) {
    const month =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(match[2].toLowerCase()) + 1;
    if (month)
      return `${match[3].length === 2 ? "20" : ""}${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw Error(
    "Enter an invoice date as an Excel date, YYYY-MM-DD or DD-MM-YYYY.",
  );
}
function checkZip(buffer) {
  // Inspect the central directory before ExcelJS inflates the workbook.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0)
    fail(
      "Select a valid .xlsx workbook. Legacy .xls and encrypted workbooks are not supported.",
    );
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (!count || count > 400 || offset >= end)
    fail("Workbook archive is too complex.");
  let pos = offset,
    size = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50)
      fail("Invalid workbook archive.");
    const expanded = buffer.readUInt32LE(pos + 24),
      compressed = buffer.readUInt32LE(pos + 20),
      length = buffer.readUInt16LE(pos + 28),
      extra = buffer.readUInt16LE(pos + 30),
      comment = buffer.readUInt16LE(pos + 32);
    const name = buffer.subarray(pos + 46, pos + 46 + length).toString();
    size += expanded;
    if (
      expanded > 12 * 1024 * 1024 ||
      size > 32 * 1024 * 1024 ||
      /vbaProject|externalLinks|embeddings/i.test(name)
    )
      fail(
        "Workbook is too large or contains unsupported macros, external links or embedded files.",
      );
    const local = buffer.readUInt32LE(pos + 42),
      method = buffer.readUInt16LE(pos + 10);
    if (
      buffer.readUInt16LE(pos + 8) & 1 ||
      local + 30 > offset ||
      buffer.readUInt32LE(local) !== 0x04034b50
    )
      fail("Invalid or encrypted workbook archive.");
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (start + compressed > offset || ![0, 8].includes(method))
      fail("Invalid workbook archive entry.");
    try {
      const data = buffer.subarray(start, start + compressed);
      const decoded =
        method === 8
          ? zlib.inflateRawSync(data, {
              maxOutputLength: Math.max(1, expanded),
            })
          : data;
      if (decoded.length !== expanded)
        fail("Workbook archive size does not match its contents.");
    } catch {
      fail("Invalid workbook archive or expanded data exceeds its size limit.");
    }
    pos += 46 + length + extra + comment;
  }
}
async function previewExcel(
  body,
  {
    period,
    taxpayer,
    purchases = [],
    invoices = [],
    masters = [],
    asOf,
    annualReturns = {},
    validateInvoice,
  },
) {
  if (
    !/\.xlsx$/i.test(body.name || "") ||
    typeof body.base64 !== "string" ||
    body.base64.length > 8_000_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)
  )
    fail("Choose an .xlsx file smaller than 6 MB.");
  const buffer = Buffer.from(body.base64, "base64");
  if (buffer.length > 6_000_000)
    fail("Choose an .xlsx file smaller than 6 MB.");
  checkZip(buffer);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer, {
      ignoreNodes: [
        "picture",
        "drawing",
        "dataValidations",
        "conditionalFormatting",
      ],
    });
  } catch {
    fail(
      "Unable to read this workbook. Save a standard, unencrypted .xlsx export and try again.",
    );
  }
  if (book.worksheets.length > 20)
    fail("Use a workbook with at most 20 sheets.");
  const rows = [],
    errors = [],
    skippedSheets = [],
    skippedVouchers = [];
  let scanned = 0;
  const sheets = book.worksheets.flatMap((sheet) =>
    sheet.state === "visible"
      ? tally.normalize(sheet, {
          ExcelJS,
          value,
          date,
          date1904: book.properties.date1904,
          masters,
          target: body.target,
        })
      : [sheet],
  );
  for (const sheet of sheets) {
    errors.push(...(sheet._normalizationErrors || []));
    skippedVouchers.push(
      ...(sheet._skippedVouchers || []).map((row) => ({
        ...row,
        sheet: sheet._sourceName || sheet.name,
      })),
    );
    if (sheet.state !== "visible") {
      skippedSheets.push(sheet.name);
      continue;
    }
    if (sheet.rowCount > 2100 || sheet.columnCount > 100)
      fail("Use at most 2,000 data rows and 100 columns per sheet.");
    let header = null,
      columns = null,
      taxColumns = null;
    for (let index = 1; index <= Math.min(30, sheet.rowCount); index++) {
      const cells = sheet.getRow(index).values;
      const normalized = cells.map((v) =>
        norm(v && typeof v === "object" ? v.text || "" : v),
      );
      const cols = Object.fromEntries(
        Object.entries(ALIASES).map(([key, aliases]) => [
          key,
          aliases.map((a) => normalized.indexOf(a)).find((n) => n > 0) || 0,
        ]),
      );
      if (
        cols.date &&
        (cols.number || cols.voucher) &&
        cols.taxable &&
        cols.name
      ) {
        header = index;
        columns = cols;
        taxColumns = Object.fromEntries(
          ["igst", "cgst", "sgst", "cess"].map((head) => [
            head,
            cells.flatMap((v, i) =>
              i > 0 &&
              (head === "cess"
                ? /cess/i.test(String(v))
                : norm(v).includes(head))
                ? [{ index: i, label: String(v) }]
                : [],
            ),
          ]),
        );
        break;
      }
    }
    if (!header) {
      skippedSheets.push(sheet.name);
      continue;
    }
    const target =
      /purchase|inward/i.test(sheet.name) || columns.supplierDate
        ? "purchases"
        : /sales|outward/i.test(sheet.name)
          ? "sales"
          : body.target;
    if (!["purchases", "sales"].includes(target)) {
      errors.push({
        sheet: sheet.name,
        row: header,
        message:
          "Cannot identify purchases or sales. Name the sheet Purchase Register or Sales Register.",
      });
      continue;
    }
    const read = (r, key) =>
      columns[key] ? value(r.getCell(columns[key])) : undefined;
    for (let index = header + 1; index <= sheet.rowCount; index++) {
      const r = sheet.getRow(index);
      if (!r.hasValues) continue;
      const texts = r.values.filter((v) => typeof v === "string");
      const isTotal = (v) =>
        typeof v === "string" &&
        /^(grand\s*total|total|closing\s*balance|opening\s*balance|brought\s*forward|carried\s*forward)\s*:?$/i.test(
          v.trim(),
        );
      const rawDate = r.getCell(columns.date).value;
      const rawNumber = r.getCell(columns.number || columns.voucher).value;
      if (!rawNumber && (!rawDate || isTotal(rawDate)) && texts.some(isTotal))
        continue;
      if (++scanned > 2000) fail("Import at most 2,000 data rows at a time.");
      const meta = sheet._sourceMeta?.[index];
      const sourceKey = meta?.key || `${sheet.id}:${index}`,
        warnings = [...(meta?.warnings || [])];
      const sourceInfo = {
        sourceKey,
        sheet: sheet._sourceName || sheet.name,
        row: meta?.row || index,
        target,
        sourceRows: meta?.sourceRows || [index],
      };
      try {
        const number = String(
          body.numbers?.[sourceKey] ??
            read(r, "number") ??
            read(r, "voucher") ??
            "",
        ).trim();
        if (!number) throw Error("Invoice number is missing.");
        const dt = date(
          read(r, "supplierDate") ?? read(r, "date"),
          book.properties.date1904,
        );
        const rawGstin = String(
          body.gstins?.[sourceKey] ?? read(r, "gstin") ?? "",
        )
          .trim()
          .toUpperCase();
        const gstin =
          target === "sales" && ["URP", "UNREGISTERED"].includes(rawGstin)
            ? ""
            : rawGstin;
        const name = String(read(r, "name") || "").trim();
        Object.assign(sourceInfo, { number, date: dt, gstin, name });
        const taxable = amount(read(r, "taxable"), "Taxable value");
        const taxes = Object.fromEntries(
          Object.entries(taxColumns).map(([head, cols]) => [
            head,
            round(
              cols.reduce(
                (sum, col) =>
                  sum + amount(value(r.getCell(col.index)), col.label, true),
                0,
              ),
            ),
          ]),
        );
        const hasTaxColumns = Object.values(taxColumns).some(
          (cols) => cols.length,
        );
        const rawRate = read(r, "rate");
        const suppliedRate =
          typeof rawRate === "number" &&
          columns.rate &&
          /%/.test(r.getCell(columns.rate).numFmt || "")
            ? rawRate * 100
            : rawRate;
        let rate;
        if (hasTaxColumns) {
          const tax = taxes.igst + taxes.cgst + taxes.sgst;
          const calculated = taxable ? (tax * 100) / taxable : 0;
          rate = RATES.find((n) => Math.abs(n - calculated) < 0.025);
          if (rate === undefined || (!taxable && tax))
            throw Error(
              "Tax amounts do not match a supported GST rate. Split mixed-rate invoices into separate rows.",
            );
          if (!tax)
            warnings.push(
              "No GST amount supplied. Review whether this is nil-rated, exempt or non-GST before claiming ITC.",
            );
          if (
            suppliedRate !== undefined &&
            suppliedRate !== null &&
            suppliedRate !== "" &&
            Math.abs(
              amount(String(suppliedRate).replace("%", ""), "Rate") - rate,
            ) > 0.025
          )
            warnings.push(
              `Entered rate differs from actual tax amounts (${rate}%). Actual amounts are preserved.`,
            );
          for (const cols of Object.values(taxColumns))
            for (const col of cols) {
              const headerRate = /@\s*(\d+(?:\.\d+)?)\s*%?/.exec(col.label);
              if (headerRate && Number(value(r.getCell(col.index)) || 0) > 0) {
                const expected = /cgst|sgst/i.test(col.label) ? rate / 2 : rate;
                if (Math.abs(Number(headerRate[1]) - expected) > 0.025)
                  warnings.push(
                    `${col.label} heading differs from the ${expected}% implied by its amount.`,
                  );
              }
            }
        } else {
          rate = amount(
            String(suppliedRate ?? "").replace("%", ""),
            "GST rate",
          );
          if (!RATES.includes(rate))
            throw Error("Choose a supported GST rate.");
        }
        const sourcePlace = read(r, "place");
        const override = body.places?.[sourceKey];
        const supplierState = gstin
          ? flow.stateName(gstin.slice(0, 2))
          : flow.stateName(taxpayer.state);
        const defaultPlace =
          target === "purchases"
            ? taxes.cgst || taxes.sgst
              ? supplierState
              : taxpayer.state
            : taxes.cgst || taxes.sgst
              ? taxpayer.state
              : supplierState;
        const place = flow.stateName(override || sourcePlace || defaultPlace);
        if (!sourcePlace && !override)
          warnings.push(`Place of Supply was not supplied; review ${place}.`);
        const inter =
          target === "purchases"
            ? supplierState !== place
            : flow.stateName(taxpayer.state) !== place;
        if (
          hasTaxColumns &&
          ((inter && (taxes.cgst || taxes.sgst)) || (!inter && taxes.igst))
        )
          throw Error(
            "Tax heads do not match Place of Supply. Correct the POS in the preview or the workbook.",
          );
        if (!hasTaxColumns) {
          const tax = round((taxable * rate) / 100);
          taxes.igst = inter ? tax : 0;
          taxes.cgst = inter ? 0 : round(tax / 2);
          taxes.sgst = inter ? 0 : round(tax - taxes.cgst);
          warnings.push(
            "Tax amounts calculated from taxable value and rate; review before import.",
          );
        }
        const gross = read(r, "gross");
        const computed = round(
          taxable + Object.values(taxes).reduce((a, b) => a + b, 0),
        );
        const invoiceValue =
          gross === null || gross === undefined || gross === ""
            ? computed
            : amount(gross, "Invoice value");
        if (Math.abs(invoiceValue - computed) > 1)
          warnings.push(
            "Invoice total differs from taxable value plus taxes. Review additional charges/rounding.",
          );
        const rawType = String(read(r, "documentType") || "Invoice");
        const documentType = /credit/i.test(rawType)
          ? "Credit Note"
          : /debit/i.test(rawType)
            ? "Debit Note"
            : "Invoice";
        const section = String(
          read(r, "section") ||
            (documentType !== "Invoice"
              ? gstin
                ? "CDNR"
                : "CDNUR"
              : gstin
                ? "B2B"
                : inter &&
                    invoiceValue > (period >= "2024-08" ? 100000 : 250000)
                  ? "B2CL"
                  : "B2CS"),
        ).toUpperCase();
        const input = {
          number,
          date: dt,
          gstin,
          supplier: name,
          recipient: name,
          taxable,
          rate,
          place,
          taxes,
          invoiceValue,
          documentType,
          section,
          noteType: documentType,
          includedIn2b: true,
          match: warnings.length ? "Requires Review" : "Matched",
        };
        let entry = null,
          rowError = null;
        try {
          if (
            target === "sales" &&
            !["B2B", "B2CL", "B2CS", "CDNR", "CDNUR"].includes(section)
          )
            throw Error(
              "This Excel layout supports domestic invoices and notes. Use the official JSON utility for other tables.",
            );
          if (target === "sales")
            rules.reporting(dt, period, {
              asOf,
              annualFiled: annualReturns[rules.fy(dt)],
            });
          entry =
            target === "purchases"
              ? flow.purchaseRow(input, period, taxpayer.state)
              : validateInvoice(
                  {
                    ...input,
                    items: [{ taxable, rate, taxes, cess: taxes.cess }],
                  },
                  period,
                  taxpayer.state,
                );
          const existing = target === "purchases" ? purchases : invoices;
          if (
            existing.some((i) =>
              target === "purchases"
                ? i.gstin === gstin &&
                  i.number === number &&
                  (i.documentType || "Invoice") === documentType
                : i.number === number &&
                  flow.financialYear(i.date.slice(0, 7)) ===
                    flow.financialYear(dt.slice(0, 7)),
            )
          )
            throw Error("Document already exists: " + number);
        } catch (error) {
          rowError = error.message;
        }
        rows.push({
          ...sourceInfo,
          number,
          date: dt,
          gstin,
          name,
          taxable,
          rate,
          place,
          taxes,
          invoiceValue,
          grossProvided: !(
            gross === null ||
            gross === undefined ||
            gross === ""
          ),
          warnings,
          error: rowError,
          entry,
        });
      } catch (error) {
        rows.push({ ...sourceInfo, warnings, error: error.message });
      }
    }
  }
  if (!rows.length && !errors.length)
    fail(
      "No supported invoice table found. Use Date, Supplier/Party Name, Supplier Invoice No./Invoice No., GSTIN/UIN, Purchase/Sales/Taxable Value and GST rate or tax-amount columns.",
    );
  const combined = [];
  const groups = new Map();
  for (const row of rows) {
    const key = [
      row.target,
      row.target === "purchases" ? row.gstin : "",
      row.number,
      row.entry?.documentType || row.entry?.section,
    ].join(":");
    if (!row.number || row.error || !row.entry) {
      combined.push(row);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) {
    const first = group[0];
    if (group.length === 1) {
      combined.push(first);
      continue;
    }
    try {
      if (
        group.some(
          (row) =>
            row.date !== first.date ||
            row.place !== first.place ||
            row.name !== first.name ||
            row.target !== first.target,
        )
      )
        throw Error(
          "Repeated invoice rows disagree on party, date or Place of Supply. Correct the source data.",
        );
      const signatures = new Set();
      for (const row of group) {
        const signature = JSON.stringify([row.rate, row.taxable, row.taxes]);
        if (signatures.has(signature))
          throw Error(
            "An identical invoice line is repeated. Remove the duplicate source row.",
          );
        signatures.add(signature);
      }
      if (new Set(group.map((row) => row.rate)).size === 1)
        throw Error(
          "Repeated same-rate rows cannot be distinguished from duplicate documents. Consolidate them into one source row.",
        );
      const taxable = round(group.reduce((n, row) => n + row.taxable, 0));
      const taxes = Object.fromEntries(
        ["igst", "cgst", "sgst", "cess"].map((h) => [
          h,
          round(group.reduce((n, row) => n + row.taxes[h], 0)),
        ]),
      );
      const expected = round(
        taxable + Object.values(taxes).reduce((a, b) => a + b, 0),
      );
      const supplied = group.filter((row) => row.grossProvided),
        unique = [...new Set(supplied.map((row) => row.invoiceValue))];
      let invoiceValue = expected;
      if (supplied.length) {
        if (unique.length === 1 && Math.abs(unique[0] - expected) <= 1)
          invoiceValue = unique[0];
        else if (
          group.every(
            (row) =>
              Math.abs(
                row.invoiceValue -
                  row.taxable -
                  Object.values(row.taxes).reduce((a, b) => a + b, 0),
              ) <= 1,
          )
        )
          invoiceValue = round(
            group.reduce((n, row) => n + row.invoiceValue, 0),
          );
        else if (unique.length === 1 && unique[0] >= expected)
          invoiceValue = unique[0];
        else
          throw Error(
            "Mixed-rate invoice totals do not reconcile. Repeat the full invoice total on each rate row, or supply each line's own total.",
          );
      }
      const items = group.map((row) => ({
        rate: row.rate,
        taxable: row.taxable,
        taxes: row.taxes,
        cess: row.taxes.cess,
      }));
      const input = { ...first.entry, items, taxable, taxes, invoiceValue };
      const entry =
        first.target === "purchases"
          ? flow.purchaseRow(input, period, taxpayer.state)
          : validateInvoice(input, period, taxpayer.state);
      combined.push({
        ...first,
        taxable,
        taxes,
        rate: "Multiple",
        invoiceValue,
        entry,
        sourceRows: [...new Set(group.flatMap((row) => row.sourceRows))],
        sourceKeys: group.map((row) => row.sourceKey),
        warnings: [
          ...new Set(group.flatMap((row) => row.warnings)),
          `${group.length} rate rows consolidated into one invoice.`,
        ],
      });
    } catch (error) {
      combined.push({
        ...first,
        error: error.message,
        entry: null,
        sourceRows: group.flatMap((row) => row.sourceRows),
        sourceKeys: group.map((row) => row.sourceKey),
      });
    }
  }
  combined.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row);
  rows.splice(0, rows.length, ...combined);
  const fingerprint = crypto
    .createHash("sha256")
    .update(buffer)
    .update(
      JSON.stringify([
        period,
        taxpayer.gstin,
        body.places || {},
        body.gstins || {},
        body.numbers || {},
        body.target || "",
      ]),
    )
    .digest("hex");
  return {
    fingerprint,
    rows,
    errors,
    skippedSheets,
    skippedVouchers,
    totals: {
      records: rows.length,
      taxable: round(rows.reduce((n, r) => n + (r.taxable || 0), 0)),
      tax: round(
        rows.reduce(
          (n, r) => n + Object.values(r.taxes || {}).reduce((a, b) => a + b, 0),
          0,
        ),
      ),
    },
    canImport: !errors.length && rows.length > 0 && rows.every((r) => !r.error),
    warningCount: rows.reduce((n, r) => n + r.warnings.length, 0),
  };
}
const publicPreview = (preview) => ({
  ...preview,
  rows: preview.rows.map(({ entry, ...row }) => row),
});
module.exports = { previewExcel, publicPreview, checkZip };
