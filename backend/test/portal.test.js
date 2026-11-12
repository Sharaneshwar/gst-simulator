"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "gst-portal-test-"));
process.env.NODE_ENV = "development";
process.env.GST_SEED_DEMO_USERS = "1";
process.env.GST_ENABLE_CASE_LIBRARY = "1";
if (!process.env.GST_TEST_POSTGRES)
  process.env.SQLITE_PATH = path.join(taskDir, "test.sqlite");
const { app, db, ready } = require("../server");
const { createOtpService } = require("../otp-service");
const delivered = [];
let otpTime = Date.now();
async function configureTestOtp() {
  app.locals.otpService = await createOtpService({
    db,
    secret: "isolated-test-key",
    now: () => otpTime,
    sendEmail: async (email) => {
      delivered.push(email);
    },
  });
}
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
  // Keep the HTTP status separate from machine-readable authentication error codes.
  return { ...(await response.json()), code: response.status };
}
async function action(route, body = {}, auth) {
  const purpose = {
    "gstr1/file": "gstr1-file",
    "gstr3b/file": "gstr3b-file",
    "registration/submit": "registration-submit",
  }[route];
  if (purpose && body.declaration && !body.challengeId) {
    otpTime += 60 * 60 * 1000;
    const email = "verification@example.com";
    const sent = await request(
      "/workspace/signing/send",
      { purpose, signatory: body.signatory, method: body.method, email },
      auth,
    );
    if (sent.code === 200)
      body = {
        ...body,
        email,
        challengeId: sent.otp.challengeId,
        otp: body.otp === "123456" ? delivered.at(-1).code : body.otp,
      };
  }
  if (route === "challan/pay" && !body.challengeId) {
    otpTime += 60 * 60 * 1000;
    const sent = await request(
      "/workspace/challan/otp",
      { id: body.id, bank: "State Bank of India", terms: true },
      auth,
    );
    if (sent.code === 200)
      body = {
        ...body,
        challengeId: sent.otp.challengeId,
        otp: delivered.at(-1).code,
      };
  }
  return request("/workspace/" + route, body, auth);
}
const sign = {
  declaration: true,
  signatory: "Student",
  method: "EVC",
  otp: "123456",
};
test("Excel preview is read-only, and reviewed import persists purchases atomically with duplicate protection", async () => {
  await reset();
  const ExcelJS = require("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Purchase Register");
  sheet.addRow([
    "Date",
    "Supplier",
    "Supplier Invoice No.",
    "GSTIN/UIN",
    "Purchase",
    "Gross Total",
    "IGST@28%",
  ]);
  sheet.addRow([
    new Date("2026-10-01T00:00:00Z"),
    "Practice Supplier",
    "XLSX/TEST1",
    "27ABCDE1234F1Z0",
    1000,
    1180,
    180,
  ]);
  const body = {
    name: "practice.xlsx",
    base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    period: "2026-10",
    target: "sales",
  };
  await action("ims/recompute");
  const before = await request("/portal");
  const inspected = await action("excel/preview", body);
  assert.equal(inspected.code, 200, inspected.message);
  assert.equal(inspected.state, undefined);
  assert.equal(inspected.preview.rows[0].target, "purchases");
  assert.equal(
    inspected.preview.rows[0].entry,
    undefined,
    "server validation objects are not client input",
  );
  assert.deepEqual(
    (await request("/portal")).activeCase.state,
    before.activeCase.state,
  );
  assert.equal(
    (
      await action("excel/import", {
        ...body,
        fingerprint: inspected.preview.fingerprint,
      })
    ).code,
    400,
    "warnings require review",
  );
  assert.equal(
    (
      await action("excel/import", {
        ...body,
        fingerprint: "changed",
        reviewed: true,
      })
    ).code,
    400,
  );
  const imported = await action("excel/import", {
    ...body,
    fingerprint: inspected.preview.fingerprint,
    reviewed: true,
  });
  assert.equal(imported.code, 200, imported.message);
  const saved = imported.state.workspace.periods["2026-10"].purchases.find(
    (p) => p.number === "XLSX/TEST1",
  );
  assert.equal(saved.taxes.igst, 180);
  assert.equal(saved.rate, 18);
  assert.equal(saved.importSource.row, 2);
  assert.equal(imported.statementRefresh.refreshed, true);
  assert.equal(imported.statementRefresh.reviewCount, 1);
  assert.match(imported.message, /require review and acceptance in IMS/);
  assert.equal(imported.state.workspace.gstr2bStale, false);
  assert.ok(
    imported.state.workspace.gstr2bRecords.some((row) => row.id === saved.id),
  );
  const beforeCredit = imported.state.workspace.eligibleItc.igst;
  const accepted = await action("ims/action", {
    ids: [saved.id],
    action: "Accepted",
  });
  assert.equal(accepted.code, 200, accepted.message);
  assert.equal(accepted.state.workspace.gstr2bStale, true);
  const refreshed = await action("ims/recompute");
  assert.equal(refreshed.state.workspace.gstr2bStale, false);
  assert.equal(refreshed.state.workspace.eligibleItc.igst, beforeCredit + 180);
  assert.equal(
    refreshed.state.workspace.draft3b["4"].taxes.igst,
    beforeCredit + 180,
  );
  const reread = await request("/portal");
  assert.ok(
    reread.activeCase.state.workspace.periods["2026-10"].purchases.some(
      (p) => p.id === saved.id,
    ),
  );
  assert.equal(
    (
      await action("excel/import", {
        ...body,
        fingerprint: inspected.preview.fingerprint,
        reviewed: true,
      })
    ).code,
    400,
  );
  // A later upload must refresh the existing snapshot again without duplicating prior ITC.
  sheet.getCell("C2").value = "XLSX/TEST2";
  const secondBody = {
    ...body,
    base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
  };
  const secondPreview = await action("excel/preview", secondBody);
  const secondImport = await action("excel/import", {
    ...secondBody,
    fingerprint: secondPreview.preview.fingerprint,
    reviewed: true,
  });
  assert.equal(secondImport.code, 200, secondImport.message);
  assert.equal(secondImport.state.workspace.gstr2bStale, false);
  const second = secondImport.state.workspace.periods["2026-10"].purchases.find(
    (row) => row.number === "XLSX/TEST2",
  );
  const secondAccepted = await action("ims/action", {
    ids: [second.id],
    action: "Accepted",
  });
  assert.equal(secondAccepted.state.workspace.gstr2bStale, true);
  const secondRefreshed = await action("ims/recompute");
  assert.equal(
    secondRefreshed.state.workspace.eligibleItc.igst,
    beforeCredit + 360,
  );
  assert.equal((await request("/workspace/excel/preview", body, "")).code, 401);
});
test("offline challans follow remitting-bank/UTR steps, minor heads stay separate and OTC has a period limit", async () => {
  await reset();
  const initial = (await request("/portal")).activeCase.state.workspace.cash;
  assert.equal(
    (
      await action("challan/create", {
        amounts: { igst: 100 },
        mode: "NEFT / RTGS",
      })
    ).code,
    400,
  );
  const c = await action("challan/create", {
    deposits: { tax: { igst: 100 }, interest: { igst: 25 }, fee: { cgst: 10 } },
    mode: "NEFT / RTGS",
    bank: "State Bank of India",
  });
  assert.equal(c.code, 200, c.message);
  assert.equal(c.challan.total, 135);
  assert.ok(new Date(c.challan.expiresAt) > new Date(c.challan.createdAt));
  const id = c.challan.id;
  assert.equal((await action("challan/check-status", { id })).code, 400);
  assert.equal(
    (
      await request("/workspace/challan/otp", {
        id,
        bank: "State Bank of India",
        terms: true,
      })
    ).code,
    400,
  );
  assert.equal(
    (await action("challan/link-utr", { id, utr: "bad" })).code,
    400,
  );
  const linked = await action("challan/link-utr", {
    id,
    utr: "BANK000000000000000001",
  });
  assert.equal(linked.challan.status, "Awaiting bank confirmation");
  assert.deepEqual(linked.state.workspace.cash, initial);
  const paid = await action("challan/check-status", { id });
  assert.equal(paid.challan.status, "Paid");
  assert.equal(paid.state.workspace.cash.igst, initial.igst + 100);
  assert.equal(paid.state.workspace.cashCategories.interest.igst, 25);
  assert.equal(paid.state.workspace.cashCategories.fee.cgst, 10);
  assert.equal((await action("challan/check-status", { id })).code, 400);
  assert.equal(
    (
      await action("challan/create", {
        amounts: { igst: 10001 },
        mode: "Over the Counter",
        bank: "State Bank of India",
        instrument: "Cash",
      })
    ).code,
    400,
  );
  const otc = await action("challan/create", {
    amounts: { cgst: 8000 },
    mode: "Over the Counter",
    bank: "State Bank of India",
    instrument: "Cash",
  });
  assert.equal(otc.code, 200);
  assert.equal(
    (
      await action("challan/create", {
        amounts: { igst: 3000 },
        mode: "Over the Counter",
        bank: "State Bank of India",
        instrument: "Cash",
      })
    ).code,
    400,
  );
  assert.equal(
    (await action("challan/check-status", { id: otc.challan.id })).challan
      .status,
    "Paid",
  );
});
test("quarter-end section edits update the original unfiled month's record without making a copy", async () => {
  await reset();
  await action("filing-frequency", { frequency: "QRMP" });
  const first = await action("invoice/save", {
    invoice: { ...invoice, number: "QTR/EDIT" },
  });
  assert.equal(first.code, 200, first.message);
  await action("period", { period: "2026-12" });
  const quarter = (await request("/portal")).activeCase.state.workspace;
  assert.ok(quarter.gstr1Invoices.some((i) => i.id === first.invoice.id));
  const edited = await action("invoice/save", {
    invoice: {
      ...first.invoice,
      taxable: 2000,
      items: undefined,
      taxes: undefined,
      invoiceValue: undefined,
    },
  });
  assert.equal(edited.code, 200, edited.message);
  assert.equal(
    edited.state.workspace.periods["2026-10"].invoices.find(
      (i) => i.id === first.invoice.id,
    ).taxable,
    2000,
  );
  assert.equal(
    edited.state.workspace.periods["2026-12"].invoices.some(
      (i) => i.id === first.invoice.id,
    ),
    false,
  );
  assert.equal(
    (await action("invoice/delete", { id: first.invoice.id })).code,
    200,
  );
  assert.equal(
    (await request("/portal")).activeCase.state.workspace.gstr1Invoices.some(
      (i) => i.id === first.invoice.id,
    ),
    false,
  );
});
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
  // Alternate fixture businesses belong to the instructor; students have one fixed business.
  if (slug !== "regular-october") token = instructorToken;
  await request(`/portal/cases/${slug}/activate`, {});
  const result = await request("/portal/reset", {});
  await action("registration/new");
  return result;
}
before(async () => {
  await ready;
  await configureTestOtp();
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
  await db.close();
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
test("all registration operations require login before changing drafts or sending OTPs", async () => {
  const before = await request("/portal");
  const emailCount = delivered.length;
  for (const endpoint of [
    "new",
    "start",
    "verify",
    "resume",
    "resume-verify",
    "save",
    "submit",
  ]) {
    for (const auth of ["", "invalid-session"]) {
      const result = await request(
        "/workspace/registration/" + endpoint,
        {},
        auth,
      );
      assert.equal(result.code, 401, endpoint);
    }
  }
  assert.equal(
    (await request("/portal/applications/open", { reference: "unknown" }, ""))
      .code,
    401,
  );
  assert.equal(delivered.length, emailCount);
  const after = await request("/portal");
  assert.deepEqual(
    after.activeCase.state.workspace.registration,
    before.activeCase.state.workspace.registration,
  );
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
    email: (await request("/auth/me")).user.email,
    mobile: "9876543210",
  };
  assert.equal((await action("registration/start", { partA })).code, 200);
  const sharedOtp = delivered.at(-1).code;
  assert.equal(
    (
      await action("registration/verify", {
        mobileOtp: "bad",
        emailOtp: sharedOtp,
      })
    ).code,
    400,
  );
  const verified = await action("registration/verify", {
    mobileOtp: sharedOtp,
    emailOtp: sharedOtp,
  });
  const trn = verified.state.workspace.registration.trn;
  assert.ok(trn);
  assert.equal(
    (await action("registration/resume", { trn, email: partA.email })).code,
    200,
  );
  assert.equal(
    (await action("registration/resume-verify", { otp: delivered.at(-1).code }))
      .code,
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
  // Reproduce the live drafts: all substantive sections saved, but the two
  // optional sections were skipped instead of explicitly confirmed as No.
  for (const [tab, data] of Object.entries(values).filter(
    ([tab]) => !["representative", "additional"].includes(tab),
  ))
    assert.equal(
      (await action("registration/save", { tab, values: data })).code,
      200,
    );
  const blocked = await action("signing/send", {
    purpose: "registration-submit",
    signatory: "Example",
    method: "EVC",
    email: partA.email,
  });
  assert.equal(blocked.code, 400);
  for (const [tab, data] of [
    ["representative", { appointed: "No" }],
    ["additional", { hasAdditional: "No" }],
  ]) {
    const saved = await action("registration/save", { tab, values: data });
    assert.equal(saved.code, 200, saved.message);
    assert.deepEqual(saved.state.workspace.registration.tabs.verification, {
      ...values.verification,
      signatoryId: partA.email,
    });
  }
  const submitted = await action("registration/submit", {
    ...sign,
    signatory: "Example",
  });
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
    const c = await action("challan/create", {
      deposits: {
        tax: plan.taxShortfall || plan.shortfall,
        ...plan.minorShortfall,
      },
    });
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

test("QRMP: historical periods, optional IFF, quarterly totals and post-filing locks", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  assert.equal(
    (await action("filing-frequency", { frequency: "QRMP" })).code,
    200,
  );
  assert.equal((await action("gstr3b/save")).code, 400);
  assert.equal(
    (
      await action("invoice/save", {
        invoice: {
          ...invoice,
          number: "OCT-1",
          date: "2022-10-02",
          taxable: 1000,
        },
      })
    ).code,
    200,
  );
  assert.equal(
    (
      await action("invoice/save", {
        invoice: {
          ...invoice,
          section: "B2CS",
          number: "CASH",
          date: "2022-10-02",
        },
      })
    ).code,
    400,
  );
  await action("purchases/save", {
    purchase: {
      number: "P-OCT",
      date: "2022-10-01",
      gstin: "29AABCL1234A1Z9",
      supplier: "Supplier",
      place: "Karnataka",
      taxable: 1000,
      rate: 18,
    },
  });
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", sign)).code, 200);
  const c = await action("challan/create", {
    amounts: { cgst: 100, sgst: 100 },
    reason: "Monthly payment for quarterly return",
  });
  assert.equal((await action("challan/pay", { id: c.challan.id })).code, 200);
  await action("period", { period: "2022-11" });
  await action("invoice/save", {
    invoice: { ...invoice, number: "NOV-1", date: "2022-11-02", taxable: 2000 },
  });
  await action("period", { period: "2022-12" });
  const saved = await action("invoice/save", {
    invoice: {
      ...invoice,
      section: "B2CS",
      number: "DEC-1",
      date: "2022-12-02",
      taxable: 3000,
    },
  });
  assert.equal(saved.state.workspace.summary.taxable, 5000);
  assert.equal(saved.state.workspace.outwardSummary.taxable, 6000);
  assert.equal(totalHeads(saved.state.workspace.eligibleItc), 180);
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", sign)).code, 200);
  await action("gstr3b/save");
  const plan = (await request("/portal")).activeCase.state.workspace
    .paymentPlan;
  if (totalHeads(plan.shortfall)) {
    const c = await action("challan/create", {
      deposits: {
        tax: plan.taxShortfall || plan.shortfall,
        ...plan.minorShortfall,
      },
    });
    await action("challan/pay", { id: c.challan.id });
  }
  assert.equal((await action("gstr3b/offset")).code, 200);
  assert.equal((await action("gstr3b/file", sign)).code, 200);
  assert.equal(
    (await action("filing-frequency", { frequency: "Monthly" })).code,
    400,
  );
  await action("period", { period: "2022-11" });
  assert.equal(
    (
      await action("invoice/save", {
        invoice: { ...invoice, number: "LATE", date: "2022-11-02" },
      })
    ).code,
    400,
  );
});

test("GSTR-1 utility upload includes notes, exports, nil, HSN, documents and multiple rates", async () => {
  await reset();
  await action("period", { period: "2022-12" });
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  const item = (txval, rt) => ({ itm_det: { txval, rt } });
  const file = {
    gstin,
    fp: "122022",
    b2b: [
      {
        ctin: "27AABCL1234A1Z9",
        inv: [
          {
            inum: "101",
            idt: "02-12-2022",
            pos: "27",
            val: 2460,
            itms: [item(1000, 18), item(1000, 28)],
          },
        ],
      },
    ],
    cdnr: [
      {
        ctin: "27AABCL1234A1Z9",
        nt: [
          {
            nt_num: "CN1",
            nt_dt: "02-12-2022",
            ntty: "C",
            pos: "27",
            nt_val: 118,
            itms: [item(100, 18)],
          },
        ],
      },
    ],
    b2cl: [
      {
        pos: "23",
        inv: [
          {
            inum: "B2CL1",
            idt: "02-12-2022",
            val: 354000,
            itms: [item(300000, 18)],
          },
        ],
      },
    ],
    cdnur: [
      {
        typ: "B2CL",
        nt_num: "URCN1",
        nt_dt: "02-12-2022",
        ntty: "C",
        pos: "23",
        nt_val: 118,
        itms: [item(100, 18)],
      },
    ],
    exp: [
      {
        exp_typ: "WPAY",
        inv: [
          {
            inum: "EXP1",
            idt: "02-12-2022",
            sbpcode: "INGRD6",
            sbnum: "165589",
            sbdt: "02-12-2022",
            val: 118000,
            itms: [item(100000, 18)],
          },
        ],
      },
    ],
    b2cs: [{ pos: "27", rt: 18, txval: 36000, sply_ty: "INTER" }],
    nil: { inv: [{ sply_ty: "INTRB2B", nil_amt: 140350 }] },
    hsn: {
      data: [
        {
          hsn_sc: "8528",
          uqc: "OTH",
          qty: 0,
          txval: 1000,
          rt: 18,
          camt: 90,
          samt: 90,
        },
      ],
    },
    doc_issue: {
      doc_det: [
        {
          doc_num: 1,
          docs: [{ from: "101", to: "124", totnum: 24, cancel: 0 }],
        },
      ],
    },
  };
  const result = await action("upload", {
    name: "Tally-GSTR1.json",
    data: file,
  });
  assert.equal(result.code, 200);
  assert.deepEqual(result.upload.errors, []);
  assert.equal(result.upload.accepted, 9);
  const rows = result.state.workspace.periods["2022-12"].invoices;
  assert.equal(totalHeads(rows.find((i) => i.number === "101").taxes), 460);
  assert.equal(
    rows.find((i) => i.number === "EXP1").shippingBillNumber,
    "165589",
  );
  assert.equal(rows.find((i) => i.section === "HSN").taxes.cgst, 90);
  assert.equal(
    (await action("upload", { data: { unknown_section: [{}] } })).code,
    400,
  );
  assert.equal(
    (
      await action("invoice/save", {
        invoice: {
          ...invoice,
          number: "NEGATIVE",
          date: "2022-12-02",
          items: [{ rate: 18, taxable: -1 }],
        },
      })
    ).code,
    400,
  );
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", sign)).code, 200);
});

test("GSTR-3B utility upload retains state rows, reversals, exemptions and is locked after filing", async () => {
  await reset();
  await action("period", { period: "2022-12" });
  const file = {
    sup_details: {
      osup_det: { txval: 10000, iamt: 1800 },
      osup_zero: { txval: 1000, iamt: 180 },
      osup_nil_exmp: { txval: 500 },
      isup_rev: { txval: 100, iamt: 18 },
      osup_nongst: { txval: 100 },
    },
    inter_sup: {
      unreg_details: [
        { pos: "23", txval: 275140, iamt: 77039.2 },
        { pos: "24", txval: 246200, iamt: 68936 },
      ],
    },
    itc_elg: {
      itc_avl: [{ ty: "OTH", iamt: 100 }],
      itc_rev: [{ ty: "OTH", iamt: 10 }],
    },
    inward_sup: { isup_details: [{ ty: "GST", inter: 25000, intra: 58250 }] },
  };
  const result = await action("gstr3b/upload", {
    data: JSON.stringify(file),
    name: "GSTR3B.json",
  });
  assert.equal(result.code, 200);
  const t = result.state.workspace.periods["2022-12"].gstr3b.tables;
  assert.equal(t["3.2"].states[0].place, "Madhya Pradesh");
  assert.equal(t["3.2"].states[1].place, "Gujarat");
  assert.equal(t["5"].rows.exempt.taxes.cgst, 58250);
  assert.equal(t["3.1d"].taxes.igst, 18);
  assert.equal(t["4b"].taxes.igst, 10);
  assert.equal(
    (
      await action("gstr3b/upload", {
        data: { tables: { 3.1: { a: { taxable: "not-a-number" } } } },
      })
    ).code,
    400,
  );
  await action("gstr1/summary");
  await action("gstr1/file", sign);
  const plan = (await request("/portal")).activeCase.state.workspace
    .paymentPlan;
  if (totalHeads(plan.shortfall)) {
    const c = await action("challan/create", {
      deposits: {
        tax: plan.taxShortfall || plan.shortfall,
        ...plan.minorShortfall,
      },
    });
    await action("challan/pay", { id: c.challan.id });
  }
  assert.equal((await action("gstr3b/offset")).code, 200);
  assert.equal((await action("gstr3b/file", sign)).code, 200);
  assert.equal((await action("gstr3b/upload", { data: file })).code, 400);
});

test("bank OTP prevents direct payment, wrong codes and replayed credits", async () => {
  await reset();
  const c = await action("challan/create", { amounts: { igst: 250 } }),
    initial = c.state.workspace.cash.igst;
  assert.equal(
    (await request("/workspace/challan/pay", { id: c.challan.id })).code,
    400,
  );
  otpTime += 3600000;
  const sent = await request("/workspace/challan/otp", {
    id: c.challan.id,
    bank: "State Bank of India",
    terms: true,
  });
  const body = {
    id: c.challan.id,
    challengeId: sent.otp.challengeId,
    otp: delivered.at(-1).code,
  };
  assert.equal(
    (await request("/workspace/challan/pay", { ...body, otp: "bad" })).code,
    400,
  );
  assert.equal(
    (await request("/portal")).activeCase.state.workspace.cash.igst,
    initial,
  );
  const paid = await request("/workspace/challan/pay", body);
  assert.equal(paid.code, 200);
  assert.equal(paid.state.workspace.cash.igst, initial + 250);
  assert.equal((await request("/workspace/challan/pay", body)).code, 400);
});

test("supplier data supports 2B inclusion and credit notes; duplicate batches do not partially save", async () => {
  await reset();
  await action("period", { period: "2022-11" });
  const row = {
    number: "P1",
    date: "2022-11-01",
    gstin: "27AABCL1234A1Z9",
    supplier: "Supplier",
    place: "Karnataka",
    taxable: 1000,
    rate: 18,
  };
  assert.equal(
    (
      await action("purchases/upload", {
        data: {
          purchases: [
            row,
            { ...row, number: "P2", includedIn2b: false },
            {
              ...row,
              number: "CN1",
              taxable: 100,
              documentType: "Credit Note",
            },
          ],
        },
      })
    ).code,
    200,
  );
  const w = (await request("/portal")).activeCase.state.workspace;
  assert.equal(totalHeads(w.eligibleItc), 162);
  assert.equal(w.periods[w.period].purchases.length, 3);
  assert.equal(
    (
      await action("purchases/upload", {
        data: { purchases: [{ ...row, number: "NEW" }, row] },
      })
    ).code,
    400,
  );
  assert.equal(
    (await request("/portal")).activeCase.state.workspace.periods[w.period]
      .purchases.length,
    3,
  );
});

async function documentLogin(kind) {
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  otpTime += 3600000;
  const sent = await action("documents/registration-otp", { kind, gstin });
  assert.equal(sent.code, 200);
  assert.equal(
    (
      await action("documents/register", {
        kind,
        password: "12345",
        otp: delivered.at(-1).code,
        challengeId: sent.otp.challengeId,
      })
    ).code,
    200,
  );
  const user = (await request("/portal")).user;
  let captcha = {};
  if (kind === "eway") {
    const issued = await action("documents/captcha", { kind });
    const svg = Buffer.from(
      issued.captcha.image.split(",")[1],
      "base64",
    ).toString();
    captcha = {
      captchaId: issued.captcha.id,
      captcha: svg.match(/letter-spacing="7">([^<]+)/)[1],
    };
  }
  assert.equal(
    (
      await action("documents/login", {
        kind,
        username: user.email,
        password: "wrong",
        ...captcha,
      })
    ).code,
    400,
  );
  assert.equal(
    (
      await action("documents/login", {
        kind,
        username: user.email,
        password: "12345",
        ...captcha,
      })
    ).code,
    200,
  );
}
function documentForm(gstin, number = "BE1000") {
  return {
    number,
    date: "2022-10-01",
    seller: {
      gstin,
      name: "Supplier",
      address: "Nasik",
      city: "Nasik",
      pincode: "422001",
      state: "Karnataka",
    },
    buyer: {
      gstin: "27ASHKT9687G1ZC",
      name: "Shakti Appliances",
      address: "Pune",
      city: "Pune",
      pincode: "411028",
      state: "Maharashtra",
    },
    place: "Maharashtra",
    mode: "Road",
    vehicle: "MH15BN1019",
    distance: 200,
    transportDocument: "63525",
    transportDate: "2022-10-01",
    items: [
      {
        name: "Washing Machine",
        hsn: "8450",
        quantity: 4,
        uqc: "NOS",
        unitPrice: 40000,
        rate: 18,
      },
      {
        name: "Smart TV",
        hsn: "8528",
        quantity: 2,
        uqc: "NOS",
        unitPrice: 30000,
        rate: 18,
      },
    ],
  };
}
test("document portals: OTP registration, login, multi-item generation, bulk uploads and cancellation", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin,
    form = documentForm(gstin);
  assert.equal(
    (await action("documents/create", { kind: "eway", form })).code,
    400,
  );
  await documentLogin("eway");
  const result = await action("documents/create", { kind: "eway", form });
  assert.equal(result.code, 200);
  assert.equal(result.document.items.length, 2);
  assert.equal(result.document.invoice.invoiceValue, 259600);
  assert.equal(result.document.transportDocument, "63525");
  const account = (await request("/portal")).activeCase.state.workspace
    .documentPortals.eway;
  assert.equal(account.passwordHash, undefined);
  assert.equal(account.salt, undefined);
  const bulk = await action("documents/bulk", {
    kind: "eway",
    data: {
      documents: [
        documentForm(gstin, "BE1001"),
        { ...form, number: "BAD", items: [] },
      ],
    },
  });
  assert.equal(bulk.upload.accepted, 1);
  assert.equal(bulk.upload.errors.length, 1);
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id: result.document.id,
        action: "cancel",
        reason: "Order Cancelled",
        remarks: "Cancelled by client",
      })
    ).code,
    200,
  );
  await documentLogin("einvoice");
  const irp = {
    DocDtls: { No: "BE1100", Dt: "01-11-2022", Typ: "INV" },
    SellerDtls: {
      Gstin: gstin,
      LglNm: "Supplier",
      Addr1: "Nasik",
      Loc: "Nasik",
      Pin: 422001,
      Stcd: "29",
    },
    BuyerDtls: {
      Gstin: "27ASHKT9687G1ZC",
      LglNm: "Buyer",
      Addr1: "Pune",
      Loc: "Pune",
      Pin: 411028,
      Stcd: "27",
      Pos: "27",
    },
    ItemList: [
      {
        PrdDesc: "Mobile",
        HsnCd: "8517",
        Qty: 4,
        Unit: "NOS",
        UnitPrice: 40000,
        AssAmt: 160000,
        GstRt: 18,
      },
    ],
  };
  const uploaded = await action("documents/bulk", {
    kind: "einvoice",
    data: JSON.stringify([irp]),
  });
  assert.equal(uploaded.code, 200);
  assert.equal(
    uploaded.upload.accepted,
    1,
    JSON.stringify(uploaded.upload.errors),
  );
  const doc = uploaded.state.workspace.documents.einvoice[0];
  assert.equal(doc.irn.length, 64);
  assert.equal(
    (
      await action("documents/update", {
        kind: "einvoice",
        id: doc.id,
        action: "cancel",
        reason: "Data Entry Mistake",
        remarks: "Wrong price",
      })
    ).code,
    200,
  );
  await action("documents/logout", { kind: "einvoice" });
  assert.equal(
    (
      await action("documents/bulk", {
        kind: "einvoice",
        data: { documents: [form] },
      })
    ).code,
    400,
  );
});

