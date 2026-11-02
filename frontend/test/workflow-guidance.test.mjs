import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { viewState } = require("../../backend/portal-engine.js");
let vite, context, returns, workflows, lib, passwords, grid;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  context = (await vite.ssrLoadModule("/src/portal-context.js")).PortalContext;
  returns = await vite.ssrLoadModule("/src/returns.jsx");
  workflows = await vite.ssrLoadModule("/src/workflows.jsx");
  lib = await vite.ssrLoadModule("/src/lib.jsx");
  passwords = await vite.ssrLoadModule("/src/password-dialog.jsx");
  grid = await vite.ssrLoadModule("/src/invoice-rate-grid.jsx");
});
after(async () => {
  await vite?.close();
});
function fixture() {
  const state = viewState(
    {
      taxpayer: {
        legalName: "Test Traders",
        state: "Maharashtra",
        gstin: "27ABCDE1234F1Z0",
      },
      salesInvoices: [],
      purchaseInvoices: [],
    },
    "October 2026",
  );
  const w = state.workspace;
  return {
    user: { email: "test@example.com" },
    active: { state },
    w,
    p: w.periods[w.period],
    go() {},
    mutate: async () => {},
    setError() {},
  };
}
function render(Component, ctx, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(Component, props),
    ),
  );
}
test("GSTR-1 explains how to enable filing before a summary exists", () => {
  const html = render(returns.Gstr1, fixture());
  assert.match(html, /Select GENERATE SUMMARY to enable/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*aria-describedby="gstr1-filing-requirement"/,
  );
});
test("GSTR-1 explains stale summaries and enables filing after regeneration", () => {
  const ctx = fixture();
  ctx.p.gstr1.summary = { taxes: {}, documents: 0, taxable: 0 };
  ctx.p.gstr1.revision = 2;
  ctx.p.gstr1.summaryRevision = 1;
  assert.match(render(returns.Gstr1, ctx), /Your summary is out of date/);
  ctx.p.gstr1.summaryRevision = 2;
  const html = render(returns.Gstr1, ctx);
  assert.doesNotMatch(html, /Your summary is out of date/);
  assert.match(html, /<button class="btn primary ">PROCEED TO FILE \/ SUMMARY/);
});
test("GSTR-3B explains saving before payment and enables the action after saving", () => {
  const ctx = fixture();
  const html = render(returns.Gstr3b, ctx);
  assert.match(html, /Select SAVE GSTR-3B to enable PROCEED TO PAYMENT/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*aria-describedby="gstr3b-payment-requirement"/,
  );
  ctx.p.gstr3b.saved = true;
  assert.doesNotMatch(
    render(returns.Gstr3b, ctx),
    /id="gstr3b-payment-requirement"/,
  );
});
test("offline uploads explain both the missing file and filed/offset locks", () => {
  const ctx = fixture();
  assert.match(
    render(workflows.OfflineReturn, ctx),
    /Select a JSON file to enable UPLOAD/,
  );
  ctx.p.gstr1.status = "Filed";
  assert.match(
    render(workflows.OfflineReturn, ctx),
    /GSTR-1 is locked because it has been filed/,
  );
  ctx.p.gstr3b.status = "Offset";
  assert.match(
    render(workflows.OfflineReturn, ctx, { type: "GSTR-3B" }),
    /GSTR-3B is locked because it has been offset/,
  );
});
test("signing explains the prerequisites for requesting an OTP", () => {
  const html = render(lib.Signing, fixture(), {
    title: "File return",
    purpose: "gstr1-file",
    onClose() {},
    onSubmit() {},
  });
  assert.match(html, /Select the declaration and authorized signatory/);
  assert.match(
    html,
    /<button[^>]*aria-describedby="signing-requirement"[^>]*disabled=""/,
  );
});
test("dialog errors are focusable and exposed as alerts", () => {
  const ctx = fixture();
  ctx.error = "Complete the mandatory fields.";
  const html = render(lib.Modal, ctx, { title: "Edit details", onClose() {} });
  assert.match(
    html,
    /<div class="modal-error" role="alert" tabindex="-1">Complete the mandatory fields/,
  );
});

test("own password changes request current password and matching new credentials", () => {
  const ctx = fixture();
  ctx.user.id = "student-one";
  const html = render(passwords.PasswordDialog, ctx, {
    onClose() {},
    onSaved() {},
  });
  assert.match(html, /Current Password/);
  assert.match(html, /Confirm New Password/);
  assert.match(html, /minLength="8"/i);
  assert.match(html, /CHANGE PASSWORD/);
});
test("instructor reset dialog identifies the student and explains session/data effects", () => {
  const ctx = fixture();
  ctx.user.id = "teacher";
  const html = render(passwords.PasswordDialog, ctx, {
    target: { id: "student-one", email: "student@example.com" },
    onClose() {},
    onSaved() {},
  });
  assert.doesNotMatch(html, /Current Password/);
  assert.match(html, /student@example.com/);
  assert.match(html, /saved work will stay intact/);
  assert.match(html, /RESET PASSWORD/);
});

