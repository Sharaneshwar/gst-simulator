"use strict";
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});
const { createMailer } = require("../mailer");
(async () => {
  const mailer = createMailer();
  await mailer.verify();
  console.log(
    `Email provider (${mailer.provider()}) and configured sender verified.`,
  );
  if (process.argv.includes("--send-self")) {
    await mailer.sendOtp({
      to: mailer.senderEmail(),
      code: String(crypto.randomInt(100000, 1000000)),
      purpose: "delivery-test",
    });
    console.log(
      "One OTP email accepted by the mail server, sent as GST Simulator to the configured sender's inbox. No second email or SMS was sent.",
    );
  }
})().catch((error) => {
  console.error(
    `Email check failed (${error.code || error.status || "EMAIL_ERROR"}). Check provider credentials and sender verification. Credentials and OTPs have not been logged.`,
  );
  process.exitCode = 1;
});
