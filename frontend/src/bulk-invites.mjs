export const MAX_BULK_INVITES = 100;
export function parseInvites(text, users = []) {
  const existing = new Set(users.map((user) => user.email.toLowerCase()));
  const seen = new Set();
  return text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((value, index) => {
      const email = value.toLowerCase();
      let status = "ready",
        message = "Ready to invite";
      if (
        email.length > 254 ||
        !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)
      ) {
        status = "invalid";
        message = "Invalid email address";
      } else if (seen.has(email)) {
        status = "duplicate";
        message = "Duplicate skipped";
      } else if (existing.has(email)) {
        status = "exists";
        message = "Account or invitation already exists";
      }
      seen.add(email);
      return { key: index, email, status, message };
    });
}
