"use strict";
// Operator-only tool. It uses private server credentials, never an app/demo login.
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
(async () => {
  const [action = "list", id, ...name] = process.argv.slice(2);
  if (!["list", "approve", "revoke"].includes(action))
    throw Error(
      "Use list, approve <request-id> <label>, or revoke <request-id>.",
    );
  const db = createDatabase();
  try {
    if (action !== "list") {
      if (!/^[a-f0-9-]{36}$/.test(id || ""))
        throw Error("Supply the exact request ID.");
      const row = await db
        .prepare("SELECT * FROM network_devices WHERE id = ?")
        .get(id);
      if (!row || Number(row.expires_at) <= Date.now())
        throw Error("Request missing or expired. Re-enroll the browser.");
      if (action === "approve" && row.status !== "pending")
        throw Error(
          "Only a pending request can be approved. Revoked devices must re-enroll with a new credential.",
        );
      const label = name.join(" ").trim().slice(0, 100) || row.label;
      await db
        .prepare(
          "UPDATE network_devices SET status = ?, approved_at = ?, approved_by = ?, label = ? WHERE id = ?",
        )
        .run(
          action === "approve" ? "approved" : "revoked",
          Date.now(),
          "private-operator-cli",
          label,
          id,
        );
      console.log(
        `Browser ${action === "approve" ? "approved" : "revoked"}: ${id}`,
      );
    }
    console.table(
      await db
        .prepare(
          "SELECT id, label, status, requested_at, expires_at, requested_ip FROM network_devices ORDER BY requested_at DESC",
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
