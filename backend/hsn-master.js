"use strict";

const snapshot = require("./data/hsn-sac.json");
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const records = [
  ...snapshot.goods.map(([code, description]) => ({
    code,
    description,
    type: "Goods",
  })),
  ...snapshot.services.map(([code, description]) => ({
    code,
    description,
    type: "Services",
  })),
].map((record) => ({
  ...record,
  text: normalize(
    record.description +
      " " +
      snapshot.alternateDescriptions
        .filter(
          (a) => a.code === record.code && a.kind === record.type.toLowerCase(),
        )
        .map((a) => a.description)
        .join(" "),
  ),
}));
const byCode = new Map(records.map((record) => [record.code, record]));
const publicRecord = ({ code, description, type }) => ({
  code,
  description,
  type,
});

function lookup(code) {
  const record = byCode.get(String(code || "").trim());
  return record ? publicRecord(record) : null;
}

function search({
  q = "",
  type = "",
  registration = false,
  browse = false,
  minDigits = 2,
  limit = 20,
  offset = 0,
} = {}) {
  if (typeof q !== "string" || q.length > 120)
    fail("Search using up to 120 characters.");
  if (type && !["Goods", "Services"].includes(type))
    fail("Select Goods or Services.");
  minDigits = Number(minDigits);
  if (![2, 4, 6, 8].includes(minDigits)) fail("Invalid code length filter.");
  limit = Number(limit);
  offset = Number(offset);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    fail("Invalid search page.");
  const query = normalize(q),
    numeric = /^\d+$/.test(query),
    minLength = numeric ? 2 : 3;
  const response = {
    results: [],
    total: 0,
    offset,
    limit,
    minLength,
    source: snapshot.source,
    retrievedOn: snapshot.retrievedOn,
  };
  if (query.length < minLength && !(browse && !query)) return response;
  const words = query.split(" ");
  const matches = [];
  for (const record of records) {
    if (
      record.code.length < minDigits ||
      (type && type !== record.type) ||
      (registration &&
        (record.type === "Goods"
          ? record.code.length !== 4
          : record.code.length < 4))
    )
      continue;
    let rank;
    if (!query) {
      rank = 0;
    } else if (numeric) {
      if (!record.code.startsWith(query)) continue;
      rank = record.code === query ? 0 : 1;
    } else {
      if (!words.every((word) => record.text.includes(word))) continue;
      rank =
        record.text === query
          ? 0
          : record.text.startsWith(query)
            ? 1
            : record.text.includes(query)
              ? 2
              : 3;
    }
    matches.push({ record, rank });
  }
  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.record.code.length - b.record.code.length ||
      a.record.code.localeCompare(b.record.code),
  );
  return {
    ...response,
    total: matches.length,
    results: matches
      .slice(offset, offset + limit)
      .map(({ record }) => publicRecord(record)),
  };
}

function registrationValues(values) {
  const rows = values.records || [values];
  if (!Array.isArray(rows) || !rows.length || rows.length > 10)
    fail("Select up to five goods and five services.");
  const counts = { Goods: 0, Services: 0 },
    seen = new Set();
  const selected = rows.map((row) => {
    const match = lookup(row.hsn);
    if (!match || match.code.length < 4)
      fail("Select a valid HSN/SAC from the search results.");
    if (match.type === "Goods" && match.code.length !== 4)
      fail("Select a four-digit HSN heading for goods registration.");
    if (
      row.type &&
      row.type !== "Goods and Services" &&
      row.type !== match.type
    )
      fail("The selected code does not match Goods / Services.");
    if (seen.has(match.code)) fail("This HSN/SAC code has already been added.");
    seen.add(match.code);
    if (++counts[match.type] > 5)
      fail("Add at most five goods and five services.");
    return {
      ...row,
      hsn: match.code,
      description: match.description,
      type: match.type,
    };
  });
  return { ...selected[0], records: selected };
}

function mountHsnMaster(app) {
  app.get("/api/masters/hsn", (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(
        search({
          q: req.query.q,
          browse: req.query.browse === "1",
          minDigits: req.query.minDigits || 2,
          type: req.query.type,
          registration: req.query.registration === "1",
          limit: req.query.limit || 20,
          offset: req.query.offset || 0,
        }),
      );
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { lookup, search, registrationValues, mountHsnMaster };
