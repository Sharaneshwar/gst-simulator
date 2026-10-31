"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
test("bulk invite preview handles spreadsheet pastes, normalized duplicates and existing accounts", async () => {
  const { parseInvites, MAX_BULK_INVITES } = await import(
    "../../frontend/src/bulk-invites.mjs"
  );
  assert.equal(MAX_BULK_INVITES, 100);
  const rows = parseInvites(
    " ONE@example.com\n two@example.com;one@example.com, bad-address\tknown@example.com",
    [{ email: "known@example.com" }],
  );
  assert.deepEqual(
    rows.map((row) => row.email),
    [
      "one@example.com",
      "two@example.com",
      "one@example.com",
      "bad-address",
      "known@example.com",
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.status),
    ["ready", "ready", "duplicate", "invalid", "exists"],
  );
  assert.deepEqual(parseInvites("  \n  "), []);
  assert.equal(
    parseInvites("a".repeat(255) + "@example.com")[0].status,
    "invalid",
  );
});
