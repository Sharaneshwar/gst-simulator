"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "gst-registration-flow-"),
);
process.env.NODE_ENV = "development";
process.env.GST_SEED_DEMO_USERS = "1";
process.env.GST_ENABLE_CASE_LIBRARY = "1";
if (!process.env.GST_TEST_POSTGRES)
  process.env.SQLITE_PATH = path.join(directory, "test.sqlite");
process.env.TOKEN_SECRET = "isolated-registration-flow-test-secret";
const { app, db, ready } = require("../server");
const { createOtpService } = require("../otp-service");
const { practiceGstin } = require("../registration-flow");
const invitations = [],
  emails = [];
let server,
  url,
  teacher,
  student,
  other,
  account,
  time = Date.now();
app.locals.sendInvitation = async (message) => invitations.push(message);
async function request(route, body, token = student) {
  const response = await fetch(url + "/api" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ...(await response.json()), code: response.status };
}
const action = (route, body = {}) => request("/workspace/" + route, body);
const portal = () => request("/portal");
async function start(name) {
  time += 3600000;
  const sent = await action("registration/start", {
    partA: {
      type: "Taxpayer",
      state: "Maharashtra",
      district: "Pune",
      legalName: name,
      pan: "ABCDE1234F",
      mobile: "9876543210",
    },
  });
  assert.equal(sent.code, 200, sent.message);
  const code = emails.at(-1).code;
  const verified = await action("registration/verify", {
    mobileOtp: code,
    emailOtp: code,
  });
  assert.equal(verified.code, 200, verified.message);
  const r = verified.state.workspace.registration;
  assert.equal(r.partA.email, account.email);
  await action("registration/resume", { trn: r.trn, email: account.email });
  assert.equal(
    (await action("registration/resume-verify", { otp: emails.at(-1).code }))
      .code,
    200,
  );
  return r.trn;
}
async function complete() {
  const tabs = {
    business: {
      tradeName: "Practice Trading",
      constitution: "Proprietorship",
      reason: "Voluntary Basis",
      commencement: "2026-10-01",
    },
    promoters: {
      name: "Practice Person",
      pan: "ABCDE1234F",
      designation: "Proprietor",
    },
    signatory: { name: "Practice Person", mobile: "9876543210" },
    representative: {},
    principal: {
      address: "1 Practice Road",
      city: "Pune",
      pincode: "411001",
      possession: "Own",
    },
    additional: {},
    goods: { hsn: "4802", description: "Paper" },
    state: {},
    aadhaar: { opted: "Yes", person: account.email },
    verification: { signatory: account.email, place: "Pune" },
  };
  for (const [tab, values] of Object.entries(tabs)) {
    const saved = await action("registration/save", { tab, values });
    assert.equal(saved.code, 200, `${tab}: ${saved.message}`);
    if (["promoters", "signatory", "principal"].includes(tab))
      assert.equal(
        saved.state.workspace.registration.tabs[tab].email,
        account.email,
      );
  }
  const signing = {
    purpose: "registration-submit",
    email: account.email,
    signatory: "Practice Person",
    method: "EVC",
    declaration: true,
  };
  const otp = await action("signing/send", signing);
  assert.equal(otp.code, 200, otp.message);
  const submitted = await action("registration/submit", {
    ...signing,
    challengeId: otp.otp.challengeId,
    otp: emails.at(-1).code,
  });
  assert.equal(submitted.code, 200, submitted.message);
  return portal();
}
before(async () => {
  await ready;
  app.locals.otpService = await createOtpService({
    db,
    secret: "local-registration-otp-test",
    now: () => time,
    sendEmail: async (message) => emails.push(message),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  teacher = (
    await request(
      "/auth/login",
      { email: "instructor@demo.com", password: "12345" },
      "",
    )
  ).token;
  account = (
    await request(
      "/instructor/users/invite",
      { email: "registration.student@example.com" },
      teacher,
    )
  ).user;
  student = (
    await request(
      "/auth/login",
      { email: account.email, password: invitations.at(-1).password },
      "",
    )
  ).token;
  other = (
    await request(
      "/auth/login",
      { email: "student@demo.com", password: "12345" },
      "",
    )
  ).token;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(directory, { recursive: true });
});

test("account email is fixed for Part A, defaulted server-side, and sent only through mocked email", async () => {
  assert.equal(account.business, null);
  const rejected = await action("registration/start", {
    partA: { email: "another@example.com" },
  });
  assert.equal(rejected.code, 400);
  assert.match(rejected.message, /account/);
  await start("First Practice Company");
  assert.ok(emails.every((message) => message.to === account.email));
  assert.equal(
    (await portal()).user.business,
    null,
    "draft registration must not publish a company identity",
  );
});
let firstBusiness, secondBusiness, firstTrn, secondTrn;
test("submission creates a blank private business without copying another business's return data", async () => {
  firstTrn = (await portal()).activeCase.state.workspace.registration.trn;
  const registered = await complete();
  firstBusiness = registered.activeCase.slug;
  assert.match(firstBusiness, /^practice-/);
  assert.equal(registered.user.email, account.email);
  assert.equal(registered.user.business.legalName, "First Practice Company");
  assert.equal(registered.user.registrationRequired, false);
  assert.equal(
    registered.activeCase.state.taxpayer.gstin,
    practiceGstin("Maharashtra", "ABCDE1234F"),
  );
  assert.equal(
    registered.applications.length,
    1,
    "copies of a submitted application must not appear twice",
  );
  assert.equal(
    registered.activeCase.state.workspace.periods["2026-10"].invoices.length,
    0,
  );
  const saved = await action("invoice/save", {
    invoice: {
      section: "B2B",
      number: "FIRST-01",
      date: "2026-10-15",
      gstin: "29AABCL1234A1Z9",
      place: "Karnataka",
      taxable: 1000,
      rate: 18,
    },
  });
  assert.equal(saved.code, 200, saved.message);
  assert.equal(
    (await request(`/portal/cases/${firstBusiness}/activate`, {}, other)).code,
    403,
  );
  assert.equal(
    (await request("/portal", undefined, other)).cases.some(
      (item) => item.slug === firstBusiness,
    ),
    false,
  );
  assert.equal(
    (await request("/portal", undefined, teacher)).cases.some(
      (item) => item.slug === firstBusiness,
    ),
    false,
    "library must not seed private company definitions for instructors",
  );
});
test("multiple drafts are listed, selected without typing a TRN, and retain their own details", async () => {
  await action("registration/new");
  secondTrn = await start("Second Practice Company");
  await action("registration/save", {
    tab: "business",
    values: {
      tradeName: "Second Trading",
      constitution: "Partnership",
      reason: "Voluntary Basis",
      commencement: "2026-10-01",
    },
  });
  await action("registration/new");
  const thirdTrn = await start("Third Practice Company");
  const listed = (await portal()).applications;
  assert.equal(listed.length, 3);
  assert.ok(listed.some((item) => item.trn === firstTrn && item.arn));
  assert.equal(
    (await request("/portal/applications/open", { reference: secondTrn })).code,
    200,
  );
  assert.equal(
    (await portal()).activeCase.state.workspace.registration.tabs.business
      .tradeName,
    "Second Trading",
  );
  assert.equal(
    (await request("/portal/applications/open", { reference: thirdTrn }, other))
      .code,
    404,
  );
  const unknown = await request("/portal/applications/open", {
    reference: "unknown",
  });
  assert.equal(unknown.code, 404);
  assert.equal(
    (await portal()).activeCase.state.workspace.registration.trn,
    secondTrn,
  );
  assert.equal(
    (await action("registration/start", { partA: {} })).code,
    400,
    "existing draft cannot be overwritten by Part A",
  );
});
test("a second completed registration has independent returns; old businesses and applications survive switching and reset", async () => {
  const second = await complete();
  secondBusiness = second.activeCase.slug;
  assert.equal(second.user.business.legalName, "Second Practice Company");
  assert.notEqual(second.activeCase.slug, firstBusiness);
  assert.equal(
    second.activeCase.state.workspace.periods["2026-10"].invoices.length,
    0,
  );
  assert.equal(second.applications.length, 3);
  assert.equal(
    (await request(`/portal/cases/${firstBusiness}/activate`, {})).code,
    200,
  );
  const first = await portal();
  assert.equal(first.user.business.legalName, "First Practice Company");
  assert.equal(
    first.activeCase.state.workspace.periods["2026-10"].invoices[0].number,
    "FIRST-01",
  );
  await request("/portal/reset", {});
  assert.equal(
    (await portal()).applications.length,
    3,
    "resetting returns must not erase applications",
  );
});

test("business amendments stay attached to their original company after switching", async () => {
  const requested = await request("/account/business-amendment", {
    legalName: "First Practice Company Updated",
    tradeName: "Updated Trading",
    reason: "Practise a business name amendment",
    declaration: true,
  });
  assert.equal(requested.code, 200, requested.message);
  const amended = (
    await request("/instructor/users", undefined, teacher)
  ).users.find((user) => user.id === account.id).amendment;
  await request(`/portal/cases/${secondBusiness}/activate`, {});
  const approved = await request(
    `/instructor/users/${account.id}/business-amendment`,
    { decision: "approve", amendmentId: amended.id },
    teacher,
  );
  assert.equal(approved.code, 200, approved.message);
  assert.equal(
    (await portal()).user.business.legalName,
    "Second Practice Company",
  );
  await request(`/portal/cases/${firstBusiness}/activate`, {});
  assert.equal(
    (await portal()).user.business.legalName,
    "First Practice Company Updated",
  );
});
