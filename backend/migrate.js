"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

async function migrateDatabase(db) {
  if (db.dialect !== "postgres") return;
  await db.transaction(async () => {
    await db.lock("gst-schema-migrations");
    await db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const folder = path.join(__dirname, "migrations");
    for (const name of fs
      .readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const sql = fs.readFileSync(path.join(folder, name), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const previous = await db
        .prepare("SELECT checksum FROM schema_migrations WHERE name = ?")
        .get(name);
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      await db.exec(sql);
      await db
        .prepare("INSERT INTO schema_migrations(name, checksum) VALUES (?, ?)")
        .run(name, checksum);
    }
  })();
}
module.exports = { migrateDatabase };
