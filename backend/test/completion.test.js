"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const {
  validateInvoice,
  summary,
  paymentPlan,
  freshPeriod,
} = require("../portal-engine");
const flow = require("../practice-workflows");
const eco = require("../eco"),
  ims = require("../ims"),
  irp = require("../irp-sync"),
  rules = require("../return-rules"),
  extensions = require("../portal-extensions");
const postal = require("../postal-masters");
const { previewExcel } = require("../excel-import");
const heads = (igst = 0, cgst = 0, sgst = 0) => ({ igst, cgst, sgst, cess: 0 });
const taxpayer = { gstin: "27ABCDE1234F1Z0", state: "Maharashtra" };
function workspace(period = "2026-10") {
  return extensions.init({
    period,
    initialPeriod: period,
    homeState: "Maharashtra",
    periods: { [period]: freshPeriod() },
    cash: heads(),
    credit: heads(),
    documents: { eway: [], einvoice: [] },
    challans: [],
    ledger: [],
    filingFrequency: "Monthly",
    filingPreferences: {},
    registration: { partA: {}, tabs: {}, savedTabs: [] },
  });
}
const invoice = {
  section: "B2B",
  number: "ORIG/1",
  date: "2026-09-15",
  gstin: "29ABCDE1234F1Z0",
  recipient: "Practice Buyer",
  place: "Karnataka",
  taxable: 1000,
  rate: 18,
};
function purchase(id = "p1", extra = {}) {
  return {
    ...flow.purchaseRow(
      {
        gstin: "29ABCDE1234F1Z0",
        supplier: "Practice Supplier",
        number: "PUR/1",
        date: "2026-10-02",
        taxable: 1000,
        rate: 18,
        place: "Maharashtra",
        ...extra,
      },
      extra.date?.slice(0, 7) || "2026-10",
      "Maharashtra",
    ),
    id,
    ...extra,
  };
}
test("earlier invoices can be reported within the allowed financial-year deadline; future dates and expired reporting fail", () => {
  assert.equal(
    validateInvoice(invoice, "2026-10", "Maharashtra").date,
    "2026-09-15",
  );
  assert.throws(
    () =>
      validateInvoice(
        { ...invoice, date: "2026-11-01" },
        "2026-10",
        "Maharashtra",
      ),
    /on or before/,
  );
  rules.reporting("2025-04-01", "2026-11", { asOf: "2026-11-30" });
  assert.throws(
    () => rules.reporting("2025-04-01", "2026-11", { asOf: "2026-12-01" }),
    /deadline/,
  );
  assert.throws(
    () =>
      rules.reporting("2025-04-01", "2026-10", {
        asOf: "2026-10-20",
        annualFiled: "2026-10-10",
      }),
    /deadline/,
  );
});
test("negative B2CS/amendment totals remain signed while individual invoice amounts remain positive", () => {
  const row = validateInvoice(
    { ...invoice, section: "B2CS", number: "B2CS-ADJ", taxable: -1000 },
    "2026-10",
    "Maharashtra",
  );
  assert.equal(row.taxable, -1000);
  assert.equal(row.taxes.igst, -180);
  assert.equal(summary({ invoices: [row] }).taxes.igst, -180);
  assert.throws(
    () =>
      validateInvoice({ ...invoice, taxable: -1 }, "2026-10", "Maharashtra"),
    /non-negative/,
  );
});
test("Table 14 has separate TCS and section 9(5) records and does not double-count outward liability", () => {
  const w = workspace();
  const row = eco.validate(
    {
      section: "ECO",
      ecoBucket: "52",
      operatorGstin: "27ABCDE1234F1C0",
      taxable: 1000,
      reportedTaxes: heads(180),
    },
    w,
    taxpayer,
  );
  w.periods[w.period].invoices.push(row);
  assert.equal(summary(w.periods[w.period]).taxable, 0);
  assert.equal(summary(w.periods[w.period]).taxes.igst, 0);
  assert.equal(
    flow.draft3b(w.periods[w.period], "Maharashtra")["3.1"].taxes.igst,
    0,
  );
  assert.throws(
    () =>
      eco.validate(
        { ...row, id: undefined, operatorGstin: "27ABCDE1234F1Z0" },
        w,
        taxpayer,
      ),
    /TCS/,
  );
  const supplier = eco.validate(
    {
      section: "ECO",
      ecoBucket: "95",
      operatorGstin: "27ABCDE1234F1Z0",
      taxable: 500,
      reportedTaxes: heads(90),
    },
    w,
    taxpayer,
  );
  w.periods[w.period].invoices.push(supplier);
  const draft = flow.draft3b(w.periods[w.period], "Maharashtra");
  assert.equal(draft["3.1.1"].rows.b.taxable, 500);
  assert.equal(draft["3.1.1"].taxes.igst, 0);
});
test("Table 15 uses supplier/recipient registration tabs and operator tax is payable in cash, not ITC", () => {
  const w = workspace();
  w.credit = heads(1000);
  const row = eco.validate(
    {
      section: "ECO95",
      ecoBucket: "B2B",
      supplierGstin: "29ABCDE1234F1Z0",
      recipientGstin: "27ABCDE1234F1Z0",
      number: "ECO/1",
      date: "2026-10-01",
      place: "Maharashtra",
      taxable: 1000,
      rate: 18,
    },
    w,
    taxpayer,
  );
  w.periods[w.period].invoices.push(row);
  const plan = paymentPlan(w.periods[w.period], w);
  assert.equal(plan.creditUsed.igst, 0);
  assert.equal(plan.taxCashUsed.igst, 180);
  assert.equal(
    flow.draft3b(w.periods[w.period], "Maharashtra")["3.1"].taxes.igst,
    0,
  );
  assert.throws(
    () =>
      eco.validate({ ...row, id: undefined, ecoBucket: "URP2C" }, w, taxpayer),
    /unregistered supplier/,
  );
});
test("ECO amendments require a filed original and adjust by the last filed amendment baseline", () => {
  const w = workspace("2026-09");
  const original = eco.validate(
    {
      section: "ECO",
      ecoBucket: "52",
      operatorGstin: "27ABCDE1234F1C0",
      taxable: 1000,
      reportedTaxes: heads(180),
    },
    w,
    taxpayer,
  );
  w.periods[w.period].invoices.push(original);
  w.periods[w.period].gstr1.status = "Filed";
  w.period = "2026-10";
  w.periods[w.period] = freshPeriod();
  const changed = eco.validate(
    {
      ...original,
      id: undefined,
      section: "ECOA",
      originalId: original.id,
      originalPeriod: "2026-09",
      taxable: -100,
      reportedTaxes: heads(-18),
    },
    w,
    taxpayer,
  );
  assert.equal(changed.amendmentBaseline.taxable, 1000);
  assert.equal(changed.taxable, -100);
  w.periods[w.period].invoices.push(changed);
  w.periods[w.period].gstr1.status = "Filed";
  w.period = "2026-11";
  w.periods[w.period] = freshPeriod();
  const again = eco.validate(
    {
      ...original,
      id: undefined,
      section: "ECOA",
      originalId: original.id,
      originalPeriod: "2026-09",
      taxable: 200,
      reportedTaxes: heads(36),
    },
    w,
    taxpayer,
  );
  assert.equal(again.amendmentBaseline.taxable, -100);
});
test("IRP details arrive after two processing days, refresh is idempotent and cancellation removes an unfiled copy", () => {
  const w = workspace();
  w.returnAsOf = "2026-10-02";
  w.documents.einvoice = [
    {
      id: "doc1",
      status: "Active",
      irn: "a".repeat(64),
      referenceDate: "2026-10-01",
      invoice: {
        ...invoice,
        date: "2026-10-01",
        taxes: heads(180),
        invoiceValue: 1180,
      },
      seller: { gstin: taxpayer.gstin },
      place: "Karnataka",
      items: [{ rate: 18, taxable: 1000, taxes: heads(180) }],
    },
  ];
  irp.sync(w, taxpayer, validateInvoice);
  assert.equal(w.periods[w.period].invoices.length, 0);
  w.returnAsOf = "2026-10-03";
  irp.sync(w, taxpayer, validateInvoice);
  assert.equal(w.periods[w.period].invoices.length, 1);
  irp.sync(w, taxpayer, validateInvoice);
  assert.equal(w.periods[w.period].invoices.length, 1);
  w.documents.einvoice[0].status = "Cancelled";
  irp.sync(w, taxpayer, validateInvoice);
  assert.equal(w.periods[w.period].invoices.length, 0);
});
test("cancelled IRNs never erase edited work or alter the financial rows of a filed return", () => {
  for (const mode of ["edited", "filed"]) {
    const w = workspace();
    w.returnAsOf = "2026-10-03";
    w.documents.einvoice = [
      {
        id: "doc",
        status: "Active",
        irn: "b".repeat(64),
        referenceDate: "2026-10-01",
        invoice: {
          ...invoice,
          date: "2026-10-01",
          taxes: heads(180),
          invoiceValue: 1180,
        },
        seller: { gstin: taxpayer.gstin },
        place: "Karnataka",
        items: [{ rate: 18, taxable: 1000, taxes: heads(180) }],
      },
    ];
    irp.sync(w, taxpayer, validateInvoice);
    const p = w.periods[w.period];
    if (mode === "edited") p.invoices[0].irnEdited = true;
    else p.gstr1.status = "Filed";
    w.documents.einvoice[0].status = "Cancelled";
    irp.sync(w, taxpayer, validateInvoice);
    assert.equal(p.invoices.length, 1);
    assert.equal(p.invoices[0].taxable, 1000);
    assert.equal(p.invoices[0].irnCancelled, true);
  }
});
test("IMS No Action is deemed accepted, pending/rejected records are excluded and changes require recomputation", () => {
  const w = workspace(),
    p = w.periods[w.period];
  p.purchases = [
    purchase("a"),
    purchase("b", { number: "PUR/2" }),
    purchase("c", { number: "PUR/3" }),
  ];
  ims.act(w, { ids: ["b"], action: "Rejected", remark: "Wrong recipient" });
  ims.act(w, { ids: ["c"], action: "Pending" });
  ims.recompute(w);
  assert.deepEqual(
    p.gstr2b.records.map((r) => r.id),
    ["a"],
  );
  assert.equal(p.gstr2b.sourceRevision, ims.revision(w));
  ims.act(w, { ids: ["b"], action: "Accepted" });
  assert.notEqual(p.gstr2b.sourceRevision, ims.revision(w));
  ims.recompute(w);
  assert.deepEqual(p.gstr2b.records.map((r) => r.id).sort(), ["a", "b"]);
});
test("pending invoices carry into the next period and can then be accepted and claimed once", () => {
  const w = workspace();
  w.periods[w.period].purchases = [purchase()];
  ims.act(w, { ids: ["p1"], action: "Pending" });
  ims.finalize(w);
  w.period = "2026-11";
  w.periods[w.period] = freshPeriod();
  ims.act(w, { ids: ["p1"], action: "Accepted" });
  ims.recompute(w);
  assert.equal(w.periods[w.period].gstr2b.records[0].id, "p1");
  ims.finalize(w);
  assert.equal(ims.pool(w).length, 0);
});
test("October-2025 credit-note pending allowance and head-wise ITC reductions are enforced", () => {
  const w = workspace(),
    p = w.periods[w.period];
  p.purchases = [purchase("cn", { documentType: "Credit Note" })];
  ims.act(w, { ids: ["cn"], action: "Pending" });
  assert.equal(p.purchases[0].pendingThrough, "2026-11");
  w.period = "2026-12";
  w.periods[w.period] = freshPeriod();
  assert.throws(
    () => ims.act(w, { ids: ["cn"], action: "Pending" }),
    /expired/,
  );
  ims.act(w, {
    ids: ["cn"],
    action: "Accepted",
    reductions: { cn: heads(50) },
  });
  ims.recompute(w);
  assert.equal(w.periods[w.period].gstr2b.records[0].taxes.igst, 50);
  assert.throws(
    () =>
      ims.act(w, {
        ids: ["cn"],
        action: "Accepted",
        reductions: { cn: heads(500) },
      }),
    /between zero/,
  );
});
test("quarterly 2B recomputation includes all quarter months without double-claiming earlier months", () => {
  const w = workspace("2026-12");
  w.filingFrequency = "QRMP";
  w.periods["2026-10"] = freshPeriod();
  w.periods["2026-11"] = freshPeriod();
  w.periods["2026-10"].purchases = [purchase("oct")];
  w.periods["2026-11"].purchases = [purchase("nov", { date: "2026-11-02" })];
  ims.recompute(w);
  assert.equal(w.periods[w.period].gstr2b.records.length, 2);
  assert.equal(flow.returnData(w, w.periods[w.period]).purchases.length, 2);
  assert.equal(
    flow.draft3b(flow.returnData(w, w.periods[w.period]), "Maharashtra")["4"]
      .taxes.igst,
    360,
  );
});
test("IMS cannot change ineligible records, unfiled supplier records do not enter 2B, and offset locks all actions", () => {
  const w = workspace(),
    p = w.periods[w.period];
  p.purchases = [
    purchase("a", { supplierFiled: false }),
    purchase("bad", { itcReason: "POS unavailable", match: "Ineligible" }),
  ];
  assert.throws(
    () => ims.act(w, { ids: ["bad"], action: "Accepted" }),
    /ineligible/,
  );
  ims.recompute(w);
  assert.equal(
    p.gstr2b.records.some((r) => r.id === "a"),
    false,
  );
  p.gstr3b.status = "Offset";
  assert.throws(() => ims.act(w, { ids: ["a"], action: "Accepted" }), /locked/);
  assert.throws(() => ims.recompute(w), /offset/);
});
test("PMT-09 preview conserves cash, supports chained major/minor transfers and never modifies ITC", () => {
  const w = workspace();
  w.cash = heads(100);
  w.credit = heads(500);
  const before = structuredClone(w);
  const preview = extensions.transferPreview(w, [
    {
      fromHead: "igst",
      fromCategory: "tax",
      toHead: "cgst",
      toCategory: "tax",
      amount: 80,
    },
    {
      fromHead: "cgst",
      fromCategory: "tax",
      toHead: "sgst",
      toCategory: "interest",
      amount: 30,
    },
  ]);
  assert.equal(preview.updated.tax.igst, 20);
  assert.equal(preview.updated.tax.cgst, 50);
  assert.equal(preview.updated.interest.sgst, 30);
  assert.deepEqual(w, before);
  assert.throws(
    () =>
      extensions.transferPreview(w, [
        {
          fromHead: "igst",
          fromCategory: "tax",
          toHead: "cgst",
          toCategory: "tax",
          amount: 101,
        },
      ]),
    /Insufficient/,
  );
});
test("interest and late fee are calculated from due dates, cash liability, balance relief and turnover caps", () => {
  const args = {
    period: "2026-10",
    filingDate: "2026-11-30",
    turnover: 10000000,
    state: "Maharashtra",
    cashLiability: heads(1000),
    minimumCash: heads(500),
  };
  const c = rules.charges(args);
  assert.equal(c.daysLate, 10);
  assert.equal(c.interest.igst, 2.47);
  assert.equal(c.latefee.cgst, 250);
  assert.equal(c.latefee.sgst, 250);
  assert.equal(rules.charges({ ...args, waiver: true }).interest.igst, 2.47);
  assert.equal(rules.charges({ ...args, waiver: true }).latefee.cgst, 0);
  assert.equal(
    rules.charges({ ...args, interestWaiver: true }).interest.igst,
    0,
  );
  assert.equal(
    rules.charges({ ...args, interestWaiver: true }).latefee.cgst,
    250,
  );
  const capped = rules.charges({ ...args, filingDate: "2027-05-30" });
  assert.equal(capped.latefee.cgst + capped.latefee.sgst, 2000);
  assert.equal(
    rules.charges({ ...args, nil: true, filingDate: "2027-05-30" }).latefee
      .cgst,
    250,
  );
  assert.equal(rules.charges({ ...args, override: "2026-11-30" }).daysLate, 0);
  assert.equal(
    rules.dueDate("2026-12", "GSTR-3B", "QRMP", "Maharashtra"),
    "2027-01-22",
  );
  assert.equal(
    rules.dueDate("2026-12", "GSTR-3B", "QRMP", "Delhi"),
    "2027-01-24",
  );
});
test("fixed-sum PMT-06 uses 35% of prior quarterly cash tax and excludes interest", () => {
  const w = workspace("2026-11");
  w.filingPreferences[2026] = "QRMP";
  w.periods["2026-09"] = freshPeriod();
  Object.assign(w.periods["2026-09"].gstr3b, {
    status: "Filed",
    offset: { taxCashUsed: heads(1000), cashUsed: heads(1100) },
  });
  assert.equal(rules.fixedSum(w, w.period).amounts.igst, 350);
  w.filingPreferences[2026] = "Monthly";
  assert.equal(rules.fixedSum(w, w.period).amounts.igst, 1000);
});
test("interest/late fees consume their own minor heads and cannot be funded from a tax-only cash deposit", () => {
  const w = workspace(),
    p = w.periods[w.period];
  w.cash = heads(1000);
  w.credit = heads(1000);
  p.gstr3b.tables["5.1"] = flow.validate3b("5.1", {
    interest: { taxes: heads(10) },
    latefee: { taxes: heads(0, 20, 20) },
  });
  const plan = paymentPlan(p, w);
  assert.equal(plan.taxCashUsed.igst, 0);
  assert.equal(plan.minorShortfall.interest.igst, 10);
  assert.equal(plan.minorShortfall.fee.cgst, 20);
  assert.equal(plan.creditUsed.igst, 0);
});
test("negative net ITC first debits available credit and moves only the remainder to cash", () => {
  const w = workspace(),
    p = w.periods[w.period];
  w.credit = heads(50);
  p.gstr3b.tables["4"] = flow.validate3b("4", {
    a5: { taxes: heads(10) },
    b2: { taxes: heads(100) },
  });
  const plan = paymentPlan(p, w);
  assert.equal(plan.recognizedItc.igst, -50);
  assert.equal(plan.taxCashUsed.igst, 40);
});
test("negative outward liability is carried forward and adjusted before credit, without becoming spendable cash", () => {
  const w = workspace(),
    p = w.periods[w.period];
  p.gstr3b.tables["3.1"] = flow.validate3b("3.1", {
    a: { taxes: heads(-180) },
  });
  const first = paymentPlan(p, w);
  assert.equal(first.taxCashUsed.igst, 0);
  assert.equal(first.negativeLiability.after.outward.igst, 180);
  assert.equal(w.cash.igst, 0);
  w.negativeLiability = structuredClone(first.negativeLiability.after);
  w.period = "2026-11";
  w.periods[w.period] = freshPeriod();
  w.periods[w.period].gstr3b.tables["3.1"] = flow.validate3b("3.1", {
    a: { taxes: heads(300) },
  });
  w.credit = heads(100);
  const second = paymentPlan(w.periods[w.period], w);
  assert.equal(second.negativeLiability.used.outward.igst, 180);
  assert.equal(second.creditUsed.igst, 100);
  assert.equal(second.taxCashUsed.igst, 20);
  assert.equal(second.negativeLiability.after.outward.igst, 0);
});
test("processing jobs are durable, validate records independently, expose errors and invalidate summary", () => {
  const w = workspace(),
    p = w.periods[w.period];
  p.processingJobs = [
    {
      id: "job",
      status: "Processing",
      readyAt: 0,
      rows: [
        { ...invoice, date: "2026-10-01" },
        { ...invoice, number: "BAD", gstin: "wrong" },
      ],
      errors: [],
    },
  ];
  p.uploads = [{ id: "job" }];
  extensions.processJobs(w, taxpayer, validateInvoice, 1);
  assert.equal(p.invoices.length, 1);
  assert.equal(p.processingJobs[0].errors.length, 1);
  assert.equal(p.uploads[0].accepted, 1);
  assert.throws(() => extensions.processingGuard(p), /Correct or delete/);
  p.processingJobs[0].errors[0].discardedAt = "now";
  extensions.processingGuard(p);
  extensions.processJobs(w, taxpayer, validateInvoice, 2);
  assert.equal(p.invoices.length, 1);
});
test("postal search covers every state/UT and distinguishes real postal data from training jurisdictions", () => {
  assert.ok(postal.count > 20000);
  for (const state of Object.values(flow.STATE_CODES).filter(
    (s) => !["Other Territory", "Outside India"].includes(s),
  ))
    assert.ok(postal.districts(state).length, state);
  assert.ok(postal.search("560001", "Karnataka").length);
  assert.equal(postal.search("560001", "Maharashtra").length, 0);
  assert.equal(
    postal.jurisdictions(workspace(), {
      state: "Maharashtra",
      district: "Nashik",
      pincode: "422001",
    }).trainingOnly,
    true,
  );
});
test("mixed-rate flat Excel rows become one purchase invoice with all source rows and original taxes", async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Purchase Register");
  sheet.addRow([
    "Date",
    "Supplier",
    "Invoice No",
    "GSTIN",
    "Purchase",
    "Gross Total",
    "IGST",
  ]);
  sheet.addRow([
    "2026-10-01",
    "Practice Supplier",
    "MIX/1",
    "29ABCDE1234F1Z0",
    1000,
    3410,
    50,
  ]);
  sheet.addRow([
    "2026-10-01",
    "Practice Supplier",
    "MIX/1",
    "29ABCDE1234F1Z0",
    2000,
    3410,
    360,
  ]);
  const p = await previewExcel(
    {
      name: "mixed.xlsx",
      base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    },
    { period: "2026-10", taxpayer, validateInvoice },
  );
  assert.equal(p.canImport, true, JSON.stringify(p.rows.map((r) => r.error)));
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].entry.items.length, 2);
  assert.equal(p.rows[0].entry.taxes.igst, 410);
  assert.equal(p.rows[0].entry.invoiceValue, 3410);
  assert.deepEqual(p.rows[0].sourceRows, [2, 3]);
});
test("standard Tally ledger export groups voucher ledgers and skips non-GST vouchers explicitly", async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Day Book");
  sheet.addRow([
    "Date",
    "Particulars",
    "Vch Type",
    "Vch No.",
    "Debit",
    "Credit",
  ]);
  sheet.addRow([
    "01-10-2026",
    "Practice Supplier",
    "Purchase",
    "P/1",
    null,
    3410,
  ]);
  sheet.addRow([null, "Purchase @5%", null, null, 1000]);
  sheet.addRow([null, "Purchase @18%", null, null, 2000]);
  sheet.addRow([null, "Input IGST @5%", null, null, 50]);
  sheet.addRow([null, "Input IGST @18%", null, null, 360]);
  sheet.addRow(["02-10-2026", "Bank", "Payment", "PAY/1", 100]);
  const p = await previewExcel(
    {
      name: "ledger.xlsx",
      base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    },
    {
      period: "2026-10",
      taxpayer,
      validateInvoice,
      masters: [{ name: "Practice Supplier", gstin: "29ABCDE1234F1Z0" }],
    },
  );
  assert.equal(p.canImport, true, JSON.stringify(p));
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].target, "purchases");
  assert.equal(p.rows[0].entry.taxable, 3000);
  assert.equal(p.rows[0].entry.taxes.igst, 410);
  assert.equal(p.skippedVouchers.length, 1);
});

