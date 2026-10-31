"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const eway = require("../eway-rules");
const { documentRow, parseGstr3b } = require("../practice-workflows");
const taxpayer = { gstin: "27ABCDE1234F1Z5", state: "Maharashtra" };
function form() {
  return {
    number: "TEST/2026-1",
    date: "2026-10-01",
    supplyType: "Outward",
    subType: "Supply",
    documentType: "Tax Invoice",
    seller: {
      gstin: taxpayer.gstin,
      name: "Test seller",
      address: "Mumbai",
      pincode: "400001",
      state: "Maharashtra",
    },
    buyer: {
      gstin: "29ABCDE1234F1Z5",
      name: "Test buyer",
      address: "Bengaluru",
      pincode: "560001",
      state: "Karnataka",
    },
    place: "Karnataka",
    mode: "Road",
    vehicle: "MH12AB1234",
    distance: 215,
    items: [
      {
        name: "Machine",
        hsn: "8450",
        uqc: "NOS",
        quantity: 2,
        unitPrice: 1000,
        rate: 18,
      },
    ],
  };
}
const create = (f) =>
  documentRow({ kind: "eway", form: f }, taxpayer, [], "2026-10-24");
test("official EWB date, supply/document, distance, units and transport validations", () => {
  for (const [change, pattern] of [
    [{ number: "ABCDEFGHIJKLMNOPQ" }, /16/],
    [{ date: "2026-10-25" }, /later/],
    [{ date: "2025-01-01" }, /180/],
    [{ subType: "Job Work" }, /Document type/],
    [{ distance: 4001 }, /4,000/],
    [{ mode: "Air", vehicle: "" }, /transport document/],
    [{ mode: "Rail", transportDocument: "12345" }, /start with/],
    [{ transportDate: "2026-02-30" }, /valid transport/],
  ])
    assert.throws(() => create({ ...form(), ...change }), pattern);
  const f = form();
  f.buyer.pincode = f.seller.pincode;
  assert.throws(() => create(f), /same dispatch/);
  const unit = form();
  unit.items[0].uqc = "BAD";
  assert.throws(() => create(unit), /unit quantity/);
  const sac = form();
  sac.items[0].hsn = "9983";
  assert.throws(() => create(sac), /goods HSN/);
  assert.equal(create(form()).invoice.invoiceValue, 2360);
});
test("physical dispatch/ship states do not replace billing states for taxes", () => {
  const f = form();
  f.buyer.state = "Maharashtra";
  f.place = "Maharashtra";
  f.transactionType = "Bill To — Ship To";
  f.shipDetails = {
    address: "Bengaluru",
    pincode: "560001",
    state: "Karnataka",
  };
  const d = create(f);
  assert.equal(d.invoice.taxes.igst, 0);
  assert.equal(d.invoice.taxes.cgst, 180);
  assert.equal(d.shipDetails.state, "Karnataka");
  f.transactionType = "Regular";
  f.shipDetails.pincode = f.seller.pincode;
  assert.equal(
    create(f).invoice.taxes.cgst,
    180,
    "Stale ship-to data must be ignored for a regular transaction",
  );
});
test("cess, signed charges and declared upload totals are reconciled", () => {
  const f = form();
  f.items[0].cessRate = 2;
  f.items[0].cessNonAdvol = 10;
  f.otherValue = -5;
  assert.equal(create(f).invoice.invoiceValue, 2405);
  assert.throws(
    () => create({ ...f, declaredTotals: { total: 9999 } }),
    /does not match/,
  );
  assert.throws(
    () => create({ ...f, declaredTotals: { total: "invalid" } }),
    /does not match/,
  );
});
test("validity ends at IST midnight with normal/ODC distance limits", () => {
  assert.equal(
    eway.expiry("2026-10-24", 200, "Regular"),
    "2026-10-25T18:29:59.999Z",
  );
  assert.equal(
    eway.expiry("2026-10-24", 201, "Regular"),
    "2026-10-26T18:29:59.999Z",
  );
  assert.equal(
    eway.expiry("2026-10-24", 21, "Over Dimensional Cargo"),
    "2026-10-26T18:29:59.999Z",
  );
});
test("Part A needs a transporter and has no movement validity before Part B", () => {
  const f = {
    ...form(),
    partAOnly: true,
    mode: "",
    vehicle: "",
    transporterId: taxpayer.gstin,
  };
  const doc = create(f);
  assert.equal(doc.status, "Part A");
  assert.equal(doc.validUntil, null);
  assert.throws(() => create({ ...f, transporterId: "" }), /transporter ID/);
});
test("BH, standard and special vehicle formats; GSTR-1 mislabeled as 3B is rejected", () => {
  for (const plate of ["MH12AB1234", "22BH1234AA", "ABC1234", "DF1234567"])
    assert.equal(eway.vehicleValid(plate), true);
  assert.equal(eway.vehicleValid("anything"), false);
  assert.throws(
    () => parseGstr3b({ b2b: [{ ctin: taxpayer.gstin }] }),
    /GSTR-1 invoice data/,
  );
});
