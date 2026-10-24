"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "gst-portal-test-"));
process.env.SQLITE_PATH = path.join(taskDir, "test.sqlite");
const { app, db } = require("../server");
const {
  allocation,
  paymentPlan,
  ensureWorkspace,
  summary,
} = require("../portal-engine");
let server, url, token, instructorToken;
async function request(route, body, auth = token) {
  const response = await fetch(url + "/api" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { code: response.status, ...(await response.json()) };
}
const action = (route, body = {}, auth) =>
  request("/workspace/" + route, body, auth);
const sign = {
  declaration: true,
  signatory: "Student",
  method: "EVC",
  otp: "123456",
};
const invoice = {
  section: "B2B",
  number: "TEST-001",
  date: "2026-10-15",
  gstin: "29AABCL1234A1Z9",
  place: "Karnataka",
  taxable: 10000,
  rate: 18,
};
async function reset(slug = "regular-october") {
  await request(`/portal/cases/${slug}/activate`, {});
  return request("/portal/reset", {});
}
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  token = (
    await request(
      "/auth/login",
      { email: "student@demo.com", password: "12345" },
      "",
    )
  ).token;
  instructorToken = (
    await request(
      "/auth/login",
      { email: "instructor@demo.com", password: "12345" },
      "",
    )
  ).token;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(taskDir, { recursive: true });
});

