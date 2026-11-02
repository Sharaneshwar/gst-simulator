"use strict";
const data = require("./data/postal-directory.json");
const { STATE_CODES } = require("./practice-workflows");
const rows = data.rows.map(
  ([pincode, code, district, localities, latitude, longitude]) => ({
    pincode,
    state: STATE_CODES[code],
    district,
    localities,
    latitude,
    longitude,
  }),
);
const index = rows.map((row) =>
  `${row.pincode} ${row.state} ${row.district} ${row.localities.join(" ")}`.toLowerCase(),
);
function search(query, state) {
  const q = String(query || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  if (q.length < 2) return [];
  const matches = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (state && row.state !== state) continue;
    if (!index[i].includes(q)) continue;
    const locality =
      row.localities.find((name) => name.toLowerCase().includes(q)) ||
      row.localities[0] ||
      row.district;
    matches.push({
      pincode: row.pincode,
      state: row.state,
      district: row.district,
      city: locality,
      locality,
      latitude: row.latitude,
      longitude: row.longitude,
      approximate: true,
    });
    if (matches.length >= 20) break;
  }
  return matches;
}
function districts(state) {
  return [
    ...new Set(
      rows.filter((row) => row.state === state).map((row) => row.district),
    ),
  ].sort();
}
function jurisdictions(w, input) {
  const { state, pincode, district } = input;
  const custom = (w.jurisdictionMasters || []).filter(
    (row) =>
      row.state === state &&
      (!row.pincode || row.pincode === pincode) &&
      (!row.district ||
        row.district.toLowerCase() === String(district || "").toLowerCase()),
  );
  if (custom.length)
    return {
      rows: custom,
      source: "Imported jurisdiction master",
      trainingOnly: false,
    };
  // Explicit training fixtures preserve the government hierarchy without pretending
  // that postal boundaries establish a legally authoritative tax jurisdiction.
  const area = String(district || districts(state)[0] || state).trim();
  return {
    trainingOnly: true,
    source: "Training jurisdiction directory",
    rows: [1, 2, 3].map((n) => ({
      state,
      district: area,
      pincode,
      stateJurisdiction: `${area} — Training Circle`,
      ward: `Training Ward ${n}`,
      commissionerate: `${state} — Training Commissionerate`,
      division: `${area} — Training Division`,
      range: `Training Range ${n}`,
    })),
  };
}
module.exports = {
  search,
  districts,
  jurisdictions,
  count: rows.length,
  sources: data.sources,
};
