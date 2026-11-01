"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createDatabase } = require("../database");
const { createNetworkAccess, COOKIE, hash } = require("../network-access");
const { hashPassword } = require("../access-control");
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
let time = Date.now(),
  server,
  url;
const gate = createNetworkAccess({ db, env, now: () => time });
const proxy = (ip = "198.51.100.7", cookie = "") => ({
  "x-gst-gateway-key": env.NETWORK_GATEWAY_SECRET,
  "x-gst-client-ip": ip,
  cookie,
});
async function request(path, body, headers = {}, base = url) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    ...(await r.json()),
    code: r.status,
    cookie: r.headers.get("set-cookie"),
    retry: r.headers.get("retry-after"),
  };
}
function appFor(service) {
  const app = express();
  app.use(express.json());
  service.mount(app);
  app.get("/api/private", (req, res) => res.json({ ok: true }));
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  return app;
}
before(async () => {
  await gate.initialize();
  await db
    .prepare("INSERT INTO network_access_settings (key,value) VALUES (?,?)")
    .run("admin_password_hash", hashPassword("test-only-admin"));
  server = appFor(gate).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
});
test("untrusted requests and legacy enrollment cannot bypass the network gate", async () => {
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-forwarded-for": "203.0.113.10",
        "x-gst-client-ip": "203.0.113.10",
      })
    ).code,
    403,
  );
  assert.equal(
    (await request("/api/network/unlock", { password: "test-only-admin" }))
      .code,
    403,
  );
  assert.equal((await request("/api/network/enroll", {}, proxy())).code, 403);
  assert.equal((await request("/api/network/approve", {}, proxy())).code, 403);
  assert.equal(
    (await request("/api/private", undefined, proxy("203.0.113.10"))).code,
    403,
  );
  assert.equal((await request("/api/health")).code, 200);
});
let cookie, sessionId, issuedGrant;
test("password unlock sets only a hashed secure access session and requires normal app login separately", async () => {
  const before = (
    await db
      .prepare("SELECT COUNT(*) AS count FROM network_access_sessions")
      .get()
  ).count;
  assert.equal(
    (await request("/api/network/unlock", { password: "wrong" }, proxy())).code,
    401,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM network_access_sessions")
        .get()
    ).count,
    before,
  );
  const result = await request(
    "/api/network/unlock",
    { password: "test-only-admin" },
    proxy(),
  );
  assert.equal(result.code, 200);
  assert.equal(result.status, "unlocked");
  assert.match(result.cookie, new RegExp("^" + COOKIE + "="));
  assert.match(
    result.cookie,
    /Max-Age=7776000; HttpOnly; Secure; SameSite=Strict/,
  );
  assert.equal(result.password, undefined);
  assert.equal(result.token, undefined);
  cookie = result.cookie.split(";")[0];
  const row = await db
    .prepare("SELECT * FROM network_access_sessions WHERE token_hash=?")
    .get(hash(cookie.split("=")[1]));
  assert.ok(row);
  sessionId = row.id;
  assert.notEqual(row.token_hash, cookie.split("=")[1]);
  const session = await request(
    "/api/network/session",
    undefined,
    proxy("198.51.100.9", cookie),
  );
  assert.equal(session.allowed, true);
  issuedGrant = session.grant;
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": issuedGrant,
      })
    ).code,
    200,
  );
  assert.equal(
    (
      await request("/api/private", undefined, {
        "x-gst-network-grant": issuedGrant + "x",
      })
    ).code,
    403,
  );
});
test("unlock follows the access session across any VPN IP; another browser has no access", async () => {
  for (const ip of ["192.0.2.99", "203.0.113.89", "2001:db8::9"])
    assert.equal(
      (await request("/api/network/session", undefined, proxy(ip, cookie)))
        .allowed,
      true,
    );
  assert.equal(
    (await request("/api/network/session", undefined, proxy("192.0.2.99")))
      .allowed,
    false,
  );
  assert.equal(
    (await request("/api/network/session", undefined, proxy("203.0.113.10")))
      .status,
    "home",
  );
});
test("old browser approvals and old device grants no longer grant access", async () => {
  assert.equal(
    (
      await request(
        "/api/network/session",
        undefined,
        proxy(undefined, "__Host-gst_browser=" + "x".repeat(43)),
      )
    ).allowed,
    false,
  );
  assert.equal(
    await gate.verifyGrant(gate.grant({ device: "old-approved-browser" })),
    false,
  );
});
test("re-unlock rotates the cookie and revokes the previous session and its API grant", async () => {
  const old = cookie;
  const result = await request(
    "/api/network/unlock",
    { password: "test-only-admin" },
    proxy("198.51.100.42", cookie),
  );
  assert.equal(result.code, 200);
  cookie = result.cookie.split(";")[0];
  assert.notEqual(cookie, old);
  assert.equal(
    (await request("/api/network/session", undefined, proxy(undefined, old)))
      .allowed,
    false,
  );
  assert.equal(await gate.verifyGrant(issuedGrant), false);
  sessionId = (
    await db
      .prepare("SELECT id FROM network_access_sessions WHERE token_hash=?")
      .get(hash(cookie.split("=")[1]))
  ).id;
});
test("failed-password limits persist across service recreation and recover after their window", async () => {
  const ip = "192.0.2.123";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await request("/api/network/unlock", { password: "wrong" }, proxy(ip)))
        .code,
      401,
    );
  const other = appFor(
    createNetworkAccess({ db, env, now: () => time }),
  ).listen(0, "127.0.0.1");
  await new Promise((r) => other.once("listening", r));
  try {
    const blocked = await request(
      "/api/network/unlock",
      { password: "test-only-admin" },
      proxy(ip),
      `http://127.0.0.1:${other.address().port}`,
    );
    assert.equal(blocked.code, 429);
    assert.ok(Number(blocked.retry) > 0);
  } finally {
    await new Promise((r) => other.close(r));
  }
  time += 15 * 60000 + 1;
  assert.equal(
    (
      await request(
        "/api/network/unlock",
        { password: "test-only-admin" },
        proxy(ip),
      )
    ).code,
    200,
  );
  await db
    .prepare(
      "INSERT INTO network_unlock_limits (key,attempts,window_started) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,window_started=excluded.window_started",
    )
    .run("global", 100, time);
  assert.equal(
    (
      await request(
        "/api/network/unlock",
        { password: "test-only-admin" },
        proxy("192.0.2.124"),
      )
    ).code,
    429,
  );
  time += 15 * 60000 + 1;
});
test("missing configuration fails closed and revocation/expiry are enforced immediately", async () => {
  await db
    .prepare("UPDATE network_access_sessions SET revoked_at=? WHERE id=?")
    .run(time, sessionId);
  assert.equal(
    (await request("/api/network/session", undefined, proxy(undefined, cookie)))
      .allowed,
    false,
  );
  const next = await request(
    "/api/network/unlock",
    { password: "test-only-admin" },
    proxy("198.51.100.88"),
  );
  const nextCookie = next.cookie.split(";")[0];
  time += 90 * 86400000 + 1;
  assert.equal(
    (
      await request(
        "/api/network/session",
        undefined,
        proxy(undefined, nextCookie),
      )
    ).allowed,
    false,
  );
  await db
    .prepare("DELETE FROM network_access_settings WHERE key=?")
    .run("admin_password_hash");
  assert.equal(
    (
      await request(
        "/api/network/unlock",
        { password: "test-only-admin" },
        proxy(),
      )
    ).code,
    503,
  );
  await gate.initialize();
  assert.ok(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM network_access_sessions")
        .get()
    ).count > 0,
    "initialization does not delete sessions",
  );
});
