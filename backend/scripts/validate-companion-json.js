"use strict";
// Read licensed exercise files from the user's directory; never copy their contents into the repository.
const fs = require("node:fs"),
  path = require("node:path");
const flow = require("../practice-workflows"),
  { validateInvoice } = require("../portal-engine");
const folder = process.argv[2];
if (!folder) {
  console.error(
    "Usage: node scripts/validate-companion-json.js /path/to/json-files",
  );
  process.exit(1);
}
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((x) =>
      x.isDirectory()
        ? files(path.join(dir, x.name))
        : x.name.toLowerCase().endsWith(".json")
          ? [path.join(dir, x.name)]
          : [],
    );
}
const report = [];
for (const file of files(folder)) {
  const name = path.basename(file);
  if (!/gstr|eway|e-invoice|einvoice/i.test(name)) continue;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const d = Array.isArray(raw) ? { Invoices: raw } : raw;
    if (/GSTR3B/i.test(name)) {
      flow.parseGstr3b(d);
      report.push({ file: name, status: "PASS", kind: "GSTR-3B" });
      continue;
    }
    if (/GSTR1/i.test(name)) {
      const period = d.fp.slice(2) + "-" + d.fp.slice(0, 2),
        state = flow.stateName(d.gstin.slice(0, 2)),
        rows = flow.parseGstr1(d, period);
      const allowed = flow.quarterInfo(period).isEnd
        ? flow.quarterInfo(period).periods
        : [period];
      for (const row of rows) validateInvoice(row, period, state, [], allowed);
      report.push({ file: name, status: "PASS", records: rows.length });
      continue;
    }
    const kind = /eway/i.test(name) ? "eway" : "einvoice",
      forms = flow.parseDocumentFile(d, kind);
    for (const form of forms) {
      const reference = new Date(
        Date.UTC(
          Number(form.date.slice(0, 4)),
          Number(form.date.slice(5, 7)),
          0,
        ),
      )
        .toISOString()
        .slice(0, 10);
      flow.documentRow(
        { kind, form },
        {
          gstin:
            form.supplyType === "Inward" ? form.buyer.gstin : form.seller.gstin,
          state:
            form.supplyType === "Inward" ? form.buyer.state : form.seller.state,
        },
        [],
        reference,
      );
    }
    report.push({ file: name, status: "PASS", records: forms.length });
  } catch (error) {
    report.push({ file: name, status: "REJECTED", reason: error.message });
  }
}
console.log(
  JSON.stringify(
    {
      files: report.length,
      passed: report.filter((r) => r.status === "PASS").length,
      rejected: report.filter((r) => r.status !== "PASS").length,
      results: report,
    },
    null,
    2,
  ),
);
if (report.some((r) => r.status !== "PASS")) process.exitCode = 1;
