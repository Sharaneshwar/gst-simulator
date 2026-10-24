"use strict";
// Opt-in only: never run integration fixtures against the application's production URL.
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env.neon-test"), override: true, quiet: true });
if (process.env.NEON_BRANCH !== "gst-migration-test-20261024") throw new Error("An isolated Neon test branch is required.");
if (!process.env.DATABASE_URL) throw new Error("Missing isolated test database URL.");
delete process.env.SQLITE_PATH;
process.env.GST_TEST_POSTGRES = "1";
