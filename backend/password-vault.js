"use strict";
const crypto = require("node:crypto");
function key(secret) {
  return crypto.hkdfSync(
    "sha256",
    secret,
    "gst-simulator-password-vault",
    "v1",
    32,
  );
}
function sealPassword(password, userId, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
function openPassword(value, userId, secret) {
  const [version, iv, tag, data, ...extra] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !data || extra.length)
    throw Error("Password unavailable");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
module.exports = { sealPassword, openPassword };
