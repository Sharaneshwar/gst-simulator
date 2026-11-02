"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../challan-rules");
test("challans expire fifteen days after creation, and expired or paid challans cannot settle", () => {
  const createdAt = new Date(Date.now() - 16 * 86400000).toISOString();
  const expiresAt = rules.expiry({ createdAt });
  assert.equal(new Date(expiresAt) - new Date(createdAt), 15 * 86400000);
  assert.throws(
    () => rules.unpaid({ createdAt, status: "Not Paid" }),
    /expired/,
  );
  assert.throws(
    () => rules.unpaid({ createdAt: new Date().toISOString(), status: "Paid" }),
    /already been paid/,
  );
});
test("deposit categories validate nonnegative amounts and do not mix tax with interest", () => {
  const deposits = rules.deposits({
    deposits: { tax: { igst: 100 }, interest: { igst: 20 }, fee: { cgst: 5 } },
  });
  assert.equal(rules.sum(deposits), 125);
  assert.equal(deposits.tax.igst, 100);
  const w = { cash: { igst: 100 } };
  rules.creditOtherHeads(w, { deposits });
  assert.equal(w.cash.igst, 100);
  assert.equal(w.cashCategories.interest.igst, 20);
  assert.throws(
    () => rules.deposits({ deposits: { tax: { igst: -10 } } }),
    /non-negative/,
  );
});
