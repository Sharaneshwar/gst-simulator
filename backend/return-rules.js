"use strict";
const H = ["igst", "cgst", "sgst", "cess"];
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const validDate = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v || "") &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const fy = (period) =>
  Number(period.slice(0, 4)) - (Number(period.slice(5, 7)) < 4 ? 1 : 0);
const end = (period) =>
  new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
function signed(v, label = "Amount") {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    fail(`${label} must be a valid amount.`);
  return round(n);
}
const signedHeads = (input) =>
  Object.fromEntries(H.map((h) => [h, signed(input?.[h], h.toUpperCase())]));
function deadline(documentDate, annualFiled) {
  const year = fy(documentDate);
  const statutory = `${year + 1}-${year >= 2021 ? "11-30" : "09-30"}`;
  return annualFiled && annualFiled < statutory ? annualFiled : statutory;
}
function reporting(date, period, { asOf, annualFiled } = {}) {
  if (!validDate(date)) fail("Enter a valid document date.");
  if (date < "2017-07-01" || date > end(period))
    fail(
      "Document date must be on or before the selected return period, from July 2017 onwards.",
    );
  if ((asOf || end(period)) > deadline(date, annualFiled))
    fail(
      `The reporting/amendment deadline for this financial year is ${deadline(date, annualFiled)}. Select an eligible return period.`,
    );
}
const DAY22 = new Set([
  "Chhattisgarh",
  "Madhya Pradesh",
  "Gujarat",
  "Maharashtra",
  "Karnataka",
  "Goa",
  "Kerala",
  "Tamil Nadu",
  "Telangana",
  "Andhra Pradesh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Puducherry",
  "Andaman and Nicobar Islands",
  "Lakshadweep",
]);
function dueDate(period, type, frequency, state, override) {
  if (override) {
    if (!validDate(override)) fail("Enter a valid due-date override.");
    return override;
  }
  const day =
    type === "GSTR-1"
      ? frequency === "QRMP"
        ? 13
        : 11
      : frequency === "QRMP"
        ? DAY22.has(state)
          ? 22
          : 24
        : 20;
  return new Date(
    Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), day),
  )
    .toISOString()
    .slice(0, 10);
}
function charges({
  period,
  type = "GSTR-3B",
  frequency = "Monthly",
  state,
  filingDate,
  turnover = 0,
  nil = false,
  cashLiability = {},
  minimumCash = {},
  override,
  waiver = false,
  interestWaiver = false,
}) {
  if (!validDate(filingDate) || filingDate < `${period}-01`)
    fail("Enter a valid filing date for the selected return.");
  const due = dueDate(period, type, frequency, state, override);
  const days = Math.max(
    0,
    Math.round((Date.parse(filingDate) - Date.parse(due)) / 86400000),
  );
  const aato = signed(turnover, "Turnover");
  if (aato < 0) fail("Turnover cannot be negative.");
  const cap =
    period < "2021-06"
      ? 10000
      : nil
        ? 500
        : aato <= 15000000
          ? 2000
          : aato <= 50000000
            ? 5000
            : 10000;
  const fee = waiver ? 0 : Math.min(days * (nil ? 20 : 50), cap);
  const interest = Object.fromEntries(
    H.map((head) => {
      const liability = signed(cashLiability[head]),
        balance = signed(minimumCash[head]);
      if (liability < 0 || balance < 0)
        fail("Cash liability and minimum balance cannot be negative.");
      return [
        head,
        interestWaiver || type !== "GSTR-3B"
          ? 0
          : round((Math.max(0, liability - balance) * 0.18 * days) / 365),
      ];
    }),
  );
  return {
    dueDate: due,
    filingDate,
    daysLate: days,
    turnover: aato,
    nil,
    cap,
    annualRate: 18,
    interest,
    latefee: { igst: 0, cgst: fee / 2, sgst: fee / 2, cess: 0 },
  };
}
function fixedSum(w, period) {
  const year = Number(period.slice(0, 4)),
    month = Number(period.slice(5, 7));
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const previousEnd = new Date(Date.UTC(year, startMonth - 1, 0))
    .toISOString()
    .slice(0, 7);
  const previousFrequency = w.filingPreferences?.[fy(previousEnd)] || "Monthly";
  const data = w.periods[previousEnd];
  if (!data || data.gstr3b.status !== "Filed" || !data.gstr3b.offset)
    fail(
      "File the preceding month/quarter's GSTR-3B before generating a fixed-sum challan. Self-assessment remains available.",
    );
  const factor = previousFrequency === "QRMP" ? 0.35 : 1;
  return {
    basisPeriod: previousEnd,
    percentage: factor * 100,
    amounts: Object.fromEntries(
      H.map((h) => [
        h,
        round(
          Number(
            (data.gstr3b.offset.taxCashUsed || data.gstr3b.offset.cashUsed)?.[
              h
            ] || 0,
          ) * factor,
        ),
      ]),
    ),
  };
}
module.exports = {
  signed,
  signedHeads,
  reporting,
  deadline,
  dueDate,
  charges,
  fixedSum,
  end,
  fy,
};
