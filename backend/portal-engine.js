"use strict";

const crypto = require("node:crypto");
const HEADS = ["igst", "cgst", "sgst", "cess"];
const SECTIONS = [
  "B2B",
  "B2CL",
  "EXP",
  "B2CS",
  "NIL",
  "CDNR",
  "CDNUR",
  "AT",
  "TXP",
  "HSN",
  "DOCS",
  "B2BA",
  "B2CLA",
  "EXPA",
  "CDNRA",
  "CDNURA",
  "ATA",
  "TXPA",
  "B2CSA",
  "ECO",
  "ECOA",
];
const REG_TABS = [
  "business",
  "promoters",
  "signatory",
  "representative",
  "principal",
  "additional",
  "goods",
  "state",
  "aadhaar",
  "verification",
];
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const zeros = () => Object.fromEntries(HEADS.map((h) => [h, 0]));
const total = (obj) =>
  round(HEADS.reduce((n, h) => n + Number(obj?.[h] || 0), 0));
const add = (a, b) =>
  Object.fromEntries(
    HEADS.map((h) => [h, round((a?.[h] || 0) + (b?.[h] || 0))]),
  );
const uid = () => crypto.randomUUID();
const digits = (length) =>
  String(crypto.randomInt(1, 10)) +
  Array.from({ length: length - 1 }, () => crypto.randomInt(0, 10)).join("");