test("Table 15A POS replacement zeros the original and adds a separate new POS without double liability", () => {
  const w = workspace("2026-09");
  const original = eco.validate(
    {
      section: "ECO95",
      ecoBucket: "B2C",
      supplierGstin: "29ABCDE1234F1Z0",
      place: "Maharashtra",
      taxable: 1000,
      rate: 18,
      reportedTaxes: heads(180),
    },
    w,
    taxpayer,
  );
  w.periods[w.period].invoices.push(original);
  w.periods[w.period].gstr1.status = "Filed";
  w.period = "2026-10";
  w.periods[w.period] = freshPeriod();
  const amend = {
    ...original,
    id: undefined,
    section: "ECO95A",
    originalId: original.id,
    originalPeriod: "2026-09",
    items: undefined,
  };
  const newPos = eco.validate({ ...amend, place: "Delhi" }, w, taxpayer);
  assert.equal(newPos.amendmentBaseline.taxable, 0);
  assert.throws(() => eco.checkPosAmendments(w, [newPos]), /first save zero/);
  const zero = eco.validate(
    { ...amend, taxable: 0, reportedTaxes: heads() },
    w,
    taxpayer,
  );
  w.periods[w.period].invoices.push(zero);
  const replacement = eco.validate({ ...amend, place: "Delhi" }, w, taxpayer);
  w.periods[w.period].invoices.push(replacement);
  eco.checkPosAmendments(w);
  assert.equal(
    flow.draft3b(w.periods[w.period], "Maharashtra")["3.1.1"].taxes.igst,
    0,
  );
  assert.throws(
    () => eco.checkPosAmendments(w, [replacement]),
    /first save zero/,
  );
});

