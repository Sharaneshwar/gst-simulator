"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createDatabase } = require("../database");
const { createNetworkAccess, hash } = require("../network-access");
const db = createDatabase(
  process.env.GST_TEST_POSTGRES
    ? process.env
    : { NODE_ENV: "development", SQLITE_PATH: ":memory:" },
);
const env = {
  NETWORK_ACCESS_ENABLED: "1",
  NETWORK_HOME_IPS: "203.0.113.10",
  NETWORK_GATEWAY_SECRET: "a".repeat(43),
};
let server,
  url,
  time = Date.now();
const gate = createNetworkAccess({ db, env, now: () => time });
const proxy = (ip = "198.51.100.7", cookie = "") => ({
  "x-gst-gateway-key": env.NETWORK_GATEWAY_SECRET,
  "x-gst-client-ip": ip,
  cookie,
});
async function request(path, body, headers = {}) {
  const r = await fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    ...(await r.json()),
    code: r.status,
    cookie: r.headers.get("set-cookie"),
  };
}
before(async () => {
  await gate.initialize();
  const app = express();
  app.use(express.json());
  gate.mount(app);
  app.get("/api/private", (req, res) => res.json({ ok: true }));
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
});
test("untrusted clients cannot spoof home IP, proxy headers, or self-approve", async () => {
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-forwarded-for": "203.0.113.10",
        "x-gst-client-ip": "203.0.113.10",
      })
    ).code,
    403,
  );
  assert.equal((await request("/api/network/session")).code, 403);
  assert.equal(
    (
      await request("/api/network/session", undefined, {
        ...proxy(),
        "x-gst-gateway-key": "é".repeat(43),
      })
    ).code,
    403,
  );
  assert.equal(
    (await request("/api/private", undefined, proxy("203.0.113.10"))).code,
    403,
    "a proxy header is not an API network grant",
  );
  assert.equal((await request("/api/health")).code, 200);
});
let cookie, requestId, deviceGrant;
test("requesting a browser creates a pending credential and never approves it", async () => {
  const pending = await request(
    "/api/network/enroll",
    { label: "Mac preview" },
    proxy(),
  );
  assert.equal(pending.code, 201);
  assert.equal(pending.status, "pending");
  assert.equal(pending.allowed, false);
  requestId = pending.requestId;
  assert.match(pending.cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(pending.cookie, /^__Host-/);
  cookie = pending.cookie.split(";")[0];
  assert.equal(
    (await request("/api/network/session", undefined, proxy(undefined, cookie)))
      .allowed,
    false,
  );
  const row = await db
    .prepare("SELECT * FROM network_devices WHERE id = ?")
    .get(requestId);
  assert.equal(row.token_hash, hash(cookie.split("=")[1]));
  assert.equal(row.token_hash.includes(cookie.split("=")[1]), false);
  assert.equal(
    (
      await request(
        "/api/network/approve",
        { id: requestId },
        proxy(undefined, cookie),
      )
    ).code,
    403,
  );
});
test("private operator approval enables the same browser across IP changes; another browser stays blocked", async () => {
  await db
    .prepare("UPDATE network_devices SET status = 'approved' WHERE id = ?")
    .run(requestId);
  const session = await request(
    "/api/network/session",
    undefined,
    proxy("203.0.113.42", cookie),
  );
  assert.equal(session.allowed, true);
  deviceGrant = session.grant;
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": deviceGrant,
      })
    ).code,
    200,
  );
  assert.equal(
    (await request("/api/network/session", undefined, proxy("203.0.113.43")))
      .allowed,
    false,
  );
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": deviceGrant + "x",
      })
    ).code,
    403,
  );
});
test("home access issues a short grant without granting permanent browser approval", async () => {
  const session = await request(
    "/api/network/session",
    undefined,
    proxy("203.0.113.10"),
  );
  assert.equal(session.status, "home");
  assert.equal(session.allowed, true);
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": session.grant,
      })
    ).code,
    200,
  );
  time += 61000;
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": session.grant,
      })
    ).code,
    403,
  );
});
test("revocation, expiry and token replacement are enforced", async () => {
  const current = await request(
    "/api/network/session",
    undefined,
    proxy(undefined, cookie),
  );
  await db
    .prepare("UPDATE network_devices SET status = 'revoked' WHERE id = ?")
    .run(requestId);
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": current.grant,
      })
    ).code,
    403,
  );
  assert.equal(
    (await request("/api/network/session", undefined, proxy(undefined, cookie)))
      .allowed,
    false,
  );
  const renewed = await request(
    "/api/network/enroll",
    { label: "Re-enrolled" },
    proxy(undefined, cookie),
  );
  assert.equal(renewed.code, 201);
  assert.notEqual(renewed.requestId, requestId);
  assert.equal(renewed.status, "pending");
  await db
    .prepare(
      "UPDATE network_devices SET status = 'approved', expires_at = ? WHERE id = ?",
    )
    .run(time - 1, renewed.requestId);
  assert.equal(
    (
      await request(
        "/api/network/session",
        undefined,
        proxy(undefined, renewed.cookie.split(";")[0]),
      )
    ).status,
    "expired",
  );
});
