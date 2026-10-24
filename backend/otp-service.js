"use strict";

const crypto = require("node:crypto");
const EXPIRES_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function failure(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function normalizeEmail(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)
  )
    failure("Enter a valid email address for OTP delivery.");
  return email;
}
function maskEmail(email) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

async function createOtpService({ db, secret, sendEmail, now = Date.now }) {
  if (!secret) throw new Error("OTP hashing secret is required.");
  await db.exec(`CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY, scope TEXT NOT NULL UNIQUE, email TEXT NOT NULL, binding TEXT NOT NULL,
    code_hash TEXT NOT NULL, salt TEXT NOT NULL, expires_at BIGINT NOT NULL, sent_at BIGINT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending'
  ); CREATE TABLE IF NOT EXISTS otp_delivery_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, sent_at BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS otp_delivery_email_time ON otp_delivery_log(email, sent_at);
  CREATE INDEX IF NOT EXISTS otp_delivery_user_time ON otp_delivery_log(user_id, sent_at);`);
  const hash = (code, salt) =>
    crypto.createHmac("sha256", secret).update(`${salt}:${code}`).digest("hex");
  const bindingHash = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  async function issue({ scope, userId, email, purpose, binding }) {
    email = normalizeEmail(email);
    const time = now(),
      id = crypto.randomUUID(),
      salt = crypto.randomBytes(24).toString("hex");
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = time + EXPIRES_MS;
    await db.transaction(async () => {
      // Serialize by user and recipient, including requests from separate backend instances.
      await db.lock(`otp-user:${userId}`);
      await db.lock(`otp-email:${email}`);
      const previous = await db
        .prepare("SELECT sent_at FROM otp_challenges WHERE scope = ?")
        .get(scope);
      if (previous && time - previous.sent_at < COOLDOWN_MS)
        failure(
          `Please wait ${Math.ceil((COOLDOWN_MS - (time - previous.sent_at)) / 1000)} seconds before requesting another OTP.`,
          429,
        );
      const since = time - 60 * 60 * 1000;
      if (
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS n FROM otp_delivery_log WHERE email = ? AND sent_at > ?",
            )
            .get(email, since)
        ).n >= 10 ||
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS n FROM otp_delivery_log WHERE user_id = ? AND sent_at > ?",
            )
            .get(userId, since)
        ).n >= 30
      )
        failure("Too many OTP requests. Try again later.", 429);
      await db
        .prepare("DELETE FROM otp_delivery_log WHERE sent_at < ?")
        .run(time - 24 * 60 * 60 * 1000);
      await db
        .prepare(
          "INSERT INTO otp_challenges (id, scope, email, binding, code_hash, salt, expires_at, sent_at, attempts, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending') ON CONFLICT(scope) DO UPDATE SET id=excluded.id, email=excluded.email, binding=excluded.binding, code_hash=excluded.code_hash, salt=excluded.salt, expires_at=excluded.expires_at, sent_at=excluded.sent_at, attempts=0, state='pending'",
        )
        .run(
          id,
          scope,
          email,
          bindingHash(binding),
          hash(code, salt),
          salt,
          expiresAt,
          time,
        );
      await db
        .prepare(
          "INSERT INTO otp_delivery_log (id, user_id, email, sent_at) VALUES (?, ?, ?, ?)",
        )
        .run(id, userId, email, time);
    })();
    try {
      await sendEmail({ to: email, code, purpose });
    } catch (error) {
      await db
        .prepare("UPDATE otp_challenges SET state = 'failed' WHERE id = ?")
        .run(id);
      if (error.status === 503 || error.status === 429) throw error;
      failure(
        "Unable to send the OTP email. Check the backend mail settings and try again after 60 seconds.",
        502,
      );
    }
    await db
      .prepare("UPDATE otp_challenges SET state = 'active' WHERE id = ?")
      .run(id);
    return {
      challengeId: id,
      recipient: maskEmail(email),
      expiresAt,
      resendAt: time + COOLDOWN_MS,
    };
  }
  async function consume({ challengeId, scope, code, binding }) {
    let result;
    await db.transaction(async () => {
      await db.lock(`otp-challenge:${challengeId}`);
      const challenge = await db
        .prepare("SELECT * FROM otp_challenges WHERE id = ? AND scope = ?")
        .get(String(challengeId || ""), scope);
      if (!challenge || challenge.state !== "active") {
        result = {
          error:
            "Request a new OTP. This code is unavailable or has already been used.",
        };
        return;
      }
      if (now() > challenge.expires_at) {
        result = { error: "OTP expired. Request a new OTP." };
        return;
      }
      if (challenge.attempts >= MAX_ATTEMPTS) {
        result = { error: "Too many incorrect attempts. Request a new OTP." };
        return;
      }
      if (challenge.binding !== bindingHash(binding)) {
        result = {
          error:
            "The details changed after this OTP was sent. Request a new OTP.",
        };
        return;
      }
      const candidate = hash(String(code || "").trim(), challenge.salt);
      if (
        !/^\d{6}$/.test(String(code || "").trim()) ||
        !crypto.timingSafeEqual(
          Buffer.from(candidate),
          Buffer.from(challenge.code_hash),
        )
      ) {
        await db
          .prepare(
            "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?",
          )
          .run(challenge.id);
        result = {
          error:
            challenge.attempts + 1 >= MAX_ATTEMPTS
              ? "Too many incorrect attempts. Request a new OTP."
              : "The OTP entered is incorrect.",
        };
        return;
      }
      await db
        .prepare("UPDATE otp_challenges SET state = 'used' WHERE id = ?")
        .run(challenge.id);
      result = { email: challenge.email };
    })();
    if (result.error) failure(result.error);
    return result;
  }
  return { issue, consume };
}

module.exports = { createOtpService, normalizeEmail };
