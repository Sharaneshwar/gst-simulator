import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeRateCell,
  invoiceRateRows,
  invoiceTaxContext,
  lineTaxes,
  rateTotals,
  resetTaxOverrides,
  itcNet,
} from "../src/return-entry.mjs";
import { ledgerStatement, ledgerCsv } from "../src/ledger-view.mjs";
import { GST_STATES, stateFromGstin } from "../src/gst-states.mjs";
const invoice = {
  section: "B2B",
  place: "Maharashtra",
  rate: 18,
  taxable: "",
  cess: "",
};
test("fixed rate grid combines multiple rates and preserves the paise split", () => {
  let draft = changeRateCell(invoice, "Maharashtra", 5, "taxable", "1000");
  draft = changeRateCell(draft, "Maharashtra", 18, "taxable", "2000");
  assert.deepEqual(rateTotals(draft, "Maharashtra"), {
    taxable: 3000,
    taxes: { igst: 0, cgst: 205, sgst: 205, cess: 0 },
  });
  draft = changeRateCell(draft, "Maharashtra", 18, "cess", "10");
  draft = changeRateCell(draft, "Maharashtra", 18, "taxable", "");
  assert.equal(draft.items.length, 1);
  assert.equal(rateTotals(draft, "Maharashtra").taxable, 1000);
  assert.equal(rateTotals(draft, "Maharashtra").taxes.cess, 0);
  const tiny = lineTaxes(
    { rate: 5, taxable: 0.2 },
    invoiceTaxContext(invoice, "Maharashtra"),
  );
  assert.equal(tiny.cgst + tiny.sgst, 0.01);
});
test("legacy single-rate records and duplicate rates from JSON remain editable without losing values", () => {
  const context = invoiceTaxContext(invoice, "Maharashtra");
  assert.equal(
    invoiceRateRows({ ...invoice, taxable: 100 }, context)[0].taxable,
    100,
  );
  const old = {
    ...invoice,
    items: [
      { rate: 18, taxable: 100, cess: 1 },
      { rate: 18, taxable: 200, cess: 2 },
    ],
  };
  const rows = invoiceRateRows(old, context);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taxable, 300);
  assert.equal(rows[0].cess, 3);
  const adjusted = invoiceRateRows(
    {
      ...invoice,
      items: [
        { rate: 18, taxable: 100, taxes: { cgst: "8.99", sgst: "8.99" } },
        { rate: 18, taxable: 100, taxes: { cgst: "9.01", sgst: "9.01" } },
      ],
    },
    context,
  );
  assert.equal(adjusted[0].taxes.cgst, 18);
});
test("manual amounts are retained until taxable value or tax context changes", () => {
  let draft = changeRateCell(invoice, "Maharashtra", 18, "taxable", "1000");
  draft = changeRateCell(draft, "Maharashtra", 18, "cgst", "89.99");
  assert.equal(rateTotals(draft, "Maharashtra").taxes.cgst, 89.99);
  draft = resetTaxOverrides({ ...draft, place: "Karnataka" });
  assert.deepEqual(rateTotals(draft, "Maharashtra").taxes, {
    igst: 180,
    cgst: 0,
    sgst: 0,
    cess: 0,
  });
});
test("SEZ, exports without payment and notified differential percentage select the right tax treatment", () => {
  const base = { ...invoice, taxable: 1000 };
  assert.equal(
    rateTotals({ ...base, supplyCategory: "SEZWP" }, "Maharashtra").taxes.igst,
    180,
  );
  assert.deepEqual(
    rateTotals({ ...base, supplyCategory: "SEZWOP", cess: 10 }, "Maharashtra")
      .taxes,
    { igst: 0, cgst: 0, sgst: 0, cess: 0 },
  );
  assert.equal(
    rateTotals({ ...base, differential: true }, "Maharashtra").taxes.cgst,
    58.5,
  );
  assert.equal(
    rateTotals(
      { ...base, section: "EXP", exportType: "Without payment of tax" },
      "Maharashtra",
    ).taxes.igst,
    0,
  );
});
test("net ITC subtracts reversals without adding disclosure amounts", () => {
  assert.equal(
    itcNet({
      a5: { taxes: { igst: 100 } },
      b1: { taxes: { igst: 10 } },
      b2: { taxes: { igst: 5 } },
      d1: { taxes: { igst: 200 } },
    }).igst,
    85,
  );
});
test("date-filtered ledger reconstructs opening and running balances from deposits and offsets", () => {
  const w = {
    cash: { cgst: 130 },
    credit: { cgst: 70 },
    ledger: [
      {
        id: "3",
        date: "2026-11-03",
        type: "Liability offset",
        debit: { cgst: 20 },
        creditDebit: { cgst: 30 },
      },
      {
        id: "2",
        date: "2026-11-02",
        type: "Cash deposit",
        credit: { cgst: 50 },
        reference: 'A,"B',
      },
      {
        id: "1",
        date: "2026-11-01",
        type: "ITC credited",
        credit: { cgst: 100 },
      },
    ],
  };
  const statement = ledgerStatement(w, "cash", "2026-11-02", "2026-11-03");
  assert.equal(statement.opening.cgst, 100);
  assert.equal(statement.rows[0].balance.cgst, 150);
  assert.equal(statement.closing.cgst, 130);
  const credit = ledgerStatement(w, "credit", "2026-11-01", "2026-11-03");
  assert.equal(credit.opening.cgst, 0);
  assert.equal(credit.closing.cgst, 70);
  assert.equal(credit.rows.length, 2);
  assert.match(ledgerCsv(statement), /"A,""B"/);
  assert.equal(
    ledgerStatement(w, "cash", "2026-11-04", "2026-11-05").closing.cgst,
    130,
  );
});
test("recipient prefixes agree with the backend's registration state master", async () => {
  const { default: access } = await import("../../backend/access-control.js");
  assert.deepEqual(GST_STATES, access.STATE_CODES);
  assert.equal(stateFromGstin("27ABCDE1234F1Z0"), "Maharashtra");
});

test("cash ledger keeps interest and tax balances in separate minor heads", () => {
  const w = {
    cash: { igst: 100 },
    cashCategories: { interest: { igst: 25 } },
    ledger: [
      {
        id: "deposit",
        date: "2026-11-02T10:00:00Z",
        type: "Cash deposit",
        credit: { igst: 100 },
        creditCategories: { tax: { igst: 100 }, interest: { igst: 25 } },
        reference: "CPIN",
      },
    ],
  };
  const tax = ledgerStatement(w, "cash", "2026-11-01", "2026-11-30");
  const interest = ledgerStatement(
    w,
    "cash",
    "2026-11-01",
    "2026-11-30",
    "interest",
  );
  assert.equal(tax.closing.igst, 100);
  assert.equal(interest.closing.igst, 25);
  assert.equal(interest.rows[0].creditAmounts.igst, 25);
  assert.equal(interest.opening.igst, 0);
});
