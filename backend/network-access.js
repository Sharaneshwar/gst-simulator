"use strict";
const crypto = require("node:crypto");
const net = require("node:net");
const { matchesIpAllowlist } = require("./ip-allowlist");
const { verifyPassword } = require("./access-control");
const COOKIE = "__Host-gst_access";
const LIFETIME = 90 * 86400000;
const WINDOW = 15 * 60000;
const SCHEMA = `CREATE TABLE IF NOT EXISTS network_access_sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 revoked_at BIGINT, last_seen_at BIGINT, requested_ip TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS network_unlock_limits (
 key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_started BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS network_access_settings (
 key TEXT PRIMARY KEY, value TEXT NOT NULL
);`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  crypto.timingSafeEqual(
    Buffer.from(hash(a), "hex"),
    Buffer.from(hash(b), "hex"),
  );
function cookieToken(headers) {
  const value = String(headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value || "") ? value : "";
}
function createNetworkAccess({ db, env = process.env, now = Date.now }) {
  const enabled = () => env.NETWORK_ACCESS_ENABLED === "1";
  const secret = () => env.NETWORK_GATEWAY_SECRET || "";
  const home = (ip) => matchesIpAllowlist(ip, env.NETWORK_HOME_IPS);
  const gateway = (req) =>
    secret().length >= 43 && equal(req.headers["x-gst-gateway-key"], secret());
  const clientIp = (req) =>
    gateway(req) && net.isIP(req.headers["x-gst-client-ip"] || "")
      ? req.headers["x-gst-client-ip"]
      : "";
  const active = (row) =>
    Boolean(row && !row.revoked_at && Number(row.expires_at) > now());
  async function accessSession(req) {
    const token = cookieToken(req.headers);
    return token
      ? db
          .prepare("SELECT * FROM network_access_sessions WHERE token_hash = ?")
          .get(hash(token))
      : null;
  }
  const sign = (value) =>
    crypto
      .createHmac("sha256", secret())
      .update("gst-network-grant:" + value)
      .digest("base64url");
  function grant(subject) {
    const body = Buffer.from(
      JSON.stringify({ ...subject, purpose: "network", exp: now() + 60000 }),
    ).toString("base64url");
    return body + "." + sign(body);
  }
  async function verifyGrant(token) {
    if (
      typeof token !== "string" ||
      token.length > 2048 ||
      secret().length < 43
    )
      return false;
    const [body, signature, extra] = token.split(".");
    if (extra || !body || !signature || !equal(signature, sign(body)))
      return false;
    let data;
    try {
      data = JSON.parse(Buffer.from(body, "base64url"));
    } catch {
      return false;
    }
    if (
      data.purpose !== "network" ||
      !Number.isFinite(data.exp) ||
      data.exp <= now() ||
      data.exp > now() + 61000
    )
      return false;
    if (data.home) return home(data.home);
    if (!data.session) return false;
    return active(
      await db
        .prepare("SELECT * FROM network_access_sessions WHERE id = ?")
        .get(data.session),
    );
  }
  async function unlockAttempt(ip) {
    return db.transaction(async () => {
      await db.lock("network-admin-unlock");
      const keys = [
        ["global", 100],
        ["ip:" + hash(ip), 5],
      ];
      const records = [];
      for (const [key, maximum] of keys) {
        const row = await db
          .prepare("SELECT * FROM network_unlock_limits WHERE key = ?")
          .get(key);
        if (
          row &&
          Number(row.window_started) + WINDOW > now() &&
          row.attempts >= maximum
        )
          return Math.max(
            1,
            Math.ceil((Number(row.window_started) + WINDOW - now()) / 1000),
          );
        records.push({
          key,
          attempts:
            row && Number(row.window_started) + WINDOW > now()
              ? row.attempts + 1
              : 1,
          start:
            row && Number(row.window_started) + WINDOW > now()
              ? Number(row.window_started)
              : now(),
        });
      }
      for (const row of records)
        await db
          .prepare(
            "INSERT INTO network_unlock_limits (key,attempts,window_started) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,window_started=excluded.window_started",
          )
          .run(row.key, row.attempts, row.start);
      await db
        .prepare("DELETE FROM network_unlock_limits WHERE window_started < ?")
        .run(now() - WINDOW);
      return 0;
    })();
  }
  async function issueSession(req, res) {
    const token = crypto.randomBytes(32).toString("base64url"),
      id = crypto.randomUUID(),
      ip = clientIp(req);
    await db.transaction(async () => {
      const previous = await accessSession(req);
      if (previous && !previous.revoked_at)
        await db
          .prepare(
            "UPDATE network_access_sessions SET revoked_at = ? WHERE id = ?",
          )
          .run(now(), previous.id);
      await db
        .prepare(
          "INSERT INTO network_access_sessions (id,token_hash,created_at,expires_at,requested_ip) VALUES (?,?,?,?,?)",
        )
        .run(id, hash(token), now(), now() + LIFETIME, ip);
    })();
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; Max-Age=${LIFETIME / 1000}; HttpOnly; Secure; SameSite=Strict`,
    );
    res.json({
      allowed: true,
      status: "unlocked",
      message: "Access unlocked. You can now open the portal.",
    });
  }
  function mount(app) {
    app.use("/api/network", (req, res, next) => {
      res.setHeader("Cache-Control", "no-store, private");
      if (!gateway(req))
        return res.status(403).json({ message: "Access blocked." });
      if (!clientIp(req))
        return res
          .status(400)
          .json({ message: "Unable to verify the network address." });
      next();
    });
    const session = async (req, res, includeGrant) => {
      const ip = clientIp(req),
        row = await accessSession(req),
        allowed = home(ip) || active(row);
      if (
        active(row) &&
        (!row.last_seen_at || now() - Number(row.last_seen_at) > 3600000)
      )
        await db
          .prepare(
            "UPDATE network_access_sessions SET last_seen_at = ? WHERE id = ?",
          )
          .run(now(), row.id);
      res.json({
        enabled: enabled(),
        allowed,
        status: home(ip) ? "home" : active(row) ? "unlocked" : "blocked",
        ...(includeGrant && allowed
          ? { grant: grant(home(ip) ? { home: ip } : { session: row.id }) }
          : {}),
      });
    };
    app.post("/api/network/check", (req, res) => session(req, res, false));
    app.get("/api/network/session", (req, res) => session(req, res, true));
    // This trusted gateway operation intentionally uses knowledge of /godmode
    // as the entry condition. Ordinary portal authentication remains separate.
    app.post("/api/network/route-unlock", async (req, res, next) => {
      try {
        if (!enabled())
          return res
            .status(503)
            .json({ message: "Network access is not enabled." });
        if (active(await accessSession(req)))
          return res.json({ allowed: true, status: "unlocked" });
        const retry = await unlockAttempt(clientIp(req));
        if (retry) {
          res.setHeader("Retry-After", retry);
          return res
            .status(429)
            .json({
              message: "Too many attempts. Please try again in 15 minutes.",
            });
        }
        await issueSession(req, res);
      } catch (error) {
        next(error);
      }
    });
    app.post("/api/network/unlock", async (req, res, next) => {
      try {
        const stored =
          env.NETWORK_ADMIN_PASSWORD_HASH ||
          (
            await db
              .prepare(
                "SELECT value FROM network_access_settings WHERE key = ?",
              )
              .get("admin_password_hash")
          )?.value ||
          "";
        if (!stored.startsWith("scrypt$"))
          return res
            .status(503)
            .json({ message: "Administrator access is not configured." });
        const retry = await unlockAttempt(clientIp(req));
        if (retry) {
          res.setHeader("Retry-After", retry);
          return res.status(429).json({
            message: "Too many attempts. Please try again in 15 minutes.",
          });
        }
        const password =
          typeof req.body?.password === "string" ? req.body.password : "";
        if (!verifyPassword(password, stored))
          return res
            .status(401)
            .json({ message: "The administrator password is incorrect." });
        await issueSession(req, res);
      } catch (error) {
        next(error);
      }
    });
    app.use("/api", async (req, res, next) => {
      if (!enabled() || req.path === "/health" || req.method === "OPTIONS")
        return next();
      if (await verifyGrant(req.headers["x-gst-network-grant"])) return next();
      res.status(403).json({
        code: "NETWORK_ACCESS_REQUIRED",
        message: "Access blocked. Contact the site owner.",
      });
    });
  }
  return {
    initialize: () => db.exec(SCHEMA),
    mount,
    verifyGrant,
    grant,
    gateway,
    home,
  };
}
module.exports = { createNetworkAccess, COOKIE, SCHEMA, hash };