test("invoice entry exposes all fixed rate rows instead of a rate selector, with the applicable heads", () => {
  const ctx = fixture();
  const invoice = {
    section: "B2B",
    place: "Maharashtra",
    items: [{ rate: 18, taxable: 1000 }],
  };
  const html = render(grid.InvoiceRateGrid, ctx, {
    invoice,
    homeState: "Maharashtra",
    onChange() {},
  });
  for (const rate of [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40])
    assert.ok(html.includes(`aria-label="${rate}% Taxable value"`));
  assert.match(html, /Central tax/);
  assert.match(html, /State\/UT tax/);
  assert.doesNotMatch(html, /role="combobox"/);
  const interstate = render(grid.InvoiceRateGrid, ctx, {
    invoice: { ...invoice, place: "Karnataka" },
    homeState: "Maharashtra",
    onChange() {},
  });
  assert.match(interstate, /Integrated tax/);
  assert.doesNotMatch(interstate, /Central tax/);
});
test("B2B starts with recipient counts and HSN uses separate B2B and B2C tabs", () => {
  const ctx = fixture();
  ctx.p.invoices.push({
    id: "invoice",
    number: "I1",
    section: "B2B",
    gstin: "27ABCDE1234F1Z0",
    recipient: "Test Buyer",
    invoiceValue: 1180,
    taxable: 1000,
    taxes: {},
  });
  const html = render(returns.Gstr1Section, ctx, { section: "B2B" });
  assert.match(html, /Recipient wise count/);
  assert.match(html, /Test Buyer/);
  assert.match(html, /IMPORT EWB DATA/);
  const hsn = render(returns.Gstr1Section, ctx, { section: "HSN" });
  assert.match(hsn, /B2B Supplies/);
  assert.match(hsn, /B2C Supplies/);
});
test("GSTR-3B table editing is a page with calculated net ITC, not a modal", () => {
  const ctx = fixture();
  ctx.p.gstr3b.tables["4"] = {
    rows: { a5: { taxes: { igst: 100 } }, b1: { taxes: { igst: 10 } } },
  };
  const html = render(returns.Gstr3bTableEditor, ctx, {
    table: "4",
    onClose() {},
  });
  assert.match(html, /Net ITC Available/);
  assert.match(html, /90\.00/);
  assert.doesNotMatch(html, /<dialog/);
});

test("summary, table and challan views can be reached through their own routes", () => {
  const ctx = fixture();
  ctx.p.gstr1.summary = { taxes: {}, documents: 0, taxable: 0 };
  ctx.p.gstr1.summaryRevision = ctx.p.gstr1.revision;
  assert.match(
    render(returns.Gstr1, ctx, { summaryView: true }),
    /FILE STATEMENT/,
  );
  assert.match(
    render(returns.Gstr3b, ctx, { tableRoute: "4" }),
    /Net ITC Available/,
  );
  assert.match(
    render(returns.Challans, ctx, { viewRoute: "create" }),
    /GENERATE CHALLAN/,
  );
  assert.match(
    render(returns.Challans, ctx, { viewRoute: "create" }),
    /type="radio"/,
  );
  ctx.p.gstr3b.status = "Filed";
  assert.doesNotMatch(
    render(returns.Gstr3b, ctx, { tableRoute: "4" }),
    /Net ITC Available/,
  );
});

test("proof uploads offer choose/upload sample buttons without real file inputs", async () => {
  const { PracticeUploads } = await vite.ssrLoadModule(
    "/src/practice-upload.jsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: fixture() },
      React.createElement(PracticeUploads, {
        tab: "signatory",
        values: {
          attachments: {
            photograph: { name: "Photograph.jpg", simulated: true },
          },
        },
        onChange() {},
      }),
    ),
  );
  assert.match(html, /Choose File/);
  assert.match(html, /UPLOAD/);
  assert.match(html, /Photograph.jpg/);
  assert.match(html, /File uploaded successfully/);
  assert.doesNotMatch(html, /type="file"|data:application|readAsDataURL/);
  assert.match(html, /Proof of Appointment/);
});
test("accounting uploads retain a real Excel file selector and a preview step", async () => {
  const { ExcelImport } = await vite.ssrLoadModule("/src/excel-import.jsx");
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: fixture() },
      React.createElement(ExcelImport, { target: "purchases" }),
    ),
  );
  assert.match(html, /type="file"/);
  assert.match(html, /\.xlsx/);
  assert.match(html, /PREVIEW EXCEL/);
  assert.match(html, /Purchases appear in Supplier Return Data/);
});

