"use strict";

function signatories(registration) {
  const saved = registration?.tabs?.signatory;
  const rows = Array.isArray(saved?.records)
    ? saved.records
    : saved?.name
      ? [saved]
      : [];
  const unique = new Map();
  for (const person of rows) {
    if (!person || typeof person !== "object") continue;
    const name = [person.name, person.middleName, person.lastName]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(" ");
    if (!name) continue;
    const email = String(person.email || "")
      .trim()
      .toLowerCase();
    unique.set(`${email}:${name}`, {
      name,
      rawName: person.name,
      email,
      primary: person.primary === "Yes",
    });
  }
  const people = [...unique.values()];
  return people.map((person) => {
    const base = person.email || person.name;
    const duplicates = people.filter(
      (p) => (p.email || p.name) === base,
    ).length;
    return {
      value: duplicates > 1 ? `${base}::${person.name}` : base,
      label: person.name,
      email: person.email,
      primary: person.primary,
      aliases: [person.name, person.rawName, person.email].filter(Boolean),
      description: [
        person.primary
          ? "Primary authorized signatory"
          : "Authorized signatory",
        person.email,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
}

function resolveSignatory(registration, value) {
  const people = signatories(registration),
    text = String(value || "")
      .trim()
      .toLowerCase();
  const exact = people.find((p) => p.value.toLowerCase() === text);
  if (exact) return exact;
  const legacy = people.filter((p) =>
    p.aliases.some((alias) => String(alias).trim().toLowerCase() === text),
  );
  return legacy.length === 1 ? legacy[0] : null;
}

function authenticationValues(registration, values) {
  if (values.opted === "No") return { ...values, person: "", personName: "" };
  if (values.opted !== "Yes") return values;
  if (!signatories(registration).length)
    throw Object.assign(
      Error(
        "Add and save an authorized signatory before selecting a person for authentication.",
      ),
      { status: 400 },
    );
  const person = resolveSignatory(registration, values.person);
  if (!person)
    throw Object.assign(
      Error(
        "Select a person from this application's saved authorized signatories.",
      ),
      { status: 400 },
    );
  return { ...values, person: person.value, personName: person.label };
}

function signingOptions(w, taxpayer, purpose) {
  const registration = purpose === "registration-submit";
  const people = registration
    ? signatories(w.registration)
    : taxpayer.signatories ||
      (["Pending for Validation", "Approved"].includes(w.registration?.stage)
        ? signatories(w.registration)
        : []);
  const constitution = registration
    ? w.registration?.tabs?.business?.constitution
    : taxpayer.constitution ||
      (["Pending for Validation", "Approved"].includes(w.registration?.stage)
        ? w.registration?.tabs?.business?.constitution
        : "");
  const dsc = /company|limited liability partnership/i.test(constitution || "");
  return { people, methods: dsc ? ["DSC"] : ["EVC", "DSC"] };
}
module.exports = {
  signatories,
  resolveSignatory,
  authenticationValues,
  signingOptions,
};