test("company registration retains directors, HSN records and attachments in a separate business", async () => {
  await reset();
  const original = (await request("/portal")).activeCase.state.taxpayer;
  const partA = {
    type: "Taxpayer",
    state: "Karnataka",
    district: "Bengaluru",
    legalName: "Example Private Limited",
    pan: "ABCDE1234F",
    email: (await request("/auth/me")).user.email,
    mobile: "9876543210",
  };
  otpTime += 3600000;
  await action("registration/start", { partA });
  let code = delivered.at(-1).code;
  const verified = await action("registration/verify", {
    mobileOtp: code,
    emailOtp: code,
  });
  const trn = verified.state.workspace.registration.trn;
  assert.equal(
    (await action("registration/save", { tab: "state", values: {} })).code,
    400,
    "TRN existence alone must not bypass resume verification",
  );
  await action("registration/resume", { trn, email: partA.email });
  await action("registration/resume-verify", { otp: delivered.at(-1).code });
  const attachment = { kind: "authorization", simulated: true };
  const directors = [
    {
      name: "Akash",
      pan: "AJOPN3378E",
      designation: "Director",
      din: "9047277",
      alsoSignatory: "Yes",
    },
    {
      name: "Vijay",
      pan: "AASGF9365C",
      designation: "Director",
      din: "9692584",
      alsoSignatory: "No",
    },
  ];
  const goods = ["8547", "8528", "8533", "8511", "8537"].map((hsn) => ({
    hsn,
    description: "Electronic goods",
  }));
  const values = {
    business: {
      tradeName: partA.legalName,
      constitution: "Private Limited Company",
      reason: "Voluntary Basis",
      commencement: "2022-04-01",
      cin: "U12345KA2022PTC123456",
    },
    promoters: { ...directors[0], records: directors },
    signatory: {
      name: "Akash",
      email: partA.email,
      mobile: partA.mobile,
      proofType: "Copy of resolution passed by BoD / Managing Committee",
      attachment,
    },
    representative: {},
    principal: {
      address: "Shiv Complex",
      city: "Bengaluru",
      pincode: "560001",
      latitude: "12.976600",
      longitude: "77.599300",
      possession: "Own",
      proofType: "Electricity Bill",
      attachment,
    },
    additional: {},
    goods: { ...goods[0], records: goods },
    state: {},
    aadhaar: { opted: "Yes", person: "Akash" },
    verification: { signatory: "Akash", place: "Bengaluru" },
  };
  for (const [tab, value] of Object.entries(values))
    assert.equal(
      (await action("registration/save", { tab, values: value })).code,
      200,
      tab,
    );
  const saved = (await request("/portal")).activeCase.state.workspace
    .registration;
  assert.equal(saved.tabs.promoters.records.length, 2);
  assert.equal(saved.tabs.goods.records.length, 5);
  assert.equal(saved.tabs.principal.latitude, "12.976600");
  assert.equal(saved.tabs.principal.longitude, "77.599300");
  assert.equal(
    (
      await action("registration/save", {
        tab: "principal",
        values: { ...values.principal, latitude: 100 },
      })
    ).code,
    400,
  );
  assert.equal(saved.tabs.signatory.attachment.simulated, true);
  assert.equal(
    saved.tabs.signatory.attachment.name,
    "Letter_of_Authorization.pdf",
  );
  assert.equal(saved.tabs.signatory.attachment.data, undefined);
  assert.equal(
    (
      await action("registration/save", {
        tab: "signatory",
        values: {
          ...values.signatory,
          attachment: {
            name: "bad.png",
            data:
              "data:image/png;base64," + Buffer.from("bad").toString("base64"),
          },
        },
      })
    ).code,
    400,
  );
  assert.equal(
    (
      await action("signing/send", {
        purpose: "registration-submit",
        ...sign,
        signatory: "Akash",
      })
    ).code,
    400,
    "companies require DSC",
  );
  assert.equal(
    (
      await action("registration/submit", {
        ...sign,
        signatory: "Akash",
        method: "DSC",
      })
    ).code,
    200,
  );
  const oldArn = (await request("/portal")).activeCase.state.workspace
    .registration.arn;
  const next = await action("registration/new");
  assert.equal(next.code, 200);
  assert.equal(next.state.workspace.registrationHistory[0].arn, oldArn);
  assert.equal(next.state.taxpayer.legalName, partA.legalName);
  assert.notEqual(next.state.taxpayer.gstin, original.gstin);
  assert.equal(
    next.state.workspace.periods[next.state.workspace.period].invoices.length,
    0,
  );
});

