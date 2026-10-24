"use strict";

const nodemailer = require("nodemailer");
const API_ORIGIN = "https://api.brevo.com/v3";

function mailError(message, status = 503, code = "EMAIL_CONFIGURATION") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function emailAddress(value) {
  const email = String(value || "").trim();
  if (
    email.length > 254 ||
    !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)
  )
    throw mailError("Configure a valid sender or recipient email address.");
  return email;
}

function createEmailTransport(env = process.env, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const createTransport = options.createTransport || nodemailer.createTransport;
  let smtp;
  const provider = () =>
    String(env.MAIL_PROVIDER || (env.BREVO_API_KEY ? "brevo" : "smtp"))
      .trim()
      .toLowerCase();
  const senderEmail = () =>
    emailAddress(env.EMAIL_FROM || env.BREVO_SENDER_EMAIL || env.SMTP_USER);
  function smtpTransport() {
    if (!env.SMTP_USER || !env.SMTP_PASS)
      throw mailError(
        "Email delivery is not configured. Set BREVO_API_KEY and EMAIL_FROM, or SMTP credentials for local use.",
      );
    const port = Number(env.SMTP_PORT || 465);
    return (smtp ||= createTransport({
      host: env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: String(env.SMTP_USER).trim(),
        pass: String(env.SMTP_PASS).replace(/\s/g, ""),
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    }));
  }
  async function brevo(path, body) {
    const key = String(env.BREVO_API_KEY || "").trim();
    if (!key)
      throw mailError("BREVO_API_KEY is required for Brevo email delivery.");
    let response;
    try {
      response = await fetchImpl(`${API_ORIGIN}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "api-key": key,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      // Do not log provider response bodies, credentials, mail content, passwords or OTPs.
      throw mailError(
        "Unable to reach the email provider. Try again later.",
        502,
        "EMAIL_NETWORK_ERROR",
      );
    }
    if (!response.ok) {
      const status = response.status;
      throw mailError(
        status === 401 || status === 403
          ? "Brevo rejected email access. Check the API key and account approval."
          : status === 429
            ? "The email provider rate limit was reached. Try again later."
            : "The email provider rejected the request. Check sender verification and sending limits.",
        status === 429 ? 429 : status === 401 || status === 403 ? 503 : 502,
        `BREVO_HTTP_${status}`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw mailError(
        "The email provider returned an invalid response.",
        502,
        "EMAIL_INVALID_RESPONSE",
      );
    }
  }
  function requireProvider() {
    const selected = provider();
    if (!["smtp", "brevo"].includes(selected))
      throw mailError("MAIL_PROVIDER must be brevo or smtp.");
    return selected;
  }
  async function sendMail(mail) {
    const selected = requireProvider();
    const sender = senderEmail();
    const recipient = emailAddress(mail.to?.address);
    if (
      mail.cc ||
      mail.bcc ||
      mail.attachments ||
      mail.from?.address !== sender
    )
      throw mailError(
        "This transport permits one recipient and the configured sender only.",
      );
    if (selected === "smtp") return smtpTransport().sendMail(mail);
    const result = await brevo("/smtp/email", {
      sender: { name: "GST Simulator", email: sender },
      to: [{ email: recipient }],
      subject: mail.subject,
      textContent: mail.text,
      ...(mail.html ? { htmlContent: mail.html } : {}),
    });
    if (typeof result.messageId !== "string" || !result.messageId)
      throw mailError(
        "The email provider did not confirm message acceptance.",
        502,
        "EMAIL_NOT_ACCEPTED",
      );
    // No SMTP fallback or automatic retry: an ambiguous response must not duplicate an OTP email.
    return { messageId: result.messageId, accepted: [recipient], rejected: [] };
  }
  async function verify() {
    const selected = requireProvider();
    const sender = senderEmail();
    if (selected === "smtp") return smtpTransport().verify();
    const result = await brevo("/senders");
    if (
      !result.senders?.some(
        (item) =>
          item.active && item.email?.toLowerCase() === sender.toLowerCase(),
      )
    )
      throw mailError(
        "Verify the configured EMAIL_FROM sender in Brevo before sending.",
        503,
        "EMAIL_SENDER_UNVERIFIED",
      );
    return true;
  }
  return { provider, senderEmail, sendMail, verify };
}

module.exports = { createEmailTransport };
