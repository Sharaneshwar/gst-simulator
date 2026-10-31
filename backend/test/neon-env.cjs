"use strict";
const fs = require("node:fs");
const path = require("node:path");
const config = require("dotenv").parse(
  fs.readFileSync(path.join(__dirname, "../.env.neon-test")),
);
if (!/^gst-(migration|release)-test-\d{8}$/.test(config.NEON_BRANCH || ""))
  throw Error("An isolated Neon test branch is required.");
const schema = process.env.GST_TEST_SCHEMA;
if (!/^gst_test_\d+_[a-f0-9]{8}$/.test(schema || ""))
  throw Error("Run npm run test:neon to create an isolated test schema.");
const url = new URL(config.DATABASE_URL_UNPOOLED || config.DATABASE_URL);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.DATABASE_URL_UNPOOLED = url.toString();
process.env.GST_TEST_POSTGRES = "1";
delete process.env.SQLITE_PATH;

// Bound network reads as well as connection establishment during cloud checks.
const pg = require("pg"),
  OriginalPool = pg.Pool;
pg.Pool = class TestPool extends OriginalPool {
  constructor(options) {
    super({ ...options, query_timeout: 20000 });
  }
};
