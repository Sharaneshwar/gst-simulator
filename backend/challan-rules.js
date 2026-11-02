"use strict";
const HEADS = ["igst", "cgst", "sgst", "cess"];
const CATEGORIES = ["tax", "interest", "penalty", "fee", "others"];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fail = (message) => {
  const e = new Error(message);
  e.status = 400;
  throw e;
};
function deposits(body) {
  const input = body.deposits || { tax: body.amounts || {} };
  if (Object.keys(input).some((key) => !CATEGORIES.includes(key)))
    fail("Unknown deposit category.");
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      Object.fromEntries(
        HEADS.map((head) => {
          const amount = Number(input[category]?.[head] || 0);
          if (!Number.isFinite(amount) || amount < 0 || amount > 1e12)
            fail("Deposit amounts must be non-negative numbers.");
          return [head, round(amount)];
        }),
      ),
    ]),
  );
}
const sum = (input) =>
  round(
    Object.values(input).reduce(
      (n, row) =>
        n + Object.values(row).reduce((a, b) => a + Number(b || 0), 0),
      0,
    ),
  );
const expiry = (c) =>
  c.expiresAt ||
  new Date(new Date(c.createdAt).valueOf() + 15 * 86400000).toISOString();
function unpaid(c) {
  if (!c) fail("Challan not found.");
  if (c.status === "Paid") fail("This challan has already been paid.");
  if (Date.now() >= new Date(expiry(c)).valueOf())
    fail("This challan has expired. Generate a new challan.");
}
function creditOtherHeads(w, c) {
  w.cashCategories ||= {};
  for (const category of CATEGORIES.filter((key) => key !== "tax")) {
    w.cashCategories[category] ||= {};
    for (const head of HEADS)
      w.cashCategories[category][head] = round(
        Number(w.cashCategories[category][head] || 0) +
          Number(c.deposits?.[category]?.[head] || 0),
      );
  }
}
module.exports = {
  CATEGORIES,
  deposits,
  sum,
  expiry,
  unpaid,
  creditOtherHeads,
};
