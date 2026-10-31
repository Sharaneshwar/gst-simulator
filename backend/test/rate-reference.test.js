"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
test("rate guide preserves zero and fractional rates without confusing empty selections", async () => {
  const { rateInfo } = await import("../../frontend/src/rate-reference.mjs");
  assert.equal(rateInfo(0).rate, 0);
  assert.equal(rateInfo(""), null);
  assert.equal(rateInfo(undefined), null);
  assert.equal(rateInfo(0.1).cgst, 0.05);
  assert.equal(rateInfo(0.25).cgst, 0.125);
  assert.equal(rateInfo(1.5).sgst, 0.75);
  assert.equal(rateInfo(17), null);
});
test("rate guidance distinguishes historical dates, the 2025 change and housing valuation", async () => {
  const { rateInfo } = await import("../../frontend/src/rate-reference.mjs");
  assert.match(rateInfo(40, "2022-10-01").periodNote, /precedes/);
  assert.doesNotMatch(rateInfo(40, "2025-09-22").periodNote, /precedes/);
  assert.match(rateInfo(12, "2026-10-01").periodNote, /Period-sensitive/);
  assert.doesNotMatch(
    rateInfo(12, "2022-10-01").periodNote,
    /Period-sensitive/,
  );
  assert.match(rateInfo(1.5, "2022-07-17").periodNote, /not yet/);
  assert.match(rateInfo(1).detail, /Do not deduct land/);
  assert.match(rateInfo(7.5).detail, /construction taxable base/);
});

test("rate lookup works by familiar areas and percentage without matching incidental dates", async () => {
  const { findRates } = await import("../../frontend/src/rate-reference.mjs");
  assert.deepEqual(
    findRates("18").map((r) => r.rate),
    [18],
  );
  assert.deepEqual(
    findRates("housing").map((r) => r.rate),
    [1, 1.5, 5, 7.5],
  );
  assert.deepEqual(
    findRates("gold").map((r) => r.rate),
    [3],
  );
  assert.deepEqual(
    findRates("IT").map((r) => r.rate),
    [18],
  );
  assert.equal(findRates("").length, 13);
});
