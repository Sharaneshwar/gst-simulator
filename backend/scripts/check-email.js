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
  console.log("SMTP connection and authentication verified.");
  if (process.argv.includes("--send-self")) {
    await mailer.sendOtp({
      to: String(process.env.SMTP_USER || "").trim(),
      code: String(crypto.randomInt(100000, 1000000)),
      purpose: "delivery-test",
    });
    console.log(
      "One OTP email accepted by the mail server, sent as GST Simulator to the configured sender's inbox. No second email or SMS was sent.",
    );
  }
})().catch((error) => {
  console.error(
    `Email check failed (${error.code || error.status || "SMTP_ERROR"}). Check SMTP_USER / SMTP_PASS and SMTP connectivity. Credentials and OTPs have not been logged.`,
  );
  process.exitCode = 1;
});
