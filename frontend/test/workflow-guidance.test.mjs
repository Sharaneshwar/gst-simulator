import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { viewState } = require("../../backend/portal-engine.js");
let vite, context, returns, workflows, lib, passwords;
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