test("nil supply grid and 3B auto-draft preserve nil/exempt/non-GST categories and export taxes", async () => {
  await reset();
  await action("period", { period: "2022-12" });
  const nil = await action("nil/save", {
    rows: [
      {
        supplyType: "Intra-state",
        recipientType: "Registered",
        nilType: "Nil Rated",
        taxable: 140350,
      },
      {
        supplyType: "Inter-state",
        recipientType: "Unregistered",
        nilType: "Non-GST",
        taxable: 500,
      },
    ],
  });
  assert.equal(nil.code, 200);
  assert.equal(nil.state.workspace.draft3b["3.1"].rows.c.taxable, 140350);
  assert.equal(nil.state.workspace.draft3b["3.1"].rows.e.taxable, 500);
  const exp = await action("invoice/save", {
    invoice: {
      section: "EXP",
      number: "EXP-DRAFT",
      date: "2022-12-02",
      taxable: 100000,
      rate: 18,
      exportType: "With payment of tax",
      portCode: "INGRD6",
      shippingBillNumber: "165589",
      shippingBillDate: "2022-12-02",
    },
  });
  assert.equal(exp.code, 200);
  assert.equal(exp.state.workspace.draft3b["3.1"].rows.b.taxable, 100000);
  assert.equal(exp.state.workspace.draft3b["3.1"].rows.a.taxable, 0);
  const cn = await action("invoice/save", {
    invoice: {
      ...invoice,
      section: "CDNR",
      number: "CN-LARGE",
      date: "2022-12-02",
      taxable: 1000,
      noteType: "Credit Note",
    },
  });
  assert.equal(
    cn.code,
    200,
    "a negative net auto-draft must never corrupt the workspace",
  );
  assert.equal(cn.state.workspace.draft3b["3.1"].rows.a.taxable, -1000);
});

