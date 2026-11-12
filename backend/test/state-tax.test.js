"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { practiceGstin } = require("../registration-flow");
const { STATE_CODES } = require("../access-control");
const { purchaseRow, draft3b } = require("../practice-workflows");
const { validateInvoice, eligibleCredit } = require("../portal-engine");
const home = "Maharashtra",
  period = "2026-10";
const input = {
  supplier: "Test Supplier",
  gstin: practiceGstin(home, "ABCDE1234F"),
  number: "POS-001",
  date: "2026-10-15",
  rate: 18,
  taxable: 1000,
};
test("all supported registrations use the selected state code in their GSTIN", () => {
  for (const [code, name] of Object.entries(STATE_CODES))
    assert.equal(practiceGstin(name, "ABCDE1234F").slice(0, 2), code);
});
test("outward supplies compare supplier state with place of supply", () => {
  for (const state of ["Maharashtra", "Karnataka", "Tamil Nadu"]) {
    const invoice = { ...input, section: "B2B", place: state };
    const taxes = validateInvoice(invoice, period, home).taxes;
    assert.deepEqual(
      taxes,
      state === home
        ? { igst: 0, cgst: 90, sgst: 90, cess: 0 }
        : { igst: 180, cgst: 0, sgst: 0, cess: 0 },
    );
  }
});
test("purchase tax follows the supplier and entered place of supply, including numeric state codes", () => {
  assert.deepEqual(purchaseRow({ ...input, place: home }, period, home).taxes, {
    igst: 0,
    cgst: 90,
    sgst: 90,
    cess: 0,
  });
  assert.deepEqual(
    purchaseRow({ ...input, place: "Karnataka" }, period, home).taxes,
    { igst: 180, cgst: 0, sgst: 0, cess: 0 },
  );
  assert.deepEqual(purchaseRow({ ...input, place: "29" }, period, home).taxes, {
    igst: 180,
    cgst: 0,
    sgst: 0,
    cess: 0,
  });
  const other = practiceGstin("Karnataka", "ABCDE1234F");
  assert.deepEqual(
    purchaseRow({ ...input, gstin: other, place: home }, period, home).taxes,
    { igst: 180, cgst: 0, sgst: 0, cess: 0 },
  );
  const outside = purchaseRow(
    { ...input, gstin: other, place: "Karnataka" },
    period,
    home,
  );
  assert.deepEqual(outside.taxes, { igst: 0, cgst: 90, sgst: 90, cess: 0 });
  assert.equal(outside.match, "Ineligible");
  assert.match(outside.itcReason, /recipient is registered in another state/);
  assert.deepEqual(eligibleCredit({ purchases: [outside] }), {
    igst: 0,
    cgst: 0,
    sgst: 0,
    cess: 0,
  });
});
test("GSTR-3B exempt inward supplies use supplier/place-of-supply classification too", () => {
  const outward = purchaseRow(
    { ...input, nature: "Exempt", rate: 0, place: "Karnataka" },
    period,
    home,
  );
  const same = purchaseRow(
    { ...input, nature: "Exempt", rate: 0, place: home },
    period,
    home,
  );
  const tables = draft3b(
    { invoices: [], purchases: [outward, same], gstr3b: { tables: {} } },
    home,
  );
  assert.equal(tables["5"].rows.exempt.taxes.igst, 1000);
  assert.equal(tables["5"].rows.exempt.taxes.cgst, 1000);
});

test("supplier JSON cannot silently turn missing tax data into zero or accept incompatible tax heads", () => {
  assert.throws(
    () => purchaseRow({ ...input, rate: undefined }, period, home),
    /GST rate or explicit tax amounts/,
  );
  assert.throws(
    () =>
      purchaseRow(
        { ...input, place: home, taxes: { igst: 180 } },
        period,
        home,
      ),
    /intra-State purchases/,
  );
  assert.throws(
    () =>
      purchaseRow(
        { ...input, place: "Karnataka", taxes: { cgst: 90, sgst: 90 } },
        period,
        home,
      ),
    /inter-State purchases/,
  );
  assert.equal(
    purchaseRow(
      { ...input, rate: undefined, place: "Karnataka", taxes: { igst: 180 } },
      period,
      home,
    ).taxes.igst,
    180,
  );
});
