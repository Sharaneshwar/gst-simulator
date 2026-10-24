"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gst-access-test-"));
process.env.GST_ENABLE_CASE_LIBRARY = "1";
if (!process.env.GST_TEST_POSTGRES)
  process.env.SQLITE_PATH = path.join(directory, "access.sqlite");
process.env.TOKEN_SECRET = "isolated-access-test-secret-with-32-characters";
const { app, db, ready } = require("../server");
const sent = [];
app.locals.sendInvitation = async (email) => sent.push(email);
let server, url, instructor, student, first, second, invitedInstructor;
async function request(route, body, token = instructor) {
  const response = await fetch(url + "/api" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, ...(await response.json()) };
}
const login = (email, password) =>
  request("/auth/login", { email, password }, "");
const invite = (email, role = "student", name = "Practice Business") =>
  request("/instructor/users/invite", {
    email,
    role,
    name,
    gstin: "33AAFCR1912B1ZX",
  });
before(async () => {
  await ready;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  instructor = (await login("instructor@demo.com", "12345")).token;
  student = (await login("student@demo.com", "12345")).token;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(directory, { recursive: true });
});

test("email access checks reject unknown emails and normalize invited addresses", async () => {
  assert.equal(
    (await request("/auth/access-check", { email: "unknown@example.com" }, ""))
      .allowed,
    false,
  );
  assert.equal(
    (await request("/auth/access-check", { email: " STUDENT@DEMO.COM " }, ""))
      .allowed,
    true,
  );
  assert.equal((await login("unknown@example.com", "12345")).status, 403);
  assert.equal((await login("student@demo.com", "incorrect")).status, 401);
});
test("students cannot list users, invite roles, change access, or rename business through profile", async () => {
  assert.equal(
    (await request("/instructor/users", undefined, student)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/instructor/users/invite",
        { name: "Bad", email: "bad@example.com", role: "instructor" },
        student,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/instructor/users/user-instructor-demo/access",
        { enabled: false },
        student,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/account/profile",
        { name: "Changed", role: "instructor" },
        student,
      )
    ).status,
    403,
  );
  assert.equal((await request("/instructor/users", undefined, "")).status, 401);
  const crypto = require("node:crypto");
  const payload = Buffer.from(
    JSON.stringify({ userId: "user-instructor-demo", exp: Date.now() + 60000 }),
  ).toString("base64url");
  const forged =
    payload +
    "." +
    crypto
      .createHmac("sha256", "replace-this-demo-secret-before-production")
      .update(payload)
      .digest("base64url");
  assert.equal(
    (await request("/instructor/users", undefined, forged)).status,
    401,
  );
});
test("instructors invite both roles; emails alone are unique; dummy GSTINs can repeat", async () => {
  first = await invite("Person.One@example.com", "student", "First Business");
  second = await invite("person.two@example.com", "student", "Second Business");
  invitedInstructor = await invite(
    "teacher@example.com",
    "instructor",
    "Teacher Two",
  );
  for (const result of [first, second, invitedInstructor]) {
    assert.equal(result.status, 201);
    assert.equal(result.user.accessStatus, "invited");
    assert.equal(result.user.firstAccessAt, null);
    assert.equal(result.user.password_hash, undefined);
    assert.equal(result.password, undefined);
  }
  assert.equal(first.user.email, "person.one@example.com");
  assert.equal(first.user.business.gstin, second.user.business.gstin);
  assert.equal(first.user.business.state, "Tamil Nadu");
  assert.equal(invitedInstructor.user.role, "instructor");
  assert.equal((await invite(" PERSON.ONE@example.com ")).status, 409);
  assert.equal((await invite("illegal@example.com", "admin")).status, 400);
  assert.equal(new Set(sent.map((item) => item.password)).size, 3);
  for (const email of sent) assert.match(email.password, /^[A-Za-z]{6}$/);
  assert.ok(
    (
      await db
        .prepare("SELECT password_hash FROM users WHERE id = ?")
        .get(first.user.id)
    ).password_hash.startsWith("scrypt$"),
  );
});
test("first successful login onboards a business and binds exactly one GSTIN across periods", async () => {
  const signed = await login(
    first.user.email,
    sent.find((item) => item.to === first.user.email).password,
  );
  first.token = signed.token;
  assert.equal(signed.user.accessStatus, "onboarded");
  assert.ok(signed.user.firstAccessAt);
  assert.ok(signed.user.lastAccessAt);
  const portal = await request("/portal", undefined, first.token);
  assert.equal(portal.cases.length, 1);
  assert.equal(portal.activeCase.state.taxpayer.legalName, "First Business");
  assert.equal(
    portal.activeCase.state.taxpayer.gstin,
    second.user.business.gstin,
  );
  assert.equal(
    (await request("/portal/cases/nil-october/activate", {}, first.token))
      .status,
    403,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM user_case_state WHERE user_id = ?")
        .get(first.user.id)
    ).n,
    1,
  );
  assert.equal(
    (await request("/workspace/period", { period: "2026-11" }, first.token))
      .status,
    200,
  );
  const later = await request("/portal", undefined, first.token);
  assert.equal(later.activeCase.state.workspace.period, "2026-11");
  assert.equal(
    later.activeCase.state.taxpayer.gstin,
    first.user.business.gstin,
  );
  const other = await login(
    second.user.email,
    sent.find((item) => item.to === second.user.email).password,
  );
  second.token = other.token;
  assert.equal(
    (await request("/portal", undefined, second.token)).activeCase.state
      .workspace.period,
    "2026-10",
  );
});
test("disabling access rejects active tokens immediately and reactivation requires a new login", async () => {
  const firstTime = (
    await db
      .prepare("SELECT first_access_at FROM users WHERE id = ?")
      .get(first.user.id)
  ).first_access_at;
  assert.equal(
    (
      await request(`/instructor/users/${first.user.id}/access`, {
        enabled: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/portal", undefined, first.token)).code,
    "ACCOUNT_DISABLED",
  );
  assert.equal(
    (await request("/auth/access-check", { email: first.user.email }, ""))
      .allowed,
    false,
  );
  assert.equal(
    (
      await login(
        first.user.email,
        sent.find((item) => item.to === first.user.email).password,
      )
    ).status,
    403,
  );
  await request(`/instructor/users/${first.user.id}/access`, { enabled: true });
  assert.equal(
    (await request("/portal", undefined, first.token)).code,
    "SESSION_REVOKED",
  );
  const signed = await login(
    first.user.email,
    sent.find((item) => item.to === first.user.email).password,
  );
  first.token = signed.token;
  assert.equal(signed.user.firstAccessAt, firstTime);
  await db
    .prepare(
      "UPDATE users SET last_access_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
    )
    .run(first.user.id);
  assert.notEqual(
    (await request("/auth/me", undefined, first.token)).user.lastAccessAt,
    "2020-01-01T00:00:00.000Z",
  );
  assert.equal(
    (
      await request("/instructor/users/user-instructor-demo/access", {
        enabled: false,
      })
    ).status,
    400,
  );
});
test("invited instructors receive backend management access, not a student role", async () => {
  const signed = await login(
    invitedInstructor.user.email,
    sent.find((item) => item.to === invitedInstructor.user.email).password,
  );
  assert.equal(signed.user.role, "instructor");
  assert.equal(
    (await request("/instructor/users", undefined, signed.token)).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/instructor/users/user-instructor-demo/access",
        { enabled: false },
        signed.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/instructor/users/${invitedInstructor.user.id}/access`,
        { enabled: false },
        signed.token,
      )
    ).status,
    400,
  );
  await request(
    "/instructor/users/user-instructor-demo/access",
    { enabled: true },
    signed.token,
  );
  instructor = (await login("instructor@demo.com", "12345")).token;
});
test("revoked and expired invitations cannot sign in; resend rotates credentials", async () => {
  const pending = await invite("pending@example.com");
  const oldPassword = sent.at(-1).password;
  assert.equal(
    (await request(`/instructor/users/${pending.user.id}/resend`, {})).status,
    429,
  );
  await request(`/instructor/users/${pending.user.id}/revoke`, {});
  assert.equal((await login(pending.user.email, oldPassword)).status, 403);
  await db
    .prepare(
      "UPDATE users SET invited_at = '2020-01-01T00:00:00Z' WHERE id = ?",
    )
    .run(pending.user.id);
  assert.equal(
    (await request(`/instructor/users/${pending.user.id}/resend`, {})).status,
    200,
  );
  const replacement = sent.at(-1).password;
  assert.notEqual(replacement, oldPassword);
  assert.equal((await login(pending.user.email, oldPassword)).status, 401);
  await db
    .prepare(
      "UPDATE users SET invite_expires_at = '2020-01-01T00:00:00Z' WHERE id = ?",
    )
    .run(pending.user.id);
  assert.equal((await login(pending.user.email, replacement)).status, 403);
});
test("failed email delivery cannot accidentally grant access", async () => {
  app.locals.sendInvitation = async () => {
    throw new Error("SMTP failure");
  };
  const result = await invite("failure@example.com");
  assert.equal(result.status, 201);
  assert.equal(result.user.deliveryStatus, "failed");
  assert.match(result.message, /delivery failed/);
  assert.equal(
    (await request("/auth/access-check", { email: result.user.email }, ""))
      .allowed,
    false,
  );
  app.locals.sendInvitation = async (email) => sent.push(email);
});
test("business name amendments require review, cannot change PAN/GSTIN, and retain saved data", async () => {
  const original = await request("/portal", undefined, first.token);
  const amendment = {
    legalName: "First Business Updated",
    tradeName: "First Trading",
    reason: "Updated business trade name",
    declaration: true,
  };
  assert.equal(
    (
      await request(
        "/account/business-amendment",
        { ...amendment, gstin: "29AAFCB0000A1Z4" },
        first.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/account/business-amendment", amendment, first.token))
      .status,
    200,
  );
  assert.equal(
    (await request("/account/business-amendment", amendment, first.token))
      .status,
    409,
  );
  assert.equal(
    (await request("/portal", undefined, first.token)).activeCase.state.taxpayer
      .legalName,
    "First Business",
  );
  const account = (await request("/instructor/users")).users.find(
    (item) => item.id === first.user.id,
  );
  assert.equal(
    (
      await request(
        `/instructor/users/${first.user.id}/business-amendment`,
        { decision: "approve", amendmentId: account.amendment.id },
        first.token,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/instructor/users/${first.user.id}/business-amendment`, {
        decision: "approve",
        amendmentId: account.amendment.id,
      })
    ).status,
    200,
  );
  const updated = await request("/portal", undefined, first.token);
  assert.equal(updated.user.name, amendment.legalName);
  assert.equal(
    updated.activeCase.state.taxpayer.legalName,
    amendment.legalName,
  );
  assert.equal(
    updated.activeCase.state.taxpayer.gstin,
    original.activeCase.state.taxpayer.gstin,
  );
  assert.deepEqual(
    updated.activeCase.state.workspace.periods,
    original.activeCase.state.workspace.periods,
  );
  await request("/portal/reset", {}, first.token);
  assert.equal(
    (await request("/portal", undefined, first.token)).activeCase.state.taxpayer
      .legalName,
    amendment.legalName,
  );
  assert.equal(
    (
      await request(`/instructor/users/${first.user.id}/business-amendment`, {
        decision: "approve",
        amendmentId: account.amendment.id,
      })
    ).status,
    409,
  );
});
test("startup preserves invited users, instructor profile edits, and existing passwords", async () => {
  await request("/account/profile", { name: "My Instructor" });
  const before = (
    await db
      .prepare(
        "SELECT password_hash FROM users WHERE id = 'user-instructor-demo'",
      )
      .get()
  ).password_hash;
  const child = spawnSync(
    process.execPath,
    [
      "-e",
      "const s=require('./server'); s.ready.then(()=>s.db.close()).catch(e=>{console.error(e.code||e.message);process.exitCode=1})",
    ],
    {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(
    (
      await db
        .prepare("SELECT name FROM users WHERE id = 'user-instructor-demo'")
        .get()
    ).name,
    "My Instructor",
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT password_hash FROM users WHERE id = 'user-instructor-demo'",
        )
        .get()
    ).password_hash,
    before,
  );
  assert.ok(
    await db.prepare("SELECT id FROM users WHERE id = ?").get(first.user.id),
  );
  assert.ok(
    (await db.prepare("SELECT COUNT(*) AS n FROM access_audit").get()).n >= 10,
  );
});
