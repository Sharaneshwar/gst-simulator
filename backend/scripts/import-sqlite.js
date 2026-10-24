"use strict";
const fs = require("node:fs");
const path = require("node:path");
const SQLite = require("better-sqlite3");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
require("dotenv").config({
  path: path.join(__dirname, "../../.env.local"),
  quiet: true,
});
const { createDatabase } = require("../database");
const { migrateDatabase } = require("../migrate");

async function main() {
  const source =
    process.argv[2] || path.join(__dirname, "../data/gst-playground.sqlite");
  if (!fs.existsSync(source))
    throw new Error("The source SQLite database does not exist.");
  const sqlite = new SQLite(source, { readonly: true, fileMustExist: true });
  const db = createDatabase({
    ...process.env,
    SQLITE_PATH: "",
    DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  });
  try {
    await migrateDatabase(db);
    const available = new Set(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    const tables = [
      "users",
      "case_definitions",
      "user_case_state",
      "access_audit",
      "otp_delivery_log",
    ].filter((name) => available.has(name));
    const counts = {};
    await db.transaction(async () => {
      await db.lock("gst-sqlite-import");
      for (const table of tables) {
        const existing = await db
          .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
          .get();
        if (existing.n)
          throw new Error(
            `Import stopped: ${table} already contains data. No existing rows were overwritten.`,
          );
      }
      for (const table of tables) {
        const columns = (
          await db
            .prepare(
              "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?",
            )
            .all(table)
        ).map((row) => row.name);
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          const keys = Object.keys(row).filter((key) => columns.includes(key));
          const statement = db.prepare(
            `INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          );
          await statement.run(...keys.map((key) => row[key]));
        }
        counts[table] = rows.length;
      }
    })();
    console.log(
      JSON.stringify({
        imported: true,
        sourceUnchanged: true,
        counts,
        otpChallenges: "Not copied: request fresh codes after migration.",
      }),
    );
  } finally {
    sqlite.close();
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
