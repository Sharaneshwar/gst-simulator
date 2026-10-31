"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lookup, search, registrationValues } = require("../hsn-master");

test("official snapshot preserves leading zeros and has both goods and services", () => {
  assert.equal(lookup("0101").type, "Goods");
  assert.match(lookup("0101").description, /HORSES/);
  assert.equal(
    lookup("998313").description,
    "Information technology consulting and support services",
  );
  assert.equal(lookup("998313").type, "Services");
  assert.equal(
    lookup("30559"),
    null,
    "Malformed source digits must not become selectable codes",
  );
});
test("search supports exact/prefix codes, descriptions, type filtering and pages", () => {
  assert.equal(search({ q: "8450" }).results[0].code, "8450");
  assert.equal(search({ q: "01" }).results[0].code, "01");
  assert.ok(
    search({
      q: "cotton woven",
      type: "Goods",
      registration: true,
    }).results.some((r) => r.code === "5208"),
  );
  assert.ok(
    search({ q: "information technology", type: "Services" }).results.some(
      (r) => r.code === "998313",
    ),
  );
  assert.equal(search({ q: "998313", type: "Goods" }).total, 0);
  const first = search({ q: "01", registration: true, limit: 3 });
  const next = search({ q: "01", registration: true, limit: 3, offset: 3 });
  assert.ok(first.total >= 6);
  assert.equal(first.results.length, 3);
  assert.ok(
    first.results.every(
      (row) => row.code.startsWith("0") && row.code.length >= 4,
    ),
  );
  assert.ok(
    !next.results.some((row) =>
      first.results.some((previous) => previous.code === row.code),
    ),
  );
  assert.equal(search({ q: "co" }).total, 0);
  assert.equal(
    search({ q: "<script>absolutely-no-match-xxx</script>" }).total,
    0,
  );
  assert.throws(() => search({ q: ["8450"] }), /120/);
  assert.throws(() => search({ type: "unknown" }), /Goods or Services/);
  assert.throws(() => search({ limit: 5000 }), /page/);
});
test("registration resolves canonical code descriptions and rejects unknown/duplicate/wrong-kind codes", () => {
  const values = registrationValues({
    hsn: "998313",
    description: "user text",
  });
  assert.equal(values.description, lookup("998313").description);
  assert.equal(values.type, "Services");
  assert.throws(() => registrationValues({ hsn: "0000" }), /valid HSN/);
  assert.throws(() => registrationValues({ hsn: "01" }), /valid HSN/);
  assert.throws(
    () => registrationValues({ hsn: "998313", type: "Goods" }),
    /does not match/,
  );
  assert.throws(
    () => registrationValues({ records: [{ hsn: "8450" }, { hsn: "8450" }] }),
    /already/,
  );
});
test("registration limits each category separately to five entries", () => {
  const goods = ["4802", "8450", "8528", "8547", "8533"].map((hsn) => ({
    hsn,
  }));
  const services = ["995411", "995412", "995413", "995414", "995415"].map(
    (hsn) => ({ hsn }),
  );
  assert.equal(
    registrationValues({ records: [...goods, ...services] }).records.length,
    10,
  );
  assert.throws(
    () => registrationValues({ records: [...goods, { hsn: "8511" }] }),
    /at most five/,
  );
  assert.throws(
    () => registrationValues({ records: [...services, { hsn: "998313" }] }),
    /at most five/,
  );
  assert.throws(() => registrationValues({ records: [] }), /five goods/);
});

test("registration matches official four-digit goods headings and the directory is browsable without a code", () => {
  const goods = search({
    q: "",
    browse: true,
    registration: true,
    type: "Goods",
    limit: 20,
  });
  assert.equal(goods.results.length, 20);
  assert.ok(goods.total > 1000);
  assert.ok(
    goods.results.every((row) => row.code.length === 4 && row.type === "Goods"),
  );
  assert.equal(
    search({ q: "8450", registration: true, type: "Goods" }).results.length,
    1,
  );
  assert.throws(() => registrationValues({ hsn: "845011" }), /four-digit/);
  const services = search({
    q: "",
    browse: true,
    registration: true,
    type: "Services",
  });
  assert.ok(services.total > 600);
  assert.ok(services.results.every((row) => row.type === "Services"));
  assert.equal(
    search({ q: "c", browse: true, type: "Goods" }).total,
    0,
    "A short typed query must not silently become an unfiltered directory",
  );
});

test("return and document searches retain six/eight-digit item codes while excluding chapter-only codes", () => {
  const rows = search({ q: "8450", minDigits: 4 }).results;
  assert.ok(rows.some((row) => row.code === "845011"));
  assert.ok(rows.some((row) => row.code === "84501100"));
  assert.ok(
    search({ q: "01", minDigits: 4 }).results.every(
      (row) => row.code.length >= 4,
    ),
  );
  assert.throws(() => search({ minDigits: 3 }), /code length/);
});
