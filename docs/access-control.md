# User access and business accounts

Instructors manage accounts from the profile menu → **User Access**. Access is enforced by the API, not only by hidden navigation.

- **Onboarded** lists retained accounts and people who have signed in, with role, first/last access (IST), and an active/inactive switch. Active accounts are listed first. The current instructor cannot deactivate themself; the last active instructor is protected.
- **Invited** lists pending, failed, expired and revoked invitations. Invitations expire after 48 hours. Resending is available after 60 seconds, generates a replacement password, and invalidates the previous invitation password. Revoking prevents first login.
- Invite either **Student** or **Instructor**. Email is the unique login identifier. Student invitations collect legal business name, optional trade name, and optional dummy GSTIN. A repeated dummy GSTIN is allowed; accounts still own separate SQLite records.
- A student has one fixed business, with the existing supported returns, periods, invoices, ledgers and documents under that business. Switching to another business is rejected by the server. Instructors retain their separate practice businesses.
- Students cannot rename a business through the personal-profile endpoint. My Profile → **Amend Business Name** submits a core-field amendment, without changing PAN/GSTIN. An instructor reviews it in User Access → View. This is a training approval, not a GSTN submission. Approved names survive a practice-data reset; existing workspace periods are retained.
- Instructor display names can be edited in My Profile. Role and login email cannot be changed through that form.

## Email and sessions

Invitation email uses the existing `SMTP_USER` / `SMTP_PASS` configuration, optional `SMTP_HOST` / `SMTP_PORT`, sender name **GST Simulator**, and the first `FRONTEND_ORIGIN` for the login link. No new mailbox or live invitations are required for the automated tests. The email-OTP implementation remains separate.

New invitation passwords remain six letters, as requested, and are stored with salted scrypt hashes. Passwords are only delivered by email, not returned by account APIs. Existing demo accounts are retained, but their credentials are no longer advertised or prefilled on public screens. Startup no longer resets names/passwords or deletes non-demo users.

Deactivation invalidates all sessions immediately at the API. Reactivation requires a fresh login. An idle open page checks its session every minute. First access is set once, on successful login; last access updates at login and at most once per minute during authenticated use.

Set a strong, private, persistent `TOKEN_SECRET` (at least 32 random bytes) in the hosting environment. If omitted, a random process-local key is used rather than a public hard-coded key; sessions then end when the server restarts. Never commit SMTP credentials or secret keys. Keep the SQLite database on a persistent disk in deployment.

The requested public email access check intentionally reveals whether an email can access the portal. It is throttled, but is not an account-enumeration-resistant design. Six-letter passwords and retained demo credentials are also deliberate demo-stage compromises, not a claim of production-grade authentication.

## Local verification

Run `npm test` from `backend` and `npm run build` from `frontend`. Access tests create temporary SQLite databases and mock email delivery. They cover permissions, both invitation roles, duplicate dummy GSTINs, expiry/revocation/resending, failed delivery, access/session revocation, fixed student businesses, core-field approval and startup persistence.

No migration deletes old practice-case data. Existing student accounts bind to their previously active business; any other prior business states remain in SQLite but are no longer selectable by that student.