test("authentication rejects missing tokens and invalid credentials", async () => {
  assert.equal((await request("/portal", undefined, "")).code, 401);
  assert.equal(
    (
      await request(
        "/auth/login",
        { email: "student@demo.com", password: "wrong" },
        "",
      )
    ).code,
    401,
  );
  assert.ok(token);
  assert.ok(instructorToken);
});
test("workspace migration retains old seed records and separates user records", async () => {
  await reset();
  const result = await request("/portal");
  const state = result.activeCase.state;
  assert.equal(state.salesInvoices.length, 3);
  assert.equal(state.workspace.periods["2026-10"].invoices.length, 3);
  const saved = await action("invoice/save", { invoice });
  assert.equal(saved.code, 200);
  assert.equal(
    (await request("/portal", undefined, instructorToken)).activeCase.state
      .workspace.periods["2026-10"].invoices.length,
    3,
  );
});
test("invoice validation prevents duplicates, invalid GSTIN, wrong month, and negative values", async () => {
  assert.equal((await action("invoice/save", { invoice })).code, 400);
  for (const change of [
    { gstin: "INVALID" },
    { date: "2026-11-15" },
    { taxable: -10 },
  ])
    assert.equal(
      (
        await action("invoice/save", {
          invoice: { ...invoice, number: "INVALID", ...change },
        })
      ).code,
      400,
    );
});
test("invoice editing invalidates the generated summary; filing locks documents", async () => {
  await action("gstr1/summary");
  const state = (await request("/portal")).activeCase.state.workspace;
  const row = state.periods[state.period].invoices.find(
    (i) => i.number === invoice.number,
  );
  const edited = await action("invoice/save", {
    invoice: { ...row, taxable: 20000 },
  });
  assert.equal(
    edited.state.workspace.periods["2026-10"].gstr1.summary,
    undefined,
  );
  assert.equal((await action("gstr1/file", sign)).code, 400);
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", { ...sign, otp: "bad" })).code, 400);
  assert.equal((await action("gstr1/file", sign)).code, 200);
  assert.equal((await action("invoice/delete", { id: row.id })).code, 400);
  assert.equal((await action("gstr1/file", sign)).code, 400);
});
test("period selection isolates records and persists across reads", async () => {
  const next = await action("period", { period: "2026-11" });
  assert.equal(next.state.workspace.periods["2026-11"].invoices.length, 0);
  const restored = await action("period", { period: "2026-10" });
  assert.equal(
    restored.state.workspace.periods["2026-10"].gstr1.status,
    "Filed",
  );
  assert.equal(
    (await request("/portal")).activeCase.state.workspace.period,
    "2026-10",
  );
});
test("creating a challan does not debit ledgers; payment credits cash exactly once", async () => {
  await reset();
  const original = (await request("/portal")).activeCase.state.workspace.cash;
  const created = await action("challan/create", { amounts: { igst: 500 } });
  assert.deepEqual(created.state.workspace.cash, original);
  const paid = await action("challan/pay", { id: created.challan.id });
  assert.equal(paid.state.workspace.cash.igst, original.igst + 500);
  assert.equal(
    (await action("challan/pay", { id: created.challan.id })).code,
    400,
  );
  assert.equal(
    (await action("challan/create", { amounts: { igst: -1 } })).code,
    400,
  );
});
test("ITC allocation never cross-uses CGST against SGST and respects cash-only liabilities", () => {
  const plan = allocation(
    { igst: 0, cgst: 0, sgst: 100, cess: 0 },
    { igst: 0, cgst: 500, sgst: 0, cess: 0 },
    { igst: 0, cgst: 0, sgst: 0, cess: 0 },
  );
  assert.equal(plan.creditUsed.cgst, 0);
  assert.equal(plan.shortfall.sgst, 100);
  const state = {
    taxpayer: { state: "Karnataka" },
    salesInvoices: [],
    purchaseInvoices: [],
    ledgers: { cash: 0, credit: 1000 },
  };
  const w = ensureWorkspace(state, "October 2026");
  const p = w.periods[w.period];
  p.gstr3b.tables["3.1d"] = { taxes: { igst: 100 } };
  assert.equal(paymentPlan(p, w).shortfall.igst, 100);
});
test("GSTR-3B table edits preserve RCM, ITC reversals and disclosures separately", async () => {
  await reset();
  const saved = await action("gstr3b/save", {
    table: "4",
    rows: {
      a5: { taxes: { cgst: 1000, sgst: 1000 } },
      b1: { taxes: { cgst: 100, sgst: 100 } },
      d1: { taxes: { cgst: 5000 } },
    },
  });
  assert.equal(saved.code, 200);
  assert.equal(saved.state.workspace.paymentPlan.recognizedItc.cgst, 900);
  const rcm = await action("gstr3b/save", {
    table: "3.1",
    rows: {
      a: { taxable: 1000, taxes: { cgst: 90, sgst: 90 } },
      d: { taxable: 1000, taxes: { igst: 180 } },
    },
  });
  assert.equal(rcm.state.workspace.paymentPlan.cashUsed.igst, 180);
});
test("GSTR-3B requires GSTR-1, cash top-up when needed and only offsets once", async () => {
  assert.equal((await action("gstr3b/offset")).code, 400);
  await action("gstr1/summary");
  await action("gstr1/file", sign);
  let offset = await action("gstr3b/offset");
  assert.equal(offset.code, 400);
  const shortfall = (await request("/portal")).activeCase.state.workspace
    .paymentPlan.shortfall;
  const c = await action("challan/create", { amounts: shortfall });
  await action("challan/pay", { id: c.challan.id });
  offset = await action("gstr3b/offset");
  assert.equal(offset.code, 200);
  const balances = offset.state.workspace.cash;
  assert.equal((await action("gstr3b/offset")).code, 400);
  const filed = await action("gstr3b/file", sign);
  assert.equal(filed.code, 200);
  assert.deepEqual(filed.state.workspace.cash, balances);
  assert.equal((await action("gstr3b/file", sign)).code, 400);
});
test("nil returns complete without payment; data prevents a false nil filing", async () => {
  await reset("nil-october");
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", { ...sign, nil: true })).code, 200);
  await action("gstr3b/save", { nil: true });
  assert.equal((await action("gstr3b/offset")).code, 200);
  assert.equal((await action("gstr3b/file", sign)).code, 200);
  await reset();
  assert.equal((await action("gstr3b/save", { nil: true })).code, 400);
});
test("JSON uploads report row errors, reject mismatched periods and keep valid rows", async () => {
  const upload = await action("upload", {
    name: "test.json",
    data: {
      fp: "102026",
      invoices: [
        { ...invoice, number: "UPLOAD-1" },
        { ...invoice, number: "UPLOAD-BAD", gstin: "BAD" },
      ],
    },
  });
  assert.equal(upload.upload.accepted, 1);
  assert.equal(upload.upload.errors.length, 1);
  assert.equal(
    (await action("upload", { data: { fp: "112026", invoices: [invoice] } }))
      .code,
    400,
  );
  assert.equal((await action("upload", { data: "{" })).code, 400);
});
test("registration verifies both OTPs, resumes TRN and requires all tabs", async () => {
  const partA = {
    type: "Taxpayer",
    state: "Karnataka",
    district: "Bengaluru",
    legalName: "Example Traders",
    pan: "ABCDE1234F",
    email: "example@example.com",
    mobile: "9876543210",
  };
  assert.equal((await action("registration/start", { partA })).code, 200);
  assert.equal(
    (
      await action("registration/verify", {
        mobileOtp: "bad",
        emailOtp: "654321",
      })
    ).code,
    400,
  );
  const verified = await action("registration/verify", {
    mobileOtp: "123456",
    emailOtp: "654321",
  });
  const trn = verified.state.workspace.registration.trn;
  assert.ok(trn);
  assert.equal(
    (await action("registration/resume", { trn, email: partA.email })).code,
    200,
  );
  assert.equal(
    (await action("registration/resume-verify", { otp: "123456" })).code,
    200,
  );
  assert.equal((await action("registration/submit", sign)).code, 400);
  const values = {
    business: {
      tradeName: "Example",
      constitution: "Proprietorship",
      reason: "Voluntary Basis",
      commencement: "2026-10-01",
    },
    promoters: { name: "Example", pan: partA.pan, designation: "Proprietor" },
    signatory: { name: "Example", email: partA.email, mobile: partA.mobile },
    representative: {},
    principal: {
      address: "1 Market Street",
      city: "Bengaluru",
      pincode: "560001",
      possession: "Own",
    },
    additional: {},
    goods: { hsn: "4802", description: "Paper" },
    state: {},
    aadhaar: {},
    verification: { signatory: "Example", place: "Bengaluru" },
  };
  for (const [tab, data] of Object.entries(values))
    assert.equal(
      (await action("registration/save", { tab, values: data })).code,
      200,
    );
  const submitted = await action("registration/submit", sign);
  assert.equal(submitted.code, 200);
  assert.equal(
    submitted.state.workspace.registration.stage,
    "Pending for Validation",
  );
  assert.equal(
    (
      await action("registration/save", {
        tab: "business",
        values: values.business,
      })
    ).code,
    400,
  );
});
test("documents validate input, prevent duplicates, update vehicles and cancel", async () => {
  await reset("interstate-dispatch");
  const current = (await request("/portal")).activeCase.state.workspace;
  const invoiceId = current.periods[current.period].invoices[0].id;
  const body = {
    kind: "eway",
    invoiceId,
    dispatch: "Chennai",
    destination: "Hyderabad",
    distance: 600,
    vehicle: "TN01AB1234",
  };
  const result = await action("documents/create", body);
  assert.equal(result.code, 200);
  assert.equal((await action("documents/create", body)).code, 400);
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id: result.document.id,
        action: "vehicle",
        vehicle: "TN02AB1234",
      })
    ).code,
    200,
  );
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id: result.document.id,
        action: "cancel",
        reason: "Order Cancelled",
      })
    ).code,
    200,
  );
  const irn = await action("documents/create", { kind: "einvoice", invoiceId });
  assert.equal(irn.document.irn.length, 64);
});
test("excess purchase credit carries forward and amendments replace originals", async () => {
  await reset("excess-purchase-october");
  const initial = (await request("/portal")).activeCase.state.workspace;
  assert.ok(
    totalHeads(initial.eligibleItc) > totalHeads(initial.summary.taxes),
  );
  const amended = {
    ...initial.periods[initial.period].invoices[0],
    section: "B2BA",
    number: "REV-001",
    originalNumber: "CWI/LOW-01",
    taxable: 2000,
  };
  const saved = await action("invoice/save", {
    invoice: { ...amended, id: undefined },
  });
  assert.equal(saved.code, 200);
  assert.equal(saved.state.workspace.summary.taxable, 2000);
});
function totalHeads(values) {
  return ["igst", "cgst", "sgst", "cess"].reduce(
    (n, h) => n + (values?.[h] || 0),
    0,
  );
}

test("later-period filings require the previous GSTR-3B and amendments contribute only the difference", async () => {
  await reset();
  await action("period", { period: "2026-11" });
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", sign)).code, 400);
  await action("period", { period: "2026-10" });
  await action("gstr1/summary");
  await action("gstr1/file", sign);
  await action("gstr3b/save");
  const plan = (await request("/portal")).activeCase.state.workspace
    .paymentPlan;
  if (totalHeads(plan.shortfall)) {
    const c = await action("challan/create", { amounts: plan.shortfall });
    await action("challan/pay", { id: c.challan.id });
  }
  assert.equal((await action("gstr3b/offset")).code, 200);
  assert.equal((await action("gstr3b/file", sign)).code, 200);
  await action("period", { period: "2026-11" });
  const amended = await action("invoice/save", {
    invoice: {
      ...invoice,
      section: "B2BA",
      number: "REV-BHS1021",
      date: "2026-10-14",
      originalNumber: "BHS/1021",
      originalPeriod: "2026-10",
      taxable: 19000,
    },
  });
  assert.equal(amended.code, 200);
  assert.equal(amended.state.workspace.summary.taxable, 250);
  assert.equal(totalHeads(amended.state.workspace.summary.taxes), 45);
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", sign)).code, 200);
});