test("automatic inward refresh replaces stale snapshots and ITC overrides without accepting review records", () => {
  const w = workspace(),
    p = w.periods[w.period];
  ims.recompute(w);
  p.gstr3b.tables["4"] = { taxes: heads(999) };
  p.gstr3b.tables["4b"] = { taxes: heads(99) };
  p.gstr3b.tables["3.1"] = { taxes: heads(90) };
  p.gstr3b.saved = true;
  p.purchases.push(
    purchase("ok"),
    purchase("review", { number: "PUR/2", match: "Requires Review" }),
  );
  p.imsRevision++;
  const result = ims.refreshAfterChange(w);
  assert.equal(result.refreshed, true);
  assert.equal(result.reviewCount, 1);
  assert.equal(p.gstr2b.records.length, 2);
  assert.equal(p.gstr2b.sourceRevision, ims.revision(w));
  assert.equal(p.gstr3b.saved, false);
  assert.equal(p.gstr3b.tables["4"], undefined);
  assert.equal(p.gstr3b.tables["4b"], undefined);
  assert.equal(p.gstr3b.tables["3.1"].taxes.igst, 90);
  assert.equal(
    flow.draft3b(flow.returnData(w, p), "Maharashtra")["4"].taxes.igst,
    180,
  );
});
test("automatic refresh explains date/quarter/offset blockers without losing uploaded documents or snapshots", () => {
  for (const setup of [
    (w) => {
      w.returnAsOf = "2026-11-13";
    },
    (w) => {
      w.filingFrequency = "QRMP";
    },
    (w) => {
      w.periods[w.period].gstr3b.status = "Offset";
    },
  ]) {
    const w = workspace(),
      p = w.periods[w.period];
    ims.recompute(w);
    const snapshot = structuredClone(p.gstr2b);
    p.purchases.push(purchase());
    p.imsRevision++;
    setup(w);
    const result = ims.refreshAfterChange(w);
    assert.equal(result.refreshed, false);
    assert.match(result.message, /refresh pending/);
    assert.equal(p.purchases.length, 1);
    assert.deepEqual(p.gstr2b, snapshot);
  }
});
