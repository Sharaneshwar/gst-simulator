"use strict";

const crypto = require("node:crypto");
const INVITE_LIFETIME = 48 * 60 * 60 * 1000;
const ACCESS_MESSAGE =
  "This email is incorrect or does not have access to the application.";
const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const validEmail = (value) =>
  value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
const STATE_CODES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  26: "Dadra and Nagar Haveli and Daman and Diu",
  27: "Maharashtra",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman and Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh",
  38: "Ladakh",
  97: "Other Territory",
};
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};
function verifyPassword(password, stored, legacySalt) {
  if (!stored || typeof password !== "string" || password.length > 128)
    return false;
  let expected, received;
  if (stored.startsWith("scrypt$")) {
    const [, salt, digest] = stored.split("$");
    if (!salt || !/^[a-f0-9]{128}$/.test(digest || "")) return false;
    expected = Buffer.from(digest, "hex");
    received = crypto.scryptSync(password, salt, 64);
  } else {
    expected = Buffer.from(stored);
    received = Buffer.from(
      crypto
        .createHash("sha256")
        .update(`${password}:${legacySalt}`)
        .digest("hex"),
    );
  }
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}
async function initializeAccess(db) {
  const columns = new Set(
    (
      await db
        .prepare(
          db.dialect === "postgres"
            ? "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'"
            : "PRAGMA table_info(users)",
        )
        .all()
    ).map((column) => column.name),
  );
  const migrations = {
    access_status: "TEXT NOT NULL DEFAULT 'onboarded'",
    is_enabled: "INTEGER NOT NULL DEFAULT 1",
    first_access_at: "TEXT",
    last_access_at: "TEXT",
    session_version: "INTEGER NOT NULL DEFAULT 0",
    invited_by: "TEXT",
    invited_at: "TEXT",
    invite_expires_at: "TEXT",
    delivery_status: "TEXT",
    password_fingerprint: "TEXT",
    business_slug: "TEXT",
    business_json: "TEXT",
    business_amendment_json: "TEXT",
  };
  for (const [name, definition] of Object.entries(migrations))
    if (!columns.has(name))
      await db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  await db.exec(`DROP INDEX IF EXISTS unique_password_fingerprint;
    CREATE TABLE IF NOT EXISTS access_audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);`);
}
function allowed(user, now = Date.now()) {
  return Boolean(
    user &&
    user.is_enabled &&
    (user.access_status === "onboarded" ||
      (user.access_status === "invited" &&
        user.delivery_status === "sent" &&
        Date.parse(user.invite_expires_at) > now)),
  );
}
function publicUser(user) {
  const business = user.business_json ? JSON.parse(user.business_json) : null;
  const amendment = user.business_amendment_json
    ? JSON.parse(user.business_amendment_json)
    : null;
  return {
    id: user.id,
    name: user.role === "student" && business ? business.legalName : user.name,
    email: user.email,
    role: user.role,
    business,
    amendment,
    isEnabled: Boolean(user.is_enabled),
    accessStatus: user.access_status,
    firstAccessAt: user.first_access_at,
    lastAccessAt: user.last_access_at,
    invitedAt: user.invited_at,
    inviteExpiresAt: user.invite_expires_at,
    deliveryStatus: user.delivery_status,
  };
}
function mountAccess(app, deps) {
  const {
    db,
    requireAuth,
    sign,
    ensureStates,
    legacySalt,
    secret,
    getActiveCase,
    saveState,
  } = deps;
  const clock = () => new Date().toISOString();
  const limits = new Map();
  function throttle(req, res, action, ceiling, windowMs) {
    const now = Date.now(),
      key = `${action}:${req.ip}`;
    if (limits.size > 10000)
      for (const [k, value] of limits) if (value.until < now) limits.delete(k);
    const limit = limits.get(key);
    if (limit && limit.until > now && limit.count >= ceiling) {
      res.setHeader("Retry-After", Math.ceil((limit.until - now) / 1000));
      res
        .status(429)
        .json({ message: "Too many attempts. Please wait and try again." });
      return false;
    }
    limits.set(
      key,
      limit && limit.until > now
        ? { ...limit, count: limit.count + 1 }
        : { count: 1, until: now + windowMs },
    );
    return true;
  }
  const instructor = async (req, res) => {
    const actor = await requireAuth(req, res);
    if (!actor) return null;
    if (actor.role !== "instructor") {
      res.status(403).json({ message: "Instructor access is required." });
      return null;
    }
    return actor;
  };
  const audit = async (actor, target, action) =>
    await db
      .prepare(
        "INSERT INTO access_audit (id, actor_id, target_id, action, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(crypto.randomUUID(), actor, target, action, clock());
  const makeToken = (user) =>
    sign({
      userId: user.id,
      version: user.session_version,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    });
  const code = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    return Array.from(
      { length: 6 },
      () => alphabet[crypto.randomInt(alphabet.length)],
    ).join("");
  };
  async function uniquePassword() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const password = code(),
        fingerprint = crypto
          .createHmac("sha256", secret)
          .update(password)
          .digest("hex");
      if (
        !(await db
          .prepare("SELECT id FROM users WHERE password_fingerprint = ?")
          .get(fingerprint))
      )
        return { password, fingerprint };
    }
    throw new Error("Unable to generate a unique password.");
  }
  async function deliver(user, password, actor) {
    try {
      await app.locals.sendInvitation({
        to: user.email,
        name: user.name,
        role: user.role,
        password,
        expiresAt: user.invite_expires_at,
        inviter: actor.name,
      });
      await db
        .prepare(
          "UPDATE users SET delivery_status = 'sent' WHERE id = ? AND access_status = 'invited'",
        )
        .run(user.id);
      return true;
    } catch {
      await db
        .prepare(
          "UPDATE users SET delivery_status = 'failed' WHERE id = ? AND access_status = 'invited'",
        )
        .run(user.id);
      return false;
    }
  }
  app.post("/api/auth/access-check", async (req, res) => {
    if (!throttle(req, res, "check", 90, 60000)) return;
    const email = normalizeEmail(req.body?.email);
    const user =
      validEmail(email) &&
      (await db.prepare("SELECT * FROM users WHERE email = ?").get(email));
    res.json({
      allowed: allowed(user),
      message: allowed(user) ? "" : ACCESS_MESSAGE,
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    if (!throttle(req, res, "login", 30, 15 * 60000)) return;
    const email = normalizeEmail(req.body?.email),
      password = String(req.body?.password || "");
    const user = await db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);
    if (!allowed(user))
      return res.status(403).json({ message: ACCESS_MESSAGE });
    if (!verifyPassword(password, user.password_hash, legacySalt))
      return res
        .status(401)
        .json({ message: "The email or password is incorrect." });
    const now = clock();
    await db
      .prepare(
        "UPDATE users SET access_status = 'onboarded', first_access_at = COALESCE(first_access_at, ?), last_access_at = ?, password_hash = ? WHERE id = ?",
      )
      .run(
        now,
        now,
        user.password_hash.startsWith("scrypt$")
          ? user.password_hash
          : hashPassword(password),
        user.id,
      );
    if (user.access_status === "invited")
      await audit(user.id, user.id, "invitation.accepted");
    await ensureStates(user.id);
    const updated = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(user.id);
    res.json({ token: makeToken(updated), user: publicUser(updated) });
  });
  app.post("/api/account/profile", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (user.role !== "instructor")
      return res.status(403).json({
        message:
          "Business names must be changed through a registration amendment, not a profile rename.",
      });
    const name = String(req.body?.name || "").trim();
    if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name))
      return res
        .status(400)
        .json({ message: "Enter a name between 2 and 80 characters." });
    await db
      .prepare("UPDATE users SET name = ? WHERE id = ?")
      .run(name, user.id);
    await audit(user.id, user.id, "profile.renamed");
    res.json({
      user: publicUser(
        await db.prepare("SELECT * FROM users WHERE id = ?").get(user.id),
      ),
      message: "Your name has been updated.",
    });
  });
  app.post("/api/account/business-amendment", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (user.role !== "student")
      return res.status(403).json({
        message:
          "Business amendments are available to student business accounts.",
      });
    await ensureStates(user.id);
    const current = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(user.id);
    const business = JSON.parse(current.business_json);
    const previous =
      current.business_amendment_json &&
      JSON.parse(current.business_amendment_json);
    if (previous?.status === "Pending")
      return res
        .status(409)
        .json({ message: "An amendment is already awaiting review." });
    const legalName = String(req.body?.legalName || "").trim(),
      tradeName = String(req.body?.tradeName || "").trim(),
      reason = String(req.body?.reason || "").trim();
    if (
      [legalName, tradeName].some(
        (value) =>
          value.length < 2 || value.length > 80 || /[\x00-\x1f]/.test(value),
      ) ||
      reason.length < 5 ||
      reason.length > 500 ||
      req.body?.declaration !== true
    )
      return res.status(400).json({
        message:
          "Enter legal and trade names (2–80 characters), a reason (5–500 characters), and accept the declaration.",
      });
    if (req.body?.gstin || req.body?.pan)
      return res
        .status(400)
        .json({ message: "This amendment cannot change the GSTIN or PAN." });
    if (legalName === business.legalName && tradeName === business.tradeName)
      return res
        .status(400)
        .json({ message: "Change the legal or trade name before submitting." });
    const amendment = {
      id: crypto.randomUUID(),
      legalName,
      tradeName,
      reason,
      status: "Pending",
      submittedAt: clock(),
      original: {
        legalName: business.legalName,
        tradeName: business.tradeName,
      },
    };
    await db
      .prepare("UPDATE users SET business_amendment_json = ? WHERE id = ?")
      .run(JSON.stringify(amendment), user.id);
    await audit(user.id, user.id, "business.amendment.submitted");
    res.json({
      message:
        "Core-field amendment submitted for instructor approval in this practice portal.",
    });
  });
  app.post("/api/instructor/users/:id/business-amendment", async (req, res) => {
    const actor = await instructor(req, res);
    if (!actor) return;
    const user = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(req.params.id);
    const amendment =
      user?.business_amendment_json && JSON.parse(user.business_amendment_json);
    if (
      !user ||
      amendment?.status !== "Pending" ||
      req.body?.amendmentId !== amendment.id ||
      !["approve", "reject"].includes(req.body?.decision)
    )
      return res.status(409).json({
        message: "Select a current pending amendment and a valid decision.",
      });
    const note = String(req.body?.note || "")
      .trim()
      .slice(0, 500);
    await db.transaction(async () => {
      amendment.status =
        req.body.decision === "approve" ? "Approved" : "Rejected";
      amendment.reviewedAt = clock();
      amendment.reviewedBy = actor.name;
      amendment.note = note;
      if (amendment.status === "Approved") {
        const business = {
          ...JSON.parse(user.business_json),
          legalName: amendment.legalName,
          tradeName: amendment.tradeName,
        };
        const active = await getActiveCase(user.id);
        active.state.taxpayer = { ...active.state.taxpayer, ...business };
        await saveState(user.id, active.slug, active.state, active.revision);
        await db
          .prepare("UPDATE users SET business_json = ?, name = ? WHERE id = ?")
          .run(JSON.stringify(business), business.legalName, user.id);
      }
      await db
        .prepare("UPDATE users SET business_amendment_json = ? WHERE id = ?")
        .run(JSON.stringify(amendment), user.id);
      await audit(
        actor.id,
        user.id,
        `business.amendment.${amendment.status.toLowerCase()}`,
      );
    })();
    res.json({
      message: `Business amendment ${amendment.status.toLowerCase()}.`,
    });
  });
  app.get("/api/instructor/users", async (req, res) => {
    if (!(await instructor(req, res))) return;
    for (const row of await db
      .prepare(
        "SELECT id FROM users WHERE role = 'student' AND business_json IS NULL",
      )
      .all())
      await ensureStates(row.id);
    res.json({
      users: (
        await db
          .prepare("SELECT * FROM users ORDER BY is_enabled DESC, LOWER(name)")
          .all()
      ).map(publicUser),
    });
  });
  app.post("/api/instructor/users/invite", async (req, res, next) => {
    const actor = await instructor(req, res);
    if (!actor || !throttle(req, res, "invite", 20, 3600000)) return;
    const email = normalizeEmail(req.body?.email),
      name = String(req.body?.name || "").trim(),
      role = req.body?.role;
    if (
      !validEmail(email) ||
      name.length < 2 ||
      name.length > 80 ||
      !["student", "instructor"].includes(role)
    )
      return res.status(400).json({
        message: "Enter a valid name, email and Student or Instructor role.",
      });
    if (/[\x00-\x1f]/.test(name))
      return res.status(400).json({ message: "Enter a valid name." });
    const tradeName = String(req.body?.tradeName || name).trim();
    const gstin = String(req.body?.gstin || "29AAFCB0000A1Z4")
      .trim()
      .toUpperCase();
    if (
      role === "student" &&
      (tradeName.length < 2 ||
        tradeName.length > 80 ||
        /[\x00-\x1f]/.test(tradeName) ||
        !/^\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) ||
        !STATE_CODES[gstin.slice(0, 2)])
    )
      return res.status(400).json({
        message:
          "Enter a trade name and a 15-character practice GSTIN with a valid state code. GSTINs may repeat across accounts.",
      });
    if (await db.prepare("SELECT id FROM users WHERE email = ?").get(email))
      return res
        .status(409)
        .json({ message: "This email already has an account or invitation." });
    try {
      const { password, fingerprint } = await uniquePassword(),
        now = clock(),
        userId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + INVITE_LIFETIME).toISOString();
      await db
        .prepare(
          "INSERT INTO users (id, name, email, password_hash, role, created_at, access_status, is_enabled, invited_by, invited_at, invite_expires_at, delivery_status, password_fingerprint) VALUES (?, ?, ?, ?, ?, ?, 'invited', 1, ?, ?, ?, 'pending', ?)",
        )
        .run(
          userId,
          name,
          email,
          hashPassword(password),
          role,
          now,
          actor.id,
          now,
          expiresAt,
          fingerprint,
        );
      if (role === "student")
        await db
          .prepare(
            "UPDATE users SET business_slug = 'regular-october', business_json = ? WHERE id = ?",
          )
          .run(
            JSON.stringify({
              legalName: name,
              tradeName,
              gstin,
              pan: gstin.slice(2, 12),
              state: STATE_CODES[gstin.slice(0, 2)],
            }),
            userId,
          );
      await audit(actor.id, userId, "invitation.created");
      const delivered = await deliver(
        await db.prepare("SELECT * FROM users WHERE id = ?").get(userId),
        password,
        actor,
      );
      res.status(201).json({
        user: publicUser(
          await db.prepare("SELECT * FROM users WHERE id = ?").get(userId),
        ),
        message: delivered
          ? "Invitation sent successfully."
          : "Invitation saved, but email delivery failed. Use Resend Invitation to try again.",
      });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/instructor/users/:id/resend", async (req, res, next) => {
    const actor = await instructor(req, res);
    if (!actor || !throttle(req, res, "invite", 20, 3600000)) return;
    const user = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(req.params.id);
    if (!user || user.access_status === "onboarded")
      return res
        .status(400)
        .json({ message: "Only pending invitations can be resent." });
    if (Date.now() - Date.parse(user.invited_at) < 60000)
      return res
        .status(429)
        .json({ message: "Wait 60 seconds before resending this invitation." });
    try {
      const { password, fingerprint } = await uniquePassword(),
        now = clock();
      await db
        .prepare(
          "UPDATE users SET password_hash = ?, password_fingerprint = ?, is_enabled = 1, access_status = 'invited', invited_at = ?, invite_expires_at = ?, delivery_status = 'pending', session_version = session_version + 1 WHERE id = ?",
        )
        .run(
          hashPassword(password),
          fingerprint,
          now,
          new Date(Date.now() + INVITE_LIFETIME).toISOString(),
          user.id,
        );
      await audit(actor.id, user.id, "invitation.resent");
      const delivered = await deliver(
        await db.prepare("SELECT * FROM users WHERE id = ?").get(user.id),
        password,
        actor,
      );
      res.json({
        message: delivered
          ? "A new invitation and password have been sent. The previous password no longer works."
          : "Email delivery failed. Wait 60 seconds and try again.",
      });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/instructor/users/:id/revoke", async (req, res) => {
    const actor = await instructor(req, res);
    if (!actor) return;
    const user = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(req.params.id);
    if (!user || user.access_status === "onboarded")
      return res
        .status(400)
        .json({ message: "Only pending invitations can be revoked." });
    await db
      .prepare(
        "UPDATE users SET access_status = 'revoked', is_enabled = 0, session_version = session_version + 1 WHERE id = ?",
      )
      .run(user.id);
    await audit(actor.id, user.id, "invitation.revoked");
    res.json({ message: "Invitation revoked." });
  });
  app.post("/api/instructor/users/:id/access", async (req, res) => {
    const actor = await instructor(req, res);
    if (!actor) return;
    const user = await db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(req.params.id),
      enabled = req.body?.enabled;
    if (
      !user ||
      user.access_status !== "onboarded" ||
      typeof enabled !== "boolean"
    )
      return res.status(400).json({
        message: "Select an onboarded user and a valid access setting.",
      });
    if (!enabled && actor.id === user.id)
      return res
        .status(400)
        .json({ message: "You cannot deactivate your own account." });
    if (
      !enabled &&
      user.role === "instructor" &&
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM users WHERE role = 'instructor' AND is_enabled = 1 AND access_status = 'onboarded'",
          )
          .get()
      ).n <= 1
    )
      return res
        .status(400)
        .json({ message: "At least one active instructor must remain." });
    await db
      .prepare(
        "UPDATE users SET is_enabled = ?, session_version = session_version + 1 WHERE id = ?",
      )
      .run(enabled ? 1 : 0, user.id);
    await audit(
      actor.id,
      user.id,
      enabled ? "access.activated" : "access.deactivated",
    );
    res.json({
      message: enabled
        ? "Access activated. The user can sign in again."
        : "Access deactivated and all existing sessions revoked.",
    });
  });
}
module.exports = {
  initializeAccess,
  mountAccess,
  hashPassword,
  verifyPassword,
  allowed,
  publicUser,
  ACCESS_MESSAGE,
};
