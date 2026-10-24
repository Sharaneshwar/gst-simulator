"use strict";

const { createEmailTransport } = require("./email-transport");

const PURPOSE_NAMES = {
  "registration-start": "Registration verification",
  "registration-resume": "Resume your registration application",
  "registration-submit": "Submit your registration application",
  "gstr1-file": "File GSTR-1",
  "gstr3b-file": "File GSTR-3B",
  "delivery-test": "Email delivery verification",
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function createMailer(env = process.env, createTransport, fetchImpl) {
  const transport = createEmailTransport(env, { createTransport, fetchImpl });
  async function sendOtp({ to, code, purpose }) {
    const user = transport.senderEmail();
    const shared =
      purpose === "registration-start" || purpose === "delivery-test";
    const heading = PURPOSE_NAMES[purpose] || "Email verification";
    const instructions = shared
      ? "Enter this same OTP in both the Mobile OTP and Email OTP fields. You receive just this one email; no SMS is sent."
      : "Enter this OTP in the verification field to continue.";
    const result = await transport.sendMail({
      from: { name: "GST Simulator", address: user },
      to: { address: to },
      subject: `GST Simulator — ${heading} OTP`,
      text: `GST Simulator\n\n${heading}\n\nYour OTP is: ${code}\n\n${instructions}\n\nThis code expires in 10 minutes and can be used only once. Do not share it. If you did not request this code, ignore this email.\n\nFor educational purposes only.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;border:1px solid #d5dce6"><div style="background:#152250;color:#fff;padding:22px 28px;font-size:24px">GST Simulator</div><div style="padding:28px;color:#263247"><h2 style="font-size:19px;margin-top:0">${escapeHtml(heading)}</h2><p>Your verification OTP is:</p><div style="font-size:32px;letter-spacing:8px;background:#edf2f8;padding:20px;text-align:center;font-weight:bold">${escapeHtml(code)}</div><p style="line-height:1.7">${escapeHtml(instructions)}</p><p style="line-height:1.7">Valid for <b>10 minutes</b> and one use only. Do not share this code.</p><p style="font-size:12px;color:#6c7480">If you did not request this code, ignore this email.</p></div><div style="border-top:1px solid #e3e7ed;padding:16px 28px;color:#737b86;font-size:11px">For educational purposes only.</div></div>`,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("The email server did not accept the message.");
    return { messageId: result.messageId };
  }
  return {
    sendOtp,
    verify: transport.verify,
    provider: transport.provider,
    senderEmail: transport.senderEmail,
  };
}

module.exports = { createMailer };
