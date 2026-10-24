"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDatabase, parameters } = require("../database");

test("PostgreSQL parameters are bound, not interpolated into SQL", () => {
  assert.deepEqual(
    parameters("SELECT ? AS value, '?' AS literal -- ?\n", [
      "Robert'; DROP TABLE users;--",
    ]),
    {
      text: "SELECT $1 AS value, '?' AS literal -- ?\n",
      values: ["Robert'; DROP TABLE users;--"],
    },
  );
  assert.deepEqual(
    parameters("INSERT INTO users(id, name) VALUES (@id, @name)", [
      { id: "student", name: "Test" },
    ]),
    {
      text: "INSERT INTO users(id, name) VALUES ($1, $2)",
      values: ["student", "Test"],
    },
  );
  assert.throws(() => parameters("SELECT @missing", [{}]), /Missing named/);
});
test("production cannot silently use an ephemeral SQLite file", () => {
  assert.throws(
    () => createDatabase({ NODE_ENV: "production", SQLITE_PATH: ":memory:" }),
    /DATABASE_URL is required/,
  );
});
test("isolated SQLite test transactions await callbacks and roll back failures", async (t) => {
  const db = createDatabase({ SQLITE_PATH: ":memory:" });
  t.after(() => db.close());
  db.exec("CREATE TABLE checks (id TEXT PRIMARY KEY)");
  await assert.rejects(
    db.transaction(async () => {
      await Promise.resolve();
      db.prepare("INSERT INTO checks VALUES (?)").run("rolled-back");
      throw new Error("rollback fixture");
    })(),
    /rollback fixture/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM checks").get().n, 0);
});