test("filing preferences are scoped to financial years and preserve other saved work", async () => {
  await reset();
  await action("invoice/save", { invoice });
  const original = (await request("/portal")).activeCase.state.workspace
    .periods["2026-10"];
  await action("period", { period: "2022-10" });
  assert.equal(
    (await action("filing-frequency", { frequency: "QRMP" })).code,
    200,
  );
  await action("period", { period: "2026-10" });
  const w = (await request("/portal")).activeCase.state.workspace;
  assert.equal(w.filingFrequency, "Monthly");
  assert.deepEqual(w.periods["2026-10"], original);
});

test("e-way bill utility billLists parser preserves transport and item values", () => {
  const { parseDocumentFile, documentRow } = require("../practice-workflows");
  const taxpayer = { gstin: "27BEASG8583P1ZG", state: "Maharashtra" };
  const utility = {
    billLists: [
      {
        docNo: "1000",
        docDate: "01/10/2022",
        fromGstin: taxpayer.gstin,
        fromTrdName: "Bharat Electronics",
        fromAddr1: "Nasik",
        fromPlace: "Nasik",
        fromPincode: 422001,
        fromStateCode: 27,
        toGstin: "27ASHKT9687G1ZC",
        toTrdName: "Shakti Appliances",
        toAddr1: "Pune",
        toPlace: "Pune",
        toPincode: 411028,
        toStateCode: 27,
        transMode: 1,
        transDistance: 200,
        vehicleNo: "MH15BN1019",
        transDocNo: "63525",
        transDocDate: "01/10/2022",
        itemList: [
          {
            productName: "Washing Machine",
            hsnCode: 8450,
            quantity: 4,
            qtyUnit: "NOS",
            taxableAmount: 160000,
            cgstRate: 9,
            sgstRate: 9,
          },
        ],
      },
    ],
  };
  const [form] = parseDocumentFile(utility, "eway");
  const doc = documentRow({ kind: "eway", form }, taxpayer, [], "2022-10-31");
  assert.equal(doc.invoice.date, "2022-10-01");
  assert.equal(doc.transportDate, "2022-10-01");
  assert.equal(doc.invoice.invoiceValue, 188800);
  assert.equal(doc.items[0].taxes.cgst, 14400);
});

