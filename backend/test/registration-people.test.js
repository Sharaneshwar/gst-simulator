"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  signatories,
  resolveSignatory,
  authenticationValues,
} = require("../registration-people");
const registration = {
  tabs: {
    signatory: {
      records: [
        {
          name: "Anita",
          lastName: "Shah",
          email: "anita@example.com",
          primary: "Yes",
        },
        {
          name: "Ravi",
          middleName: "Kumar",
          lastName: "Patel",
          email: "ravi@example.com",
        },
      ],
    },
  },
};
test("authentication choices come from saved authorized signatories and show full names", () => {
  const people = signatories(registration);
  assert.deepEqual(
    people.map((p) => p.label),
    ["Anita Shah", "Ravi Kumar Patel"],
  );
  assert.equal(people[0].value, "anita@example.com");
  assert.match(people[0].description, /Primary/);
  assert.equal(
    resolveSignatory(registration, "Ravi").label,
    "Ravi Kumar Patel",
  );
  const saved = authenticationValues(registration, {
    opted: "Yes",
    person: "Anita Shah",
  });
  assert.equal(saved.person, "anita@example.com");
  assert.equal(saved.personName, "Anita Shah");
});
test("unknown people and ambiguous names cannot become selected signatories", () => {
  assert.throws(
    () =>
      authenticationValues(registration, {
        opted: "Yes",
        person: "Someone else",
      }),
    /saved authorized/,
  );
  assert.throws(
    () => authenticationValues({ tabs: {} }, { opted: "Yes", person: "Anita" }),
    /Add and save/,
  );
  const repeated = {
    tabs: {
      signatory: {
        records: [
          { name: "Same Name", email: "one@example.com" },
          { name: "Same Name", email: "two@example.com" },
        ],
      },
    },
  };
  assert.equal(resolveSignatory(repeated, "Same Name"), null);
  assert.equal(
    authenticationValues(repeated, { opted: "Yes", person: "two@example.com" })
      .person,
    "two@example.com",
  );
  assert.deepEqual(
    authenticationValues(registration, { opted: "No", person: "old text" }),
    { opted: "No", person: "", personName: "" },
  );
});
test("single-record legacy signatories work and shared contact emails stay distinguishable", () => {
  assert.equal(
    signatories({
      tabs: { signatory: { name: "Legacy", email: "old@example.com" } },
    })[0].label,
    "Legacy",
  );
  const shared = {
    tabs: {
      signatory: {
        records: [
          { name: "First Person", email: "shared@example.com" },
          { name: "Second Person", email: "shared@example.com" },
        ],
      },
    },
  };
  const people = signatories(shared);
  assert.notEqual(people[0].value, people[1].value);
  assert.equal(resolveSignatory(shared, "shared@example.com"), null);
  assert.equal(
    authenticationValues(shared, { opted: "Yes", person: people[1].value })
      .personName,
    "Second Person",
  );
});
