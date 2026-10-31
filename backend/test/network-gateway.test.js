"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createDatabase } = require("../database");
const { createNetworkAccess } = require("../network-access");
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
    },
  });
  await service.initialize();
  const b = express();
  b.use(express.json());
  service.mount(b);
  backend = b.listen(0, "127.0.0.1");
  await new Promise((r) => backend.once("listening", r));
  backendUrl = `http://127.0.0.1:${backend.address().port}`;
  process.env.NETWORK_ACCESS_ENABLED = "1";
  process.env.NETWORK_HOME_IPS = "203.0.113.10";
  process.env.NETWORK_GATEWAY_SECRET = secret;
  process.env.GST_API_ORIGIN = backendUrl;
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
  await new Promise((r) => edge.close(r));
  await new Promise((r) => backend.close(r));
  await db.close();
});
const page = (ip, cookie = "") =>
  middleware(
    new Request(edgeUrl + "/", { headers: { "x-real-ip": ip, cookie } }),
  );
test("middleware gates unknown browsers and private assets, while home network passes", async () => {
  const deniedPage = await page("203.0.113.2");
  assert.equal(deniedPage.status, 403);
  const deniedHtml = await deniedPage.text();
  assert.match(deniedHtml, /Sorry, you have been blocked/);
  assert.doesNotMatch(deniedHtml, /Network access required|Request browser access|Check access|<script|<input/);
  const asset = await middleware(
    new Request(edgeUrl + "/assets/app.js", {
      headers: { "x-real-ip": "203.0.113.2" },
    }),
  );
  assert.equal(asset.status, 403);
  assert.equal(
    (await page("203.0.113.10")).headers.get("x-middleware-next"),
    "1",
  );
  const gate = await middleware(
    new Request(edgeUrl + "/api/network?action=enroll"),
  );
  assert.equal(gate.headers.get("x-middleware-next"), "1");
});
let cookie, id;
test("same-origin gateway sets private cookies, never approves requests, and rejects cross-site enrollment", async () => {
  // Vercel's response provides send/status/setHeader, but not Express's type().
  const vercelResponse = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
  };
  await handler({ method: "GET", query: { action: "page" }, url: "/api/network?action=page", headers: { host: new URL(edgeUrl).host, "x-real-ip": "203.0.113.10" } }, vercelResponse);
  assert.equal(vercelResponse.code, 200);
  assert.match(vercelResponse.headers["Content-Type"], /text\/html/);
  assert.match(vercelResponse.body, /Request browser access/);
  const management = await fetch(edgeUrl + "/api/network?action=page", { headers: { "x-real-ip": "203.0.113.10" } });
  assert.equal(management.status, 200);
  assert.match(management.headers.get("content-type"), /text\/html/);
  const html = await management.text();
  assert.match(html, /Request browser access/);
  assert.match(html, /This network is approved/);
  assert.match(html, /Open portal/);
  const denied = await fetch(edgeUrl + "/api/network?action=enroll", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.2",
      origin: "https://evil.invalid",
    },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const enrolled = await fetch(edgeUrl + "/api/network?action=enroll", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.10",
      origin: edgeUrl.replace("http:", "https:"),
    },
    body: JSON.stringify({ label: "Test browser" }),
  });
  assert.equal(enrolled.status, 201);
  cookie = enrolled.headers.get("set-cookie").split(";")[0];
  const data = await enrolled.json();
  id = data.requestId;
  assert.equal(data.allowed, true);
  assert.equal(data.status, "pending");
  assert.equal((await page("203.0.113.2", cookie)).status, 403);
});
test("approved browser passes middleware on a different IP; revocation immediately blocks it", async () => {
  await db
    .prepare("UPDATE network_devices SET status='approved' WHERE id=?")
    .run(id);
  assert.equal(
    (await page("198.51.100.42", cookie)).headers.get("x-middleware-next"),
    "1",
  );
  const session = await fetch(edgeUrl + "/api/network?action=session", {
    headers: { "x-real-ip": "198.51.100.42", cookie },
  });
  assert.equal((await session.json()).allowed, true);
  await db
    .prepare("UPDATE network_devices SET status='revoked' WHERE id=?")
    .run(id);
  assert.equal((await page("198.51.100.42", cookie)).status, 403);
});

test("outsiders cannot open enrollment, create pending requests, or inspect browser status", async () => {
  const beforeCount = (await db.prepare("SELECT COUNT(*) AS count FROM network_devices").get()).count;
  for (const action of ["page", "session", "enroll"]) {
    const response = await fetch(edgeUrl + "/api/network?action=" + action, {
      method: action === "enroll" ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.2",
        origin: edgeUrl.replace("http:", "https:"),
      },
      ...(action === "enroll" ? { body: JSON.stringify({ label: "Outsider" }) } : {}),
    });
    assert.equal(response.status, 403);
    const body = await response.text();
    assert.doesNotMatch(body, /Request browser access|requestId|grant|home network|NETWORK_ACCESS/);
    if (action === "page") assert.match(body, /Sorry, you have been blocked/);
    else assert.deepEqual(JSON.parse(body), { message: "Access blocked." });
  }
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM network_devices").get()).count, beforeCount);
});