test("e-way Part A completion starts validity once; expired vehicle updates and late cancellations fail", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  await action("documents/date", { date: "2022-10-10" });
  await documentLogin("eway");
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  const form = {
    ...documentForm(gstin, "PARTA-1"),
    mode: "",
    vehicle: "",
    transportDocument: "",
    partAOnly: true,
    transporterId: gstin,
  };
  const created = await action("documents/create", { kind: "eway", form });
  assert.equal(created.code, 200, created.error);
  assert.equal(created.document.status, "Part A");
  assert.equal(created.document.validUntil, null);
  const id = created.document.id;
  await action("documents/date", { date: "2022-10-11" });
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id,
        action: "vehicle",
        vehicle: "MH12AB1234",
        mode: "Road",
      })
    ).code,
    200,
  );
  let doc = (
    await request("/portal")
  ).activeCase.state.workspace.documents.eway.find((d) => d.id === id);
  const expiry = doc.validUntil;
  assert.equal(doc.status, "Active");
  assert.ok(expiry);
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id,
        action: "vehicle",
        vehicle: "MH12AB9999",
      })
    ).code,
    200,
  );
  doc = (
    await request("/portal")
  ).activeCase.state.workspace.documents.eway.find((d) => d.id === id);
  assert.equal(doc.validUntil, expiry);
  await action("documents/date", { date: "2022-10-14" });
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id,
        action: "vehicle",
        vehicle: "MH12AB1234",
      })
    ).code,
    400,
  );
  assert.equal(
    (
      await action("documents/update", {
        kind: "eway",
        id,
        action: "cancel",
        reason: "Duplicate",
        remarks: "Test",
      })
    ).code,
    400,
  );
});

