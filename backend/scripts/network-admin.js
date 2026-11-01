"use strict";
// Private operator tool. No app login can configure the unlock password.
const path = require("node:path");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
require("dotenv").config({
  path: path.join(__dirname, "../../.env.local"),
  quiet: true,
});
const { createDatabase } = require("../database");
const { createNetworkAccess } = require("../network-access");
const { hashPassword } = require("../access-control");
(async () => {
  const [action = "list", id] = process.argv.slice(2);
  if (!["list", "set-password", "revoke"].includes(action))
    throw Error(
      "Use list, set-password (password on stdin), or revoke <session-id>.",
    );
  const db = createDatabase();
  try {
    await createNetworkAccess({ db }).initialize();
    if (action === "set-password") {
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk;
        if (input.length > 130)
          throw Error("Password must be 7–128 characters.");
      }
      const password = input.replace(/\r?\n$/, "");
      if (password.length < 7 || password.length > 128)
        throw Error("Password must be 7–128 characters.");
      await db
        .prepare(
          "INSERT INTO network_access_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run("admin_password_hash", hashPassword(password));
      console.log(
        "Administrator access password configured. Existing app passwords and sessions are unchanged.",
      );
    } else if (action === "revoke") {
      if (!/^[a-f0-9-]{36}$/.test(id || ""))
        throw Error("Supply the exact access-session ID.");
      const changed = await db
        .prepare(
          "UPDATE network_access_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
        )
        .run(Date.now(), id);
      if (!changed.changes) throw Error("Active access session not found.");
      console.log("Access session revoked.");
    } else
      console.table(
        await db
          .prepare(
            "SELECT id,created_at,expires_at,revoked_at,last_seen_at,requested_ip FROM network_access_sessions ORDER BY created_at DESC",
          )
          .all(),
      );
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
