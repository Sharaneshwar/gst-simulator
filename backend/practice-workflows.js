"use strict";
const crypto = require("node:crypto");
const eway = require("./eway-rules");
const ims = require("./ims");
const returnRules = require("./return-rules");
const HEADS = ["igst", "cgst", "sgst", "cess"];
const STATE_CODES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  26: "Dadra and Nagar Haveli and Daman and Diu",
  27: "Maharashtra",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman and Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh",
  38: "Ladakh",
  97: "Other Territory",
  96: "Outside India",
};
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
function amount(v, label = "Amount") {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 1e12)
    fail(`${label} must be a valid non-negative amount.`);
  return round(n);
}
const heads = (v = {}) =>
  Object.fromEntries(HEADS.map((h) => [h, amount(v[h], h)]));
const add = (a = {}, b = {}) =>
  Object.fromEntries(HEADS.map((h) => [h, round((a[h] || 0) + (b[h] || 0))]));
const total = (v) => round(HEADS.reduce((n, h) => n + Number(v?.[h] || 0), 0));
const stateName = (v) =>
  STATE_CODES[String(v).padStart(2, "0")] ||
  (Object.values(STATE_CODES).includes(v)
    ? v
    : fail("Select a valid place of supply."));
const date = (v) => {
  const text = String(v || "").replaceAll("/", "-");
  return /^\d{2}-\d{2}-\d{4}$/.test(text)
    ? text.split("-").reverse().join("-")
    : text;
};
const validDate = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v || "") &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const financialYear = (period) =>
  Number(period.slice(0, 4)) - (Number(period.slice(5)) < 4 ? 1 : 0);