test("HSN catalog API and registration persist official selections and enforce category limits", async () => {
  const directory = await request(
    "/masters/hsn?browse=1&registration=1&type=Goods",
    undefined,
    "",
  );
  assert.equal(directory.code, 200);
  assert.equal(directory.results.length, 20);
  assert.ok(directory.results.every((row) => row.code.length === 4));
  const publicResult = await request(
    "/masters/hsn?q=998313&type=Services&registration=1",
    undefined,
    "",
  );
  assert.equal(publicResult.code, 200);
  assert.equal(publicResult.results[0].code, "998313");
  assert.equal(
    (await request("/masters/hsn?q=8450&type=Invalid", undefined, "")).code,
    400,
  );
  await reset();
  otpTime += 3600000;
  const partA = {
    type: "Taxpayer",
    state: "Karnataka",
    district: "Bengaluru",
    legalName: "Catalog Test",
    pan: "ABCDE1234F",
    email: (await request("/auth/me")).user.email,
    mobile: "9876543210",
  };
  assert.equal((await action("registration/start", { partA })).code, 200);
  const code = delivered.at(-1).code;
  const verified = await action("registration/verify", {
    mobileOtp: code,
    emailOtp: code,
  });
  await action("registration/resume", {
    trn: verified.state.workspace.registration.trn,
    email: partA.email,
  });
  await action("registration/resume-verify", { otp: delivered.at(-1).code });
  const save = (rows) =>
    action("registration/save", {
      tab: "goods",
      values: { ...rows[0], records: rows },
    });
  assert.equal(
    (await save([{ hsn: "0000", description: "Unknown" }])).code,
    400,
  );
  assert.equal(
    (await save([{ hsn: "998313", description: "Service", type: "Goods" }]))
      .code,
    400,
  );
  const rows = [
    { hsn: "8450", description: "Machine" },
    { hsn: "998313", description: "IT" },
  ];
  assert.equal((await save(rows)).code, 200);
  const stored = (await request("/portal")).activeCase.state.workspace
    .registration.tabs.goods;
  assert.equal(stored.records[0].type, "Goods");
  assert.equal(stored.records[1].type, "Services");
  assert.equal(
    stored.records[1].description,
    "Information technology consulting and support services",
  );
  assert.equal((await save([rows[0], rows[0]])).code, 400);
  const tooMany = ["4802", "8450", "8528", "8547", "8533", "8511"].map(
    (hsn) => ({ hsn, description: "Test" }),
  );
  assert.equal((await save(tooMany)).code, 400);
  assert.deepEqual(
    (await request("/portal")).activeCase.state.workspace.registration.tabs
      .goods,
    stored,
    "Invalid saves must preserve the previous selections",
  );
});

