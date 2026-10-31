"use strict";
const hsnMaster = require("./hsn-master");
const registrationPeople = require("./registration-people");

const crypto = require("node:crypto");
const flow = require("./practice-workflows");
const eway = require("./eway-rules");
const { normalizeEmail } = require("./otp-service");
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
  flow.setFrequency(state.workspace);
  state.workspace.homeState = state.taxpayer.state;
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
    .filter((p) => p.match === "Matched" && p.includedIn2b !== false)
    .reduce(
      (out, p) =>
        add(
          out,
          Object.fromEntries(
            HEADS.map((h) => [
              h,
              (p.documentType === "Credit Note" ? -1 : 1) * (p.taxes[h] || 0),
            ]),
          ),
        ),
      zeros(),
    );
}
function validateInvoice(
  input,
  period,
  homeState,
  existing = [],
  allowedPeriods = [period],
) {
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
      !flow.validDate(date) ||
      (!allowedPeriods.includes(date.slice(0, 7)) &&
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
    ...(section === "HSN"
      ? { hsnDescription: hsnMaster.lookup(input.hsn)?.description || "" }
      : {}),
    quantity: amount(input.quantity),
    uqc: input.uqc || "NOS",
    issued: amount(input.issued),
    cancelled: amount(input.cancelled),
    fromSerial: input.fromSerial || "",
    toSerial: input.toSerial || "",
    supplyType: input.supplyType || "Intra-state",
    reverseCharge: Boolean(input.reverseCharge),
    portCode: String(input.portCode || "")
      .toUpperCase()
      .slice(0, 6),
    shippingBillNumber: String(input.shippingBillNumber || "").slice(0, 30),
    shippingBillDate: String(input.shippingBillDate || ""),
    nilType: input.nilType || "Nil Rated",
    recipientType: input.recipientType || "Registered",
    documentType: String(input.documentType || "1"),
    reportedTaxes: input.reportedTaxes ? heads(input.reportedTaxes) : undefined,
  };
  if (
    section.startsWith("EXP") &&
    row.shippingBillDate &&
    Number.isNaN(Date.parse(row.shippingBillDate))
  )
    fail("Enter a valid shipping bill date.");
  if (
    section.startsWith("EXP") &&
    row.portCode &&
    !/^[A-Z0-9]{6}$/.test(row.portCode)
  )
    fail("Port code must contain six letters or digits.");
  if (Array.isArray(input.items) && input.items.length) {
    if (input.items.length > 100) fail("Add at most 100 tax-rate rows.");
    row.items = input.items.map((item) => {
      const rate = amount(item.rate, "Tax rate");
      if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(rate))
        fail("Select an available tax rate.");
      return { rate, taxable: amount(item.taxable), cess: amount(item.cess) };
    });
    row.taxable = round(row.items.reduce((n, i) => n + i.taxable, 0));
    row.taxes = row.items.reduce(
      (out, item) => add(out, taxFor({ ...row, ...item }, homeState)),
      zeros(),
    );
  } else row.taxes = taxFor(row, homeState);
  if (section === "HSN" && row.reportedTaxes) row.taxes = row.reportedTaxes;
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
  const tables = {
    ...flow.draft3b(period, workspace.homeState),
    ...period.gstr3b.tables,
  };
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
  const q = flow.quarterInfo(w.period);
  const outward = flow.returnData(w, p, "gstr1"),
    monthly = flow.returnData(w, p);
  w.registrationSignatories = registrationPeople.signatories(w.registration);
  w.documentDate = eway.workingDate(w);
  w.ewayMasters = {
    mapping: eway.MAPPING,
    units: eway.UQC,
    documentTypes: Object.values(eway.DOC_TYPES),
  };
  w.returnInfo = {
    ...q,
    frequency: w.filingFrequency || "Monthly",
    isIff: w.filingFrequency === "QRMP" && !q.isEnd,
  };
  w.gstr1Invoices = outward.invoices;
  w.gstr3bInvoices = monthly.invoices;
  w.gstr3bPurchases = monthly.purchases;
  w.draft3b = flow.draft3b(monthly, state.taxpayer.state);
  w.summary = summary(outward);
  w.outwardSummary = summary({
    ...monthly,
    invoices: monthly.invoices.filter((i) => !i.reverseCharge),
  });
  w.eligibleItc = eligibleCredit(monthly);
  w.paymentPlan = paymentPlan(monthly, w);
  return state;
}
function publicState(state) {
  const out = structuredClone(state);
  if (out.workspace) delete out.workspace.documentCaptchas;
  for (const account of Object.values(out.workspace?.documentPortals || {})) {
    delete account.passwordHash;
    delete account.salt;
  }
  return out;
}
function mountPortal(app, deps) {
  const {
    activeFor,
    saveState,
    requireAuth,
    getActiveCase,
    getOtpService,
    completeRegistration,
  } = deps;
  const otpScope = (ctx, w, purpose) =>
    `${ctx.user.id}:${ctx.active.slug}:${purpose}${purpose.startsWith("gstr") ? ":" + w.period : ""}`;
  const signingBinding = (purpose, body, w, p) => ({
    purpose,
    email: normalizeEmail(body.email),
    signatory: String(body.signatory || ""),
    method: body.method,
    data:
      purpose === "gstr1-file"
        ? { revision: p.gstr1.revision, summary: p.gstr1.summary }
        : purpose === "gstr3b-file"
          ? { offset: p.gstr3b.offset, tables: p.gstr3b.tables }
          : { partA: w.registration.partA, tabs: w.registration.tabs },
  });
  const signingCheck = async (body, purpose, w, p, ctx) => {
    if (!body.declaration || !body.signatory)
      fail("Select the declaration and authorised signatory.");
    if (!["EVC", "DSC"].includes(body.method)) fail("Select a signing method.");
    await getOtpService().consume({
      challengeId: body.challengeId,
      scope: otpScope(ctx, w, purpose),
      code: body.otp,
      binding: signingBinding(purpose, body, w, p),
    });
  };
  const route = (path, handler) =>
    app.post(`/api/workspace/${path}`, async (req, res, next) => {
      try {
        const ctx = await activeFor(req, res);
        if (!ctx) return;
        const w = ensureWorkspace(ctx.active.state, ctx.active.period);
        if (
          ctx.active.state.taxpayer.registrationRequired &&
          !path.startsWith("registration/") &&
          !(
            path === "signing/send" &&
            req.body?.purpose === "registration-submit"
          )
        )
          fail("Complete a registration before using this business workspace.");
        if (req.body?.period) {
          checkPeriod(req.body.period);
          w.period = req.body.period;
        }
        flow.setFrequency(w);
        const p = getPeriod(w);
        const result = (await handler(req.body || {}, w, p, ctx)) || {};
        if (path === "registration/submit") await completeRegistration(ctx);
        else
          await saveState(
            ctx.user.id,
            ctx.active.slug,
            ctx.active.state,
            ctx.active.revision,
          );
        res.json({
          ...result,
          state: publicState(viewState(ctx.active.state, ctx.active.period)),
        });
      } catch (error) {
        if (error.status)
          res.status(error.status).json({ message: error.message });
        else next(error);
      }
    });
  const revision = (w, p) =>
    JSON.stringify([
      w.filingFrequency || "Monthly",
      ...(w.filingFrequency === "QRMP" && flow.quarterInfo(w.period).isEnd
        ? flow.quarterInfo(w.period).periods
        : [w.period]
      ).map((k) => [
        k,
        w.periods[k]?.gstr1.revision || 0,
        k === w.period ? null : w.periods[k]?.gstr1.status,
      ]),
    ]);
  const assert3b = (w) => {
    if (w.filingFrequency === "QRMP" && !flow.quarterInfo(w.period).isEnd)
      fail(
        "GSTR-3B is available at quarter end. Use PMT-06 for monthly payments.",
      );
  };
  route("period", () => ({ message: "Return period selected." }));
  route("filing-frequency", (body, w) => {
    if (!["Monthly", "QRMP"].includes(body.frequency))
      fail("Select Monthly or QRMP.");
    const year = flow.financialYear(w.period);
    if (
      Object.entries(w.periods)
        .filter(([k]) => flow.financialYear(k) === year)
        .some(
          ([, p]) =>
            p.gstr1.status === "Filed" ||
            ["Offset", "Filed"].includes(p.gstr3b.status),
        )
    )
      fail(
        "Filing frequency cannot change after a return has been filed. Existing filed work is preserved.",
      );
    w.filingPreferences[year] = body.frequency;
    flow.setFrequency(w);
    Object.entries(w.periods)
      .filter(([k]) => flow.financialYear(k) === year)
      .forEach(([, p]) => {
        delete p.gstr1.summary;
        p.gstr1.status = "Not Filed";
      });
    return { message: "Return filing frequency updated." };
  });
  route("signing/send", async (body, w, p, ctx) => {
    const purpose = body.purpose;
    if (!["gstr1-file", "gstr3b-file", "registration-submit"].includes(purpose))
      fail("Select a valid verification purpose.");
    if (!body.signatory || !["EVC", "DSC"].includes(body.method))
      fail("Select the authorised signatory and filing method first.");
    if (
      purpose === "gstr1-file" &&
      (p.gstr1.status !== "Ready to File" ||
        p.gstr1.summaryRevision !== p.gstr1.revision ||
        (p.gstr1.sourceRevision && p.gstr1.sourceRevision !== revision(w, p)))
    )
      fail("Generate the latest GSTR-1 summary before requesting an OTP.");
    if (purpose === "gstr3b-file" && p.gstr3b.status !== "Offset")
      fail("Offset the liability before requesting a filing OTP.");
    if (
      purpose === "registration-submit" &&
      (w.registration.stage !== "draft" ||
        REG_TABS.some((tab) => !w.registration.savedTabs.includes(tab)))
    )
      fail(
        "Complete the registration application before requesting a submission OTP.",
      );
    const otp = await getOtpService().issue({
      scope: otpScope(ctx, w, purpose),
      userId: ctx.user.id,
      email: body.email,
      purpose,
      binding: signingBinding(purpose, body, w, p),
    });
    return { otp, message: `OTP sent to ${otp.recipient}.` };
  });
  route("invoice/save", (body, w, p, ctx) => {
    flow.assertWritable(w, p);
    flow.assertIff(w, body.invoice?.section);
    const row = validateInvoice(
      body.invoice || {},
      w.period,
      ctx.active.state.taxpayer.state,
      flow.returnData(w, p, "gstr1").invoices,
      w.filingFrequency === "QRMP" && flow.quarterInfo(w.period).isEnd
        ? flow.quarterInfo(w.period).periods
        : [w.period],
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
    flow.assertWritable(w, p);
    if (!p.invoices.some((i) => i.id === body.id)) fail("Document not found.");
    p.invoices = p.invoices.filter((i) => i.id !== body.id);
    p.gstr1.revision += 1;
    delete p.gstr1.summary;
    return { message: "Document deleted." };
  });
  route("nil/save", (body, w, p, ctx) => {
    flow.assertWritable(w, p);
    flow.assertIff(w, "NIL");
    if (!Array.isArray(body.rows) || body.rows.length > 12)
      fail("Invalid nil-rated supply details.");
    const records = body.rows.map((row) => {
      if (
        !["Nil Rated", "Exempt", "Non-GST"].includes(row.nilType) ||
        !["Registered", "Unregistered"].includes(row.recipientType) ||
        !["Intra-state", "Inter-state"].includes(row.supplyType)
      )
        fail("Select a valid supply category.");
      return validateInvoice(
        {
          ...row,
          section: "NIL",
          number: `${row.supplyType}-${row.recipientType}-${row.nilType}`.slice(
            0,
            30,
          ),
          place: ctx.active.state.taxpayer.state,
          rate: 0,
        },
        w.period,
        ctx.active.state.taxpayer.state,
      );
    });
    p.invoices = [
      ...p.invoices.filter((i) => i.section !== "NIL"),
      ...records.filter((i) => i.taxable > 0),
    ];
    p.gstr1.revision++;
    p.gstr1.status = "In Progress";
    delete p.gstr1.summary;
    return { message: "Nil-rated supplies saved." };
  });
  route("gstr1/summary", (body, w, p) => {
    flow.assertWritable(w, p);
    const data = flow.returnData(w, p, "gstr1");
    if (w.filingFrequency === "QRMP" && !flow.quarterInfo(w.period).isEnd)
      data.invoices.forEach((i) => flow.assertIff(w, i.section));
    p.gstr1.summary = summary(data);
    p.gstr1.summaryRevision = p.gstr1.revision;
    p.gstr1.generatedAt = stamp();
    p.gstr1.status = "Ready to File";
    p.gstr1.sourceRevision = revision(w, p);
    return { message: "Summary generated successfully." };
  });
  route("gstr1/file", async (body, w, p, ctx) => {
    flow.assertWritable(w, p);
    if (p.gstr1.status === "Filed") fail("This return has already been filed.");
    if (w.period > w.initialPeriod && w.filingFrequency !== "QRMP") {
      const previousDate = new Date(`${w.period}-01T00:00:00Z`);
      previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
      const previous = previousDate.toISOString().slice(0, 7);
      if (w.periods[previous]?.gstr3b.status !== "Filed")
        fail(
          `File GSTR-3B for ${previous} before filing the next period's GSTR-1.`,
        );
    }
    if (
      !p.gstr1.summary ||
      p.gstr1.summaryRevision !== p.gstr1.revision ||
      (p.gstr1.sourceRevision && p.gstr1.sourceRevision !== revision(w, p))
    )
      fail("Generate the latest summary before filing.");
    if (
      body.nil &&
      flow
        .returnData(w, p, "gstr1")
        .invoices.some((i) => Number(i.taxable) > 0 || i.issued > 0)
    )
      fail("A nil return cannot contain outward supply records.");
    await signingCheck(body, "gstr1-file", w, p, ctx);
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
    assert3b(w);
    const data = flow.returnData(w, p);
    if (["Filed", "Offset"].includes(p.gstr3b.status))
      fail("This return is locked after liability offset.");
    if (
      body.nil &&
      (summary(data).documents ||
        data.purchases.length ||
        Object.values(p.gstr3b.tables).some(
          (t) => total(t.taxes) > 0 || t.taxable > 0,
        ))
    )
      fail(
        "Nil filing is unavailable because the period contains supply or ITC data.",
      );
    if (body.table) {
      const result = flow.validate3b(body.table, body.rows || {});
      p.gstr3b.tables[body.table] = result;
      if (body.table === "3.1") p.gstr3b.tables["3.1d"] = result.rows.d;
      if (body.table === "4")
        p.gstr3b.tables["4b"] = {
          taxable: 0,
          taxes: add(result.rows.b1.taxes, result.rows.b2.taxes),
        };
    }
    p.gstr3b.saved = true;
    p.gstr3b.nil = Boolean(body.nil);
    p.gstr3b.status = "In Progress";
    return { message: "GSTR-3B details saved successfully." };
  });
  route("gstr3b/offset", (body, w, p) => {
    assert3b(w);
    if (["Offset", "Filed"].includes(p.gstr3b.status))
      fail("Liability has already been offset.");
    if (!p.gstr3b.saved)
      fail("Save the GSTR-3B details before making payment.");
    if (p.gstr1.status !== "Filed")
      fail("File GSTR-1 for this period before filing GSTR-3B.");
    const plan = paymentPlan(flow.returnData(w, p), w);
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
  route("gstr3b/file", async (body, w, p, ctx) => {
    assert3b(w);
    if (p.gstr3b.status !== "Offset")
      fail("Offset the liability before filing GSTR-3B.");
    await signingCheck(body, "gstr3b-file", w, p, ctx);
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
      verificationRequired: true,
      mode: body.mode || "E-Payment",
      reason: body.reason || "Any other payment",
      challanType: body.challanType || "Self-assessment basis",
      financialYear:
        Number(w.period.slice(0, 4)) - (Number(w.period.slice(5)) < 4 ? 1 : 0),
      createdAt: stamp(),
      period: w.period,
    };
    w.challans.unshift(challan);
    return { challan, message: "Challan generated successfully." };
  });
  route("challan/otp", async (body, w, p, ctx) => {
    const c = w.challans.find((c) => c.id === body.id);
    if (!c || c.status === "Paid") fail("Select an unpaid challan.");
    if (!body.bank || !body.terms) fail("Select a bank and accept the terms.");
    const otp = await getOtpService().issue({
      scope: otpScope(ctx, w, "challan-" + c.id),
      userId: ctx.user.id,
      email: body.email || ctx.user.email,
      purpose: "bank-payment",
      binding: { id: c.id, total: c.total, bank: body.bank },
    });
    c.verificationRequired = true;
    c.bank = body.bank;
    c.otp = otp;
    return { otp, message: `OTP sent to ${otp.recipient}.` };
  });
  route("challan/pay", async (body, w, p, ctx) => {
    const challan = w.challans.find((c) => c.id === body.id);
    if (!challan) fail("Challan not found.");
    if (challan.status === "Paid") fail("This challan has already been paid.");
    if (!challan.bank || !challan.otp)
      fail("Confirm the bank payment and verify its OTP first.");
    await getOtpService().consume({
      challengeId: body.challengeId || challan.otp?.challengeId,
      scope: otpScope(ctx, w, "challan-" + challan.id),
      code: body.otp,
      binding: { id: challan.id, total: challan.total, bank: challan.bank },
    });
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
    flow.assertWritable(w, p);
    const data = flow.parseObject(body.data);
    flow.checkFile(data, ctx.active.state.taxpayer.gstin, w.period);
    const incoming = flow.parseGstr1(data, w.period),
      accepted = [],
      errors = [];
    for (const [i, input] of incoming.entries()) {
      try {
        flow.assertIff(w, input.section);
        const row = validateInvoice(
          input,
          w.period,
          ctx.active.state.taxpayer.state,
          [...flow.returnData(w, p, "gstr1").invoices, ...accepted],
          w.filingFrequency === "QRMP" && flow.quarterInfo(w.period).isEnd
            ? flow.quarterInfo(w.period).periods
            : [w.period],
        );
        if (
          row.originalNumber &&
          row.originalPeriod &&
          row.originalPeriod !== w.period
        ) {
          if (row.originalPeriod >= w.period)
            fail("Select an earlier original return period.");
          const original = w.periods[row.originalPeriod];
          const invoice = original?.invoices.find(
            (x) => x.number === row.originalNumber,
          );
          if (!invoice || original.gstr1.status !== "Filed")
            fail("Original invoice must belong to a filed return.");
          row.amendmentBaseline = {
            taxable: invoice.taxable,
            taxes: invoice.taxes,
          };
        }
        accepted.push(row);
      } catch (e) {
        errors.push({
          row: i + 1,
          number: input.number || "",
          error: e.message,
        });
      }
    }
    p.invoices.push(...accepted);
    if (accepted.length) {
      p.gstr1.revision++;
      p.gstr1.status = "In Progress";
      delete p.gstr1.summary;
    }
    const upload = {
      id: uid(),
      name: String(body.name || "returns.json").slice(0, 100),
      type: "GSTR-1",
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
  route("gstr3b/upload", (body, w, p, ctx) => {
    assert3b(w);
    if (["Filed", "Offset"].includes(p.gstr3b.status))
      fail("This return is locked.");
    const d = flow.parseObject(body.data);
    flow.checkFile(d, ctx.active.state.taxpayer.gstin, w.period);
    const tables = flow.parseGstr3b(d);
    p.gstr3b.tables = { ...p.gstr3b.tables, ...tables };
    if (tables["3.1"]) p.gstr3b.tables["3.1d"] = tables["3.1"].rows.d;
    if (tables["4"])
      p.gstr3b.tables["4b"] = {
        taxable: 0,
        taxes: add(tables["4"].rows.b1.taxes, tables["4"].rows.b2.taxes),
      };
    p.gstr3b.saved = true;
    p.gstr3b.status = "In Progress";
    p.gstr3b.nil = false;
    const upload = {
      id: uid(),
      name: String(body.name || "gstr3b.json").slice(0, 100),
      type: "GSTR-3B",
      accepted: Object.keys(tables).length,
      errors: [],
      status: "Processed",
      at: stamp(),
    };
    p.uploads.unshift(upload);
    return {
      upload,
      message:
        "GSTR-3B data uploaded. Review the tables before payment and filing.",
    };
  });
  route("purchases/save", (body, w, p, ctx) => {
    if (
      ["Offset", "Filed"].includes(p.gstr3b.status) ||
      (w.filingFrequency === "QRMP" &&
        ["Offset", "Filed"].includes(
          w.periods[flow.quarterInfo(w.period).end]?.gstr3b.status,
        ))
    )
      fail("Purchase data is locked after liability offset.");
    const row = flow.purchaseRow(
      body.purchase || {},
      w.period,
      ctx.active.state.taxpayer.state,
    );
    if (
      p.purchases.some(
        (i) =>
          i.id !== row.id &&
          i.gstin === row.gstin &&
          i.number === row.number &&
          i.documentType === row.documentType,
      )
    )
      fail("This supplier document already exists.");
    const i = p.purchases.findIndex((i) => i.id === row.id);
    if (i >= 0) p.purchases[i] = row;
    else p.purchases.push(row);
    return {
      message: row.itcReason
        ? `Supplier document saved. ITC unavailable: ${row.itcReason}`
        : "Supplier document saved.",
    };
  });
  route("purchases/upload", (body, w, p, ctx) => {
    if (
      ["Offset", "Filed"].includes(p.gstr3b.status) ||
      (w.filingFrequency === "QRMP" &&
        ["Offset", "Filed"].includes(
          w.periods[flow.quarterInfo(w.period).end]?.gstr3b.status,
        ))
    )
      fail("Purchase data is locked after liability offset.");
    const d = flow.parseObject(body.data);
    flow.checkFile(d, ctx.active.state.taxpayer.gstin, w.period);
    if (
      !Array.isArray(d.purchases) ||
      !d.purchases.length ||
      d.purchases.length > 2000
    )
      fail("Provide between 1 and 2,000 purchase documents.");
    const incoming = d.purchases.map((i) =>
      flow.purchaseRow(i, w.period, ctx.active.state.taxpayer.state),
    );
    const keys = new Set(
      p.purchases.map((i) =>
        [i.gstin, i.number, i.documentType || "Invoice"].join(":"),
      ),
    );
    incoming.forEach((i) => {
      const key = [i.gstin, i.number, i.documentType].join(":");
      if (keys.has(key)) fail("Duplicate supplier document: " + i.number);
      keys.add(key);
    });
    p.purchases.push(...incoming);
    return { message: `${incoming.length} supplier documents loaded.` };
  });
  route("registration/new", (body, w) => {
    if (w.registration.createdAt || w.registration.trn) {
      w.registrationHistory ||= [];
      w.registrationHistory.unshift(w.registration);
    }
    w.registration = { stage: "new", partA: {}, tabs: {}, savedTabs: [] };
    return {
      message:
        "New registration application opened. Previous applications are retained.",
    };
  });
  route("registration/start", async (body, w, p, ctx) => {
    if (w.registration.trn)
      fail("Open the saved application or start a new registration first.");
    const a = { ...body.partA, email: ctx.user.email };
    if (
      body.partA?.email &&
      normalizeEmail(body.partA.email) !== normalizeEmail(ctx.user.email)
    )
      fail("Use the email address linked to your account.");
    for (const key of [
      "type",
      "state",
      "district",
      "legalName",
      "pan",
      "mobile",
    ])
      if (typeof a[key] === "string") a[key] = a[key].trim();
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
    a.email = normalizeEmail(a.email);
    const otp = await getOtpService().issue({
      scope: otpScope(ctx, w, "registration-start"),
      userId: ctx.user.id,
      email: a.email,
      purpose: "registration-start",
      binding: a,
    });
    w.registration.partA = a;
    w.registration.createdAt ||= stamp();
    w.registration.id ||= crypto.randomUUID();
    w.registration.stage = "otp";
    w.registration.otp = otp;
    delete w.registration.otpExpires;
    return {
      otp,
      message: `One OTP email sent to ${otp.recipient}. Use the same code in both OTP fields.`,
    };
  });
  route("registration/verify", async (body, w, p, ctx) => {
    const r = w.registration;
    if (r.stage !== "otp") fail("Complete Part A first.");
    await getOtpService().consume({
      challengeId: body.challengeId || r.otp?.challengeId,
      scope: otpScope(ctx, w, "registration-start"),
      code: body.mobileOtp === body.emailOtp ? body.emailOtp : "",
      binding: r.partA,
    });
    r.verifiedEmail = r.partA.email;
    r.trn ||= digits(15);
    r.stage = "trn";
    return { message: `Temporary Reference Number: ${r.trn}` };
  });
  route("registration/resume", async (body, w, p, ctx) => {
    if (
      !w.registration.trn ||
      body.trn !== w.registration.trn ||
      normalizeEmail(body.email) !== w.registration.partA.email
    )
      fail("TRN or email address is incorrect.");
    const otp = await getOtpService().issue({
      scope: otpScope(ctx, w, "registration-resume"),
      userId: ctx.user.id,
      email: w.registration.partA.email,
      purpose: "registration-resume",
      binding: { trn: w.registration.trn, email: w.registration.partA.email },
    });
    w.registration.resumeOtp = otp;
    return { otp, message: `OTP sent to ${otp.recipient}.` };
  });
  route("registration/resume-verify", async (body, w, p, ctx) => {
    await getOtpService().consume({
      challengeId: body.challengeId || w.registration.resumeOtp?.challengeId,
      scope: otpScope(ctx, w, "registration-resume"),
      code: body.otp,
      binding: { trn: w.registration.trn, email: w.registration.partA.email },
    });
    if (!["Pending for Validation", "Approved"].includes(w.registration.stage))
      w.registration.stage = "draft";
    return { message: "Application opened." };
  });
  route("registration/save", (body, w, p, ctx) => {
    body = { ...body, values: { ...body.values } };
    if (["promoters", "signatory", "principal"].includes(body.tab)) {
      body.values.email ||= ctx.user.email;
      if (Array.isArray(body.values.records))
        body.values.records = body.values.records.map((item) => ({
          ...item,
          email: item.email || ctx.user.email,
        }));
    }
    const r = w.registration;
    if (body.tab === "principal") {
      if (body.values.state && body.values.state !== r.partA.state)
        fail("The principal place State / UT must match Part A.");
      body.values.state = r.partA.state;
      body.values.district ||= r.partA.district;
    }
    if (!r.trn || r.stage !== "draft")
      fail("Verify the TRN OTP to open the draft application first.");
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
    const values =
      body.tab === "goods"
        ? hsnMaster.registrationValues(body.values)
        : body.tab === "aadhaar"
          ? registrationPeople.authenticationValues(r, body.values)
          : { ...body.values };
    if (body.tab === "verification") {
      const signer = registrationPeople.resolveSignatory(
        r,
        values.signatoryId || values.signatory,
      );
      if (!signer)
        fail("Select an authorized signatory saved in this application.");
      values.signatory = signer.label;
      values.signatoryId = signer.value;
    }
    if (
      values.records &&
      (!Array.isArray(values.records) || values.records.length > 20)
    )
      fail("Add at most 20 records per section.");
    for (const item of values.records || [values]) {
      if (required.some((key) => !String(item[key] || "").trim()))
        fail("Complete mandatory fields in every record.");
      if (item.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(item.pan))
        fail("Enter a valid PAN.");
      if (item.din && !/^\d{7,8}$/.test(item.din))
        fail("Enter a valid Director Identification Number.");
      if (body.tab === "goods" && !/^\d{4,8}$/.test(item.hsn))
        fail("Enter a valid HSN/SAC.");
      if (item.attachment) item.attachment = flow.attachment(item.attachment);
    }
    if (values.attachment)
      values.attachment = flow.attachment(values.attachment);
    if (JSON.stringify({ ...r.tabs, [body.tab]: values }).length > 6000000)
      fail("Total application attachments must be smaller than 4 MB.");
    r.tabs[body.tab] = values;
    if (body.tab === "signatory" && r.tabs.aadhaar?.opted === "Yes") {
      try {
        r.tabs.aadhaar = registrationPeople.authenticationValues(
          r,
          r.tabs.aadhaar,
        );
      } catch {
        r.tabs.aadhaar = { ...r.tabs.aadhaar, person: "", personName: "" };
        r.savedTabs = r.savedTabs.filter((tab) => tab !== "aadhaar");
      }
    }
    if (
      body.tab === "signatory" &&
      r.tabs.verification?.signatory &&
      !registrationPeople.resolveSignatory(
        r,
        r.tabs.verification.signatoryId || r.tabs.verification.signatory,
      )
    ) {
      r.tabs.verification = {
        ...r.tabs.verification,
        signatory: "",
        signatoryId: "",
      };
      r.savedTabs = r.savedTabs.filter((tab) => tab !== "verification");
    }
    if (!r.savedTabs.includes(body.tab)) r.savedTabs.push(body.tab);
    r.stage = "draft";
    return { message: "Details saved successfully." };
  });
  route("registration/submit", async (body, w, p, ctx) => {
    const r = w.registration;
    if (r.stage === "Pending for Validation")
      fail("Application already submitted.");
    if (REG_TABS.some((tab) => !r.savedTabs.includes(tab)))
      fail("Save all registration tabs before submitting.");
    registrationPeople.authenticationValues(r, r.tabs.aadhaar || {});
    if (
      !registrationPeople.resolveSignatory(
        r,
        r.tabs.verification?.signatoryId || r.tabs.verification?.signatory,
      )
    )
      fail("Select an authorized signatory saved in this application.");
    await signingCheck(body, "registration-submit", w, p, ctx);
    r.stage = "Pending for Validation";
    r.arn = `AA${crypto.randomInt(1000000000000, 9999999999999)}`;
    r.submittedAt = stamp();
    return { message: `Application submitted. ARN: ${r.arn}` };
  });
  route("documents/date", (body, w) => {
    if (!flow.validDate(body.date)) fail("Enter a valid working date.");
    w.documentDates ||= {};
    w.documentDates[w.period] = body.date;
    return { message: "Working date updated." };
  });
  route("documents/registration-otp", async (body, w, p, ctx) => {
    if (!["eway", "einvoice"].includes(body.kind))
      fail("Select a valid portal.");
    if (body.gstin !== ctx.active.state.taxpayer.gstin)
      fail("GSTIN must match the selected taxpayer.");
    const otp = await getOtpService().issue({
      scope: otpScope(ctx, w, "document-register-" + body.kind),
      userId: ctx.user.id,
      email: ctx.user.email,
      purpose: body.kind + "-registration",
      binding: { kind: body.kind, gstin: body.gstin },
    });
    return { otp, message: `OTP sent to ${otp.recipient}.` };
  });
  route("documents/register", async (body, w, p, ctx) => {
    if (!["eway", "einvoice"].includes(body.kind))
      fail("Select a valid portal.");
    if (String(body.password || "").length < 5)
      fail("Use a password with at least five characters.");
    await getOtpService().consume({
      challengeId: body.challengeId,
      scope: otpScope(ctx, w, "document-register-" + body.kind),
      code: body.otp,
      binding: { kind: body.kind, gstin: ctx.active.state.taxpayer.gstin },
    });
    w.documentPortals ||= {};
    const salt = crypto.randomBytes(16).toString("hex");
    w.documentPortals[body.kind] = {
      username: ctx.user.email,
      salt,
      passwordHash: crypto.scryptSync(body.password, salt, 32).toString("hex"),
      registeredAt: stamp(),
    };
    return { message: "Portal registration completed. You can now log in." };
  });
  route("documents/captcha", (body, w) => {
    if (body.kind !== "eway") fail("Select the e-way bill portal.");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(
      { length: 6 },
      () => alphabet[crypto.randomInt(alphabet.length)],
    ).join("");
    const id = uid();
    w.documentCaptchas ||= {};
    w.documentCaptchas.eway = {
      id,
      hash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: Date.now() + 300000,
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="65"><rect width="260" height="65" fill="#edf0fa"/><path d="M0 20L260 42M10 50L240 12" stroke="#a1a8d5"/><text x="25" y="45" font-family="serif" font-size="35" fill="#312784" letter-spacing="7">${code}</text></svg>`;
    return {
      captcha: {
        id,
        image:
          "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
      },
    };
  });
  route("documents/login", (body, w, p, ctx) => {
    if (body.kind === "eway") {
      const challenge = w.documentCaptchas?.eway;
      if (
        !challenge ||
        body.captchaId !== challenge.id ||
        challenge.expiresAt < Date.now() ||
        crypto
          .createHash("sha256")
          .update(String(body.captcha || "").toUpperCase())
          .digest("hex") !== challenge.hash
      )
        fail("Enter the correct CAPTCHA code. Refresh it if expired.");
    }
    const account = w.documentPortals?.[body.kind];
    if (
      !account ||
      body.username !== account.username ||
      !crypto.timingSafeEqual(
        Buffer.from(account.passwordHash, "hex"),
        crypto.scryptSync(String(body.password || ""), account.salt, 32),
      )
    )
      fail("Portal username or password is incorrect.");
    account.sessionUntil = Date.now() + 3600000;
    if (body.kind === "eway") delete w.documentCaptchas.eway;
    return { message: "Logged in successfully." };
  });
  route("documents/logout", (body, w) => {
    if (w.documentPortals?.[body.kind])
      delete w.documentPortals[body.kind].sessionUntil;
    return { message: "Logged out of portal." };
  });
  const documentLogin = (w, kind) => {
    if (
      !w.documentPortals?.[kind]?.sessionUntil ||
      w.documentPortals[kind].sessionUntil < Date.now()
    )
      fail("Log in to this document portal first.");
  };
  route("documents/bulk", (body, w, p, ctx) => {
    documentLogin(w, body.kind);
    const d = flow.parseObject(body.data, true);
    flow.checkFile(d, ctx.active.state.taxpayer.gstin, w.period);
    const forms = flow.parseDocumentFile(d, body.kind);
    if (!forms.length || forms.length > 500)
      fail("Upload between 1 and 500 documents.");
    const accepted = [],
      errors = [];
    forms.forEach((form, i) => {
      try {
        accepted.push(
          flow.documentRow(
            { kind: body.kind, form },
            ctx.active.state.taxpayer,
            [...w.documents[body.kind], ...accepted],
            eway.workingDate(w),
          ),
        );
      } catch (e) {
        errors.push({ row: i + 1, number: form.number, error: e.message });
      }
    });
    w.documents[body.kind].unshift(...accepted);
    w.documentUploads ||= [];
    const upload = {
      id: uid(),
      kind: body.kind,
      name: String(body.name || "bulk.json").slice(0, 100),
      at: stamp(),
      accepted: accepted.length,
      errors,
    };
    w.documentUploads.unshift(upload);
    return {
      upload,
      message: `${accepted.length} documents generated; ${errors.length} errors.`,
    };
  });
  route("documents/create", (body, w, p, ctx) => {
    const kind = body.kind;
    if (body.form) {
      documentLogin(w, kind);
      const doc = flow.documentRow(
        body,
        ctx.active.state.taxpayer,
        w.documents[kind] || [],
        eway.workingDate(w),
      );
      doc.period = w.period;
      w.documents[kind].unshift(doc);
      return {
        document: doc,
        message:
          kind === "eway"
            ? "E-way bill generated successfully."
            : "IRN generated successfully.",
      };
    }
    if (!["eway", "einvoice"].includes(kind)) fail("Unknown document type.");
    const invoice = p.invoices.find((i) => i.id === body.invoiceId);
    if (!invoice) fail("Select an outward invoice.");
    if (
      w.documents[kind].some(
        (d) =>
          d.invoiceId === invoice.id &&
          (kind === "einvoice" || d.status !== "Cancelled"),
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
      if (
        (doc.referenceDate
          ? Date.parse(eway.workingDate(w) + "T12:00:00+05:30") -
            Date.parse(doc.issuedAt)
          : Date.now() - Date.parse(doc.createdAt)) > 86400000
      )
        fail("The 24-hour cancellation window has expired.");
      doc.status = "Cancelled";
      doc.reason = body.reason;
      doc.remarks = String(body.remarks || "").slice(0, 500);
    } else if (body.action === "vehicle" && body.kind === "eway") {
      const workingDate = eway.workingDate(w);
      if (doc.status === "Part A") {
        if (
          (Date.parse(workingDate) - Date.parse(doc.referenceDate)) / 86400000 >
          15
        )
          fail("The 15-day Part A completion window has expired.");
        const mode = body.mode || "Road";
        const candidate = {
          ...doc,
          number: doc.invoice.number,
          date: doc.invoice.date,
          mode,
          vehicle: body.vehicle || "",
          transportDocument: body.transportDocument || "",
          transportDate: body.transportDate || "",
          partAOnly: false,
        };
        if (candidate.transportDate && !flow.validDate(candidate.transportDate))
          fail("Enter a valid transport document date.");
        eway.validate(
          candidate,
          {
            gstin:
              doc.supplyType === "Inward" ? doc.buyer.gstin : doc.seller.gstin,
          },
          workingDate,
        );
        doc.mode = mode;
        doc.transportDocument = candidate.transportDocument;
        doc.transportDate = candidate.transportDate;
        doc.validUntil = eway.expiry(
          workingDate,
          doc.distance,
          doc.vehicleType,
        );
        doc.partAOnly = false;
        doc.status = "Active";
        doc.partBAt = workingDate + "T12:00:00+05:30";
      } else if (!eway.vehicleValid(body.vehicle))
        fail("Enter a valid vehicle number.");
      if (
        doc.validUntil &&
        Date.parse(eway.workingDate(w) + "T12:00:00+05:30") >
          Date.parse(doc.validUntil)
      )
        fail("The e-way bill has expired. Vehicle update is unavailable.");
      doc.vehicle = body.vehicle;
    } else fail("Unknown document action.");
    return { message: "Document updated." };
  });
  app.get("/api/workspace/export", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const active = await getActiveCase(user.id);
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
module.exports = {
  mountPortal,
  publicState,
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
