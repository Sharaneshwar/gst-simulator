"use strict";
const crypto = require("node:crypto");
const net = require("node:net");
const COOKIE = "__Host-gst_browser";
const LIFETIME = 90 * 86400000;
const SCHEMA = `CREATE TABLE IF NOT EXISTS network_devices (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', requested_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL, approved_at BIGINT, approved_by TEXT, last_seen_at BIGINT,
 requested_ip TEXT NOT NULL
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
  const home = (ip) =>
    net.isIP(ip) &&
    String(env.NETWORK_HOME_IPS || "")
      .split(",")
      .map((v) => v.trim())
      .includes(ip);
  const gateway = (req) =>
    secret().length >= 43 && equal(req.headers["x-gst-gateway-key"], secret());
  const clientIp = (req) =>
    gateway(req) && net.isIP(req.headers["x-gst-client-ip"] || "")
      ? req.headers["x-gst-client-ip"]
      : "";
  async function device(req) {
    const token = cookieToken(req.headers);
    return token
      ? db
          .prepare("SELECT * FROM network_devices WHERE token_hash = ?")
          .get(hash(token))
      : null;
  }
  const approved = (row) =>
    row?.status === "approved" && Number(row.expires_at) > now();
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
    if (data.home) return Boolean(home(data.home));
    if (!data.device) return false;
    return approved(
      await db
        .prepare("SELECT * FROM network_devices WHERE id = ?")
        .get(data.device),
    );
  }
  const limits = new Map();
  function mount(app) {
    app.use("/api/network", (req, res, next) => {
      res.setHeader("Cache-Control", "no-store, private");
      if (!gateway(req))
        return res
          .status(403)
          .json({ message: "Use the website to request browser access." });
      if (!clientIp(req))
        return res
          .status(400)
          .json({ message: "Unable to verify the network address." });
      next();
    });
    const session = async (req, res, includeGrant) => {
      const ip = clientIp(req),
        row = await device(req);
      const allowed = Boolean(home(ip) || approved(row));
      const status = home(ip)
        ? "home"
        : row && Number(row.expires_at) <= now()
          ? "expired"
          : row?.status || "unknown";
      if (
        allowed &&
        row &&
        approved(row) &&
        (!row.last_seen_at || now() - Number(row.last_seen_at) > 3600000)
      )
        await db
          .prepare("UPDATE network_devices SET last_seen_at = ? WHERE id = ?")
          .run(now(), row.id);
      res.json({
        enabled: enabled(),
        allowed,
        status,
        requestId: row?.id || "",
        ...(includeGrant && allowed
          ? { grant: grant(home(ip) ? { home: ip } : { device: row.id }) }
          : {}),
      });
    };
    app.post("/api/network/check", (req, res) => session(req, res, false));
    app.get("/api/network/session", (req, res) => session(req, res, true));
    app.post("/api/network/enroll", async (req, res) => {
      const previous = await device(req);
      if (
        previous &&
        previous.status !== "revoked" &&
        Number(previous.expires_at) > now()
      )
        return session(req, res, true);
      const ip = clientIp(req),
        limit = limits.get(ip);
      if (limit && limit.until > now() && limit.count >= 3)
        return res
          .status(429)
          .json({ message: "Too many requests. Try again in an hour." });
      limits.set(
        ip,
        limit && limit.until > now()
          ? { ...limit, count: limit.count + 1 }
          : { count: 1, until: now() + 3600000 },
      );
      if (limits.size > 10000)
        for (const [key, value] of limits)
          if (value.until < now()) limits.delete(key);
      const token = crypto.randomBytes(32).toString("base64url"),
        id = crypto.randomUUID();
      const label =
        String(req.body?.label || "Browser access request")
          .replace(/[\x00-\x1f]/g, "")
          .trim()
          .slice(0, 100) || "Browser access request";
      await db
        .prepare(
          "INSERT INTO network_devices (id, token_hash, label, status, requested_at, expires_at, requested_ip) VALUES (?, ?, ?, 'pending', ?, ?, ?)",
        )
        .run(id, hash(token), label, now(), now() + LIFETIME, ip);
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${token}; Path=/; Max-Age=${LIFETIME / 1000}; HttpOnly; Secure; SameSite=Strict`,
      );
      res
        .status(201)
        .json({
          allowed: Boolean(home(ip)),
          status: "pending",
          requestId: id,
          message:
            "Request received. An administrator must approve this browser.",
        });
    });
    // No HTTP approval route exists: approval needs private operator/database access.
    app.use("/api", async (req, res, next) => {
      if (!enabled() || req.path === "/health" || req.method === "OPTIONS")
        return next();
      if (await verifyGrant(req.headers["x-gst-network-grant"])) return next();
      res
        .status(403)
        .json({
          code: "NETWORK_ACCESS_REQUIRED",
          message:
            "Use your home network or an administrator-approved browser.",
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