test("Aadhaar person dropdown uses saved signatories and removed people require a new selection", async () => {
  await reset();
  otpTime += 3600000;
  const partA = {
    type: "Taxpayer",
    state: "Karnataka",
    district: "Bengaluru",
    legalName: "Signatory Test",
    pan: "ABCDE1234F",
    email: (await request("/auth/me")).user.email,
    mobile: "9876543210",
  };
  await action("registration/start", { partA });
  const otp = delivered.at(-1).code;
  const verified = await action("registration/verify", {
    mobileOtp: otp,
    emailOtp: otp,
  });
  await action("registration/resume", {
    trn: verified.state.workspace.registration.trn,
    email: partA.email,
  });
  await action("registration/resume-verify", { otp: delivered.at(-1).code });
  const records = [
    {
      name: "Anita",
      lastName: "Shah",
      email: "anita@example.com",
      mobile: "9876543210",
      primary: "Yes",
    },
    {
      name: "Ravi",
      lastName: "Patel",
      email: "ravi@example.com",
      mobile: "9876543211",
    },
  ];
  let saved = await action("registration/save", {
    tab: "signatory",
    values: { ...records[0], records },
  });
  assert.equal(saved.code, 200);
  assert.deepEqual(
    saved.state.workspace.registrationSignatories.map((p) => p.label),
    ["Anita Shah", "Ravi Patel"],
  );
  assert.equal(
    (
      await action("registration/save", {
        tab: "aadhaar",
        values: { opted: "Yes", person: "Not registered" },
      })
    ).code,
    400,
  );
  saved = await action("registration/save", {
    tab: "aadhaar",
    values: { opted: "Yes", person: "Anita Shah" },
  });
  assert.equal(saved.code, 200);
  assert.equal(
    saved.state.workspace.registration.tabs.aadhaar.person,
    "anita@example.com",
  );
  assert.equal(
    (
      await action("registration/save", {
        tab: "verification",
        values: { signatory: "Wrong Person", place: "Bengaluru" },
      })
    ).code,
    400,
  );
  assert.equal(
    (
      await action("registration/save", {
        tab: "verification",
        values: { signatory: "Ravi Patel", place: "Bengaluru" },
      })
    ).code,
    200,
  );
  saved = await action("registration/save", {
    tab: "signatory",
    values: records[1],
  });
  assert.equal(saved.code, 200);
  assert.equal(saved.state.workspace.registration.tabs.aadhaar.person, "");
  assert.ok(!saved.state.workspace.registration.savedTabs.includes("aadhaar"));
  assert.equal(
    (
      await action("registration/save", {
        tab: "aadhaar",
        values: { opted: "Yes", person: "ravi@example.com" },
      })
    ).code,
    200,
  );
  const verification = (await request("/portal")).activeCase.state.workspace
    .registration.tabs.verification;
  assert.equal(verification.signatoryId, "ravi@example.com");
  assert.equal(verification.signatory, "Ravi Patel");
  saved = await action("registration/save", {
    tab: "signatory",
    values: records[0],
  });
  assert.equal(
    saved.state.workspace.registration.tabs.verification.signatory,
    "",
  );
  assert.ok(
    !saved.state.workspace.registration.savedTabs.includes("verification"),
  );
});

test("e-way bill import creates real return records, preserves item taxes, rejects duplicate imports and respects filing locks", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  await documentLogin("eway");
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  const form = {
    ...documentForm(gstin, "IMP/001"),
    supplyType: "Outward",
    subType: "Supply",
    documentType: "Tax Invoice",
  };
  const generated = await action("documents/create", { kind: "eway", form });
  assert.equal(generated.code, 200, generated.message);
  const imported = await action("gstr1/import-ewb", {
    section: "B2B",
    ids: [generated.document.id],
  });
  assert.equal(imported.code, 200, imported.message);
  assert.equal(imported.accepted, 1);
  const row = imported.state.workspace.periods["2022-10"].invoices.find(
    (row) => row.number === "IMP/001",
  );
  assert.equal(row.source, "E-way bill");
  assert.equal(row.items.length, 2);
  assert.equal(row.taxes.igst, 39600);
  const again = await action("gstr1/import-ewb", {
    section: "B2B",
    ids: [generated.document.id],
  });
  assert.equal(again.accepted, 0);
  assert.match(again.errors[0].error, /already been imported/);
  const revised = await action("invoice/save", {
    invoice: { ...row, recipient: "Updated Buyer" },
  });
  assert.equal(revised.code, 200);
  assert.equal(revised.invoice.ewayBillNumber, generated.document.number);
  assert.equal(
    (
      await action("gstr1/import-ewb", {
        section: "B2B",
        ids: [generated.document.id],
      })
    ).accepted,
    0,
  );
  await action("gstr1/summary");
  assert.equal((await action("gstr1/file", sign)).code, 200);
  assert.equal(
    (
      await action("gstr1/import-ewb", {
        section: "B2B",
        ids: [generated.document.id],
      })
    ).code,
    400,
  );
});

