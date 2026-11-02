"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateInvoice } = require("../portal-engine");
const { parseGstr1, validate3b } = require("../practice-workflows");
const home = "Maharashtra";
test("import ITC cannot be entered under the CGST or SGST cells disabled in the official form", () => {
  assert.throws(
    () => validate3b("4", { a1: { taxes: { cgst: 10 } } }),
    /Integrated Tax and Cess only/,
  );
  const valid = validate3b("4", {
    a1: { taxes: { igst: 100, cess: 10 } },
    a2: { taxes: { igst: 50 } },
  });
  assert.equal(valid.taxes.igst, 150);
  assert.equal(valid.taxes.cess, 10);
});
const invoice = {
  section: "B2B",
  number: "GRID/001",
  gstin: "27ABCDE1234F1Z0",
  place: home,
  date: "2026-10-12",
  rate: 18,
  taxable: 0,
  items: [
    { rate: 5, taxable: 1000, cess: 2 },
    { rate: 18, taxable: 2000, cess: 3 },
  ],
};
test("multiple rate rows total correctly, including cess, after a persisted JSON round trip", () => {
  const saved = validateInvoice(invoice, "2026-10", home);
  assert.equal(saved.taxable, 3000);
  assert.equal(saved.cess, 5);
  assert.equal(saved.invoiceValue, 3415);
  assert.deepEqual(saved.taxes, { igst: 0, cgst: 205, sgst: 205, cess: 5 });
  const reopened = validateInvoice(
    JSON.parse(JSON.stringify(saved)),
    "2026-10",
    home,
  );
  assert.deepEqual(reopened.items, saved.items);
  assert.deepEqual(reopened.taxes, saved.taxes);
});
test("manually adjusted portal tax amounts survive save while invalid tax heads are rejected", () => {
  const changed = {
    ...invoice,
    items: [
      { rate: 18, taxable: 1000, taxes: { cgst: 89.99, sgst: 89.99 }, cess: 1 },
    ],
  };
  const row = validateInvoice(changed, "2026-10", home);
  assert.deepEqual(row.taxes, { igst: 0, cgst: 89.99, sgst: 89.99, cess: 1 });
  assert.throws(
    () => validateInvoice({ ...changed, place: "Karnataka" }, "2026-10", home),
    /Integrated Tax/,
  );
  assert.throws(
    () =>
      validateInvoice(
        {
          ...changed,
          items: [{ rate: 18, taxable: 100, taxes: { cgst: -1 } }],
        },
        "2026-10",
        home,
      ),
    /non-negative/,
  );
});
test("SEZ and differential flags affect calculations and cannot evade applicable heads", () => {
  const row = validateInvoice(
    { ...invoice, supplyCategory: "SEZWP" },
    "2026-10",
    home,
  );
  assert.equal(row.taxes.igst, 410);
  assert.equal(row.taxes.cgst, 0);
  assert.deepEqual(
    validateInvoice({ ...invoice, supplyCategory: "SEZWOP" }, "2026-10", home)
      .taxes,
    { igst: 0, cgst: 0, sgst: 0, cess: 0 },
  );
  assert.equal(
    validateInvoice({ ...invoice, differential: true }, "2026-10", home).taxes
      .cgst,
    133.25,
  );
  assert.throws(
    () =>
      validateInvoice({ ...invoice, intraStateIgst: true }, "2026-10", home),
    /reverse-charge/,
  );
  assert.equal(
    validateInvoice(
      { ...invoice, intraStateIgst: true, reverseCharge: true },
      "2026-10",
      home,
    ).taxes.igst,
    410,
  );
});
test("B2C large classification uses the period-specific threshold and requires interstate supply", () => {
  const input = {
    ...invoice,
    section: "B2CL",
    place: "Karnataka",
    invoiceValue: 100000,
  };
  assert.throws(() => validateInvoice(input, "2026-10", home), /1,00,000/);
  assert.equal(
    validateInvoice({ ...input, invoiceValue: 100001 }, "2026-10", home)
      .invoiceValue,
    100001,
  );
  assert.throws(
    () =>
      validateInvoice(
        { ...input, place: home, invoiceValue: 300000 },
        "2026-10",
        home,
      ),
    /intra-State/,
  );
  assert.throws(
    () =>
      validateInvoice(
        { ...input, invoiceValue: 250000, date: "2024-07-12" },
        "2024-07",
        home,
      ),
    /2,50,000/,
  );
});
test("document identifiers use the official 16-character format", () => {
  for (const number of ["12345678901234567", "INV 1", "INV@1"])
    assert.throws(
      () => validateInvoice({ ...invoice, number }, "2026-10", home),
      /1 to 16/,
    );
});
test("offline invoice parsing distinguishes absent tax values from explicitly supplied amounts", () => {
  const data = {
    b2b: [
      {
        ctin: invoice.gstin,
        inv: [
          {
            inum: "JSON/1",
            idt: "12-10-2026",
            pos: "27",
            inv_typ: "R",
            itms: [
              { itm_det: { rt: 18, txval: 1000, camt: 89.99, samt: 89.99 } },
            ],
          },
        ],
      },
    ],
  };
  const parsed = parseGstr1(data, "2026-10")[0];
  assert.equal(validateInvoice(parsed, "2026-10", home).taxes.cgst, 89.99);
});
