"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createEmailTransport } = require("../email-transport");
const { createMailer } = require("../mailer");
const { createInvitationMailer } = require("../invitation-mailer");
const env = {
  BREVO_API_KEY: "private-test-api-key",
  EMAIL_FROM: "sender@example.com",
  FRONTEND_ORIGIN: "https://example.com",
};
function fixture(
  response = { messageId: "accepted-test-message" },
  status = 201,
) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
    };
  };
  const noSmtp = () => {
    throw new Error("SMTP must never be used for Brevo delivery");
  };
  return { calls, fetchImpl, noSmtp };
}
test("Brevo sends one shared OTP via HTTPS with GST Simulator as the sender", async () => {
  const f = fixture();
  const mailer = createMailer(env, f.noSmtp, f.fetchImpl);
  await mailer.sendOtp({
    to: "learner@example.com",
    code: "734891",
    purpose: "registration-start",
  });
  assert.equal(mailer.provider(), "brevo");
  assert.equal(f.calls.length, 1);
  const { url, options } = f.calls[0];
  assert.equal(url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(options.headers["api-key"], env.BREVO_API_KEY);
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
  const body = JSON.parse(options.body);
  assert.deepEqual(body.sender, {
    name: "GST Simulator",
    email: env.EMAIL_FROM,
  });
  assert.deepEqual(body.to, [{ email: "learner@example.com" }]);
  assert.match(
    body.textContent,
    /same OTP in both the Mobile OTP and Email OTP/,
  );
  assert.match(body.htmlContent, /734891/);
  assert.equal(body.cc, undefined);
  assert.equal(body.bcc, undefined);
});
test("all other OTP purposes use the same HTTPS transport", async () => {
  const f = fixture();
  const mailer = createMailer(env, f.noSmtp, f.fetchImpl);
  for (const purpose of [
    "registration-resume",
    "registration-submit",
    "gstr1-file",
    "gstr3b-file",
  ])
    await mailer.sendOtp({
      to: "learner@example.com",
      code: "734891",
      purpose,
    });
  assert.equal(f.calls.length, 4);
  assert.ok(
    f.calls.every((call) => JSON.parse(call.options.body).to.length === 1),
  );
});
test("invitations use Brevo too and preserve the existing login URL and temporary password", async () => {
  const f = fixture();
  const invite = createInvitationMailer(env, f.noSmtp, f.fetchImpl);
  await invite({
    to: "learner@example.com",
    name: "Practice Learner",
    role: "student",
    password: "aBcDEF",
    expiresAt: "2026-10-26T12:00:00Z",
    inviter: "Instructor",
  });
  assert.equal(f.calls.length, 1);
  const body = JSON.parse(f.calls[0].options.body);
  assert.equal(body.sender.name, "GST Simulator");
  assert.match(body.textContent, /https:\/\/example.com\/#\/login/);
  assert.match(body.textContent, /aBcDEF/);
  assert.match(body.textContent, /48 hours/);
});
test("Brevo verification checks the active configured sender without sending email", async () => {
  const f = fixture(
    { senders: [{ active: true, email: env.EMAIL_FROM }] },
    200,
  );
  await createEmailTransport(env, { fetchImpl: f.fetchImpl }).verify();
  assert.equal(f.calls[0].url, "https://api.brevo.com/v3/senders");
  assert.equal(f.calls[0].options.method, "GET");
  assert.equal(f.calls[0].options.body, undefined);
});
test("an inactive or wrong sender fails verification", async () => {
  const f = fixture(
    { senders: [{ active: false, email: env.EMAIL_FROM }] },
    200,
  );
  await assert.rejects(
    createEmailTransport(env, { fetchImpl: f.fetchImpl }).verify(),
    (error) => error.code === "EMAIL_SENDER_UNVERIFIED",
  );
});
test("provider failures never leak details, retry, or fall back to SMTP", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const f = fixture({ message: env.BREVO_API_KEY }, status);
    await assert.rejects(
      createMailer(env, f.noSmtp, f.fetchImpl).sendOtp({
        to: "learner@example.com",
        code: "734891",
        purpose: "gstr1-file",
      }),
      (error) =>
        !error.message.includes(env.BREVO_API_KEY) &&
        error.code === `BREVO_HTTP_${status}`,
    );
    assert.equal(f.calls.length, 1);
  }
});
test("network errors are sanitized and do not trigger a duplicate send", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error(env.BREVO_API_KEY);
  };
  await assert.rejects(
    createMailer(env, undefined, fetchImpl).sendOtp({
      to: "learner@example.com",
      code: "734891",
      purpose: "gstr1-file",
    }),
    (error) =>
      error.code === "EMAIL_NETWORK_ERROR" &&
      !error.message.includes(env.BREVO_API_KEY),
  );
  assert.equal(calls, 1);
});
test("explicit Brevo configuration never silently uses Gmail when its key is missing", async () => {
  const f = fixture();
  await assert.rejects(
    createMailer(
      {
        MAIL_PROVIDER: "brevo",
        EMAIL_FROM: env.EMAIL_FROM,
        SMTP_USER: env.EMAIL_FROM,
        SMTP_PASS: "private-smtp-password",
      },
      f.noSmtp,
      f.fetchImpl,
    ).sendOtp({
      to: "learner@example.com",
      code: "734891",
      purpose: "registration-start",
    }),
    (error) => error.status === 503,
  );
  assert.equal(f.calls.length, 0);
});
test("only one recipient and the configured sender are allowed", async () => {
  const f = fixture(),
    transport = createEmailTransport(env, { fetchImpl: f.fetchImpl });
  const mail = {
    from: { address: env.EMAIL_FROM },
    to: { address: "learner@example.com" },
    text: "Test",
    subject: "Test",
  };
  await assert.rejects(
    transport.sendMail({ ...mail, bcc: "another@example.com" }),
  );
  await assert.rejects(
    transport.sendMail({ ...mail, from: { address: "other@example.com" } }),
  );
  await assert.rejects(
    transport.sendMail({
      ...mail,
      to: { address: "learner@example.com\r\nBcc: other@example.com" },
    }),
  );
  assert.equal(f.calls.length, 0);
});
