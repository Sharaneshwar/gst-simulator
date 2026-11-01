"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createDatabase } = require("../database");
const { createNetworkAccess } = require("../network-access");
const { hashPassword } = require("../access-control");
const db = createDatabase({ NODE_ENV: "development", SQLITE_PATH: ":memory:" });
let backend, backendUrl, edge, edgeUrl, handler, middleware;
const secret = "gateway-test-key-".padEnd(43, "s");
before(async () => {
  const service = createNetworkAccess({
    db,
    env: {
      NETWORK_ACCESS_ENABLED: "1",
      NETWORK_HOME_IPS: "203.0.113.10",
      NETWORK_GATEWAY_SECRET: secret,
      NETWORK_ADMIN_PASSWORD_HASH: hashPassword("test-only-admin"),
    },
  });
  await service.initialize();
  const b = express();
  b.use(express.json());
  service.mount(b);
  backend = b.listen(0, "127.0.0.1");
  await new Promise((r) => backend.once("listening", r));
  backendUrl = `http://127.0.0.1:${backend.address().port}`;
  Object.assign(process.env, {
    NETWORK_ACCESS_ENABLED: "1",
    NETWORK_HOME_IPS: "203.0.113.10",
    NETWORK_GATEWAY_SECRET: secret,
    GST_API_ORIGIN: backendUrl,
  });
  handler = (await import("../../frontend/api/network.js")).default;
  middleware = (await import("../../frontend/middleware.js")).default;
  const e = express();
  e.use(express.json());
  e.all("/api/network", handler);
  edge = e.listen(0, "127.0.0.1");
  await new Promise((r) => edge.once("listening", r));
  edgeUrl = `http://127.0.0.1:${edge.address().port}`;
});
after(async () => {
  if (edge) await new Promise((r) => edge.close(r));
  if (backend) await new Promise((r) => backend.close(r));
  await db.close();
});
const page = (ip, cookie = "", path = "/") =>
  middleware(
    new Request(edgeUrl + path, { headers: { "x-real-ip": ip, cookie } }),
  );
test("outsiders remain blocked except the password-protected admin page", async () => {
  for (const path of ["/", "/assets/app.js", "/admin/anything"])
    assert.equal((await page("203.0.113.2", "", path)).status, 403);
  const denied = await page("203.0.113.2");
  const html = await denied.text();
  assert.match(html, /Sorry, you have been blocked/);
  assert.doesNotMatch(html, /\/admin|Browser access|<script|<input/);
  assert.equal(
    (await page("203.0.113.10")).headers.get("x-middleware-next"),
    "1",
  );
  const admin = await page("203.0.113.2", "", "/admin");
  assert.equal(admin.status, 200);
  const form = await admin.text();
  assert.match(form, /Administrator access/);
  assert.match(form, /type="password"/);
  assert.doesNotMatch(form, /test-only-admin|scrypt\$|NETWORK_GATEWAY_SECRET/);
  assert.match(admin.headers.get("cache-control"), /no-store/);
  assert.match(
    admin.headers.get("content-security-policy"),
    /script-src 'nonce-/,
  );
  const adminAgain = await page("203.0.113.2", "", "/admin");
  assert.notEqual(
    admin.headers.get("content-security-policy"),
    adminAgain.headers.get("content-security-policy"),
  );
  assert.equal(
    (await middleware(new Request(edgeUrl + "/admin", { method: "POST" })))
      .status,
    405,
  );
  assert.equal(
    (await page("203.0.113.2", "", "/api/network?action=unlock")).headers.get(
      "x-middleware-next",
    ),
    "1",
  );
});
let cookie;
test("unlock checks the password, rejects cross-site posts, and forwards a secure cookie", async () => {
  const opts = (password) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "198.51.100.2",
      origin: edgeUrl.replace("http:", "https:"),
    },
    body: JSON.stringify({ password }),
  });
  const cross = opts("test-only-admin");
  cross.headers.origin = "https://evil.invalid";
  assert.equal(
    (await fetch(edgeUrl + "/api/network?action=unlock", cross)).status,
    403,
  );
  const wrong = await fetch(
    edgeUrl + "/api/network?action=unlock",
    opts("wrong"),
  );
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  const unlocked = await fetch(
    edgeUrl + "/api/network?action=unlock",
    opts("test-only-admin"),
  );
  assert.equal(unlocked.status, 200);
  assert.match(unlocked.headers.get("cache-control"), /no-store/);
  cookie = unlocked.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^__Host-gst_access=/);
  assert.equal((await unlocked.json()).allowed, true);
});
test("the unlocked session permits middleware and network grants across VPN IP changes", async () => {
  assert.equal(
    (await page("192.0.2.77", cookie)).headers.get("x-middleware-next"),
    "1",
  );
  const result = await fetch(edgeUrl + "/api/network?action=session", {
    headers: { "x-real-ip": "192.0.2.78", cookie },
  });
  assert.equal(result.status, 200);
  assert.ok((await result.json()).grant);
  assert.equal((await page("192.0.2.77")).status, 403);
});
test("legacy enrollment and browser-approval controls stay removed", async () => {
  for (const action of ["page", "enroll"]) {
    const result = await fetch(edgeUrl + "/api/network?action=" + action, {
      headers: { "x-real-ip": "203.0.113.10" },
    });
    assert.equal(result.status, 403);
    assert.deepEqual(await result.json(), { message: "Access blocked." });
  }
  assert.equal(
    (await page("192.0.2.77", "__Host-gst_browser=" + "x".repeat(43))).status,
    403,
  );
  const token = cookie.split("=")[1];
  const { hash } = require("../network-access");
  await db
    .prepare(
      "UPDATE network_access_sessions SET revoked_at=? WHERE token_hash=?",
    )
    .run(Date.now(), hash(token));
  assert.equal((await page("192.0.2.77", cookie)).status, 403);
});
