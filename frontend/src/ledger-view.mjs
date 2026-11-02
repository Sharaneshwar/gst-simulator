import { roundAmount } from "./return-entry.mjs";
const HEADS = ["igst", "cgst", "sgst", "cess"];
const heads = (input = {}) =>
  Object.fromEntries(HEADS.map((head) => [head, Number(input[head] || 0)]));
const combine = (a, b, sign = 1) =>
  Object.fromEntries(
    HEADS.map((head) => [head, roundAmount(a[head] + sign * b[head])]),
  );
export function ledgerStatement(workspace, type, from, to, category = "tax") {
  const entries = (workspace.ledger || [])
    .filter((entry) =>
      type === "cash"
        ? entry.type === "Cash deposit" || entry.debit
        : type === "credit"
          ? entry.type === "ITC credited" || entry.creditDebit
          : entry.type === "Liability offset",
    )
    .filter(
      (entry) =>
        type !== "cash" ||
        category === "tax" ||
        [
          ...Object.values(entry.creditCategories?.[category] || {}),
          ...Object.values(entry.debitCategories?.[category] || {}),
        ].some((value) => Number(value) !== 0),
    )
    .map((entry) => ({
      ...entry,
      debitAmounts: heads(
        type === "credit"
          ? entry.creditDebit
          : type === "liability"
            ? combine(heads(entry.debit), heads(entry.creditDebit))
            : category === "tax"
              ? entry.debit
              : entry.debitCategories?.[category],
      ),
      creditAmounts: heads(
        type === "liability"
          ? {}
          : type === "cash" && category !== "tax"
            ? entry.creditCategories?.[category]
            : entry.credit,
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || 0);
  // Retain insertion order for equal timestamps: backend stores newest first.
  // The stable reverse makes equal-time credits precede the corresponding offset.
  const chronological = entries
    .reverse()
    .sort((a, b) => a.date.localeCompare(b.date));
  const current = heads(
    type === "credit"
      ? workspace.credit
      : category === "tax"
        ? workspace.cash
        : workspace.cashCategories?.[category],
  );
  let opening = chronological.reduce(
    (balance, entry) =>
      combine(combine(balance, entry.creditAmounts, -1), entry.debitAmounts),
    current,
  );
  const before = chronological.filter(
    (entry) => entry.date.slice(0, 10) < from,
  );
  for (const entry of before)
    opening = combine(
      combine(opening, entry.creditAmounts),
      entry.debitAmounts,
      -1,
    );
  let balance = { ...opening };
  const rows = chronological
    .filter(
      (entry) =>
        entry.date.slice(0, 10) >= from && entry.date.slice(0, 10) <= to,
    )
    .map((entry) => {
      balance = combine(
        combine(balance, entry.creditAmounts),
        entry.debitAmounts,
        -1,
      );
      return { ...entry, balance: { ...balance } };
    });
  return { type, category, rows, opening, closing: balance };
}
export function ledgerCsv(statement) {
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const includeBalance = statement.type !== "liability";
  return [
    [
      "Date",
      "Reference Number",
      "Description",
      "Return Period",
      "Debit",
      "Credit",
      ...(includeBalance ? ["Balance"] : []),
    ],
    ...statement.rows.map((entry) => [
      entry.date,
      entry.reference,
      entry.type,
      entry.period,
      HEADS.reduce((n, h) => n + entry.debitAmounts[h], 0),
      HEADS.reduce((n, h) => n + entry.creditAmounts[h], 0),
      ...(includeBalance
        ? [HEADS.reduce((n, h) => n + entry.balance[h], 0)]
        : []),
    ]),
  ]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
