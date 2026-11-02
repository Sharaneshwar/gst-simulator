"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createDatabase } = require("../database");
const { createNetworkAccess } = require("../network-access");
const { hashPassword } = require("../access-control");
const db = createDatabase({ NODE_ENV: "development", SQLITE_PATH: ":memory:" });
let backend, backendUrl, edge, edgeUrl, handler, middleware, service;
const secret = "gateway-test-key-".padEnd(43, "s");
before(async () => {
  service = createNetworkAccess({
    db,
    env: {
      NETWORK_ACCESS_ENABLED: "1",
      NETWORK_HOME_IPS: "203.0.113.10,49.36.43.71/24",
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
    NETWORK_HOME_IPS: "203.0.113.10,49.36.43.71/24",
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
test("outsiders stay blocked and the old admin route no longer provides an unlock form", async () => {
  for (const path of [
    "/",
    "/assets/app.js",
    "/admin",
    "/admin/",
    "/admin/anything",
    "/godmode/anything",
  ])
    assert.equal((await page("203.0.113.2", "", path)).status, 403, path);
  const html = await (await page("203.0.113.2")).text();
  assert.match(html, /Sorry, you have been blocked/);
  assert.doesNotMatch(html, /\/godmode|\/admin|Browser access|<script|<input/);
  assert.equal(
    (await page("203.0.113.10")).headers.get("x-middleware-next"),
    "1",
  );
  assert.equal(
    (await page("203.0.113.2", "", "/api/network?action=unlock")).headers.get(
      "x-middleware-next",
    ),
    "1",
  );
});
test("visiting godmode issues a secure 90-day cookie without password input and redirects to the portal", async () => {
  const result = await page("192.0.2.12", "", "/godmode");
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "/");
  assert.match(result.headers.get("cache-control"), /no-store/);
  assert.equal(await result.text(), "");
  const setCookie = result.headers.get("set-cookie");
  assert.match(
    setCookie,
    /^__Host-gst_access=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=7776000; HttpOnly; Secure; SameSite=Strict$/,
  );
  const entryCookie = setCookie.split(";")[0];
  assert.equal(
    (await page("198.51.100.55", entryCookie)).headers.get("x-middleware-next"),
    "1",
  );
  assert.equal((await page("198.51.100.55")).status, 403);
  const session = await fetch(edgeUrl + "/api/network?action=session", {
    headers: { "x-real-ip": "198.51.100.56", cookie: entryCookie },
  });
  const data = await session.json();
  assert.equal(data.allowed, true);
  assert.equal(data.status, "unlocked");
  assert.equal(await service.verifyGrant(data.grant), true);
  const again = await page("198.51.100.56", entryCookie, "/godmode/");
  assert.equal(again.status, 303);
  assert.equal(again.headers.get("set-cookie"), null);
  const row = await db
    .prepare("SELECT * FROM network_access_sessions WHERE token_hash=?")
    .get(require("../network-access").hash(entryCookie.split("=")[1]));
  assert.ok(row);
  assert.equal(Number(row.expires_at) - Number(row.created_at), 90 * 86400000);
});
test("HEAD, prefetch and unsupported godmode requests cannot create sessions", async () => {
  const count = async () =>
    Number(
      (
        await db
          .prepare("SELECT COUNT(*) AS count FROM network_access_sessions")
          .get()
      ).count,
    );
  const before = await count();
  for (const options of [
    { method: "HEAD" },
    { method: "GET", headers: { purpose: "prefetch" } },
    { method: "GET", headers: { "sec-purpose": "prefetch;prerender" } },
    { method: "POST" },
  ]) {
    const result = await middleware(
      new Request(edgeUrl + "/godmode", {
        ...options,
        headers: { "x-real-ip": "192.0.2.14", ...options.headers },
      }),
    );
    assert.equal(result.status, options.method === "POST" ? 405 : 204);
    assert.equal(result.headers.get("set-cookie"), null);
  }
  assert.equal(await count(), before);
});
test("godmode fails closed when gateway settings or backend availability are missing", async () => {
  const origin = process.env.GST_API_ORIGIN,
    key = process.env.NETWORK_GATEWAY_SECRET;
  try {
    process.env.NETWORK_GATEWAY_SECRET = "";
    assert.equal((await page("192.0.2.14", "", "/godmode")).status, 503);
    process.env.NETWORK_GATEWAY_SECRET = key;
    process.env.GST_API_ORIGIN = "http://127.0.0.1:1";
    const result = await page("192.0.2.14", "", "/godmode");
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("set-cookie"), null);
    assert.equal(result.headers.get("location"), null);
  } finally {
    process.env.GST_API_ORIGIN = origin;
    process.env.NETWORK_GATEWAY_SECRET = key;
  }
});
test("route unlock requires the private gateway and is throttled without affecting existing sessions", async () => {
  const direct = await fetch(backendUrl + "/api/network/route-unlock", {
    method: "POST",
    headers: { "x-gst-client-ip": "192.0.2.15" },
  });
  assert.equal(direct.status, 403);
  const publicAction = await fetch(
    edgeUrl + "/api/network?action=route-unlock",
    { method: "POST", headers: { "x-real-ip": "192.0.2.15" } },
  );
  assert.equal(publicAction.status, 403);
  const first = await page("192.0.2.15", "", "/godmode");
  assert.equal(first.status, 303);
  const entryCookie = first.headers.get("set-cookie").split(";")[0];
  for (let i = 0; i < 4; i++)
    assert.equal((await page("192.0.2.15", "", "/godmode")).status, 303);
  const limited = await page("192.0.2.15", "", "/godmode");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(limited.headers.get("set-cookie"), null);
  assert.equal((await page("192.0.2.15", entryCookie, "/godmode")).status, 303);
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

// Exercise the real middleware, gateway and signed API-grant flow together.
test("CIDR home access agrees at Vercel and Render and excludes neighbouring subnets", async () => {
  for (const ip of [
    "49.36.43.0",
    "49.36.43.1",
    "49.36.43.71",
    "49.36.43.243",
    "49.36.43.255",
  ]) {
    assert.equal((await page(ip)).headers.get("x-middleware-next"), "1", ip);
    const response = await fetch(edgeUrl + "/api/network?action=session", {
      headers: { "x-real-ip": ip },
    });
    assert.equal(response.status, 200, ip);
    const session = await response.json();
    assert.equal(session.status, "home");
    assert.equal(session.allowed, true);
    assert.equal(await service.verifyGrant(session.grant), true);
    const payload = JSON.parse(
      Buffer.from(session.grant.split(".")[0], "base64url"),
    );
    assert.equal(payload.home, ip);
  }
  for (const ip of ["49.36.42.255", "49.36.44.0", "49.36.143.71"]) {
    assert.equal((await page(ip)).status, 403, ip);
    assert.equal(
      (
        await fetch(edgeUrl + "/api/network?action=session", {
          headers: { "x-real-ip": ip },
        })
      ).status,
      403,
      ip,
    );
  }
});
