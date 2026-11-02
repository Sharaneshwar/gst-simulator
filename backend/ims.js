"use strict";
const rules = require("./return-rules");
const H = ["igst", "cgst", "sgst", "cess"];
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const next = (period) =>
  new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1))
    .toISOString()
    .slice(0, 7);
const asOf = (w) =>
  w.returnAsOf && w.returnAsOf >= `${w.period}-01`
    ? w.returnAsOf
    : `${next(w.period)}-20`;
function revision(w) {
  return JSON.stringify(
    Object.entries(w.periods)
      .filter(([period]) => period <= w.period)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, p]) => [period, p.imsRevision || 0]),
  );
}
function pool(w) {
  const month = Number(w.period.slice(5, 7)),
    year = Number(w.period.slice(0, 4));
  const currentPeriods =
    w.filingFrequency === "QRMP" && month % 3 === 0
      ? [0, 1, 2].map(
          (offset) => `${year}-${String(month - 2 + offset).padStart(2, "0")}`,
        )
      : [w.period];
  return Object.entries(w.periods)
    .filter(([period]) => period <= w.period)
    .flatMap(([sourcePeriod, p]) =>
      p.purchases.map((row) => ({
        ...row,
        sourcePeriod,
        date: row.date || `${sourcePeriod}-01`,
      })),
    )
    .map((row) =>
      row.documentType !== "Credit Note" &&
      asOf(w) > rules.deadline(row.date, w.annualReturns?.[rules.fy(row.date)])
        ? {
            ...row,
            match: "Ineligible",
            itcReason:
              "The time limit for claiming this invoice's ITC has expired.",
          }
        : row,
    )
    .filter(
      (row) =>
        !row.imsFinalizedIn &&
        (currentPeriods.includes(row.sourcePeriod) ||
          row.imsAction === "Pending" ||
          row.imsActedFor === w.period ||
          row.supplierFiled === false ||
          row.supplierFiledAtPeriod === w.period),
    );
}
function actionFor(row, period) {
  if (
    row.imsAction === "Pending" &&
    row.pendingThrough &&
    period > row.pendingThrough
  )
    return "No Action";
  return row.imsAction || "No Action";
}
function included(row, period) {
  return (
    row.includedIn2b !== false &&
    row.supplierFiled !== false &&
    !["Rejected", "Pending"].includes(actionFor(row, period))
  );
}
function eligible(row, period) {
  return included(row, period) && row.match === "Matched" && !row.itcReason;
}
function act(w, body) {
  const p = w.periods[w.period];
  if (w.period < "2024-10")
    fail("IMS is available from the October 2024 tax period.");
  if (["Offset", "Filed"].includes(p.gstr3b.status))
    fail(
      "IMS actions are locked after liability offset. Select an open tax period.",
    );
  if (!["No Action", "Accepted", "Rejected", "Pending"].includes(body.action))
    fail("Select Accept, Reject, Pending or No Action.");
  if (
    !Array.isArray(body.ids) ||
    !body.ids.length ||
    body.ids.length > 2000 ||
    new Set(body.ids).size !== body.ids.length
  )
    fail("Select between 1 and 2,000 distinct invoices.");
  const rows = pool(w);
  const selected = body.ids.map(
    (id) =>
      rows.find((r) => r.id === id) ||
      fail("This invoice is not available for an IMS action."),
  );
  const changes = selected.map((row) => {
    const credit = row.documentType === "Credit Note";
    if (body.action === "Pending" && credit && row.sourcePeriod < "2025-10")
      fail("Credit notes reported before October 2025 cannot be kept Pending.");
    if (row.reverseCharge || row.itcReason)
      fail(
        "This record is unavailable for IMS action because it is reverse-charge or ITC-ineligible.",
      );
    if (row.amendedFrom && row.supplierFiled === false)
      fail(
        "An amended record must be filed by its supplier before an IMS action.",
      );
    if (
      body.action === "Pending" &&
      row.pendingThrough &&
      w.period > row.pendingThrough
    )
      fail("This credit note's Pending allowance has expired.");
    const reduced =
      credit && body.action === "Accepted" && body.reductions?.[row.id]
        ? rules.signedHeads(body.reductions[row.id])
        : null;
    if (reduced && H.some((h) => reduced[h] < 0 || reduced[h] > row.taxes[h]))
      fail(
        "ITC reduction must be between zero and the credit note's tax amount for each head.",
      );
    return { row, reduced };
  });
  for (const { row, reduced } of changes) {
    const source = w.periods[row.sourcePeriod].purchases.find(
      (r) => r.id === row.id,
    );
    source.imsAction = body.action;
    source.imsActedFor = w.period;
    source.imsRemark = String(body.remark || "").slice(0, 500);
    source.imsActedAt = new Date().toISOString();
    if (body.action === "Pending" && row.documentType === "Credit Note") {
      // The one-period pending allowance is tied to first action, never extended by repeating it.
      source.pendingThrough ||=
        w.filingFrequency === "QRMP"
          ? new Date(
              Date.UTC(
                Number(w.period.slice(0, 4)),
                Math.ceil(Number(w.period.slice(5, 7)) / 3) * 3 + 2,
                1,
              ),
            )
              .toISOString()
              .slice(0, 7)
          : next(w.period);
      if (w.period > source.pendingThrough)
        fail(
          "This credit note's one-tax-period Pending allowance has expired.",
        );
    }
    if (reduced) source.itcReduction = reduced;
    else if (body.action === "Accepted") delete source.itcReduction;
    if (body.action === "Accepted" && source.match === "Requires Review")
      source.match = "Matched";
  }
  p.imsRevision = (p.imsRevision || 0) + 1;
  return {
    message: `${selected.length} IMS record(s) updated. Recompute GSTR-2B to update the ITC statement.`,
  };
}
function recompute(w) {
  const p = w.periods[w.period];
  if (["Offset", "Filed"].includes(p.gstr3b.status))
    fail("GSTR-2B cannot be recomputed after liability offset.");
  if (w.filingFrequency === "QRMP" && Number(w.period.slice(5, 7)) % 3 !== 0)
    fail("Quarterly GSTR-2B is computed at quarter end.");
  const availability = `${next(w.period)}-14`;
  if (asOf(w) < availability)
    fail(`GSTR-2B computation is available from ${availability}.`);
  const records = pool(w)
    .filter((row) => included(row, w.period))
    .map((row) => ({
      ...row,
      imsAction: actionFor(row, w.period),
      ...(row.documentType === "Credit Note" && row.itcReduction
        ? { originalTaxes: row.taxes, taxes: row.itcReduction }
        : {}),
    }));
  p.gstr2b = {
    records,
    computedAt: new Date().toISOString(),
    sourceRevision: revision(w),
    portalDate: asOf(w),
  };
  // Previously saved ITC has to be reviewed again after a recomputation; don't keep a stale override.
  delete p.gstr3b.tables["4"];
  delete p.gstr3b.tables["4b"];
  p.gstr3b.saved = false;
  return {
    message:
      "GSTR-2B recomputed. Review the updated ITC before saving GSTR-3B.",
  };
}
function purchasesFor3b(w, p) {
  const period =
    Object.keys(w.periods).find((key) => w.periods[key] === p) || w.period;
  return (
    p.gstr2b?.records || p.purchases.filter((row) => included(row, period))
  );
}
function finalize(w) {
  for (const row of pool(w)) {
    const source = w.periods[row.sourcePeriod].purchases.find(
      (i) => i.id === row.id,
    );
    if (actionFor(row, w.period) !== "Pending" && row.supplierFiled !== false)
      source.imsFinalizedIn = w.period;
  }
}
module.exports = {
  pool,
  act,
  included,
  eligible,
  actionFor,
  recompute,
  purchasesFor3b,
  finalize,
  asOf,
  revision,
};