const stamp = () => new Date().toISOString();
const fail = (message) => {
  const error = new Error(message);
  error.status = 400;
  throw error;
};
function amount(value, label = "Amount") {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 1e12)
    fail(`${label} must be a valid non-negative amount.`);
  return round(n);
}
function heads(input = {}) {
  return Object.fromEntries(
    HEADS.map((h) => [h, amount(input[h], h.toUpperCase())]),
  );
}
function seedPeriod(label) {
  const date = new Date(`1 ${label} 00:00:00 GMT`);
  return Number.isNaN(date.valueOf())
    ? "2026-10"
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function checkPeriod(period) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period || ""))
    fail("Select a valid return period.");
  return period;
}
function taxFor(invoice, homeState) {
  if (["NIL", "DOCS", "HSN"].includes(invoice.section)) return zeros();
  const tax = round(
    (Number(invoice.taxable || 0) * Number(invoice.rate || 0)) / 100,
  );
  if (
    invoice.section.startsWith("EXP") &&
    invoice.exportType === "Without payment of tax"
  )
    return zeros();
  const interstate =
    invoice.place !== homeState || invoice.section.startsWith("EXP");
  return {
    igst: interstate ? tax : 0,
    cgst: interstate ? 0 : round(tax / 2),
    sgst: interstate ? 0 : round(tax - round(tax / 2)),
    cess: amount(invoice.cess),
  };
}
function freshPeriod(sales = [], purchases = [], homeState = "Karnataka") {
  return {
    invoices: sales.map((i, index) => {
      const row = {
        ...i,
        id: `seed-${index}`,
        section: i.supply === "B2C" ? "B2CS" : "B2B",
        invoiceValue: round(i.taxable + i.tax),
        cess: 0,
      };
      return { ...row, taxes: taxFor(row, homeState) };
    }),
    purchases: purchases.map((i, index) => ({
      ...i,
      id: `purchase-${index}`,
      taxes: {
        igst: 0,
        cgst: round(i.tax / 2),
        sgst: round(i.tax / 2),
        cess: 0,
      },
    })),
    gstr1: { status: "Not Filed", revision: 0 },
    gstr3b: { status: "Not Filed", tables: {}, saved: false },
    uploads: [],
  };
}
function ensureWorkspace(state, label) {
  if (!state.workspace) {
    const initial = seedPeriod(label);
    state.workspace = {
      version: 2,
      initialPeriod: initial,
      period: initial,
      periods: {
        [initial]: freshPeriod(
          state.salesInvoices,
          state.purchaseInvoices,
          state.taxpayer.state,
        ),
      },
      cash: {
        igst: 0,
        cgst: round((state.ledgers?.cash || 0) / 2),
        sgst: round((state.ledgers?.cash || 0) / 2),
        cess: 0,
      },
      credit: {
        igst: 0,
        cgst: round((state.ledgers?.credit || 0) / 2),
        sgst: round((state.ledgers?.credit || 0) / 2),
        cess: 0,
      },
      ledger: [],
      challans: [],
      documents: { eway: [], einvoice: [] },
      registration: { stage: "new", partA: {}, tabs: {}, savedTabs: [] },
    };
  }
  return state.workspace;
}
function getPeriod(workspace, key = workspace.period) {
  checkPeriod(key);
  return (workspace.periods[key] ||= freshPeriod());
}
function summary(period) {
  const rows = period.invoices.filter(
    (i) => !["HSN", "DOCS", "NIL"].includes(i.section),
  );
  const invoiceKey = (i) => i.originalNumber || i.number;
  // An amendment replaces its original in this period rather than counting both.
  const amended = new Set(rows.filter((i) => i.originalNumber).map(invoiceKey));
  return rows
    .filter((i) => i.originalNumber || !amended.has(i.number))
    .reduce(
      (result, row) => {
        const sign =
          row.section.startsWith("CDN") && row.noteType !== "Debit Note"
            ? -1
            : row.section === "TXP" || row.section === "TXPA"
              ? -1
              : 1;
        result.taxable = round(
          result.taxable +
            sign *
              (Number(row.taxable || 0) -
                Number(row.amendmentBaseline?.taxable || 0)),
        );
        HEADS.forEach((h) => {
          result.taxes[h] = round(
            result.taxes[h] +
              sign *
                (Number(row.taxes?.[h] || 0) -
                  Number(row.amendmentBaseline?.taxes?.[h] || 0)),
          );
        });
        result.documents += 1;
        return result;
      },
      { taxable: 0, taxes: zeros(), documents: 0 },
    );
}
function eligibleCredit(period) {
  return period.purchases
    .filter((p) => p.match === "Matched")
    .reduce((out, p) => add(out, p.taxes), zeros());
}
function validateInvoice(input, period, homeState, existing = []) {
  if (!SECTIONS.includes(input.section)) fail("Select a valid GSTR-1 section.");
  const section = input.section;
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
  const number = String(input.number || "").trim();
  if (!number || number.length > 30)
    fail(
      aggregate
        ? "Enter a description or reference for this record."
        : "Enter an invoice or note number (maximum 30 characters).",
    );
  if (
    existing.some(
      (i) => i.id !== input.id && i.number === number && i.section === section,
    )
  )
    fail("This document number already exists in this section.");
  const gstin = String(input.gstin || "")
    .trim()
    .toUpperCase();
  if (
    ["B2B", "B2BA", "CDNR", "CDNRA"].includes(section) &&
    !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)
  )
    fail("Enter a valid 15-character recipient GSTIN/UIN.");
  const date = String(input.date || "");
  if (
    !aggregate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      (date.slice(0, 7) !== period &&
        !(section.endsWith("A") && date.slice(0, 7) === input.originalPeriod)))
  )
    fail("Document date must fall within the selected return period.");
  const rate = amount(input.rate, "Tax rate");
  if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(rate))
    fail("Select an available tax rate.");
  if (section.endsWith("A") && !input.originalNumber)
    fail("Enter the original document reference for the amendment.");
  if (!input.place && !section.startsWith("EXP") && section !== "DOCS")
    fail("Select the place of supply.");
  if (section === "HSN" && !/^\d{4,8}$/.test(input.hsn || ""))
    fail("Enter a valid HSN/SAC (4 to 8 digits).");
  if (section === "DOCS" && amount(input.cancelled) > amount(input.issued))
    fail("Cancelled documents cannot exceed total documents issued.");
  const row = {
    id: input.id || uid(),
    section,
    number,
    date,
    gstin,
    recipient: String(input.recipient || "").slice(0, 150),
    place: input.place || "Outside India",
    rate,
    taxable: amount(input.taxable, "Taxable value"),
    cess: amount(input.cess),
    noteType: input.noteType || "Credit Note",
    exportType: input.exportType || "With payment of tax",
    originalNumber: String(input.originalNumber || ""),
    originalPeriod: input.originalPeriod || "",
    hsn: input.hsn || "",
    quantity: amount(input.quantity),
    uqc: input.uqc || "NOS",
    issued: amount(input.issued),
    cancelled: amount(input.cancelled),
    fromSerial: input.fromSerial || "",
    toSerial: input.toSerial || "",
    supplyType: input.supplyType || "Intra-state",
    reverseCharge: Boolean(input.reverseCharge),
  };
  row.taxes = taxFor(row, homeState);
  row.invoiceValue =
    input.invoiceValue !== undefined && input.invoiceValue !== ""
      ? amount(input.invoiceValue, "Invoice value")
      : round(row.taxable + total(row.taxes));
  return row;
}
function allocation(liability, credit, cash) {
  const remaining = heads(liability),
    available = heads(credit),
    used = zeros(),
    cashUsed = zeros(),
    allocations = [];
  const use = (from, to) => {
    const value = round(Math.min(available[from], remaining[to]));
    if (value > 0) {
      available[from] = round(available[from] - value);
      remaining[to] = round(remaining[to] - value);
      used[from] = round(used[from] + value);
      allocations.push({ from, to, value });
    }
  };
  // IGST credit is exhausted first, then same-head and eligible cross-utilisation.
  use("igst", "igst");
  use("igst", "cgst");
  use("igst", "sgst");
  use("cgst", "cgst");
  use("cgst", "igst");
  use("sgst", "sgst");
  use("sgst", "igst");
  use("cess", "cess");
  HEADS.forEach((h) => {
    cashUsed[h] = remaining[h];
  });
  return {
    liability,
    creditUsed: used,
    cashUsed,
    allocations,
    shortfall: Object.fromEntries(
      HEADS.map((h) => [h, round(Math.max(0, remaining[h] - (cash[h] || 0)))]),
    ),
  };
}
function paymentPlan(period, workspace) {
  // RCM, interest and late fee cannot be paid with ITC.
  const tables = period.gstr3b.tables;
  const output =
    tables["3.1"]?.taxes ||
    summary({
      ...period,
      invoices: period.invoices.filter((i) => !i.reverseCharge),
    }).taxes;
  const creditable = Object.fromEntries(
    HEADS.map((h) => [h, Math.max(0, add(output, tables["3.1.1"]?.taxes)[h])]),
  );
  const itc = tables["4"]?.taxes || eligibleCredit(period);
  const reversal = tables["4b"]?.taxes || zeros();
  const recognizedItc = Object.fromEntries(
    HEADS.map((h) => [h, round(Math.max(0, itc[h] - reversal[h]))]),
  );
  const availableCredit = add(workspace.credit, recognizedItc);
  const plan = allocation(creditable, availableCredit, workspace.cash);
  plan.recognizedItc = recognizedItc;
  plan.availableCredit = availableCredit;
  const cashOnly = add(tables["5.1"]?.taxes, tables["3.1d"]?.taxes);
  plan.liability = add(plan.liability, cashOnly);
  plan.cashUsed = add(plan.cashUsed, cashOnly);
  plan.shortfall = Object.fromEntries(
    HEADS.map((h) => [
      h,
      round(Math.max(0, plan.cashUsed[h] - workspace.cash[h])),
    ]),
  );
  return plan;
}
function viewState(state, label) {
  const w = ensureWorkspace(state, label);
  const p = getPeriod(w);
  w.summary = summary(p);
  w.outwardSummary = summary({
    ...p,
    invoices: p.invoices.filter((i) => !i.reverseCharge),
  });
  w.eligibleItc = eligibleCredit(p);
  w.paymentPlan = paymentPlan(p, w);
  return state;
}
function mountPortal(app, deps) {
  const { activeFor, saveState, requireAuth, getActiveCase } = deps;
  const route = (path, handler) =>
    app.post(`/api/workspace/${path}`, (req, res, next) => {
      try {
        const ctx = activeFor(req, res);
        if (!ctx) return;
        const w = ensureWorkspace(ctx.active.state, ctx.active.period);
        if (req.body?.period) {
          checkPeriod(req.body.period);
          w.period = req.body.period;
        }
        const p = getPeriod(w);
        const result = handler(req.body || {}, w, p, ctx) || {};
        saveState(ctx.user.id, ctx.active.slug, ctx.active.state);
        res.json({
          ...result,
          state: viewState(ctx.active.state, ctx.active.period),
        });
      } catch (error) {
        if (error.status)
          res.status(error.status).json({ message: error.message });
        else next(error);
      }
    });
  route("period", () => ({ message: "Return period selected." }));
  route("invoice/save", (body, w, p, ctx) => {
    if (p.gstr1.status === "Filed")
      fail("This return is filed. Select a later period to amend a document.");
    const row = validateInvoice(
      body.invoice || {},
      w.period,
      ctx.active.state.taxpayer.state,
      p.invoices,
    );
    if (row.originalNumber) {
      if (
        p.invoices.some(
          (i) => i.originalNumber === row.originalNumber && i.id !== row.id,
        )
      )
        fail(
          "An amendment for this original document already exists in the selected period.",
        );
      if (row.originalPeriod && row.originalPeriod !== w.period) {
        checkPeriod(row.originalPeriod);
        if (row.originalPeriod >= w.period)
          fail("Select an earlier original return period.");
        const originalPeriod = w.periods[row.originalPeriod];
        const original = originalPeriod?.invoices.find(
          (i) => i.number === row.originalNumber,
        );
        if (!original || originalPeriod.gstr1.status !== "Filed")
          fail(
            "The original document must belong to a filed return in the selected original period.",
          );
        row.amendmentBaseline = {
          taxable: original.taxable,
          taxes: original.taxes,
        };
      }
    }
    const index = p.invoices.findIndex((i) => i.id === row.id);
    if (body.invoice?.id && index < 0) fail("Document not found.");
    if (index >= 0) p.invoices[index] = row;
    else p.invoices.push(row);
    p.gstr1.revision += 1;
    p.gstr1.status = "In Progress";
    delete p.gstr1.summary;
    return { invoice: row, message: "Details saved successfully." };
  });
  route("invoice/delete", (body, w, p) => {
    if (p.gstr1.status === "Filed")
      fail("Filed return documents cannot be deleted.");
    if (!p.invoices.some((i) => i.id === body.id)) fail("Document not found.");
    p.invoices = p.invoices.filter((i) => i.id !== body.id);
    p.gstr1.revision += 1;
    delete p.gstr1.summary;
    return { message: "Document deleted." };
  });
  route("gstr1/summary", (body, w, p) => {
    if (p.gstr1.status === "Filed") fail("The return has already been filed.");
    p.gstr1.summary = summary(p);
    p.gstr1.summaryRevision = p.gstr1.revision;
    p.gstr1.generatedAt = stamp();
    p.gstr1.status = "Ready to File";
    return { message: "Summary generated successfully." };
  });
  route("gstr1/file", (body, w, p) => {
    if (p.gstr1.status === "Filed") fail("This return has already been filed.");
    if (w.period > w.initialPeriod) {
      const previousDate = new Date(`${w.period}-01T00:00:00Z`);
      previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
      const previous = previousDate.toISOString().slice(0, 7);
      if (w.periods[previous]?.gstr3b.status !== "Filed")
        fail(
          `File GSTR-3B for ${previous} before filing the next period's GSTR-1.`,
        );
    }
    if (!p.gstr1.summary || p.gstr1.summaryRevision !== p.gstr1.revision)
      fail("Generate the latest summary before filing.");
    if (
      body.nil &&
      p.invoices.some((i) => Number(i.taxable) > 0 || i.issued > 0)
    )
      fail("A nil return cannot contain outward supply records.");
    verifySigning(body);
    p.gstr1 = {
      ...p.gstr1,
      status: "Filed",
      arn: `AA${crypto.randomInt(1000000000000, 9999999999999)}`,
      filedAt: stamp(),
      nil: Boolean(body.nil),
    };
    return { message: `GSTR-1 filed successfully. ARN: ${p.gstr1.arn}` };
  });
  route("gstr3b/save", (body, w, p) => {
    if (["Filed", "Offset"].includes(p.gstr3b.status))
      fail("This return is locked after liability offset.");
    if (
      body.nil &&
      (summary(p).documents ||
        p.purchases.length ||
        Object.values(p.gstr3b.tables).some(
          (t) => total(t.taxes) > 0 || t.taxable > 0,
        ))
    )
      fail(
        "Nil filing is unavailable because the period contains supply or ITC data.",
      );
    const allowed = ["3.1", "3.1d", "3.1.1", "3.2", "4", "4b", "5", "5.1"];
    if (body.table) {
      if (!allowed.includes(body.table)) fail("Unknown GSTR-3B table.");
      const rowKeys = {
        3.1: ["a", "b", "c", "d", "e"],
        "3.1.1": ["a", "b"],
        3.2: ["unregistered", "composition", "uin"],
        4: ["a1", "a2", "a3", "a4", "a5", "b1", "b2", "d1", "d2"],
        5: ["exempt", "nongst"],
        5.1: ["interest", "latefee"],
      }[body.table];
      const rows = {};
      if (body.rows) {
        if (typeof body.rows !== "object" || Array.isArray(body.rows))
          fail("Invalid table details.");
        rowKeys.forEach((key) => {
          const input = body.rows[key] || {};
          rows[key] = {
            taxable: amount(input.taxable),
            taxes: heads(input.taxes),
          };
        });
        const included =
          body.table === "3.1"
            ? ["a", "b"]
            : body.table === "3.1.1"
              ? ["a"]
              : body.table === "4"
                ? ["a1", "a2", "a3", "a4", "a5"]
                : rowKeys;
        const taxes = included.reduce(
          (out, key) => add(out, rows[key].taxes),
          zeros(),
        );
        p.gstr3b.tables[body.table] = {
          taxable: included.reduce((n, key) => round(n + rows[key].taxable), 0),
          taxes,
          rows,
        };
        if (body.table === "3.1") p.gstr3b.tables["3.1d"] = rows.d;
        if (body.table === "4")
          p.gstr3b.tables["4b"] = {
            taxable: 0,
            taxes: add(rows.b1.taxes, rows.b2.taxes),
          };
      } else
        p.gstr3b.tables[body.table] = {
          taxable: amount(body.taxable),
          taxes: heads(body.taxes),
        };
    }
    p.gstr3b.saved = true;
    p.gstr3b.nil = Boolean(body.nil);
    p.gstr3b.status = "In Progress";
    return { message: "GSTR-3B details saved successfully." };
  });
  route("gstr3b/offset", (body, w, p) => {
    if (["Offset", "Filed"].includes(p.gstr3b.status))
      fail("Liability has already been offset.");
    if (!p.gstr3b.saved)
      fail("Save the GSTR-3B details before making payment.");
    if (p.gstr1.status !== "Filed")
      fail("File GSTR-1 for this period before filing GSTR-3B.");
    const plan = paymentPlan(p, w);
    if (total(plan.shortfall))
      fail(
        "Insufficient cash balance. Create and pay a challan for the shortfall.",
      );
    HEADS.forEach((h) => {
      w.credit[h] = round(
        w.credit[h] + plan.recognizedItc[h] - plan.creditUsed[h],
      );
      w.cash[h] = round(w.cash[h] - plan.cashUsed[h]);
    });
    w.ledger.unshift({
      id: uid(),
      date: stamp(),
      type: "ITC credited",
      period: w.period,
      credit: plan.recognizedItc,
      reference: `ITC-${w.period}`,
    });
    p.gstr3b.offset = plan;
    p.gstr3b.status = "Offset";
    w.ledger.unshift({
      id: uid(),
      date: stamp(),
      type: "Liability offset",
      period: w.period,
      debit: plan.cashUsed,
      creditDebit: plan.creditUsed,
      reference: `OFFSET-${Date.now()}`,
    });
    return { message: "Liability offset successfully. Proceed to filing." };
  });
  route("gstr3b/file", (body, w, p) => {
    if (p.gstr3b.status !== "Offset")
      fail("Offset the liability before filing GSTR-3B.");
    verifySigning(body);
    p.gstr3b.status = "Filed";
    p.gstr3b.arn = `AA${crypto.randomInt(1000000000000, 9999999999999)}`;
    p.gstr3b.filedAt = stamp();
    return { message: `GSTR-3B filed successfully. ARN: ${p.gstr3b.arn}` };
  });
  route("challan/create", (body, w) => {
    const amounts = heads(body.amounts);
    if (!total(amounts)) fail("Enter at least one tax amount.");
    const challan = {
      id: uid(),
      cpin: String(crypto.randomInt(10000000000000, 99999999999999)),
      amounts,
      total: total(amounts),
      status: "Not Paid",
      mode: body.mode || "E-Payment",
      createdAt: stamp(),
      period: w.period,
    };
    w.challans.unshift(challan);
    return { challan, message: "Challan generated successfully." };
  });
  route("challan/pay", (body, w) => {
    const challan = w.challans.find((c) => c.id === body.id);
    if (!challan) fail("Challan not found.");
    if (challan.status === "Paid") fail("This challan has already been paid.");
    challan.status = "Paid";
    challan.cin = challan.cpin + "SBIN";
    challan.paidAt = stamp();
    w.cash = add(w.cash, challan.amounts);
    w.ledger.unshift({
      id: uid(),
      date: stamp(),
      type: "Cash deposit",
      period: w.period,
      credit: challan.amounts,
      reference: challan.cin,
    });
    return {
      challan,
      message: "Payment successful. Electronic cash ledger updated.",
    };
  });
  route("upload", (body, w, p, ctx) => {
    if (p.gstr1.status === "Filed")
      fail("A filed return cannot accept uploads.");
    let data;
    try {
      data = typeof body.data === "string" ? JSON.parse(body.data) : body.data;
    } catch {
      fail("The uploaded file is not valid JSON.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      fail("Upload a GSTR-1 JSON object.");
    if (data.gstin && data.gstin !== ctx.active.state.taxpayer.gstin)
      fail("The GSTIN in this file does not match the selected taxpayer.");
    if (data.fp && data.fp !== w.period.slice(5) + w.period.slice(0, 4))
      fail("The return period in the file does not match the selected period.");
    const incoming = Array.isArray(data.invoices) ? data.invoices : [];
    const unsupported = [
      "b2cl",
      "b2cs",
      "exp",
      "cdnr",
      "cdnur",
      "hsn",
      "doc_issue",
      "nil",
      "b2ba",
    ].filter(
      (key) =>
        data[key] && (Array.isArray(data[key]) ? data[key].length : true),
    );
    if (unsupported.length)
      fail(
        `Use the online forms for these offline-utility sections: ${unsupported.join(", ")}. No records were imported.`,
      );
    if (Array.isArray(data.b2b))
      data.b2b.forEach((party) =>
        (party.inv || []).forEach((inv) => {
          const rates = new Set((inv.itms || []).map((i) => i.itm_det?.rt));
          if (rates.size > 1)
            fail(
              `Invoice ${inv.inum} contains multiple tax rates. Enter this invoice online.`,
            );
          const item = inv.itms?.[0]?.itm_det || {};
          incoming.push({
            section: "B2B",
            number: inv.inum,
            date: String(inv.idt || "")
              .split("-")
              .reverse()
              .join("-"),
            gstin: party.ctin,
            place:
              String(inv.pos || party.ctin?.slice(0, 2)) ===
              ctx.active.state.taxpayer.gstin.slice(0, 2)
                ? ctx.active.state.taxpayer.state
                : "Other State",
            taxable: (inv.itms || []).reduce(
              (n, i) => n + Number(i.itm_det?.txval || 0),
              0,
            ),
            rate: item.rt || 0,
            recipient: "",
            cess: (inv.itms || []).reduce(
              (n, i) => n + Number(i.itm_det?.csamt || 0),
              0,
            ),
          });
        }),
      );
    if (!incoming.length)
      fail(
        "No supported invoice records found. Use the downloadable JSON template or B2B invoice JSON.",
      );
    const accepted = [],
      errors = [];
    incoming.forEach((row, i) => {
      try {
        if (row.section?.endsWith("A"))
          fail("Enter amendment records in the online amendment form.");
        accepted.push(
          validateInvoice(row, w.period, ctx.active.state.taxpayer.state, [
            ...p.invoices,
            ...accepted,
          ]),
        );
      } catch (e) {
        errors.push({
          row: i + 1,
          number: row.number || row.inum || "",
          error: e.message,
        });
      }
    });
    p.invoices.push(...accepted);
    if (accepted.length) {
      p.gstr1.revision += 1;
      p.gstr1.status = "In Progress";
      delete p.gstr1.summary;
    }
    const upload = {
      id: uid(),
      name: String(body.name || "returns.json").slice(0, 100),
      accepted: accepted.length,
      errors,
      status: errors.length ? "Processed with errors" : "Processed",
      at: stamp(),
    };
    p.uploads.unshift(upload);
    return {
      upload,
      message: `${accepted.length} records processed; ${errors.length} errors.`,
    };
  });
  route("registration/start", (body, w) => {
    if (["Pending for Validation", "Approved"].includes(w.registration.stage))
      fail("This application has already been submitted.");
    const a = body.partA || {};
    for (const key of [
      "type",
      "state",
      "district",
      "legalName",
      "pan",
      "email",
      "mobile",
    ])
      if (!String(a[key] || "").trim()) fail("Complete all mandatory fields.");
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(a.pan)) fail("Enter a valid PAN.");
    if (!/^\S+@\S+\.\S+$/.test(a.email) || !/^[6-9]\d{9}$/.test(a.mobile))
      fail("Enter a valid email address and mobile number.");
    w.registration.partA = a;
    w.registration.createdAt ||= stamp();
    w.registration.stage = "otp";
    w.registration.otpExpires = Date.now() + 10 * 60 * 1000;
    return { message: "OTP generated. Mobile OTP: 123456 · Email OTP: 654321" };
  });
  route("registration/verify", (body, w) => {
    const r = w.registration;
    if (r.stage !== "otp") fail("Complete Part A first.");
    if (Date.now() > r.otpExpires) fail("OTP expired. Request a new OTP.");
    if (body.mobileOtp !== "123456" || body.emailOtp !== "654321")
      fail("The OTP entered is incorrect.");
    r.trn ||= digits(15);
    r.stage = "trn";
    return { message: `Temporary Reference Number: ${r.trn}` };
  });
  route("registration/resume", (body, w) => {
    if (
      !w.registration.trn ||
      body.trn !== w.registration.trn ||
      body.email !== w.registration.partA.email
    )
      fail("TRN or email address is incorrect.");
    w.registration.resumeExpires = Date.now() + 600000;
    return { message: "OTP generated: 123456" };
  });
  route("registration/resume-verify", (body, w) => {
    if (
      !w.registration.resumeExpires ||
      Date.now() > w.registration.resumeExpires ||
      body.otp !== "123456"
    )
      fail("Invalid or expired OTP.");
    if (w.registration.stage !== "Pending for Validation")
      w.registration.stage = "draft";
    return { message: "Application opened." };
  });
  route("registration/save", (body, w) => {
    const r = w.registration;
    if (!r.trn) fail("Complete OTP verification first.");
    if (["Pending for Validation", "Approved"].includes(r.stage))
      fail("A submitted application cannot be edited.");
    if (!REG_TABS.includes(body.tab)) fail("Invalid registration tab.");
    const required =
      {
        business: ["tradeName", "constitution", "reason", "commencement"],
        promoters: ["name", "pan", "designation"],
        signatory: ["name", "email", "mobile"],
        principal: ["address", "city", "pincode", "possession"],
        goods: ["hsn", "description"],
        verification: ["signatory", "place"],
      }[body.tab] || [];
    if (required.some((key) => !String(body.values?.[key] || "").trim()))
      fail("Complete the mandatory fields before saving this tab.");
    if (body.tab === "principal" && !/^\d{6}$/.test(body.values.pincode))
      fail("Enter a valid six-digit PIN code.");
    r.tabs[body.tab] = body.values;
    if (!r.savedTabs.includes(body.tab)) r.savedTabs.push(body.tab);
    r.stage = "draft";
    return { message: "Details saved successfully." };
  });
  route("registration/submit", (body, w) => {
    const r = w.registration;
    if (r.stage === "Pending for Validation")
      fail("Application already submitted.");
    if (REG_TABS.some((tab) => !r.savedTabs.includes(tab)))
      fail("Save all registration tabs before submitting.");
    verifySigning(body);
    r.stage = "Pending for Validation";
    r.arn = `AA${crypto.randomInt(1000000000000, 9999999999999)}`;
    r.submittedAt = stamp();
    return { message: `Application submitted. ARN: ${r.arn}` };
  });
  route("documents/create", (body, w, p, ctx) => {
    const kind = body.kind;
    if (!["eway", "einvoice"].includes(kind)) fail("Unknown document type.");
    const invoice = p.invoices.find((i) => i.id === body.invoiceId);
    if (!invoice) fail("Select an outward invoice.");
    if (
      w.documents[kind].some(
        (d) => d.invoiceId === invoice.id && d.status !== "Cancelled",
      )
    )
      fail("An active document already exists for this invoice.");
    if (kind === "einvoice" && !["B2B", "EXP"].includes(invoice.section))
      fail("Select a B2B or export invoice for e-invoicing.");
    if (
      kind === "eway" &&
      (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(
        String(body.vehicle || "").replace(/\s/g, ""),
      ) ||
        !body.dispatch ||
        !body.destination ||
        Number(body.distance) <= 0)
    )
      fail(
        "Enter dispatch address, destination, distance and a valid vehicle number.",
      );
    const doc = {
      id: uid(),
      invoiceId: invoice.id,
      invoice: { ...invoice },
      period: w.period,
      createdAt: stamp(),
      status: "Active",
      vehicle: body.vehicle || "",
      transporter: body.transporter || "",
      distance: amount(body.distance),
      dispatch: body.dispatch || "",
      destination: body.destination || "",
      mode: body.mode || "Road",
      number: digits(12),
      acknowledgement: digits(15),
      irn: crypto
        .createHash("sha256")
        .update(`${ctx.user.id}:${invoice.id}:${Date.now()}`)
        .digest("hex"),
    };
    w.documents[kind].unshift(doc);
    return {
      document: doc,
      message:
        kind === "eway"
          ? "E-way bill generated successfully."
          : "IRN generated successfully.",
    };
  });
  route("documents/update", (body, w) => {
    const doc = w.documents[body.kind]?.find((d) => d.id === body.id);
    if (!doc) fail("Document not found.");
    if (doc.status === "Cancelled") fail("This document is cancelled.");
    if (body.action === "cancel") {
      if (!body.reason) fail("Select a cancellation reason.");
      if (Date.now() - Date.parse(doc.createdAt) > 86400000)
        fail("The 24-hour cancellation window has expired.");
      doc.status = "Cancelled";
      doc.reason = body.reason;
    } else if (body.action === "vehicle" && body.kind === "eway") {
      if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(body.vehicle || ""))
        fail("Enter a valid vehicle number.");
      doc.vehicle = body.vehicle;
    } else fail("Unknown document action.");
    return { message: "Document updated." };
  });
  app.get("/api/workspace/export", (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const active = getActiveCase(user.id);
    const w = ensureWorkspace(active.state, active.period);
    const p = getPeriod(w);
    res.json({
      gstin: active.state.taxpayer.gstin,
      fp: w.period.slice(5) + w.period.slice(0, 4),
      invoices: p.invoices,
      gstr1: p.gstr1,
      gstr3b: p.gstr3b,
    });
  });
}
function verifySigning(body) {
  if (!body.declaration || !body.signatory)
    fail("Select the declaration and authorised signatory.");
  if (!["EVC", "DSC"].includes(body.method)) fail("Select a signing method.");
  if (body.otp !== "123456")
    fail("Verification code is incorrect. Use 123456.");
}
module.exports = {
  mountPortal,
  viewState,
  ensureWorkspace,
  freshPeriod,
  summary,
  eligibleCredit,
  validateInvoice,
  allocation,
  paymentPlan,
  heads,
  total,
  HEADS,
  REG_TABS,
};
