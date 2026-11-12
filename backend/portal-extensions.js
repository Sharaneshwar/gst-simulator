"use strict";
const crypto = require("node:crypto");
const flow = require("./practice-workflows");
const eco = require("./eco");
const ims = require("./ims");
const irp = require("./irp-sync");
const rules = require("./return-rules");
const postal = require("./postal-masters");
const H = ["igst", "cgst", "sgst", "cess"];
const C = ["tax", "interest", "penalty", "fee", "others"];
const id = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
function init(w) {
  w.masters ||= { parties: [], products: [] };
  w.pmt09Files ||= [];
  w.cashCategories ||= {};
  for (const p of Object.values(w.periods)) {
    p.processingJobs ||= [];
    p.imsRevision ||= 0;
  }
  return w;
}
function balances(w) {
  return Object.fromEntries(
    C.map((c) => [
      c,
      Object.fromEntries(
        H.map((h) => [
          h,
          Number((c === "tax" ? w.cash : w.cashCategories?.[c])?.[h] || 0),
        ]),
      ),
    ]),
  );
}
function transferPreview(w, rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 20)
    fail("Add between 1 and 20 cash transfers.");
  const original = balances(w),
    updated = structuredClone(original);
  const records = rows.map((row) => {
    const { fromHead, fromCategory, toHead, toCategory } = row;
    if (
      ![fromHead, toHead].every((h) => H.includes(h)) ||
      ![fromCategory, toCategory].every((c) => C.includes(c))
    )
      fail("Select valid source and destination major/minor heads.");
    if (fromHead === toHead && fromCategory === toCategory)
      fail("Source and destination must differ.");
    const amount = rules.signed(row.amount);
    if (amount <= 0) fail("Transfer amount must be greater than zero.");
    if (amount > updated[fromCategory][fromHead])
      fail(
        `Insufficient ${fromHead.toUpperCase()} ${fromCategory} cash balance.`,
      );
    updated[fromCategory][fromHead] = rules.signed(
      updated[fromCategory][fromHead] - amount,
    );
    updated[toCategory][toHead] = rules.signed(
      updated[toCategory][toHead] + amount,
    );
    return {
      id: row.id || id(),
      fromHead,
      fromCategory,
      toHead,
      toCategory,
      amount,
    };
  });
  return { original, updated, rows: records };
}
function master(input, kind, existing = []) {
  const name = String(input.name || "")
    .trim()
    .slice(0, 150);
  if (!name) fail("Enter a master name.");
  if (input.id && !existing.some((row) => row.id === input.id))
    fail("Master record not found.");
  if (kind === "parties") {
    const gstin = String(input.gstin || "")
      .trim()
      .toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][ZC][A-Z\d]$/.test(gstin))
      fail("Enter a valid GSTIN for this party.");
    if (existing.some((row) => row.id !== input.id && row.gstin === gstin))
      fail("This GSTIN is already in My Masters.");
    if (
      input.registrationType &&
      !["Regular", "TCS", "Composition", "UIN", "SEZ"].includes(
        input.registrationType,
      )
    )
      fail("Select a valid registration type.");
    return {
      id: input.id || id(),
      name,
      gstin,
      state: flow.stateName(gstin.slice(0, 2)),
      registrationType:
        input.registrationType || (gstin[13] === "C" ? "TCS" : "Regular"),
    };
  }
  const hsn = String(input.hsn || "");
  if (!/^\d{4,8}$/.test(hsn)) fail("Enter a 4–8 digit HSN/SAC.");
  const rate = Number(input.rate ?? 18);
  if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(rate))
    fail("Select a valid GST rate.");
  const uqc = String(input.uqc || "NOS")
    .toUpperCase()
    .slice(0, 10);
  if (
    existing.some(
      (row) =>
        row.id !== input.id &&
        row.hsn === hsn &&
        row.uqc === uqc &&
        row.rate === rate,
    )
  )
    fail("This HSN, unit and rate already exist in Product Master.");
  return {
    id: input.id || id(),
    name,
    hsn,
    uqc,
    rate,
    description: String(input.description || name).slice(0, 300),
  };
}
function processJobs(w, taxpayer, validateInvoice, now = Date.now()) {
  const p = w.periods[w.period];
  let changed = 0;
  for (const job of p.processingJobs || []) {
    if (job.status !== "Processing" || job.readyAt > now) continue;
    const upload = p.uploads.find((u) => u.id === job.id);
    const accepted = [];
    for (const [index, input] of job.rows.entries()) {
      try {
        flow.assertWritable(w, p);
        flow.assertIff(w, input.section);
        const candidates = Object.entries(w.periods)
          .filter(([period]) => rules.fy(period) === rules.fy(w.period))
          .flatMap(([, data]) => data.invoices);
        if (input.originalNumber)
          fail(
            "Upload original invoices first; use the amendment screens to locate and amend a filed original.",
          );
        const row = validateInvoice(
          { ...input, id: undefined },
          w.period,
          taxpayer.state,
          [...candidates, ...accepted],
        );
        if (row.date)
          rules.reporting(row.date, w.period, {
            asOf: ims.asOf(w),
            annualFiled: w.annualReturns?.[rules.fy(row.date)],
          });
        accepted.push(row);
      } catch (error) {
        job.errors.push({
          id: id(),
          row: index + 1,
          number: input.number || "",
          section: input.section || "",
          gstin: input.gstin || "",
          error: error.message,
          input,
        });
      }
    }
    p.invoices.push(...accepted);
    if (accepted.length) {
      p.gstr1.revision++;
      p.gstr1.status = "In Progress";
      delete p.gstr1.summary;
    }
    job.status = job.errors.length ? "Processed with errors" : "Processed";
    job.accepted = accepted.length;
    job.completedAt = stamp();
    job.rows = [];
    if (upload)
      Object.assign(upload, {
        accepted: accepted.length,
        errors: job.errors.map(({ input, ...e }) => e),
        status: job.status,
      });
    changed++;
  }
  return changed;
}
function processingGuard(p) {
  if (p.processingJobs?.some((j) => j.status === "Processing"))
    fail(
      "Wait for pending records to finish processing before generating or filing the statement.",
    );
  if (
    p.processingJobs?.some((j) =>
      j.errors?.some((e) => !e.resolvedAt && !e.discardedAt),
    )
  )
    fail(
      "Correct or delete the errored records before generating or filing the statement.",
    );
}
function chargeBinding(w, p, plan) {
  return JSON.stringify({
    period: w.period,
    frequency: w.filingFrequency,
    asOf: ims.asOf(w),
    override: w.dueDateOverrides?.[w.period],
    waiver: w.lateFeeWaivers?.[w.period] === true,
    interestWaiver: w.interestWaivers?.[w.period] === true,
    cashLiability: plan.taxCashUsed || plan.cashUsed,
    nil:
      !!p.gstr3b.nil ||
      H.every((h) => Number((plan.taxLiability || plan.liability)[h]) <= 0),
  });
}
function projection(w) {
  init(w);
  w.ecoOptions = eco.BUCKETS;
  w.imsRecords = ims
    .pool(w)
    .map((row) => ({ ...row, imsAction: ims.actionFor(row, w.period) }));
  w.gstr2bRecords =
    w.periods[w.period].gstr2b?.records ||
    w.periods[w.period].purchases.filter((row) => ims.included(row, w.period));
  w.gstr2bStale =
    !!w.periods[w.period].gstr2b &&
    w.periods[w.period].gstr2b.sourceRevision !== ims.revision(w);
  w.gstr2bRefreshBlocked = ims.recomputeBlocker(w);
  w.gstr2bReviewCount = ims
    .pool(w)
    .filter(
      (row) => ims.included(row, w.period) && row.match === "Requires Review",
    ).length;
  w.portalDate = ims.asOf(w);
  w.cashBalances = balances(w);
}
function mount({
  route,
  validateInvoice,
  signingCheck,
  paymentPlan,
  hsnMaster,
}) {
  route(
    "registration/address-search",
    (body, w) => ({
      results: postal.search(body.query, body.state || undefined),
    }),
    { readOnly: true },
  );
  route(
    "registration/districts",
    (body) => ({ districts: postal.districts(body.state) }),
    { readOnly: true },
  );
  route(
    "registration/jurisdictions",
    (body, w) => {
      if (!/^\d{6}$/.test(body.pincode || ""))
        fail("Enter a six-digit PIN code before fetching jurisdiction.");
      return postal.jurisdictions(w, body);
    },
    { readOnly: true },
  );
  route("registration/jurisdiction-master", (body, w, p, ctx) => {
    if (ctx.user.role !== "instructor")
      fail("Only an instructor can import jurisdiction masters.");
    const data = flow.parseObject(body.data);
    if (
      !Array.isArray(data.rows) ||
      !data.rows.length ||
      data.rows.length > 20000
    )
      fail("Provide up to 20,000 jurisdiction mappings.");
    const rows = data.rows.map((row) => {
      const state = flow.stateName(row.state);
      if (row.pincode && !/^\d{6}$/.test(row.pincode))
        fail("Every mapped PIN code must have six digits.");
      for (const field of [
        "stateJurisdiction",
        "ward",
        "commissionerate",
        "division",
        "range",
      ])
        if (!String(row[field] || "").trim())
          fail("Complete every jurisdiction level in each mapping.");
      return Object.fromEntries(
        [
          "district",
          "pincode",
          "stateJurisdiction",
          "ward",
          "commissionerate",
          "division",
          "range",
        ]
          .map((key) => [key, String(row[key] || "").slice(0, 200)])
          .concat([["state", state]]),
      );
    });
    w.jurisdictionMasters = rows;
    return { message: `${rows.length} jurisdiction mappings imported.` };
  });
  route("returns/preferences", (body, w, p, ctx) => {
    if (ctx.user.role !== "instructor")
      fail("Only an instructor can change notified filing-calendar settings.");
    if (body.dueDate) {
      if (!flow.validDate(body.dueDate))
        fail("Enter a valid extended due date.");
      w.dueDateOverrides ||= {};
      w.dueDateOverrides[w.period] = body.dueDate;
    }
    if (body.waiver !== undefined) {
      w.lateFeeWaivers ||= {};
      w.lateFeeWaivers[w.period] = body.waiver === true;
    }
    if (body.interestWaiver !== undefined) {
      w.interestWaivers ||= {};
      w.interestWaivers[w.period] = body.interestWaiver === true;
    }
    if (body.annualYear !== undefined && body.annualFiled) {
      if (
        !/^20\d{2}$/.test(String(body.annualYear)) ||
        !flow.validDate(body.annualFiled)
      )
        fail("Enter a valid annual-return year and filing date.");
      w.annualReturns ||= {};
      w.annualReturns[body.annualYear] = body.annualFiled;
    }
    return { message: "Filing-calendar settings saved for this business." };
  });
  route("calendar/date", (body, w) => {
    if (!flow.validDate(body.date) || body.date < `${w.period}-01`)
      fail(
        "Enter a processing date on or after the selected tax period starts.",
      );
    w.returnAsOf = body.date;
    return { message: "Processing date updated." };
  });
  route("eco/save", (body, w, p, ctx) => {
    flow.assertWritable(w, p);
    flow.assertIff(w, body.invoice?.section);
    const row = eco.validate(body.invoice || {}, w, ctx.active.state.taxpayer);
    const index = p.invoices.findIndex((i) => i.id === row.id);
    if (body.invoice?.id && index < 0)
      fail("E-commerce record not found in this return.");
    eco.checkPosAmendments(w, [
      ...p.invoices.filter((i) => i.id !== row.id),
      row,
    ]);
    if (index < 0) p.invoices.push(row);
    else p.invoices[index] = row;
    p.gstr1.revision++;
    p.gstr1.status = "In Progress";
    delete p.gstr1.summary;
    return { invoice: row, message: "E-commerce record saved." };
  });
  route("gstr1/sync-irn", (body, w, p, ctx) => ({
    records: irp.sync(w, ctx.active.state.taxpayer, validateInvoice),
    message:
      "E-invoice synchronization checked. Review the source status and return records.",
  }));
  route("gstr1/export-irn", async (body, w) => {
    const ExcelJS = require("exceljs"),
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("E-Invoice Details");
    sheet.addRow([
      "Document No.",
      "Document Date",
      "Recipient GSTIN",
      "Recipient Name",
      "Taxable Value",
      "IGST",
      "CGST",
      "SGST",
      "Cess",
      "Invoice Value",
      "IRN",
      "IRN Date",
      "GSTR-1 Status",
    ]);
    const records = w.documents.einvoice.filter(
      (doc) => doc.invoice.date.slice(0, 7) === w.period,
    );
    for (const doc of records) {
      const inv = doc.invoice;
      sheet.addRow([
        inv.number,
        inv.date,
        inv.gstin,
        inv.recipient,
        inv.taxable,
        ...H.map((h) => inv.taxes?.[h] || 0),
        inv.invoiceValue,
        doc.irn,
        doc.referenceDate || doc.createdAt?.slice(0, 10),
        doc.irpSyncStatus || doc.status,
      ]);
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF344F7E" },
    };
    sheet.columns.forEach((column, index) => {
      column.width = index === 10 ? 66 : index < 4 ? 24 : 18;
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    const bytes = await book.xlsx.writeBuffer();
    w.irpExportHistory ||= [];
    w.irpExportHistory.unshift({
      id: id(),
      period: w.period,
      at: stamp(),
      records: records.length,
    });
    return {
      base64: Buffer.from(bytes).toString("base64"),
      message: "E-invoice details exported.",
    };
  });
  route("gstr1/import-hsn", (body, w, p) => {
    flow.assertWritable(w, p);
    flow.assertIff(w, "HSN");
    if (body.confirm !== true)
      fail("Confirm replacement of the existing HSN summary.");
    const rows = [];
    const docs = w.documents.einvoice.filter(
      (doc) =>
        doc.status === "Active" && doc.invoice.date.slice(0, 7) === w.period,
    );
    for (const doc of docs)
      for (const item of doc.items || []) {
        const recipientType =
          doc.invoice.gstin && doc.invoice.gstin !== "URP"
            ? "Registered"
            : "Unregistered";
        const key = [item.hsn, item.uqc, item.rate, recipientType].join(":");
        let row = rows.find((r) => r.number === key);
        if (!row) {
          row = {
            id: id(),
            section: "HSN",
            number: key,
            hsn: item.hsn,
            hsnDescription:
              hsnMaster.lookup(item.hsn)?.description || item.description || "",
            quantity: 0,
            uqc: item.uqc,
            rate: item.rate,
            recipientType,
            place: w.homeState,
            date: "",
            taxable: 0,
            taxes: Object.fromEntries(H.map((h) => [h, 0])),
          };
          rows.push(row);
        }
        row.quantity += Number(item.quantity || 0);
        row.taxable = rules.signed(row.taxable + item.taxable);
        for (const head of H)
          row.taxes[head] = rules.signed(
            row.taxes[head] + Number(item.taxes?.[head] || 0),
          );
      }
    if (!rows.length)
      fail(
        "No active e-invoice item data is available for this return period.",
      );
    p.invoices = [...p.invoices.filter((i) => i.section !== "HSN"), ...rows];
    p.gstr1.revision++;
    delete p.gstr1.summary;
    return {
      message: `${rows.length} HSN summary records imported from e-invoices.`,
    };
  });
  route("processing/start", (body, w, p, ctx) => {
    flow.assertWritable(w, p);
    const data = flow.parseObject(body.data);
    flow.checkFile(data, ctx.active.state.taxpayer.gstin, w.period);
    const rows = flow.parseGstr1(data, w.period);
    if (!rows.length || rows.length > 2000)
      fail("Upload between 1 and 2,000 return records.");
    if (p.processingJobs.filter((j) => j.status === "Processing").length >= 3)
      fail("Wait for an existing upload to finish before starting another.");
    const job = {
      id: id(),
      period: w.period,
      name: String(body.name || "returns.json").slice(0, 100),
      rows,
      errors: [],
      accepted: 0,
      status: "Processing",
      at: stamp(),
      readyAt: Date.now() + 1000,
    };
    p.processingJobs.unshift(job);
    p.uploads.unshift({
      id: job.id,
      name: job.name,
      type: "GSTR-1",
      status: job.status,
      at: job.at,
      accepted: 0,
      errors: [],
    });
    return {
      job: { id: job.id, status: job.status },
      message: "Upload accepted. Records are being processed.",
    };
  });
  route("processing/refresh", (body, w, p, ctx) => ({
    processed: processJobs(w, ctx.active.state.taxpayer, validateInvoice),
    message: "Record processing status refreshed.",
  }));
  route("processing/correct", (body, w, p, ctx) => {
    flow.assertWritable(w, p);
    const issue = p.processingJobs
      .flatMap((j) => j.errors)
      .find((e) => e.id === body.id && !e.resolvedAt && !e.discardedAt);
    if (!issue) fail("Errored record not found.");
    if (body.discard === true) {
      issue.discardedAt = stamp();
      return { message: "Errored record deleted." };
    }
    flow.assertIff(w, body.invoice?.section);
    if (body.invoice?.originalNumber)
      fail("Use the amendment screen to locate a filed original.");
    const row = validateInvoice(
      { ...body.invoice, id: undefined },
      w.period,
      ctx.active.state.taxpayer.state,
      Object.values(w.periods).flatMap((d) => d.invoices),
    );
    p.invoices.push(row);
    issue.resolvedAt = stamp();
    p.gstr1.revision++;
    p.gstr1.status = "In Progress";
    delete p.gstr1.summary;
    return { message: "Corrected record processed successfully." };
  });
  route("masters/save", (body, w) => {
    if (!["parties", "products"].includes(body.kind))
      fail("Select a valid master type.");
    const list = w.masters[body.kind],
      row = master(body.record || {}, body.kind, list),
      index = list.findIndex((r) => r.id === row.id);
    if (index < 0) list.push(row);
    else list[index] = row;
    return { record: row, message: "My Master saved." };
  });
  route("masters/delete", (body, w) => {
    if (!["parties", "products"].includes(body.kind))
      fail("Select a valid master type.");
    if (!w.masters[body.kind].some((row) => row.id === body.id))
      fail("Master not found.");
    w.masters[body.kind] = w.masters[body.kind].filter(
      (row) => row.id !== body.id,
    );
    return { message: "Master removed. Existing invoices are unchanged." };
  });
  route("masters/import", (body, w) => {
    const data = flow.parseObject(body.data),
      temp = structuredClone(w.masters);
    let count = 0;
    for (const kind of ["parties", "products"]) {
      if (
        data[kind] !== undefined &&
        (!Array.isArray(data[kind]) || data[kind].length > 2000)
      )
        fail("Upload up to 2,000 records per master type.");
      for (const input of data[kind] || []) {
        const previous = temp[kind].find((row) =>
          kind === "parties"
            ? row.gstin === String(input.gstin || "").toUpperCase()
            : row.hsn === String(input.hsn) &&
              row.uqc === (input.uqc || "NOS") &&
              row.rate === Number(input.rate ?? 18),
        );
        const row = master({ ...input, id: previous?.id }, kind, temp[kind]);
        if (previous) temp[kind][temp[kind].indexOf(previous)] = row;
        else temp[kind].push(row);
        count++;
      }
    }
    if (!count) fail("No product or party masters found.");
    w.masters = temp;
    return { message: `${count} master records imported.` };
  });
  route("ims/action", (body, w) => ims.act(w, body));
  route("ims/supplier-filed", (body, w, p) => {
    if (["Offset", "Filed"].includes(p.gstr3b.status))
      fail(
        "Select an open tax period before refreshing supplier filing status.",
      );
    const record = ims.pool(w).find((row) => row.id === body.id);
    if (!record || record.imsFinalizedIn)
      fail("Supplier record is not available for refresh.");
    const source = w.periods[record.sourcePeriod].purchases.find(
      (row) => row.id === body.id,
    );
    source.supplierFiled = true;
    source.supplierFiledAtPeriod = w.period;
    source.imsActedFor = w.period;
    p.imsRevision = (p.imsRevision || 0) + 1;
    return {
      message:
        "Supplier filing status updated. Recompute GSTR-2B to include eligible documents.",
    };
  });
  route("ims/recompute", (body, w) => ims.recompute(w));
  route("pmt09/clear", (body, w) => {
    delete w.pmt09Draft;
    return { message: "Cash transfer draft cleared." };
  });
  route("pmt09/save", (body, w) => {
    const preview = transferPreview(w, body.rows);
    w.pmt09Draft = {
      id: w.pmt09Draft?.id || id(),
      rows: preview.rows,
      updatedAt: stamp(),
    };
    return {
      preview,
      message:
        "Cash transfer saved. Review the updated balances before filing.",
    };
  });
  route("pmt09/file", async (body, w, p, ctx) => {
    if (!w.pmt09Draft) fail("Save a cash-transfer draft first.");
    const preview = transferPreview(w, w.pmt09Draft.rows);
    await signingCheck(body, "pmt09-file", w, p, ctx);
    w.cash = preview.updated.tax;
    for (const c of C.filter((c) => c !== "tax"))
      w.cashCategories[c] = preview.updated[c];
    const arn = "AA" + String(crypto.randomInt(1000000000000, 9999999999999));
    const filed = {
      id: w.pmt09Draft.id,
      arn,
      rows: preview.rows,
      balancesBefore: preview.original,
      balancesAfter: preview.updated,
      filedAt: stamp(),
      status: "Filed",
    };
    w.pmt09Files.unshift(filed);
    delete w.pmt09Draft;
    const credits = Object.fromEntries(
        C.map((c) => [c, Object.fromEntries(H.map((h) => [h, 0]))]),
      ),
      debits = structuredClone(credits);
    for (const row of preview.rows) {
      credits[row.toCategory][row.toHead] = rules.signed(
        credits[row.toCategory][row.toHead] + row.amount,
      );
      debits[row.fromCategory][row.fromHead] = rules.signed(
        debits[row.fromCategory][row.fromHead] + row.amount,
      );
    }
    w.ledger.unshift({
      id: id(),
      date: stamp(),
      type: "Cash transfer",
      period: w.period,
      reference: arn,
      credit: credits.tax,
      debit: debits.tax,
      creditCategories: credits,
      debitCategories: debits,
    });
    return { filed, message: `GST PMT-09 filed successfully. ARN: ${arn}` };
  });
  route("fees/calculate", (body, w, p, ctx) => {
    if (["Offset", "Filed"].includes(p.gstr3b.status))
      fail("Interest and late fee cannot change after liability offset.");
    const plan = paymentPlan(flow.returnData(w, p), w);
    const calculation = rules.charges({
      period: w.period,
      frequency: w.filingFrequency,
      state: ctx.active.state.taxpayer.state,
      filingDate: body.filingDate || ims.asOf(w),
      turnover: body.turnover ?? w.taxProfile?.turnover ?? 0,
      nil:
        !!p.gstr3b.nil ||
        H.every((h) => Number((plan.taxLiability || plan.liability)[h]) <= 0),
      cashLiability: plan.taxCashUsed || plan.cashUsed,
      minimumCash: body.minimumCash || {},
      override: w.dueDateOverrides?.[w.period],
      waiver: w.lateFeeWaivers?.[w.period] === true,
      interestWaiver: w.interestWaivers?.[w.period] === true,
    });
    if (body.apply === true) {
      p.gstr3b.tables["5.1"] = flow.validate3b("5.1", {
        interest: { taxes: calculation.interest },
        latefee: { taxes: calculation.latefee },
      });
      p.gstr3b.charges = calculation;
      p.gstr3b.chargesBinding = chargeBinding(w, p, plan);
      p.gstr3b.saved = false;
      w.taxProfile = { ...w.taxProfile, turnover: calculation.turnover };
    }
    return {
      calculation,
      message: body.apply
        ? "Interest and late fee applied. Review and save GSTR-3B."
        : "Interest and late fee calculated.",
    };
  });
  route(
    "challan/fixed-sum",
    (body, w) => ({
      fixedSum: rules.fixedSum(w, w.period),
      message: "Fixed-sum basis calculated from the previous filed return.",
    }),
    { readOnly: true },
  );
}
module.exports = {
  init,
  projection,
  mount,
  balances,
  transferPreview,
  processJobs,
  processingGuard,
  master,
  chargeBinding,
};
