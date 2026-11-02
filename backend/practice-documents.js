"use strict";
// Proofs are metadata only. No identity document bytes are accepted or retained.
const DOCUMENTS = {
  constitution: ["Business_Constitution.pdf", 82000],
  photograph: ["Photograph.jpg", 48000],
  authorization: ["Letter_of_Authorization.pdf", 96000],
  premises: ["Electricity_Bill.pdf", 128000],
  tenancy: ["Rent_Agreement.pdf", 164000],
  consent: ["Consent_Letter.pdf", 72000],
  ekyc: ["E_KYC_Identity_Proof.pdf", 108000],
  sez: ["SEZ_Letter_of_Approval.pdf", 132000],
};
function fail(message) {
  const e = new Error(message);
  e.status = 400;
  throw e;
}
function attachment(value) {
  if (!value) return null;
  const kind = value.kind;
  if (
    !value.simulated ||
    !DOCUMENTS[kind] ||
    Object.keys(value).some(
      (k) => !["kind", "simulated", "name", "size"].includes(k),
    )
  )
    fail(
      "Identity documents use sample attachments. Real files are not accepted.",
    );
  const [name, size] = DOCUMENTS[kind];
  return { kind, simulated: true, name, size };
}
function sanitize(value, { legacy = false } = {}) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, { legacy }));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "attachment")
      out[key] = legacy
        ? item
          ? attachment({
              kind:
                item.simulated && DOCUMENTS[item.kind] ? item.kind : "premises",
              simulated: true,
            })
          : null
        : attachment(item);
    else if (key === "attachments") {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).length > 8
      )
        fail("Invalid attachment list.");
      out[key] = Object.fromEntries(
        Object.entries(item).map(([kind, doc]) => {
          if (!DOCUMENTS[kind]) fail("Unknown document type.");
          return [
            kind,
            legacy
              ? attachment({ kind, simulated: true })
              : attachment({ ...doc, kind }),
          ];
        }),
      );
    } else if (
      ["data", "base64", "content", "buffer", "dataUrl"].includes(key) ||
      (typeof item === "string" && item.startsWith("data:"))
    ) {
      if (!legacy)
        fail("Real document contents are not accepted in registration.");
    } else out[key] = sanitize(item, { legacy });
  }
  return out;
}
function validateCoordinates(values) {
  for (const item of values.records || [values]) {
    const hasLat = item.latitude !== undefined && item.latitude !== "";
    const hasLon = item.longitude !== undefined && item.longitude !== "";
    if (hasLat !== hasLon)
      fail(
        "Enter both latitude and longitude, or select a location on the map.",
      );
    if (
      hasLat &&
      (![item.latitude, item.longitude].every((v) =>
        Number.isFinite(Number(v)),
      ) ||
        Math.abs(Number(item.latitude)) > 90 ||
        Math.abs(Number(item.longitude)) > 180)
    )
      fail("Enter valid latitude (-90 to 90) and longitude (-180 to 180).");
  }
}
module.exports = { attachment, sanitize, validateCoordinates };
