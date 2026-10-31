"use strict";
// Every run gets a fresh schema on the explicitly configured non-production branch.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const dotenv = require("dotenv");
const { createDatabase } = require("../database");
const root = path.join(__dirname, "..");
const read = (file) =>
  fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
const test = read(path.join(root, ".env.neon-test"));
const production = {
  ...read(path.join(root, "../.env.local")),
  ...read(path.join(root, ".env")),
};
const endpoint = (url) => new URL(url).hostname.replace("-pooler", "");
(async () => {
  if (
    !/^gst-(migration|release)-test-\d{8}$/.test(test.NEON_BRANCH || "") ||
    !test.DATABASE_URL ||
    !production.DATABASE_URL ||
    endpoint(test.DATABASE_URL) === endpoint(production.DATABASE_URL)
  )
    throw Error(
      "An isolated Neon test branch with a different endpoint is required.",
    );
  const schema =
    "gst_test_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
  const db = createDatabase({
    DATABASE_URL: test.DATABASE_URL_UNPOOLED || test.DATABASE_URL,
  });
  try {
    await db.exec(`CREATE SCHEMA "${schema}"`);
    console.log(
      "Neon test isolation verified: fresh schema " +
        schema +
        " on the non-production branch.",
    );
    const selected = process.argv.slice(2);
    if (selected.some((file) => !/^test\/[a-z-]+\.test\.js$/.test(file)))
      throw Error("Select test/*.test.js files only.");
    const files = selected.length
      ? selected
      : [
          "test/access.test.js",
          "test/portal.test.js",
          "test/registration-flow.test.js",
          "test/network-access.test.js",
        ];
    const child = spawn(
      process.execPath,
      [
        "--require",
        "./test/neon-env.cjs",
        "--test",
        "--test-concurrency=1",
        ...(process.env.GST_TEST_NAME_PATTERN
          ? ["--test-name-pattern=" + process.env.GST_TEST_NAME_PATTERN]
          : []),
        ...files,
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          GST_TEST_SCHEMA: schema,
          TOKEN_SECRET: crypto.randomBytes(32).toString("hex"),
          OTP_SECRET: crypto.randomBytes(32).toString("hex"),
          NODE_ENV: "development",
        },
      },
    );
    const timer = setTimeout(() => {
      console.error(
        "Neon test run exceeded 30 minutes; stopping the test process.",
      );
      child.kill("SIGTERM");
    }, 1800000);
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    clearTimeout(timer);
    process.exitCode = code === 0 ? 0 : 1;
  } finally {
    await db.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.close();
    console.log(
      "Temporary Neon test schema removed; existing schemas preserved.",
    );
  }
})().catch((e) => {
  console.error("Neon test run failed:", e.code || e.message);
  process.exitCode = 1;
});
