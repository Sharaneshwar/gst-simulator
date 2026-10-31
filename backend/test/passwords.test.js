"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gst-passwords-"));
Object.assign(process.env, {
  NODE_ENV: "development",
  GST_SEED_DEMO_USERS: "1",
  TOKEN_SECRET: "isolated-password-test-secret",
});
if (!process.env.GST_TEST_POSTGRES)
  process.env.SQLITE_PATH = path.join(dir, "test.sqlite");
const { app, db, ready } = require("../server");
const { sealPassword, openPassword } = require("../password-vault");
const sent = [];
app.locals.sendInvitation = async (m) => sent.push(m);
let server, url, teacher, student, invited, otherTeacher;
async function request(route, body, token = teacher) {
  const res = await fetch(url + "/api" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: res.status,
    cache: res.headers.get("cache-control"),
    ...(await res.json()),
  };
}
const login = (email, password) =>
  request("/auth/login", { email, password }, "");
before(async () => {
  await ready;
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
  teacher = (await login("instructor@demo.com", "12345")).token;
  student = (await login("student@demo.com", "12345")).token;
  invited = (
    await request("/instructor/users/invite", {
      email: "vault.student@example.com",
    })
  ).user;
  otherTeacher = (
    await request("/instructor/users/invite", {
      email: "vault.teacher@example.com",
      role: "instructor",
    })
  ).user;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  fs.rmSync(dir, { recursive: true });
});
test("password encryption authenticates the secret, target account, and ciphertext", () => {
  const value = sealPassword("CaseSensitive@23", "user-one", "test-secret");
  assert.equal(
    openPassword(value, "user-one", "test-secret"),
    "CaseSensitive@23",
  );
  assert.ok(!value.includes("CaseSensitive"));
  assert.notEqual(
    value,
    sealPassword("CaseSensitive@23", "user-one", "test-secret"),
  );
  assert.throws(() => openPassword(value, "user-two", "test-secret"));
  assert.throws(() => openPassword(value, "user-one", "other-secret"));
  const parts = value.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => openPassword(parts.join("."), "user-one", "test-secret"));
});
test("only instructors reveal their own or student passwords; ordinary responses never expose them", async () => {
  const route = `/instructor/users/${invited.id}/password/reveal`;
  assert.equal((await request(route, {}, "")).status, 401);
  assert.equal((await request(route, {}, student)).status, 403);
  const shown = await request(route, {});
  assert.equal(
    shown.password,
    sent.find((m) => m.to === invited.email).password,
  );
  assert.equal(shown.cache, "no-store");
  assert.equal(
    (await request(`/instructor/users/${otherTeacher.id}/password/reveal`, {}))
      .status,
    403,
  );
  const own = await request(
    "/instructor/users/user-instructor-demo/password/reveal",
    {},
  );
  assert.equal(own.password, "12345");
  const list = await request("/instructor/users");
  for (const user of list.users) {
    assert.equal(user.password, undefined);
    assert.equal(user.password_hash, undefined);
    assert.equal(user.password_ciphertext, undefined);
  }
  const row = await db
    .prepare("SELECT password_hash,password_ciphertext FROM users WHERE id=?")
    .get(invited.id);
  assert.ok(row.password_hash.startsWith("scrypt$"));
  assert.ok(row.password_ciphertext.startsWith("v1."));
  assert.ok(!row.password_ciphertext.includes(shown.password));
  assert.ok(
    await db
      .prepare(
        "SELECT id FROM access_audit WHERE target_id=? AND action='password.revealed'",
      )
      .get(invited.id),
  );
});
test("legacy passwords are unavailable until successful login; bad attempts never overwrite them", async () => {
  await db
    .prepare("UPDATE users SET password_ciphertext=NULL WHERE id=?")
    .run("user-student-demo");
  assert.equal(
    (await request("/instructor/users/user-student-demo/password/reveal", {}))
      .status,
    409,
  );
  assert.equal((await login("student@demo.com", "wrong")).status, 401);
  assert.equal(
    (await request("/instructor/users/user-student-demo/password/reveal", {}))
      .status,
    409,
  );
  student = (await login("student@demo.com", "12345")).token;
  assert.equal(
    (await request("/instructor/users/user-student-demo/password/reveal", {}))
      .password,
    "12345",
  );
});
test("profile password changes verify current password and confirmation, revoke old sessions, and update instructor viewing", async () => {
  for (const body of [
    {
      currentPassword: "wrong",
      newPassword: "Changed@23",
      confirmPassword: "Changed@23",
    },
    {
      currentPassword: "12345",
      newPassword: "short",
      confirmPassword: "short",
    },
    {
      currentPassword: "12345",
      newPassword: "Changed@23",
      confirmPassword: "Other@23",
    },
  ])
    assert.equal(
      (await request("/account/password", body, student)).status,
      400,
    );
  const old = student;
  const result = await request(
    "/account/password",
    {
      currentPassword: "12345",
      newPassword: "Changed@23",
      confirmPassword: "Changed@23",
    },
    student,
  );
  assert.equal(result.status, 200);
  assert.ok(result.token);
  student = result.token;
  assert.equal((await request("/auth/me", undefined, old)).status, 401);
  assert.equal((await request("/auth/me", undefined, student)).status, 200);
  assert.equal((await login("student@demo.com", "12345")).status, 401);
  assert.equal((await login("student@demo.com", "Changed@23")).status, 200);
  assert.equal(
    (await request("/instructor/users/user-student-demo/password/reveal", {}))
      .password,
    "Changed@23",
  );
});
test("instructors reset only onboarded students without email or deleting saved work", async () => {
  const body = {
    newPassword: "ResetByDad@23",
    confirmPassword: "ResetByDad@23",
  };
  assert.equal(
    (
      await request(
        "/instructor/users/user-student-demo/password/reset",
        body,
        student,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/instructor/users/${otherTeacher.id}/password/reset`, body))
      .status,
    403,
  );
  assert.equal(
    (await request(`/instructor/users/${invited.id}/password/reset`, body))
      .status,
    409,
  );
  const before = await db
    .prepare(
      "SELECT case_slug,state_json FROM user_case_state WHERE user_id=? ORDER BY case_slug",
    )
    .all("user-student-demo");
  const count = sent.length;
  const reset = await request(
    "/instructor/users/user-student-demo/password/reset",
    body,
  );
  assert.equal(reset.status, 200);
  assert.equal(reset.cache, "no-store");
  assert.equal(sent.length, count);
  assert.deepEqual(
    await db
      .prepare(
        "SELECT case_slug,state_json FROM user_case_state WHERE user_id=? ORDER BY case_slug",
      )
      .all("user-student-demo"),
    before,
  );
  assert.equal((await request("/auth/me", undefined, student)).status, 401);
  assert.equal((await login("student@demo.com", "Changed@23")).status, 401);
  const fresh = await login("student@demo.com", "ResetByDad@23");
  assert.equal(fresh.status, 200);
  student = fresh.token;
  assert.equal(
    (await request("/instructor/users/user-student-demo/password/reveal", {}))
      .password,
    "ResetByDad@23",
  );
});
test("instructors change their own password using the profile and receive a working replacement session", async () => {
  const old = teacher;
  const result = await request("/account/password", {
    currentPassword: "12345",
    newPassword: "TeacherNew@23",
    confirmPassword: "TeacherNew@23",
  });
  assert.equal(result.status, 200);
  teacher = result.token;
  assert.equal((await request("/auth/me", undefined, old)).status, 401);
  assert.equal((await request("/auth/me")).status, 200);
  assert.equal(
    (
      await request(
        "/instructor/users/user-instructor-demo/password/reveal",
        {},
      )
    ).password,
    "TeacherNew@23",
  );
});
test("a password reset racing with login cannot be overwritten by that login", async () => {
  const original = db.prepare.bind(db);
  const before = await original(
    "SELECT password_hash,password_ciphertext FROM users WHERE id=?",
  ).get("user-student-demo");
  db.prepare = (sql) => {
    const statement = original(sql);
    if (!sql.startsWith("UPDATE users SET access_status = 'onboarded'"))
      return statement;
    return {
      ...statement,
      run: async (...args) => {
        await original(
          "UPDATE users SET session_version=session_version+1 WHERE id=?",
        ).run("user-student-demo");
        return statement.run(...args);
      },
    };
  };
  try {
    assert.equal(
      (await login("student@demo.com", "ResetByDad@23")).status,
      409,
    );
    assert.deepEqual(
      await original(
        "SELECT password_hash,password_ciphertext FROM users WHERE id=?",
      ).get("user-student-demo"),
      before,
    );
  } finally {
    db.prepare = original;
  }
});
