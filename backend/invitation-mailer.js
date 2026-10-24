"use strict";

const { createEmailTransport } = require("./email-transport");
function createInvitationMailer(env = process.env, createTransport, fetchImpl) {
  const transporter = createEmailTransport(env, { createTransport, fetchImpl });
  return async ({ to, name, role, password, expiresAt, inviter }) => {
    const frontend = String(env.FRONTEND_ORIGIN || "http://localhost:4173")
      .split(",")[0]
      .trim();
    const loginUrl = new URL("/#/login", frontend).href;
    const result = await transporter.sendMail({
      from: { name: "GST Simulator", address: transporter.senderEmail() },
      to: { address: to },
      subject: "GST Simulator — Your invitation",
      text: `Hello ${name},\n\n${inviter} has invited you to GST Simulator as an ${role === "instructor" ? "Instructor" : "Student"}.\n\nSign in: ${loginUrl}\nEmail: ${to}\nYour case-sensitive six-letter password: ${password}\n\nSign in for the first time before ${new Date(expiresAt).toUTCString()} to activate your account. This invitation expires in 48 hours. After your first sign-in, use this password for subsequent access. Do not share your credentials.\n\nIf you did not expect this invitation, contact your instructor.\n\nFor educational purposes only.`,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error("Invitation delivery was not accepted.");
  };
}
module.exports = { createInvitationMailer };
