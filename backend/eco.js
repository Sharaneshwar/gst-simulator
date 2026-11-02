"use strict";
const crypto = require("node:crypto");
const flow = require("./practice-workflows");
const rules = require("./return-rules");
const ims = require("./ims");
const HEADS = ["igst", "cgst", "sgst", "cess"];
const SECTIONS = ["ECO", "ECOA", "ECO95", "ECO95A"];
const BUCKETS = {
  ECO: [
    ["52", "Liable to collect tax u/s 52 (TCS)"],
    ["95", "Liable to pay tax u/s 9(5)"],
  ],
  ECO95: [
    ["B2B", "Registered to Registered (B2B)"],
    ["B2C", "Registered to Unregistered (B2C)"],
    ["URP2B", "Unregistered to Registered (URP2B)"],
    ["URP2C", "Unregistered to Unregistered (URP2C)"],
  ],
};
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const gstin = (v) =>
  /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][ZC][A-Z\d]$/.test(v || "");
function baseSection(section) {
  return section.endsWith("A") ? section.slice(0, -1) : section;
}
function originals(w, section, bucket) {
  return Object.entries(w.periods)
    .filter(([key, data]) => key < w.period && data.gstr1.status === "Filed")
    .flatMap(([period, data]) =>
      data.invoices
        .filter(
          (i) =>
            i.section === baseSection(section) &&
            (i.ecoBucket || "52") === bucket,
        )
        .map((i) => ({ ...i, originalPeriod: period })),
    );
}
function previousAmendment(w, section, original, place) {
  return Object.entries(w.periods)
    .filter(
      ([period, data]) => period < w.period && data.gstr1.status === "Filed",
    )
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([, data]) => data.invoices)
    .find(
      (i) =>
        i.section === section &&
        i.originalId === original.id &&
        (!place || i.place === place),
    );
}
function checkPosAmendments(w, rows = w.periods[w.period].invoices) {
  for (const row of rows.filter(
    (i) => i.section === "ECO95A" && ["B2C", "URP2C"].includes(i.ecoBucket),
  )) {
    const original = originals(w, row.section, row.ecoBucket).find(
      (i) => i.id === row.originalId,
    );
    if (!original || row.place === original.place) continue;
    const oldPos =
      rows.find(
        (i) =>
          i.section === row.section &&
          i.originalId === row.originalId &&
          i.place === original.place,
      ) ||
      previousAmendment(w, row.section, original, original.place) ||
      original;
    if (Number(oldPos.taxable) || HEADS.some((h) => Number(oldPos.taxes?.[h])))
      fail(
        "To change Place of Supply, first save zero values for the original POS. Keep that zero amendment while adding the new POS.",
      );
  }
}
function validate(input, w, taxpayer) {
  const section = input.section;
  if (!SECTIONS.includes(section)) fail("Select an e-commerce table.");
  const base = baseSection(section),
    amended = section.endsWith("A"),
    disclosure = base === "ECO";
  if (w.period < "2024-01")
    fail("Tables 14/15 and their amendments are available from January 2024.");
  const bucket = input.ecoBucket || (disclosure ? "52" : "B2B");
  if (!BUCKETS[base].some(([key]) => key === bucket))
    fail("Select a valid e-commerce supply tab.");
  const operatorGstin = String(input.operatorGstin || input.gstin || "")
    .trim()
    .toUpperCase();
  const supplierGstin = String(input.supplierGstin || "")
    .trim()
    .toUpperCase();
  const recipientGstin = String(input.recipientGstin || "")
    .trim()
    .toUpperCase();
  if (disclosure && !gstin(operatorGstin))
    fail("Enter a valid GSTIN of the e-commerce operator.");
  if (
    disclosure &&
    bucket === "52" &&
    operatorGstin[13] !== "C" &&
    !w.masters?.parties?.some(
      (p) => p.gstin === operatorGstin && p.registrationType === "TCS",
    )
  )
    fail(
      "Table 14 u/s 52 requires a TCS-registered operator. Add the operator's TCS registration to My Masters.",
    );
  if (!disclosure && ["B2B", "B2C"].includes(bucket) && !gstin(supplierGstin))
    fail("Enter the registered supplier's GSTIN.");
  if (
    !disclosure &&
    ["B2B", "URP2B"].includes(bucket) &&
    !gstin(recipientGstin)
  )
    fail("Enter the registered recipient's GSTIN.");
  if (!disclosure && ["URP2B", "URP2C"].includes(bucket) && supplierGstin)
    fail("Leave supplier GSTIN empty for an unregistered supplier.");
  if (!disclosure && ["B2C", "URP2C"].includes(bucket) && recipientGstin)
    fail("Leave recipient GSTIN empty for an unregistered recipient.");
  const aggregate = disclosure || ["B2C", "URP2C"].includes(bucket);
  const place = disclosure ? taxpayer.state : flow.stateName(input.place);
  const rate = Number(input.rate ?? 18);
  if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(rate))
    fail("Select a valid rate.");
  const category = input.supplyCategory || "Regular";
  if (!["Regular", "DeemedExport", "SEZWP", "SEZWOP"].includes(category))
    fail("Select a valid supply category.");
  const supplierState = supplierGstin
    ? flow.stateName(supplierGstin.slice(0, 2))
    : flow.stateName(input.supplierState || taxpayer.state);
  const inter = place !== supplierState || category.startsWith("SEZ");
  const number = aggregate
    ? `${bucket}:${disclosure ? operatorGstin : [supplierGstin, place, rate].join(":")}`
    : String(input.number || "").trim();
  const date = aggregate ? "" : String(input.date || "");
  if (!aggregate) {
    if (!/^[A-Za-z0-9/-]{1,16}$/.test(number))
      fail(
        "Enter a document number with 1–16 letters, digits, hyphens or slashes.",
      );
    rules.reporting(date, w.period, {
      asOf: ims.asOf(w),
      annualFiled: w.annualReturns?.[rules.fy(date)],
    });
  }
  const amount = (value) => {
    const n = rules.signed(value);
    if (!aggregate && n < 0) fail("Invoice amounts cannot be negative.");
    return n;
  };
  const lines =
    !aggregate && Array.isArray(input.items) && input.items.length
      ? input.items
      : [
          {
            taxable: input.taxable,
            rate,
            taxes: input.reportedTaxes || input.taxes,
            cess: input.cess,
          },
        ];
  if (lines.length > 100) fail("Add at most 100 rate rows.");
  const items = lines.map((line) => {
    const r = Number(line.rate ?? rate);
    if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(r))
      fail("Select a valid rate.");
    const taxable = amount(line.taxable),
      calculated = round((taxable * r) / 100);
    const taxes = line.taxes
      ? rules.signedHeads(line.taxes)
      : {
          igst: inter ? calculated : 0,
          cgst: inter ? 0 : round(calculated / 2),
          sgst: inter ? 0 : round(calculated - round(calculated / 2)),
          cess: amount(line.cess),
        };
    if (disclosure && !line.taxes) for (const head of HEADS) taxes[head] = 0;
    for (const head of HEADS)
      if (
        taxes[head] &&
        (!taxable || Math.sign(taxes[head]) !== Math.sign(taxable))
      )
        fail("Tax amounts must have the same sign as the net taxable value.");
    if (!disclosure && (inter ? taxes.cgst || taxes.sgst : taxes.igst))
      fail("Tax heads must match the supplier state and Place of Supply.");
    if (category === "SEZWOP" && HEADS.some((head) => taxes[head]))
      fail("SEZ without payment requires zero tax.");
    return { taxable, rate: r, taxes, cess: taxes.cess };
  });
  const taxes = Object.fromEntries(
    HEADS.map((head) => [
      head,
      round(items.reduce((n, line) => n + line.taxes[head], 0)),
    ]),
  );
  const taxable = round(items.reduce((n, line) => n + line.taxable, 0));
  const original = amended
    ? originals(w, section, bucket).find(
        (i) =>
          i.id === input.originalId ||
          (i.originalPeriod === input.originalPeriod &&
            i.number === input.originalNumber),
      )
    : null;
  if (amended && !original)
    fail("Find the original record in a filed earlier return before amending.");
  if (original)
    rules.reporting(original.date || `${input.originalPeriod}-01`, w.period, {
      asOf: ims.asOf(w),
      annualFiled: w.annualReturns?.[rules.fy(input.originalPeriod)],
    });
  const current = w.periods[w.period];
  if (
    current.invoices.some(
      (i) =>
        i.id !== input.id &&
        i.section === section &&
        (amended
          ? i.originalId === original.id &&
            (!(base === "ECO95" && aggregate) || i.place === place)
          : i.number === number && i.ecoBucket === bucket),
    )
  )
    fail("This e-commerce record already exists in the selected period.");
  if (
    !aggregate &&
    Object.values(w.periods).some((data) =>
      data.invoices.some(
        (i) =>
          i.id !== input.id &&
          i.section === section &&
          i.ecoBucket === bucket &&
          i.number.toUpperCase() === number.toUpperCase() &&
          rules.fy(i.date || w.period) === rules.fy(date),
      ),
    )
  )
    fail(
      "This e-commerce document number already exists in the financial year.",
    );
  return {
    id: input.id || crypto.randomUUID(),
    section,
    ecoBucket: bucket,
    operatorGstin,
    supplierGstin,
    recipientGstin,
    supplierState,
    gstin: disclosure ? operatorGstin : recipientGstin,
    number,
    date,
    taxable,
    taxes,
    rate,
    place,
    items,
    supplyCategory: category,
    invoiceValue: amount(
      input.invoiceValue ?? taxable + HEADS.reduce((n, h) => n + taxes[h], 0),
    ),
    ...(original
      ? {
          originalId: original.id,
          originalNumber: original.number,
          originalPeriod: input.originalPeriod || original.originalPeriod,
          amendmentBaseline: (() => {
            const byPlace = base === "ECO95" && aggregate;
            const previous =
              previousAmendment(
                w,
                section,
                original,
                byPlace ? place : undefined,
              ) ||
              (byPlace && place !== original.place
                ? {
                    taxable: 0,
                    taxes: Object.fromEntries(HEADS.map((h) => [h, 0])),
                  }
                : original);
            return { taxable: previous.taxable, taxes: previous.taxes };
          })(),
        }
      : {}),
  };
}
module.exports = {
  SECTIONS,
  BUCKETS,
  baseSection,
  originals,
  validate,
  checkPosAmendments,
};
