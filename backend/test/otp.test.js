"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDatabase } = require("../database");
const { createOtpService } = require("../otp-service");
const { createMailer } = require("../mailer");

async function fixture(t, options = {}) {
  const db = createDatabase({ SQLITE_PATH: ":memory:" });
  t.after(() => db.close());
  let time = 1700000000000;
  const deliveries = [];
  const service = await createOtpService({
    db,
    secret: "test-only-secret",
    now: () => time,
    sendEmail:
      options.sendEmail ||
      (async (email) => {
        deliveries.push(email);
      }),
  });
  const request = {
    scope: "student:business:registration-start",
    userId: "student",
    email: "learner@example.com",
    purpose: "registration-start",
    binding: { email: "learner@example.com", pan: "ABCDE1234F" },
  };
  return {
    db,
    service,
    deliveries,
    request,
    tick: (ms) => {
      time += ms;
    },
  };
}

test("one message carries a random shared OTP; metadata and SQLite never expose plaintext codes", async (t) => {
  const { service, db, deliveries, request } = await fixture(t);
  const response = await service.issue(request);
  assert.equal(deliveries.length, 1);
  assert.match(deliveries[0].code, /^\d{6}$/);
  assert.equal(response.code, undefined);
  assert.equal(response.otp, undefined);
  const stored = db.prepare("SELECT * FROM otp_challenges").get();
  assert.equal(stored.code, undefined);
  assert.equal(stored.code_hash.length, 64);
  assert.notEqual(stored.code_hash, deliveries[0].code);
  assert.ok(response.recipient.includes("***"));
});
test("verification consumes an OTP once and keeps attempts across failed requests", async (t) => {
  const { service, deliveries, request } = await fixture(t);
  const challenge = await service.issue(request);
  const input = {
    scope: request.scope,
    challengeId: challenge.challengeId,
    binding: request.binding,
    code: deliveries[0].code,
  };
  await assert.rejects(
    () => service.consume({ ...input, code: "bad" }),
    /incorrect/,
  );
  assert.equal((await service.consume(input)).email, request.email);
  await assert.rejects(() => service.consume(input), /already been used/);
});
test("expiry, five-attempt lockout, wrong scope and changed request details are enforced", async (t) => {
  const { service, deliveries, request, tick } = await fixture(t);
  let challenge = await service.issue(request);
  let input = {
    scope: request.scope,
    challengeId: challenge.challengeId,
    binding: request.binding,
    code: deliveries.at(-1).code,
  };
  await assert.rejects(
    () => service.consume({ ...input, scope: "other-user" }),
    /unavailable/,
  );
  await assert.rejects(
    () => service.consume({ ...input, binding: { changed: true } }),
    /details changed/,
  );
  for (let n = 0; n < 5; n++)
    await assert.rejects(
      () => service.consume({ ...input, code: "wrong" }),
      /incorrect|Too many/,
    );
  await assert.rejects(() => service.consume(input), /Too many/);
  tick(60001);
  challenge = await service.issue(request);
  input = {
    ...input,
    challengeId: challenge.challengeId,
    code: deliveries.at(-1).code,
  };
  tick(10 * 60 * 1000 + 1);
  await assert.rejects(() => service.consume(input), /expired/);
});
test("resend cooldown persists in SQLite and supersedes previous challenges", async (t) => {
  const { service, deliveries, request, tick } = await fixture(t);
  const old = await service.issue(request);
  await assert.rejects(service.issue(request), (error) => error.status === 429);
  assert.equal(deliveries.length, 1);
  tick(60001);
  const next = await service.issue(request);
  assert.notEqual(next.challengeId, old.challengeId);
  await assert.rejects(
    () =>
      service.consume({
        scope: request.scope,
        challengeId: old.challengeId,
        binding: request.binding,
        code: deliveries[0].code,
      }),
    /unavailable/,
  );
});
test("email quota prevents bypassing cooldown by changing purpose or business", async (t) => {
  const { service, request } = await fixture(t);
  for (let i = 0; i < 10; i++)
    await service.issue({ ...request, scope: `scope-${i}` });
  await assert.rejects(
    service.issue({ ...request, scope: "scope-extra" }),
    (error) => error.status === 429,
  );
});
test("concurrent verification consumes a shared OTP only once", async (t) => {
  const { service, deliveries, request } = await fixture(t);
  const challenge = await service.issue(request);
  const input = {
    scope: request.scope,
    challengeId: challenge.challengeId,
    binding: request.binding,
    code: deliveries[0].code,
  };
  const results = await Promise.allSettled([
    service.consume(input),
    service.consume(input),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
});
test("mail failure invalidates the challenge and never returns provider credentials", async (t) => {
  const { service, db, request } = await fixture(t, {
    sendEmail: async () => {
      throw new Error("private provider failure");
    },
  });
  await assert.rejects(
    service.issue(request),
    (error) =>
      error.status === 502 && !error.message.includes("private provider"),
  );
  assert.equal(
    db.prepare("SELECT state FROM otp_challenges").get().state,
    "failed",
  );
});
test("sender uses GST Simulator and configured email; one message explains the shared code", async () => {
  const sent = [];
  let transportSettings;
  const mailer = createMailer(
    { SMTP_USER: "sender@example.com", SMTP_PASS: "abcd efgh ijkl mnop" },
    (settings) => {
      transportSettings = settings;
      return {
        sendMail: async (mail) => {
          sent.push(mail);
          return {
            accepted: [mail.to.address],
            rejected: [],
            messageId: "test",
          };
        },
        verify: async () => true,
      };
    },
  );
  await mailer.sendOtp({
    to: "learner@example.com",
    code: "492731",
    purpose: "registration-start",
  });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].from, {
    name: "GST Simulator",
    address: "sender@example.com",
  });
  assert.match(sent[0].text, /same OTP in both the Mobile OTP and Email OTP/);
  assert.match(sent[0].html, /492731/);
  assert.equal(transportSettings.auth.pass, "abcdefghijklmnop");
  assert.equal(transportSettings.secure, true);
  assert.equal(transportSettings.debug, false);
});
test("missing email configuration fails clearly instead of falling back to static OTPs", async () => {
  await assert.rejects(
    createMailer({}).sendOtp({
      to: "learner@example.com",
      code: "111111",
      purpose: "registration-start",
    }),
    (error) => error.status === 503,
  );
});