test("challan creation exposes the official deposit matrix and distinct payment modes", () => {
  const ctx = fixture();
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(returns.Challans, { viewRoute: "create" }),
    ),
  );
  for (const text of [
    "Details of Deposit",
    "Interest",
    "Penalty",
    "Others",
    "NEFT / RTGS",
    "Over the Counter",
  ])
    assert.ok(html.includes(text), text);
});
test("NEFT challan shows mandate and UTR linking rather than the online OTP flow", () => {
  const ctx = fixture();
  ctx.w.challans = [
    {
      id: "neft",
      cpin: "12345678901234",
      mode: "NEFT / RTGS",
      bank: "State Bank of India",
      status: "Not Paid",
      amounts: { igst: 100 },
      total: 100,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(returns.Challans, { viewRoute: "neft" }),
    ),
  );
  assert.match(html, /NEFT \/ RTGS Mandate/);
  assert.match(html, /LINK UTR/);
  assert.match(html, /CHECK PAYMENT STATUS/);
  assert.doesNotMatch(html, /VERIFY OTP &amp; PAY|Email Address for OTP/);
});

test("the four e-commerce sections are separate and the Table 14 disclosure is labelled outside liability", async () => {
  const advanced = await vite.ssrLoadModule("/src/advanced-pages.jsx");
  const ctx = fixture();
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(advanced.Ecommerce, { section: "ECO" }),
    ),
  );
  assert.match(html, /14 — Supplies made through ECO/);
  assert.match(html, /Liable to collect tax u\/s 52/);
  assert.match(html, /Liable to pay tax u\/s 9\(5\)/);
  assert.match(html, /do not add to the supplier/);
  const operator = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(advanced.Ecommerce, { section: "ECO95" }),
    ),
  );
  for (const text of [
    "Registered to Registered",
    "Registered to Unregistered",
    "Unregistered to Registered",
    "Unregistered to Unregistered",
  ])
    assert.ok(operator.includes(text));
  assert.ok(
    lib.SECTIONS.some(([code, number]) => code === "ECOA" && number === "14A"),
  );
  assert.ok(
    lib.SECTIONS.some(
      ([code, number]) => code === "ECO95A" && number === "15A",
    ),
  );
});
test("IMS exposes review actions, stale-statement guidance and the recomputation step", async () => {
  const advanced = await vite.ssrLoadModule("/src/advanced-pages.jsx");
  const ctx = fixture();
  ctx.w.gstr2bStale = true;
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(advanced.IMS),
    ),
  );
  for (const text of [
    "Invoice Management System",
    "ACCEPT",
    "REJECT",
    "PENDING",
    "RECOMPUTE GSTR-2B",
    "not yet reflected",
  ])
    assert.ok(html.includes(text), text);
});
test("PMT-09 previews cash balances separately and offers verified filing and filed receipts", async () => {
  const advanced = await vite.ssrLoadModule("/src/advanced-pages.jsx");
  const ctx = fixture();
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(advanced.CashTransfer),
    ),
  );
  for (const text of [
    "GST PMT-09",
    "Available for Transfer",
    "Preview of Updated Balance",
    "PROCEED TO FILE",
    "Filed GST PMT-09",
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Electronic Credit Ledger/);
});
test("My Masters has editable product/party tabs and import/export controls", async () => {
  const advanced = await vite.ssrLoadModule("/src/advanced-pages.jsx");
  const ctx = fixture();
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(advanced.Masters),
    ),
  );
  for (const text of [
    "Product Master",
    "Supplier / Recipient Master",
    "DOWNLOAD MY MASTERS",
    "UPLOAD MY MASTERS",
    "ADD RECORD",
  ])
    assert.ok(html.includes(text), text);
});
test("queued return processing and error records have dedicated tabs", async () => {
  const advanced = await vite.ssrLoadModule("/src/advanced-pages.jsx");
  const ctx = fixture();
  ctx.p.processingJobs = [
    {
      id: "job",
      status: "Processing",
      rows: [{ section: "B2B", number: "Q/1" }],
      errors: [],
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(advanced.ProcessingRecords, { section: "B2B" }),
    ),
  );
  assert.match(html, /Processing Records \(1\)/);
  assert.match(html, /Errored Records \(0\)/);
  assert.match(html, /Processed Records/);
});
test("interest table has a recomputation action and invoice lists expose column controls", () => {
  const ctx = fixture();
  const interest = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(returns.Gstr3bTableEditor, {
        table: "5.1",
        onClose() {},
      }),
    ),
  );
  assert.match(interest, /RE-COMPUTE INTEREST/);
  const invoices = renderToStaticMarkup(
    React.createElement(
      context.Provider,
      { value: ctx },
      React.createElement(returns.Gstr1Section, { section: "B2CS" }),
    ),
  );
  assert.match(invoices, /Display\/Hide Columns/);
});
