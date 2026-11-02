"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { previewExcel } = require("../excel-import");
const { validateInvoice } = require("../portal-engine");
const { sanitize, validateCoordinates } = require("../practice-documents");
const context = {
  period: "2026-10",
  taxpayer: { state: "Maharashtra", gstin: "27ABCDE1234F1Z0" },
  validateInvoice,
};
async function workbook(
  rows,
  name = "Purchase Register",
  headers = [
    "Date",
    "Supplier",
    "Supplier Invoice No.",
    "GSTIN/UIN",
    "Purchase",
    "Gross Total",
    "IGST@28%",
    "INPUT CGST",
    "INPUT SGST",
  ],
) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name);
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return {
    name: "example.xlsx",
    base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    target: "sales",
  };
}
test("Tally purchase layout preserves invoice numbers, actual taxes and dates; excludes totals and flags incorrect rate headings", async () => {
  const body = await workbook([
    [
      new Date("2026-10-01T00:00:00Z"),
      "Example Supplier",
      "P/01",
      "09ABCDE1234F1Z0",
      1000,
      1180,
      180,
    ],
    [
      new Date("2026-10-02T00:00:00Z"),
      "Local Supplier",
      "001/ TEST",
      "27ABCDE1234F1Z0",
      2000,
      2560,
      null,
      280,
      280,
    ],
    [null, "Grand Total", null, null, 3000, 3740, 180, 280, 280],
  ]);
  const p = await previewExcel(body, context);
  assert.equal(p.canImport, true);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.totals, { records: 2, taxable: 3000, tax: 740 });
  assert.equal(p.rows[0].target, "purchases");
  assert.equal(p.rows[0].rate, 18);
  assert.equal(p.rows[0].entry.taxes.igst, 180);
  assert.match(p.rows[0].warnings.join(" "), /28%.*18%/);
  assert.equal(p.rows[1].entry.number, "001/ TEST");
  assert.equal(p.rows[1].entry.date, "2026-10-02");
});
test("missing rates and missing formula results never become zero-rated purchases", async () => {
  const headers = [
    "Date",
    "Supplier",
    "Invoice No",
    "GSTIN",
    "Taxable Value",
    "Rate",
  ];
  const p = await previewExcel(
    await workbook(
      [["01-10-2026", "Supplier", "1", "27ABCDE1234F1Z0", 1000]],
      "Purchase Register",
      headers,
    ),
    context,
  );
  assert.equal(p.canImport, false);
  assert.match(p.rows[0].error, /GST rate is missing/);
  const formula = await previewExcel(
    await workbook(
      [
        [
          "01-10-2026",
          "Supplier",
          "1",
          "27ABCDE1234F1Z0",
          { formula: "1+2" },
          18,
        ],
      ],
      "Purchase Register",
      headers,
    ),
    context,
  );
  assert.match(formula.rows[0].error, /cached result/);
});
test("invalid dates, periods, tax heads and duplicates cannot be imported", async () => {
  for (const date of ["31-02-2026", "2026-09-01"]) {
    const p = await previewExcel(
      await workbook([
        [date, "Supplier", "1", "09ABCDE1234F1Z0", 1000, 1180, 180],
      ]),
      context,
    );
    assert.equal(p.canImport, false);
    assert.match(p.rows[0].error, /date/i);
  }
  const body = await workbook([
    ["01-10-2026", "Supplier", "1", "27ABCDE1234F1Z0", 1000, 1180, 180],
  ]);
  const bad = await previewExcel(body, context);
  assert.match(bad.rows[0].error, /Tax heads/);
  const corrected = await previewExcel(
    { ...body, places: { "1:2": "Karnataka" } },
    context,
  );
  assert.equal(corrected.canImport, true);
  assert.notEqual(corrected.fingerprint, bad.fingerprint);
  const duplicate = await previewExcel(
    { ...body, places: { "1:2": "Karnataka" } },
    { ...context, purchases: [corrected.rows[0].entry] },
  );
  assert.match(duplicate.rows[0].error, /already exists/);
});
test("sales sheet becomes a validated outward invoice and uses its supplied tax amounts", async () => {
  const p = await previewExcel(
    await workbook(
      [
        [
          "01-10-2026",
          "Buyer",
          "S/1",
          "29ABCDE1234F1Z0",
          1000,
          1180,
          180,
          "Karnataka",
        ],
      ],
      "Sales Register",
      [
        "Date",
        "Party Name",
        "Invoice No",
        "GSTIN",
        "Sales",
        "Gross Total",
        "IGST",
        "Place of Supply",
      ],
    ),
    context,
  );
  assert.equal(p.canImport, true);
  assert.equal(p.rows[0].entry.section, "B2B");
  assert.equal(p.rows[0].entry.items[0].taxes.igst, 180);
});
test("unregistered sales and percentage-formatted rate cells import without inventing a GSTIN", async () => {
  const body = await workbook(
    [["01-10-2026", "Retail Buyer", "S/2", "URP", 1000, 1180, 90, 90]],
    "Sales Register",
    [
      "Date",
      "Party Name",
      "Invoice No",
      "GSTIN",
      "Sales",
      "Gross Total",
      "CGST",
      "SGST",
    ],
  );
  const p = await previewExcel(body, context);
  assert.equal(p.canImport, true, p.rows[0].error);
  assert.equal(p.rows[0].entry.section, "B2CS");
  assert.equal(p.rows[0].entry.gstin, "");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Sales Register");
  sheet.addRow(["Date", "Party Name", "Invoice No", "GSTIN", "Sales", "Rate"]);
  sheet.addRow(["01-10-2026", "Buyer", "S/3", "29ABCDE1234F1Z0", 1000, 0.18]);
  sheet.getCell("F2").numFmt = "0%";
  const result = await previewExcel(
    {
      name: "rate.xlsx",
      base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    },
    context,
  );
  assert.equal(result.canImport, true, result.rows[0].error);
  assert.equal(result.rows[0].entry.rate, 18);
  assert.equal(result.rows[0].entry.taxes.igst, 180);
});
test("malformed and oversized workbook archives are rejected before parsing", async () => {
  await assert.rejects(
    previewExcel(
      {
        name: "evil.xlsx",
        base64: Buffer.from("not a zip").toString("base64"),
      },
      context,
    ),
    /valid .xlsx/,
  );
  await assert.rejects(
    previewExcel({ name: "old.xls", base64: "AAAA" }, context),
    /xlsx/,
  );
  const body = await workbook([
    ["2026-10-01", "Supplier", "1", "09ABCDE1234F1Z0", 1000, 1180, 180],
  ]);
  const buffer = Buffer.from(body.base64, "base64");
  const central = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  buffer.writeUInt32LE(64 * 1024 * 1024, central + 24);
  await assert.rejects(
    previewExcel({ ...body, base64: buffer.toString("base64") }, context),
    /too large/,
  );
  buffer.writeUInt32LE(1, central + 24);
  await assert.rejects(
    previewExcel({ ...body, base64: buffer.toString("base64") }, context),
    /expanded data|size/,
  );
});
test("registration attachments are canonical sample metadata and reject real bytes at any nesting level", () => {
  const saved = sanitize({
    attachments: { photograph: { simulated: true, name: "private.jpg" } },
    records: [{ attachments: { authorization: { simulated: true } } }],
  });
  assert.equal(saved.attachments.photograph.name, "Photograph.jpg");
  assert.equal(
    saved.records[0].attachments.authorization.name,
    "Letter_of_Authorization.pdf",
  );
  for (const v of [
    { attachment: { data: "data:application/pdf;base64,AAAA" } },
    { attachments: { photograph: { simulated: true, data: "secret" } } },
    { records: [{ private: { data: "secret" } }] },
  ])
    assert.throws(() => sanitize(v), /not accepted/);
  const legacy = sanitize(
    { attachment: { name: "private.pdf", data: "secret" } },
    { legacy: true },
  );
  assert.equal(legacy.attachment.data, undefined);
  assert.equal(legacy.attachment.simulated, true);
});
test("address coordinates require a complete pair and valid geographic bounds", () => {
  validateCoordinates({
    records: [{ latitude: "19.997500", longitude: "73.789800" }],
  });
  for (const v of [
    { latitude: "19" },
    { latitude: 91, longitude: 10 },
    { latitude: 0, longitude: "not a number" },
  ])
    assert.throws(() => validateCoordinates(v), /latitude|longitude/);
});