test("B2C e-way bill imports consolidate multiple documents by POS and rate without duplicate tax", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  await documentLogin("eway");
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  const base = documentForm(gstin, "IMP/002");
  const form = {
    ...base,
    supplyType: "Outward",
    subType: "Supply",
    documentType: "Tax Invoice",
    buyer: { ...base.buyer, gstin: "URP" },
    items: [
      { ...base.items[0], quantity: 1, unitPrice: 1000, rate: 5 },
      { ...base.items[1], quantity: 1, unitPrice: 2000, rate: 18 },
    ],
  };
  const one = await action("documents/create", { kind: "eway", form });
  const two = await action("documents/create", {
    kind: "eway",
    form: { ...form, number: "IMP/003" },
  });
  assert.equal(one.code, 200, one.message);
  assert.equal(two.code, 200, two.message);
  const imported = await action("gstr1/import-ewb", {
    section: "B2CS",
    ids: [one.document.id, two.document.id],
  });
  assert.equal(imported.code, 200, imported.message);
  assert.deepEqual(imported.errors, []);
  const rows = imported.state.workspace.periods["2022-10"].invoices.filter(
    (row) => row.section === "B2CS",
  );
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((n, row) => n + row.taxable, 0),
    6000,
  );
  assert.equal(
    rows.reduce((n, row) => n + row.taxes.igst, 0),
    820,
  );
  assert.equal(rows[0].ewayBillNumbers.length, 2);
  const again = await action("gstr1/import-ewb", {
    section: "B2CS",
    ids: [one.document.id],
  });
  assert.equal(again.accepted, 0);
  assert.match(again.errors[0].error, /already been imported/);
});

test("invoice numbers are unique across return months and invoice tables in the same FY, while aggregate references can recur monthly", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  const original = { ...invoice, number: "FY/001", date: "2022-10-15" };
  assert.equal((await action("invoice/save", { invoice: original })).code, 200);
  const aggregate = {
    section: "B2CS",
    number: "B2CS-29-18",
    place: "Karnataka",
    taxable: 100,
    rate: 18,
  };
  assert.equal(
    (await action("invoice/save", { invoice: aggregate })).code,
    200,
  );
  await action("period", { period: "2022-11" });
  const duplicate = await action("invoice/save", {
    invoice: { ...original, date: "2022-11-15" },
  });
  assert.equal(duplicate.code, 400);
  assert.match(duplicate.message, /financial year/);
  assert.equal(
    (await action("invoice/save", { invoice: aggregate })).code,
    200,
  );
  await action("period", { period: "2023-10" });
  assert.equal(
    (
      await action("invoice/save", {
        invoice: { ...original, date: "2023-10-15" },
      })
    ).code,
    200,
  );
});

test("e-way validity extension persists history and updated transport without changing invoice taxes or return entries", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  await documentLogin("eway");
  await action("documents/date", { date: "2022-10-12", time: "10:30" });
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  const generated = await action("documents/create", {
    kind: "eway",
    form: documentForm(gstin, "EXT/1"),
  });
  assert.equal(generated.code, 200, generated.message);
  assert.equal(generated.document.issuedAt, "2022-10-12T10:30:00+05:30");
  const before = generated.document.invoice;
  assert.equal(
    (await action("documents/date", { date: "2022-10-13", time: "25:10" }))
      .code,
    400,
  );
  await action("documents/date", { date: "2022-10-13", time: "20:00" });
  const body = {
    kind: "eway",
    id: generated.document.id,
    action: "extend",
    reason: "Transshipment",
    remarks: "Vehicle breakdown",
    remainingDistance: 400,
    consignmentStatus: "In Movement",
    currentPlace: "Pune",
    currentPincode: "411001",
    currentState: "Maharashtra",
    mode: "Road",
    vehicle: "MH12AB9999",
  };
  const extended = await action("documents/update", body);
  assert.equal(extended.code, 200, extended.message);
  const reread = (await request("/portal")).activeCase.state.workspace;
  const doc = reread.documents.eway.find((row) => row.id === body.id);
  assert.deepEqual(doc.invoice, before);
  assert.equal(doc.vehicle, "MH12AB9999");
  assert.equal(doc.extensions.length, 1);
  assert.equal(
    doc.extensions[0].previousValidUntil,
    generated.document.validUntil,
  );
  assert.equal(doc.validUntil, "2022-10-15T18:29:59.999Z");
  assert.equal(
    (await action("documents/update", body)).code,
    400,
    "the new expiry is outside the extension window",
  );
  await action("documents/logout", { kind: "eway" });
  const loggedOut = await action("documents/update", {
    kind: "eway",
    id: body.id,
    action: "vehicle",
    vehicle: "MH12AB1111",
  });
  assert.equal(loggedOut.code, 400);
  assert.match(loggedOut.message, /Log in to this document portal/);
});

test("IRP synchronization, HSN replacement and the source workbook finish through authenticated HTTP routes", async () => {
  await reset();
  await action("period", { period: "2022-10" });
  await documentLogin("einvoice");
  await action("documents/date", { date: "2022-10-12" });
  await action("calendar/date", { date: "2022-10-12" });
  const gstin = (await request("/portal")).activeCase.state.taxpayer.gstin;
  const generated = await action("documents/create", {
    kind: "einvoice",
    form: documentForm(gstin, "IRP/HTTP1"),
  });
  assert.equal(generated.code, 200, generated.message);
  const early = await action("gstr1/sync-irn");
  assert.equal(
    early.state.workspace.periods["2022-10"].invoices.some(
      (row) => row.sourceDocumentId === generated.document.id,
    ),
    false,
  );
  await action("calendar/date", { date: "2022-10-14" });
  const synced = await action("gstr1/sync-irn");
  assert.equal(synced.code, 200, synced.message);
  assert.equal(
    synced.state.workspace.periods["2022-10"].invoices.filter(
      (row) => row.sourceDocumentId === generated.document.id,
    ).length,
    1,
  );
  assert.equal((await action("gstr1/import-hsn")).code, 400);
  const hsn = await action("gstr1/import-hsn", { confirm: true });
  assert.equal(hsn.code, 200, hsn.message);
  assert.ok(
    hsn.state.workspace.periods["2022-10"].invoices.some(
      (row) => row.section === "HSN",
    ),
  );
  const exported = await action("gstr1/export-irn");
  assert.equal(exported.code, 200, exported.message);
  const ExcelJS = require("exceljs"),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(exported.base64, "base64"));
  assert.equal(book.worksheets[0].getCell("A2").value, "IRP/HTTP1");
});
