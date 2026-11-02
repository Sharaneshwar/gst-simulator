"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { matchesIpAllowlist: backend } = require("../ip-allowlist");
test("both deployment matchers accept only valid exact IPs and CIDR members", async () => {
  const { matchesIpAllowlist: frontend } = await import(
    "../../frontend/network/ip-allowlist.js"
  );
  const checks = [
    ["49.36.43.0", "49.36.43.71/24", true],
    ["49.36.43.255", "49.36.43.71/24", true],
    ["49.36.42.255", "49.36.43.71/24", false],
    ["49.36.44.0", "49.36.43.71/24", false],
    ["49.36.43.71", "49.36.43.71/32", true],
    ["49.36.43.72", "49.36.43.71/32", false],
    ["49.36.43.71", "49.36.43.71", true],
    ["49.36.43.72", "49.36.43.71", false],
    ["49.36.43.71", "invalid, 49.36.43.71/24, 192.0.2.1", true],
    ["192.0.2.1", "invalid, 49.36.43.71/24, 192.0.2.1", true],
    ["192.0.2.2", "invalid, 49.36.43.71/24, 192.0.2.1", false],
    ["2001:db8:abcd::9", "2001:db8:abcd::1/64", true],
    ["2001:db8:abce::9", "2001:db8:abcd::1/64", false],
    ["2001:db8::1", "2001:0db8:0:0:0:0:0:1", true],
    ["::ffff:49.36.43.71", "49.36.43.71/24", true],
    ["::ffff:3124:2b47", "49.36.43.71/24", true],
    ["::ffff:49.36.44.1", "49.36.43.71/24", false],
  ];
  for (const match of [backend, frontend]) {
    for (const [ip, rule, allowed] of checks)
      assert.equal(match(ip, rule), allowed, `${ip} in ${rule}`);
    for (const malformed of [
      "",
      null,
      "49.36.43.71/",
      "49.36.43.71/33",
      "49.36.43.71/-1",
      "49.36.43.71/2e1",
      "49.36.43.71/024",
      "49.36.43.71/24/0",
      "49.36.43.999/24",
      "2001:db8::/129",
      "*",
    ])
      assert.equal(match("49.36.43.71", malformed), false, String(malformed));
    for (const invalid of [
      null,
      undefined,
      "",
      "not-an-ip",
      "49.36.43.071",
      "49.36.43.71:80",
      "49.36.43.71/24",
    ])
      assert.equal(match(invalid, "49.36.43.71/24"), false, String(invalid));
  }
});
