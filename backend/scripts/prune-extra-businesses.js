"use strict";
const path = require("node:path");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
const { createDatabase } = require("../database");

async function main() {
  const db = createDatabase();
  if (db.dialect !== "postgres")
    throw new Error("This maintenance command requires PostgreSQL.");
  try {
    const result = await db.transaction(async () => {
      await db.lock("gst-business-cleanup");
      await db.exec(
        "CREATE TABLE IF NOT EXISTS business_cleanup_backup (user_id TEXT NOT NULL, case_slug TEXT NOT NULL, row_json JSONB NOT NULL, backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id, case_slug))",
      );
      const users = await db
        .prepare("SELECT id, business_slug FROM users ORDER BY id")
        .all();
      let removed = 0;
      for (const user of users) {
        const rows = await db
          .prepare(
            "SELECT * FROM user_case_state WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC",
          )
          .all(user.id);
        const keep =
          rows.find((row) => row.case_slug === user.business_slug) || rows[0];
        if (!keep) continue;
        const state = JSON.parse(keep.state_json);
        await db
          .prepare(
            "UPDATE users SET business_slug = ?, business_json = COALESCE(business_json, ?) WHERE id = ?",
          )
          .run(keep.case_slug, JSON.stringify(state.taxpayer), user.id);
        for (const row of rows.filter(
          (row) => row.case_slug !== keep.case_slug,
        )) {
          await db
            .prepare(
              "INSERT INTO business_cleanup_backup(user_id,case_slug,row_json) VALUES (?,?,?::jsonb) ON CONFLICT(user_id,case_slug) DO NOTHING",
            )
            .run(row.user_id, row.case_slug, JSON.stringify(row));
          removed += (
            await db
              .prepare(
                "DELETE FROM user_case_state WHERE user_id = ? AND case_slug = ?",
              )
              .run(row.user_id, row.case_slug)
          ).changes;
        }
        await db
          .prepare(
            "UPDATE user_case_state SET is_active = 1 WHERE user_id = ? AND case_slug = ?",
          )
          .run(user.id, keep.case_slug);
      }
      await db.exec(
        "DELETE FROM case_definitions WHERE slug <> 'regular-october' AND slug NOT IN (SELECT case_slug FROM user_case_state) AND slug NOT IN (SELECT business_slug FROM users WHERE business_slug IS NOT NULL)",
      );
      const remaining = await db
        .prepare("SELECT COUNT(*) AS n FROM user_case_state")
        .get();
      return {
        removed,
        remainingBusinesses: remaining.n,
        accounts: users.length,
        savedWorkPreserved: true,
        recoveryTable: "business_cleanup_backup",
      };
    })();
    console.log(JSON.stringify(result));
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