function setFrequency(w) {
  w.filingPreferences ||= {};
  w.filingFrequency = w.filingPreferences[financialYear(w.period)] || "Monthly";
}
function parseObject(value, allowArray = false) {
  let d = value;
  try {
    if (typeof d === "string") d = JSON.parse(d);
  } catch {
    fail("The uploaded file is not valid JSON.");
  }
  if (allowArray && Array.isArray(d)) return { Invoices: d };
  if (!d || typeof d !== "object" || Array.isArray(d))
    fail("Upload a JSON object.");
  return d;
}
function checkFile(d, gstin, period) {
  if (d.gstin && d.gstin !== gstin)
    fail("The GSTIN in this file does not match the selected taxpayer.");
  if (d.fp && d.fp !== period.slice(5) + period.slice(0, 4))
    fail("The return period in the file does not match the selected period.");
}
function quarterInfo(period) {
  const y = Number(period.slice(0, 4)),
    m = Number(period.slice(5)),
    start = Math.floor((m - 1) / 3) * 3 + 1;
  const periods = [0, 1, 2].map(
    (i) => `${y}-${String(start + i).padStart(2, "0")}`,
  );
  return {
    periods,
    start: periods[0],
    end: periods[2],
    isEnd: m === start + 2,
    month: m - start + 1,
  };
}
function returnData(w, p, type = "gstr3b") {
  if (w.filingFrequency !== "QRMP" || !quarterInfo(w.period).isEnd)
    return { ...p, purchases: ims.purchasesFor3b(w, p) };
  const q = quarterInfo(w.period);
  const all = q.periods.map((k) => w.periods[k]).filter(Boolean);
  return {
    ...p,
    invoices: all.flatMap((x, i) =>
      type === "gstr1" && x !== p && x.gstr1.status === "Filed"
        ? []
        : x.invoices,
    ),
    purchases:
      p.gstr2b?.records || all.flatMap((x) => ims.purchasesFor3b(w, x)),
  };
}
function assertWritable(w, p) {
  if (
    p.gstr1.status === "Filed" ||
    (w.filingFrequency === "QRMP" &&
      w.periods[quarterInfo(w.period).end]?.gstr1.status === "Filed")
  )
    fail("This return is filed. Select a later period to amend a document.");
}
const IFF = ["B2B", "CDNR", "B2BA", "CDNRA"];
function assertIff(w, section) {
  if (
    w.filingFrequency === "QRMP" &&
    !quarterInfo(w.period).isEnd &&
    !IFF.includes(section)
  )
    fail(
      "IFF accepts B2B invoices and registered credit/debit notes only. Report other supplies in the quarter-end GSTR-1.",
    );
}
function invoiceItems(inv) {
  return (inv.itms || []).map((x) => {
    const t = x.itm_det || x;
    return {
      rate: t.rt,
      taxable: t.txval,
      cess: t.csamt,
      ...(Object.keys(t).some((key) =>
        ["iamt", "camt", "samt", "csamt"].includes(key),
      )
        ? {
            taxes: Object.fromEntries(
              [
                ["igst", "iamt"],
                ["cgst", "camt"],
                ["sgst", "samt"],
                ["cess", "csamt"],
              ]
                .filter(([, source]) => Object.hasOwn(t, source))
                .map(([head, source]) => [head, t[source]]),
            ),
          }
        : {}),
    };
  });
}
function parseGstr1(d, period) {
  const out = [...(Array.isArray(d.invoices) ? d.invoices : [])];
  const base = (inv, section, extra = {}) => ({
    section,
    number: inv.inum || inv.nt_num,
    date: date(inv.idt || inv.nt_dt),
    invoiceValue: inv.val || inv.nt_val,
    place: inv.pos ? stateName(inv.pos) : undefined,
    reverseCharge: inv.rchrg === "Y",
    supplyCategory:
      { R: "Regular", DE: "DeemedExport", SEWP: "SEZWP", SEWOP: "SEZWOP" }[
        inv.inv_typ
      ] || "Regular",
    differential: Number(inv.diff_percent) === 0.65,
    ...extra,
    ...(inv.itms?.length
      ? { items: invoiceItems(inv) }
      : { rate: inv.rt, taxable: inv.txval, cess: inv.csamt }),
  });
  for (const [key, section] of [
    ["b2b", "B2B"],
    ["b2ba", "B2BA"],
    ["cdnr", "CDNR"],
    ["cdnra", "CDNRA"],
  ])
    for (const party of d[key] || [])
      for (const inv of party.inv || party.nt || [])
        out.push(
          base(inv, section, {
            gstin: party.ctin,
            place: stateName(inv.pos || party.ctin?.slice(0, 2)),
            noteType: inv.ntty === "D" ? "Debit Note" : "Credit Note",
            originalNumber: inv.oinum || inv.ont_num,
            originalPeriod: date(inv.oidt || inv.ont_dt).slice(0, 7),
          }),
        );
  for (const [key, section] of [
    ["b2cl", "B2CL"],
    ["b2cla", "B2CLA"],
  ])
    for (const group of d[key] || [])
      for (const inv of group.inv || [])
        out.push(
          base(inv, section, {
            place: stateName(group.pos),
            originalNumber: inv.oinum,
            originalPeriod: date(inv.oidt).slice(0, 7),
          }),
        );
  for (const [key, section] of [
    ["exp", "EXP"],
    ["expa", "EXPA"],
  ])
    for (const group of d[key] || [])
      for (const inv of group.inv || [])
        out.push(
          base(inv, section, {
            exportType:
              group.exp_typ === "WOPAY"
                ? "Without payment of tax"
                : "With payment of tax",
            portCode: inv.sbpcode,
            shippingBillNumber: inv.sbnum,
            shippingBillDate: date(inv.sbdt),
            originalNumber: inv.oinum,
            originalPeriod: date(inv.oidt).slice(0, 7),
          }),
        );
  for (const [key, section] of [
    ["cdnur", "CDNUR"],
    ["cdnura", "CDNURA"],
  ])
    for (const inv of d[key] || [])
      out.push(
        base(inv, section, {
          noteType: inv.ntty === "D" ? "Debit Note" : "Credit Note",
          recipientType: inv.typ || "B2CL",
          urType: inv.typ || "B2CL",
          originalNumber: inv.ont_num,
          originalPeriod: date(inv.ont_dt).slice(0, 7),
        }),
      );
  for (const [i, r] of (d.b2cs || []).entries())
    out.push({
      section: "B2CS",
      number: `B2CS-${i + 1}-${r.pos}-${r.rt}`,
      place: stateName(r.pos),
      rate: r.rt,
      taxable: r.txval,
      cess: r.csamt,
      supplyType: r.sply_ty === "INTER" ? "Inter-state" : "Intra-state",
    });
  for (const r of d.nil?.inv || [])
    for (const [key, name] of [
      ["nil_amt", "Nil Rated"],
      ["expt_amt", "Exempt"],
      ["ngsup_amt", "Non-GST"],
    ])
      if (Number(r[key]))
        out.push({
          section: "NIL",
          number: `${r.sply_ty}-${name}`,
          place: "Other Territory",
          taxable: r[key],
          rate: 0,
          recipientType: r.sply_ty?.endsWith("B2B")
            ? "Registered"
            : "Unregistered",
          supplyType: r.sply_ty?.startsWith("INTER")
            ? "Inter-state"
            : "Intra-state",
          nilType: name,
        });
  const hsn = d.hsn?.data || [
    ...(d.hsn?.hsn_b2b || []),
    ...(d.hsn?.hsn_b2c || []),
  ];
  for (const [i, r] of hsn.entries())
    out.push({
      section: "HSN",
      number: `HSN-${r.hsn_sc}-${r.rt || 0}-${i}`,
      place: "Other Territory",
      hsn: r.hsn_sc,
      recipient: r.desc,
      quantity: r.qty,
      uqc: r.uqc,
      rate: r.rt || 0,
      taxable: r.txval,
      reportedTaxes: {
        igst: r.iamt || 0,
        cgst: r.camt || 0,
        sgst: r.samt || 0,
        cess: r.csamt || 0,
      },
    });
  for (const group of d.doc_issue?.doc_det || [])
    for (const [i, r] of (group.docs || []).entries())
      out.push({
        section: "DOCS",
        number: `DOC-${group.doc_num}-${i}`,
        documentType: String(group.doc_num),
        fromSerial: r.from,
        toSerial: r.to,
        issued: r.totnum,
        cancelled: r.cancel,
        rate: 0,
        taxable: 0,
      });
  for (const [key, section] of [
    ["at", "AT"],
    ["txpd", "TXP"],
  ])
    for (const group of d[key] || [])
      for (const [i, r] of (group.itms || []).entries())
        out.push({
          section,
          number: `${section}-${group.pos}-${i}`,
          place: stateName(group.pos),
          rate: r.rt,
          taxable: r.ad_amt,
          cess: r.csamt,
        });
  const supported = [
    "gstin",
    "fp",
    "version",
    "hash",
    "gt",
    "cur_gt",
    "invoices",
    "b2b",
    "b2ba",
    "b2cl",
    "b2cla",
    "exp",
    "expa",
    "cdnr",
    "cdnra",
    "cdnur",
    "cdnura",
    "b2cs",
    "nil",
    "hsn",
    "doc_issue",
    "at",
    "txpd",
  ];
  for (const [k, v] of Object.entries(d))
    if (
      !supported.includes(k) &&
      v &&
      (Array.isArray(v)
        ? v.length
        : typeof v === "object"
          ? Object.keys(v).length
          : true)
    )
      fail(`Unsupported JSON section: ${k}. No records were imported.`);
  if (!out.length) fail("No invoice records found in this file.");
  if (out.length > 2000) fail("Upload at most 2,000 records at a time.");
  return out;
}
function draft3b(p, homeState) {
  const sum = (records) =>
    records.reduce(
      (out, i) => {
        const sign =
          (i.section.startsWith("CDN") && i.noteType !== "Debit Note") ||
          i.section === "TXP" ||
          i.section === "TXPA"
            ? -1
            : 1;
        out.taxable = round(
          out.taxable +
            sign * (i.taxable - (i.amendmentBaseline?.taxable || 0)),
        );
        HEADS.forEach(
          (h) =>
            (out.taxes[h] = round(
              out.taxes[h] +
                sign *
                  ((i.taxes?.[h] || 0) -
                    (i.amendmentBaseline?.taxes?.[h] || 0)),
            )),
        );
        return out;
      },
      { taxable: 0, taxes: heads() },
    );
  const rows = {
    a: sum(
      p.invoices.filter(
        (i) =>
          !["NIL", "DOCS", "HSN"].includes(i.section) &&
          !i.section.startsWith("ECO") &&
          !i.section.startsWith("EXP") &&
          !i.reverseCharge,
      ),
    ),
    b: sum(p.invoices.filter((i) => i.section.startsWith("EXP"))),
    c: {
      taxable: p.invoices
        .filter((i) => i.section === "NIL" && i.nilType !== "Non-GST")
        .reduce((n, i) => n + i.taxable, 0),
    },
    e: {
      taxable: p.invoices
        .filter((i) => i.section === "NIL" && i.nilType === "Non-GST")
        .reduce((n, i) => n + i.taxable, 0),
    },
  };
  const credit = p.purchases
    .filter((i) => i.match === "Matched" && i.includedIn2b !== false)
    .reduce((a, i) => {
      HEADS.forEach(
        (h) =>
          (a[h] = round(
            a[h] +
              (i.documentType === "Credit Note" ? -1 : 1) * (i.taxes[h] || 0),
          )),
      );
      return a;
    }, heads());
  const states = [];
  for (const i of p.invoices.filter(
    (i) =>
      ["B2CL", "B2CS", "CDNUR"].includes(i.section) && i.place !== homeState,
  )) {
    let r = states.find((r) => r.place === i.place);
    if (!r) {
      r = {
        category: "unregistered",
        place: i.place,
        taxable: 0,
        taxes: { igst: 0 },
      };
      states.push(r);
    }
    const sign = i.section === "CDNUR" && i.noteType !== "Debit Note" ? -1 : 1;
    r.taxable = round(r.taxable + sign * i.taxable);
    r.taxes.igst = round(r.taxes.igst + sign * i.taxes.igst);
  }
  const five = { exempt: { taxes: heads() }, nongst: { taxes: heads() } };
  for (const i of p.purchases.filter(
    (i) => i.nature && i.nature !== "Taxable",
  )) {
    const key = i.nature === "Non-GST" ? "nongst" : "exempt",
      h = purchaseIsInterstate(i.gstin, i.place || homeState) ? "igst" : "cgst";
    five[key].taxes[h] += i.taxable;
  }
  const signed = (rows, keys) => ({
    rows: Object.fromEntries(
      Object.entries(rows).map(([k, r]) => [
        k,
        { taxable: r.taxable || 0, taxes: { ...heads(), ...r.taxes } },
      ]),
    ),
    taxable: keys.reduce((n, k) => round(n + (rows[k]?.taxable || 0)), 0),
    taxes: keys.reduce((n, k) => add(n, rows[k]?.taxes), heads()),
  });
  const interRows = {};
  for (const key of ["unregistered", "composition", "uin"])
    interRows[key] = states
      .filter((r) => r.category === key)
      .reduce(
        (a, r) => ({
          taxable: round(a.taxable + r.taxable),
          taxes: add(a.taxes, r.taxes),
        }),
        { taxable: 0, taxes: heads() },
      );
  const interstate = signed(interRows, ["unregistered", "composition", "uin"]);
  interstate.states = states;
  interstate.rows.states = states;
  return {
    3.1: signed({ ...rows, d: { taxable: 0, taxes: heads() } }, ["a", "b"]),
    "3.1.1": signed(
      {
        a: sum(
          p.invoices.filter((i) => ["ECO95", "ECO95A"].includes(i.section)),
        ),
        b: sum(
          p.invoices.filter(
            (i) => ["ECO", "ECOA"].includes(i.section) && i.ecoBucket === "95",
          ),
        ),
      },
      ["a"],
    ),
    3.2: interstate,
    4: validate3b("4", {
      a5: {
        taxes: Object.fromEntries(
          HEADS.map((h) => [h, Math.max(0, credit[h])]),
        ),
      },
    }),
    5: validate3b("5", five),
  };
}
function validate3b(table, inputRows) {
  const keys = {
    3.1: ["a", "b", "c", "d", "e"],
    "3.1.1": ["a", "b"],
    3.2: ["unregistered", "composition", "uin"],
    4: ["a1", "a2", "a3", "a4", "a5", "b1", "b2", "d1", "d2"],
    5: ["exempt", "nongst"],
    5.1: ["interest", "latefee"],
  }[table];
  if (!keys) fail("Unknown GSTR-3B table.");
  if (!inputRows || typeof inputRows !== "object" || Array.isArray(inputRows))
    fail("Invalid table details.");
  const readAmount = ["3.1", "3.1.1", "4"].includes(String(table))
    ? returnRules.signed
    : amount;
  const readHeads = ["3.1", "3.1.1", "4"].includes(String(table))
    ? returnRules.signedHeads
    : heads;
  const rows = Object.fromEntries(
    keys.map((k) => [
      k,
      {
        taxable: readAmount(inputRows[k]?.taxable),
        taxes: readHeads(inputRows[k]?.taxes),
      },
    ]),
  );
  const states =
    table === "3.2"
      ? (inputRows.states || []).map((r) => ({
          category: keys.includes(r.category)
            ? r.category
            : fail("Select a valid recipient category."),
          place: stateName(r.place),
          taxable: amount(r.taxable),
          taxes: { igst: amount(r.taxes?.igst), cgst: 0, sgst: 0, cess: 0 },
        }))
      : [];
  if (
    table === "4" &&
    ["a1", "a2"].some((key) => rows[key].taxes.cgst || rows[key].taxes.sgst)
  )
    fail(
      "Import of goods and import of services allow Integrated Tax and Cess only in Table 4.",
    );
  if (states.length > 100) fail("Too many interstate supply rows.");
  if (states.length)
    for (const key of keys)
      rows[key] = states
        .filter((r) => r.category === key)
        .reduce(
          (a, r) => ({
            taxable: round(a.taxable + r.taxable),
            taxes: add(a.taxes, r.taxes),
          }),
          { taxable: 0, taxes: heads() },
        );
  const included =
    table === "3.1"
      ? ["a", "b"]
      : table === "3.1.1"
        ? ["a"]
        : table === "4"
          ? ["a1", "a2", "a3", "a4", "a5"]
          : keys;
  const result = {
    rows,
    taxable: included.reduce((n, k) => round(n + rows[k].taxable), 0),
    taxes: included.reduce((n, k) => add(n, rows[k].taxes), heads()),
  };
  if (table === "3.2") {
    result.states = states;
    result.rows.states = states;
  }
  return result;
}
const utilityTax = (r) => ({
  taxable: r?.txval || 0,
  taxes: {
    igst: r?.iamt || 0,
    cgst: r?.camt || 0,
    sgst: r?.samt || 0,
    cess: r?.csamt || 0,
  },
});
function parseGstr3b(d) {
  if (!d.tables && !d.sup_details && (d.b2b || d.hsn || d.doc_issue))
    fail(
      "This file contains GSTR-1 invoice data, not GSTR-3B tables. Select a GSTR-3B utility JSON file.",
    );
  if (d.tables)
    return Object.fromEntries(
      Object.entries(d.tables).map(([k, v]) => [k, validate3b(k, v.rows || v)]),
    );
  const out = {},
    s = d.sup_details,
    i = d.itc_elg;
  if (s)
    out["3.1"] = validate3b(
      "3.1",
      Object.fromEntries(
        [
          "osup_det",
          "osup_zero",
          "osup_nil_exmp",
          "isup_rev",
          "osup_nongst",
        ].map((k, n) => [["a", "b", "c", "d", "e"][n], utilityTax(s[k])]),
      ),
    );
  if (d.inter_sup)
    out["3.2"] = validate3b("3.2", {
      states: [
        ...[...(d.inter_sup.unreg_details || [])].map((r) => ({
          ...r,
          category: "unregistered",
        })),
        ...(d.inter_sup.comp_details || []).map((r) => ({
          ...r,
          category: "composition",
        })),
        ...(d.inter_sup.uin_details || []).map((r) => ({
          ...r,
          category: "uin",
        })),
      ].map((r) => ({
        category: r.category,
        place: stateName(r.pos),
        taxable: r.txval,
        taxes: { igst: r.iamt },
      })),
    });
  if (i) {
    const rows = {};
    for (const r of i.itc_avl || [])
      rows[
        { IMPG: "a1", IMPS: "a2", ISRC: "a3", ISD: "a4", OTH: "a5" }[r.ty] ||
          fail("Unknown ITC category.")
      ] = utilityTax(r);
    for (const r of i.itc_rev || [])
      rows[r.ty === "RUL" ? "b1" : "b2"] = utilityTax(r);
    for (const r of i.itc_inelg || [])
      rows[r.ty === "RUL" ? "d1" : "d2"] = utilityTax(r);
    out["4"] = validate3b("4", rows);
  }
  if (d.inward_sup) {
    const rows = {};
    for (const r of d.inward_sup.isup_details || [])
      rows[r.ty === "GST" ? "exempt" : "nongst"] = {
        taxes: { igst: r.inter || 0, cgst: r.intra || 0 },
      };
    out["5"] = validate3b("5", rows);
  }
  if (d.intr_ltfee)
    out["5.1"] = validate3b("5.1", {
      interest: utilityTax(d.intr_ltfee.intr_details),
      latefee: utilityTax(d.intr_ltfee.ltfee_details),
    });
  if (!Object.keys(out).length) fail("No supported GSTR-3B tables found.");
  return out;
}
function purchaseIsInterstate(gstin, place) {
  return stateName(gstin.slice(0, 2)) !== stateName(place);
}
function purchaseRow(input, period, homeState) {
  if (Array.isArray(input.items) && input.items.length) {
    if (input.items.length > 100)
      fail("Add at most 100 item-rate rows per purchase document.");
    const parts = input.items.map((line) =>
      purchaseRow(
        {
          ...input,
          items: undefined,
          rate: line.rate,
          taxable: line.taxable,
          taxes: line.taxes,
          cess: line.cess,
          invoiceValue: undefined,
        },
        period,
        homeState,
      ),
    );
    const taxable = round(parts.reduce((n, line) => n + line.taxable, 0)),
      taxes = parts.reduce((sum, line) => add(sum, line.taxes), heads());
    return {
      ...parts[0],
      taxable,
      taxes,
      invoiceValue:
        input.invoiceValue === undefined
          ? round(taxable + total(taxes))
          : amount(input.invoiceValue),
      mixedRate: new Set(parts.map((line) => line.rate)).size > 1,
      items: parts.map((line, index) => ({
        rate: line.rate,
        taxable: line.taxable,
        taxes: line.taxes,
        cess: line.taxes.cess,
        hsn: input.items[index].hsn || "",
      })),
    };
  }

  const gstin = String(input.gstin || "").toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin))
    fail("Enter a valid supplier GSTIN.");
  if (!input.number || !input.supplier)
    fail("Enter supplier name and invoice number.");
  const dt = date(input.date);
  if (dt.slice(0, 7) !== period || !validDate(dt))
    fail("Purchase date must match the selected month.");
  const place = stateName(input.place || homeState),
    rate = amount(input.rate),
    taxable = amount(input.taxable),
    tax = round((taxable * rate) / 100),
    inter = purchaseIsInterstate(gstin, place);
  if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(rate))
    fail("Select a valid GST rate.");
  if (
    input.match &&
    !["Matched", "Requires Review", "Ineligible"].includes(input.match)
  )
    fail("Select a valid ITC status.");
  if (
    input.documentType &&
    !["Invoice", "Credit Note", "Debit Note"].includes(input.documentType)
  )
    fail("Select a valid supplier document type.");
  const taxes = input.taxes
    ? heads(input.taxes)
    : {
        igst: inter ? tax : 0,
        cgst: inter ? 0 : round(tax / 2),
        sgst: inter ? 0 : round(tax - round(tax / 2)),
        cess: amount(input.cess),
      };
  return {
    id: input.id || crypto.randomUUID(),
    gstin,
    supplier: String(input.supplier).slice(0, 150),
    number: String(input.number).slice(0, 30),
    date: dt,
    place,
    rate,
    taxable,
    taxes,
    invoiceValue:
      input.invoiceValue === undefined
        ? round(taxable + total(taxes))
        : amount(input.invoiceValue),
    match:
      !inter && place !== stateName(homeState)
        ? "Ineligible"
        : input.match || "Matched",
    itcReason:
      !inter && place !== stateName(homeState)
        ? "Supplier and Place of Supply are in the same state, while the recipient is registered in another state."
        : "",
    includedIn2b: input.includedIn2b !== false,
    documentType: input.documentType || "Invoice",
    supplierFiled: input.supplierFiled !== false,
    reverseCharge: Boolean(input.reverseCharge),
    nature: input.nature || "Taxable",
    reportedOn: input.reportedOn || dt,
  };
}
function documentRow(
  body,
  taxpayer,
  existing = [],
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  const kind = body.kind;
  if (!["eway", "einvoice"].includes(kind)) fail("Unknown document type.");
  const f = { ...body.form, date: date(body.form?.date) };
  if (f.transportDate && !validDate(f.transportDate))
    fail("Enter a valid transport document date.");
  if (!f.number || !validDate(f.date))
    fail("Enter document number and valid date.");
  if (String(f.number).length > 30) fail("Document number is too long.");
  if (
    existing.some(
      (d) =>
        d.invoice.number === f.number &&
        (kind === "einvoice"
          ? financialYear(d.invoice.date.slice(0, 7)) ===
            financialYear(f.date.slice(0, 7))
          : d.invoice.date === f.date) &&
        (kind === "einvoice" || d.status !== "Cancelled"),
    )
  )
    fail(
      "A document already exists for this invoice. Cancelled IRNs cannot be regenerated for the same invoice.",
    );
  const seller = f.seller || {},
    buyer = f.buyer || {};
  if (kind !== "eway" && seller.gstin && seller.gstin !== taxpayer.gstin)
    fail("Supplier GSTIN must match the selected taxpayer.");
  const gstin = String(buyer.gstin || "URP").toUpperCase();
  if (
    (kind === "einvoice" || gstin !== "URP") &&
    !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)
  )
    fail("Enter a valid recipient GSTIN.");
  for (const [label, party] of [
    ["Seller", seller],
    ["Buyer", buyer],
  ])
    if (
      !party.name ||
      !party.address ||
      !/^\d{6}$/.test(party.pincode || "") ||
      !party.state
    )
      fail(`${label} name, address, state and six-digit PIN are required.`);
  const place = stateName(f.place || buyer.state),
    inter =
      place !== seller.state ||
      f.subType === "Export" ||
      f.subType === "Import";
  if (
    !Array.isArray(f.items) ||
    !f.items.length ||
    f.items.length > (kind === "eway" ? 250 : 100)
  )
    fail(`Add between 1 and ${kind === "eway" ? 250 : 100} items.`);
  const items = f.items.map((i) => {
    if (!i.name || !/^\d{4,8}$/.test(i.hsn || "") || !i.uqc)
      fail("Each item needs a product name, HSN and unit.");
    const quantity = amount(i.quantity),
      unitPrice = amount(i.unitPrice),
      rate = amount(i.rate);
    if (
      !quantity ||
      ![0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40].includes(rate)
    )
      fail("Enter positive quantity and a valid GST rate.");
    const taxable =
        i.taxable === undefined || i.taxable === ""
          ? round(quantity * unitPrice)
          : amount(i.taxable),
      tax = round((taxable * rate) / 100);
    return {
      ...i,
      quantity,
      unitPrice,
      rate,
      taxable,
      taxes: {
        igst: inter ? tax : 0,
        cgst: inter ? 0 : round(tax / 2),
        sgst: inter ? 0 : round(tax - round(tax / 2)),
        cess:
          i.cessRate !== undefined
            ? round(
                (taxable * amount(i.cessRate)) / 100 + amount(i.cessNonAdvol),
              )
            : amount(i.cess),
      },
    };
  });
  const taxes = items.reduce((s, i) => add(s, i.taxes), heads()),
    taxable = round(items.reduce((n, i) => n + i.taxable, 0));
  const ruleResult =
    kind === "eway" ? eway.validate(f, taxpayer, referenceDate) : null;
  const otherValue = Number(f.otherValue || 0);
  if (!Number.isFinite(otherValue) || Math.abs(otherValue) > 1e12)
    fail("Enter a valid other charge amount.");
  const computedTotal = round(taxable + total(taxes) + otherValue);
  if (computedTotal < 0) fail("Invoice total cannot be negative.");
  if (f.declaredTotals) {
    for (const [key, value] of Object.entries({
      taxable,
      ...taxes,
      total: computedTotal,
    }))
      if (
        f.declaredTotals[key] !== undefined &&
        (!Number.isFinite(Number(f.declaredTotals[key])) ||
          Math.abs(Number(f.declaredTotals[key]) - value) > 2)
      )
        fail(`Uploaded ${key} total does not match the item values.`);
  }
  const createdAt = new Date().toISOString(),
    number = String(crypto.randomInt(100000000000, 999999999999)),
    acknowledgement =
      String(crypto.randomInt(100000000, 1000000000)) +
      String(crypto.randomInt(100000, 1000000));
  return {
    id: crypto.randomUUID(),
    kind,
    createdAt,
    status: f.partAOnly ? "Part A" : "Active",
    issuedAt: referenceDate + "T12:00:00+05:30",
    referenceDate,
    partAOnly: Boolean(f.partAOnly),
    alerts: ruleResult?.alerts || [],
    number,
    acknowledgement,
    irn: crypto
      .createHash("sha256")
      .update(`${taxpayer.gstin}:${f.number}:${f.date}`)
      .digest("hex"),
    invoice: {
      number: String(f.number),
      date: f.date,
      gstin,
      recipient: buyer.name,
      taxable,
      taxes,
      invoiceValue: computedTotal,
    },
    ...Object.fromEntries(
      [
        "supplyType",
        "subType",
        "documentType",
        "transactionType",
        "mode",
        "vehicle",
        "vehicleType",
        "transporter",
        "transportDocument",
        "transportDate",
        "transporterId",
        "subSupplyDesc",
        "dispatch",
        "destination",
      ].map((k) => [k, String(f[k] || "").slice(0, 200)]),
    ),
    seller,
    buyer,
    dispatchDetails: f.dispatchDetails,
    shipDetails: f.shipDetails,
    otherValue,
    place,
    items,
    distance: amount(f.distance),
    validUntil:
      kind !== "eway" || f.partAOnly
        ? null
        : eway.expiry(referenceDate, f.distance, f.vehicleType),
  };
}
function parseDocumentFile(d, kind) {
  if (Array.isArray(d.documents)) return d.documents;
  if (kind === "eway" && Array.isArray(d.billLists))
    return d.billLists.map((r) => ({
      number: r.docNo,
      date: date(r.docDate),
      supplyType: r.supplyType === "I" ? "Inward" : "Outward",
      subType: eway.SUB_TYPES[r.subSupplyType] || "Supply",
      subSupplyDesc: r.subSupplyDesc || "",
      documentType: eway.DOC_TYPES[r.docType] || "Tax Invoice",
      transactionType:
        {
          1: "Regular",
          2: "Bill To — Ship To",
          3: "Bill From — Dispatch From",
          4: "Combination",
        }[r.transactionType || r.transType] || "Regular",
      seller: {
        gstin: r.fromGstin,
        name: r.fromTrdName,
        address: [r.fromAddr1, r.fromAddr2].filter(Boolean).join(" "),
        city: r.fromPlace,
        pincode: String(r.fromPincode),
        state: stateName(r.fromStateCode),
      },
      buyer: {
        gstin: r.toGstin,
        name: r.toTrdName,
        address: [r.toAddr1, r.toAddr2].filter(Boolean).join(" "),
        city: r.toPlace,
        pincode: String(r.toPincode),
        state: stateName(r.toStateCode),
      },
      place: stateName(r.toStateCode),
      dispatchDetails: {
        address: [r.fromAddr1, r.fromAddr2].filter(Boolean).join(" "),
        city: r.fromPlace,
        pincode: String(r.fromPincode),
        state: stateName(
          r.actFromStateCode || r.actualFromStateCode || r.fromStateCode,
        ),
      },
      shipDetails: {
        address: [r.toAddr1, r.toAddr2].filter(Boolean).join(" "),
        city: r.toPlace,
        pincode: String(r.toPincode),
        state: stateName(
          r.actToStateCode || r.actualToStateCode || r.toStateCode,
        ),
      },
      otherValue: r.otherValue || 0,
      declaredTotals: {
        taxable: r.totalValue,
        total: r.totInvValue,
        igst: r.igstValue,
        cgst: r.cgstValue,
        sgst: r.sgstValue,
        cess: Number(r.cessValue || 0) + Number(r.cessNonAdvolValue || 0),
      },
      vehicleType: r.vehicleType === "O" ? "Over Dimensional Cargo" : "Regular",
      vehicle: r.vehicleNo,
      mode:
        { 1: "Road", 2: "Rail", 3: "Air", 4: "Ship" }[r.transMode] || "Road",
      distance: r.transDistance,
      transporter: r.transporterName || "",
      transporterId: r.transporterId,
      transportDocument: r.transDocNo,
      transportDate: date(r.transDocDate),
      items: (r.itemList || []).map((i) => ({
        name: i.productName,
        description: i.productDesc,
        hsn: String(i.hsnCode),
        quantity: i.quantity,
        uqc: i.qtyUnit,
        taxable: i.taxableAmount,
        unitPrice: i.taxableAmount / i.quantity,
        rate:
          Number(i.igstRate) ||
          Number(i.cgstRate || 0) + Number(i.sgstRate || 0),
        cessRate: i.cessRate || 0,
        cessNonAdvol: i.cessNonadvol || 0,
      })),
    }));
  const invoices = d.Invoices || d.invoices || (d.DocDtls ? [d] : null);
  if (kind === "einvoice" && Array.isArray(invoices))
    return invoices.map((w) => {
      const r = w.Invoice || w;
      return {
        number: r.DocDtls?.No,
        date: date(r.DocDtls?.Dt),
        documentType: r.DocDtls?.Typ || "INV",
        seller: {
          gstin: r.SellerDtls?.Gstin,
          name: r.SellerDtls?.LglNm,
          address: r.SellerDtls?.Addr1,
          city: r.SellerDtls?.Loc,
          pincode: String(r.SellerDtls?.Pin),
          state: stateName(r.SellerDtls?.Stcd),
        },
        buyer: {
          gstin: r.BuyerDtls?.Gstin,
          name: r.BuyerDtls?.LglNm,
          address: r.BuyerDtls?.Addr1,
          city: r.BuyerDtls?.Loc,
          pincode: String(r.BuyerDtls?.Pin),
          state: stateName(r.BuyerDtls?.Stcd),
        },
        place: stateName(r.BuyerDtls?.Pos || r.BuyerDtls?.Stcd),
        items: (r.ItemList || []).map((i) => ({
          name: i.PrdDesc,
          hsn: String(i.HsnCd),
          quantity: i.Qty,
          uqc: i.Unit,
          unitPrice: i.UnitPrice,
          taxable: i.AssAmt,
          rate: i.GstRt,
          cess: Number(i.CesAmt || 0) + Number(i.CesNonAdvlAmt || 0),
        })),
      };
    });
  fail(
    "No supported documents found. Use the JSON template, e-way bill billLists, or e-invoice Invoices format.",
  );
}
const { attachment } = require("./practice-documents");

module.exports = {
  draft3b,
  financialYear,
  setFrequency,
  validDate,
  STATE_CODES,
  stateName,
  quarterInfo,
  returnData,
  assertWritable,
  assertIff,
  parseGstr1,
  parseGstr3b,
  validate3b,
  purchaseRow,
  documentRow,
  parseDocumentFile,
  parseObject,
  checkFile,
  attachment,
};
