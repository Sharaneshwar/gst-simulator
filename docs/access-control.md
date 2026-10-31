# User access and business accounts

Instructors manage accounts from the profile menu → **User Access**. Access is enforced by the API, not only by hidden navigation.

- **Onboarded** lists retained accounts and people who have signed in, with role, first/last access (IST), and an active/inactive switch. Active accounts are listed first. The current instructor cannot deactivate themself; the last active instructor is protected.
- **Invited** lists pending, failed, expired and revoked invitations. Invitations expire after 48 hours. Resending is available after 60 seconds, generates a replacement password, and invalidates the previous invitation password. Revoking prevents first login.
- Single invitations accept a student email. **Bulk Invite** accepts up to 100 addresses with preview, progress and per-recipient results; see [bulk-invitations.md](bulk-invitations.md). The API retains instructor-role invitations for existing administrative integrations, but accepts no business identity from invitation inputs. New student accounts have no company until completing registration.
- Students can practise multiple registrations and switch between their own completed businesses. Each business retains separate return periods and saved work; other accounts' businesses are rejected by the server. Existing business records remain available.
- Students cannot rename a business through the personal-profile endpoint. My Profile → **Amend Business Name** submits a core-field amendment, without changing PAN/GSTIN. An instructor reviews it in User Access → View. This is a training approval, not a GSTN submission. Approved names survive a practice-data reset; existing workspace periods are retained.
- Instructor display names can be edited in My Profile. Role and login email cannot be changed through that form.

## Email and sessions

Invitation email uses the configured transport (Brevo HTTPS on Render, or SMTP where supported), sender name **GST Simulator**, and the first `FRONTEND_ORIGIN` for the login link. No new mailbox or live invitations are required for the automated tests. The email-OTP implementation remains separate.

New invitation passwords remain six letters, as requested, and are stored with salted scrypt hashes. Passwords are only delivered by email, not returned by account APIs. Existing accounts persist across startup. Production does not automatically create demo accounts, reset names/passwords or delete invited users.

Login tokens last 12 hours and are stored in local storage. Browser restarts preserve them until expiry or revocation; clearing site data removes them. Clearing cookies alone does not necessarily clear local storage. Deactivation invalidates all sessions immediately at the API. Reactivation requires a fresh login. An idle open page checks its session every minute. First access is set once, on successful login; last access updates at login and at most once per minute during authenticated use.

Set a strong, private, persistent `TOKEN_SECRET` (at least 32 random bytes) in the hosting environment. If omitted, a random process-local key is used rather than a public hard-coded key; sessions then end when the server restarts. Never commit SMTP credentials or secret keys. Production data is stored in Neon PostgreSQL; SQLite is an explicit isolated local/test option.

The requested public email access check intentionally reveals whether an email can access the portal. It is throttled, but is not an account-enumeration-resistant design. Generated six-letter invitation passwords retain the existing training-account behavior.

## Local verification

Run `npm test` from `backend` and `npm run build` from `frontend`. Access tests create temporary SQLite databases and mock email delivery. They cover permissions, both invitation roles, duplicate dummy GSTINs, expiry/revocation/resending, failed delivery, access/session revocation, account-owned business workspaces, core-field approval and startup persistence.

No migration deletes old practice-case data. Existing student accounts retain their previously active business. New registrations add private workspaces. See [registration-practice.md](registration-practice.md) for application history and input defaults.

## Password changes, resets and viewing

Every signed-in user can change their password from **My Profile → Change Password**, using their current password and a matching new password of 8–128 characters. The current browser receives a replacement session; other sessions must sign in again. Instructors can reset onboarded students from **User Access → View → Reset Student Password**. Resetting does not send email, reactivate disabled accounts, alter invitations or remove practice work. Pending invitations use **Resend**, which replaces the invitation password.

Instructors can reveal their own password and student passwords through **Show Password** in account details. Other instructor passwords cannot be revealed. Responses use `Cache-Control: no-store`; each successful reveal is audited. Passwords stay hidden by default and clear when the dialog closes or after 60 seconds. Public user/login/list responses never include passwords, password hashes or encrypted values.

Login verification continues to use scrypt hashes. A separate AES-256-GCM encrypted copy supports the explicitly requested instructor viewing feature. Its key is derived from the persistent server `TOKEN_SECRET`; ciphertext is authenticated against the target user ID. Keep that secret stable. Older hash-only accounts become viewable after a successful login, a profile password change or an instructor reset. No existing password is recovered or reset during deployment. A successful login also repairs an encrypted copy after a key rotation. The encrypted password is never used to authenticate a login.
