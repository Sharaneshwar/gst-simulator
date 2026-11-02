"use strict";
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gst-advanced-http-"));
process.env.NODE_ENV = "development";
process.env.GST_SEED_DEMO_USERS = "1";
process.env.GST_ENABLE_CASE_LIBRARY = "1";
process.env.SQLITE_PATH = path.join(dir, "test.sqlite");
const { app, db, ready } = require("../server");
const { createOtpService } = require("../otp-service");
let server,
  url,
  token,
  instructor,
  clock = Date.now();
const emails = [];
async function req(endpoint, body, auth = token) {
  const res = await fetch(url + "/api" + endpoint, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ...(await res.json()), code: res.status };
}
const act = (endpoint, body = {}) => req("/workspace/" + endpoint, body);
async function sign(endpoint, purpose) {
  clock += 120000;
  const form = {
    purpose,
    signatory: "Practice Signatory",
    email: "practice@example.com",
    method: "EVC",
    declaration: true,
  };
  const sent = await act("signing/send", form);
  assert.equal(sent.code, 200, sent.message);
  return act(endpoint, {
    ...form,
    challengeId: sent.otp.challengeId,
    otp: emails.at(-1).code,
  });
}
async function deposit(amounts) {
  const created = await act("challan/create", { amounts });
  assert.equal(created.code, 200, created.message);
  clock += 120000;
  const sent = await act("challan/otp", {
    id: created.challan.id,
    bank: "State Bank of India",
    terms: true,
  });
  assert.equal(sent.code, 200, sent.message);
  const paid = await act("challan/pay", {
    id: created.challan.id,
    challengeId: sent.otp.challengeId,
    otp: emails.at(-1).code,
  });
  assert.equal(paid.code, 200, paid.message);
  return paid;
}
before(async () => {
  await ready;
  app.locals.otpService = await createOtpService({
    db,
    secret: "isolated-advanced-test-key",
    now: () => clock,
    sendEmail: async (email) => emails.push(email),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
  token = (
    await req(
      "/auth/login",
      { email: "student@demo.com", password: "12345" },
      "",
    )
  ).token;
  instructor = (
    await req(
      "/auth/login",
      { email: "instructor@demo.com", password: "12345" },
      "",
    )
  ).token;
});
beforeEach(async () => {
  assert.equal((await req("/portal/reset", {})).code, 200);
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  fs.rmSync(dir, { recursive: true });
});

test("PMT-09 is a draft until verified filing; cash transfers are atomic, signed and replay protected", async () => {
  await deposit({ igst: 200 });
  const before = (await req("/portal")).activeCase.state.workspace;
  const rows = [
    {
      fromHead: "igst",
      fromCategory: "tax",
      toHead: "cgst",
      toCategory: "interest",
      amount: 75,
    },
  ];
  const draft = await act("pmt09/save", { rows });
  assert.equal(draft.code, 200, draft.message);
  assert.deepEqual(draft.state.workspace.cash, before.cash);
  assert.equal(
    (
      await act("pmt09/file", {
        method: "EVC",
        declaration: true,
        signatory: "Practice Signatory",
        otp: "bad",
      })
    ).code,
    400,
  );
  const filed = await sign("pmt09/file", "pmt09-file");
  assert.equal(filed.code, 200, filed.message);
  assert.equal(filed.state.workspace.cash.igst, before.cash.igst - 75);
  assert.equal(filed.state.workspace.cashCategories.interest.cgst, 75);
  assert.deepEqual(filed.state.workspace.credit, before.credit);
  assert.equal(filed.state.workspace.pmt09Files[0].arn, filed.filed.arn);
  assert.equal((await act("pmt09/file", {})).code, 400);
  assert.equal((await req("/workspace/pmt09/save", { rows }, "")).code, 401);
});
test("PMT-09 OTP is bound to the saved transfer and cannot approve a changed draft", async () => {
  await deposit({ igst: 200 });
  const base = {
    fromHead: "igst",
    fromCategory: "tax",
    toHead: "cgst",
    toCategory: "tax",
    amount: 50,
  };
  await act("pmt09/save", { rows: [base] });
  clock += 120000;
  const form = {
    purpose: "pmt09-file",
    method: "EVC",
    declaration: true,
    signatory: "Practice Signatory",
    email: "practice@example.com",
  };
  const sent = await act("signing/send", form);
  assert.equal(sent.code, 200, sent.message);
  const code = emails.at(-1).code;
  await act("pmt09/save", { rows: [{ ...base, amount: 150 }] });
  assert.equal(
    (
      await act("pmt09/file", {
        ...form,
        challengeId: sent.otp.challengeId,
        otp: code,
      })
    ).code,
    400,
  );
  assert.equal(
    (await req("/portal")).activeCase.state.workspace.cash.igst,
    200,
  );
});
test("Table 14 disclosures do not inflate liability; ECO amendments locate an immutable filed original", async () => {
  const before = (await req("/portal")).activeCase.state.workspace.summary;
  const input = {
    section: "ECO",
    ecoBucket: "52",
    operatorGstin: "27ABCDE1234F1C0",
    taxable: 1000,
    reportedTaxes: { igst: 180 },
  };
  const original = await act("eco/save", { invoice: input });
  assert.equal(original.code, 200, original.message);
  assert.deepEqual(original.state.workspace.summary, before);
  const op = await act("eco/save", {
    invoice: {
      section: "ECO95",
      ecoBucket: "B2B",
      supplierGstin: "29ABCDE1234F1Z0",
      recipientGstin: "27ABCDE1234F1Z0",
      number: "ECO/001",
      date: "2026-10-01",
      place: "Maharashtra",
      taxable: 1000,
      rate: 18,
    },
  });
  assert.equal(op.code, 200, op.message);
  assert.equal(op.state.workspace.summary.taxable, before.taxable + 1000);
  await act("gstr1/summary");
  assert.equal((await sign("gstr1/file", "gstr1-file")).code, 200);
  assert.equal(
    (await act("eco/save", { invoice: { ...input, taxable: 2000 } })).code,
    400,
  );
  await act("period", { period: "2026-11" });
  const amended = await act("eco/save", {
    invoice: {
      ...input,
      section: "ECOA",
      originalId: original.invoice.id,
      originalPeriod: "2026-10",
      taxable: -100,
      reportedTaxes: { igst: -18 },
    },
  });
  assert.equal(amended.code, 200, amended.message);
  assert.equal(amended.invoice.amendmentBaseline.taxable, 1000);
});
test("IMS actions and supplier filing refresh change the recomputed 2B snapshot and its stale marker", async () => {
  const saved = await act("purchases/save", {
    purchase: {
      gstin: "27ABCDE1234F1Z0",
      supplier: "Practice Supplier",
      number: "IMS/01",
      date: "2026-10-02",
      place: "Karnataka",
      taxable: 1000,
      rate: 18,
      match: "Matched",
      supplierFiled: false,
    },
  });
  assert.equal(saved.code, 200, saved.message);
  const row = saved.state.workspace.periods["2026-10"].purchases.find(
    (r) => r.number === "IMS/01",
  );
  let computed = await act("ims/recompute");
  assert.equal(computed.code, 200, computed.message);
  assert.equal(
    computed.state.workspace.gstr2bRecords.some((r) => r.id === row.id),
    false,
  );
  await act("ims/supplier-filed", { id: row.id });
  computed = await act("ims/recompute");
  assert.ok(
    computed.state.workspace.gstr2bRecords.some((r) => r.id === row.id),
  );
  const rejected = await act("ims/action", {
    ids: [row.id],
    action: "Rejected",
    remark: "Wrong recipient",
  });
  assert.equal(rejected.code, 200, rejected.message);
  assert.equal(rejected.state.workspace.gstr2bStale, true);
  computed = await act("ims/recompute");
  assert.equal(
    computed.state.workspace.gstr2bRecords.some((r) => r.id === row.id),
    false,
  );
  assert.equal(computed.state.workspace.gstr2bStale, false);
  assert.equal(
    (await act("ims/action", { ids: ["foreign-case"], action: "Accepted" }))
      .code,
    400,
  );
});
test("queued processing exposes pending/error states, accepts corrections and processes accepted rows once", async () => {
  const original = (await req("/portal")).activeCase.state.workspace.periods[
    "2026-10"
  ].invoices;
  const invoice = {
    section: "B2B",
    number: "QUEUE/1",
    date: "2026-10-02",
    gstin: "27ABCDE1234F1Z0",
    place: "Maharashtra",
    taxable: 1000,
    rate: 18,
  };
  const queued = await act("processing/start", {
    name: "practice.json",
    data: {
      invoices: [invoice, { ...invoice, number: "QUEUE/2", gstin: "bad" }],
    },
  });
  assert.equal(queued.code, 200, queued.message);
  assert.equal(queued.job.status, "Processing");
  assert.equal(
    queued.state.workspace.periods["2026-10"].invoices.length,
    original.length,
  );
  assert.equal((await act("gstr1/summary")).code, 400);
  await new Promise((r) => setTimeout(r, 1050));
  const processed = await act("processing/refresh");
  const job = processed.state.workspace.periods["2026-10"].processingJobs.find(
    (j) => j.id === queued.job.id,
  );
  assert.equal(job.accepted, 1);
  assert.equal(job.errors.length, 1);
  assert.equal((await act("gstr1/summary")).code, 400);
  const fixed = await act("processing/correct", {
    id: job.errors[0].id,
    invoice: { ...invoice, number: "QUEUE/2" },
  });
  assert.equal(fixed.code, 200, fixed.message);
  assert.equal(
    fixed.state.workspace.periods["2026-10"].invoices.length,
    original.length + 2,
  );
  const repeat = await act("processing/refresh");
  assert.equal(
    repeat.state.workspace.periods["2026-10"].invoices.length,
    original.length + 2,
  );
  assert.equal((await act("gstr1/summary")).code, 200);
});
test("master import round-trips without duplicates and an invalid mixed batch leaves saved masters intact", async () => {
  const product = await act("masters/save", {
    kind: "products",
    record: { name: "Practice Computer", hsn: "8471", uqc: "NOS", rate: 18 },
  });
  assert.equal(product.code, 200, product.message);
  const party = await act("masters/save", {
    kind: "parties",
    record: {
      name: "Practice Buyer",
      gstin: "27ABCDE1234F1Z0",
      registrationType: "Regular",
    },
  });
  assert.equal(party.code, 200, party.message);
  const imported = await act("masters/import", {
    data: party.state.workspace.masters,
  });
  assert.equal(imported.code, 200, imported.message);
  assert.equal(imported.state.workspace.masters.products.length, 1);
  assert.equal(imported.state.workspace.masters.parties.length, 1);
  const bad = await act("masters/import", {
    data: {
      products: [
        { name: "Valid", hsn: "9983", uqc: "NOS", rate: 18 },
        { name: "Bad", hsn: "no", rate: 18 },
      ],
    },
  });
  assert.equal(bad.code, 400);
  assert.equal(
    (await req("/portal")).activeCase.state.workspace.masters.products.length,
    1,
  );
});
test("postal searches are authenticated and read-only, and training jurisdiction data is labelled", async () => {
  const search = await act("registration/address-search", {
    query: "560001",
    state: "Karnataka",
  });
  assert.equal(search.code, 200);
  assert.ok(search.results.length);
  assert.equal(search.state, undefined);
  const district = await act("registration/districts", {
    state: "Maharashtra",
  });
  assert.ok(district.districts.includes("Nashik"));
  const jurisdiction = await act("registration/jurisdictions", {
    state: "Maharashtra",
    district: "Nashik",
    pincode: "422001",
  });
  assert.equal(jurisdiction.trainingOnly, true);
  assert.equal(
    (
      await req(
        "/workspace/registration/address-search",
        { query: "560001" },
        "",
      )
    ).code,
    401,
  );
  assert.equal(
    (await act("registration/jurisdiction-master", { data: { rows: [] } }))
      .code,
    400,
  );
});
test("negative 3B values persist, and calculated late fee is funded through the fee minor head", async () => {
  const negative = await act("gstr3b/save", {
    table: "3.1",
    rows: { a: { taxable: -100, taxes: { igst: -18 } } },
  });
  assert.equal(negative.code, 200, negative.message);
  assert.equal(
    negative.state.workspace.periods["2026-10"].gstr3b.tables["3.1"].rows.a
      .taxable,
    -100,
  );
  const fee = await act("fees/calculate", {
    filingDate: "2026-11-30",
    turnover: 10000000,
    apply: true,
  });
  assert.equal(fee.code, 200, fee.message);
  assert.equal(fee.calculation.daysLate, 10);
  assert.equal(fee.calculation.latefee.cgst, 100);
  assert.equal(fee.state.workspace.paymentPlan.minorShortfall.fee.cgst, 100);
});
