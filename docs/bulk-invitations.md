# Bulk student invitations and loading states

In **User Access → Bulk Invite**, paste up to 100 email addresses separated by newlines, commas, semicolons or whitespace. Review the list before sending. Addresses are normalized; invalid, duplicate and existing accounts are shown and skipped. Each new student receives their own password and the existing 48-hour first-login invitation. Business registration remains the student's own task.

The UI sends batches of five to `POST /api/instructor/users/invite-bulk` and displays progress and per-address results. Only instructors can call it; bulk invitations cannot create instructors. The backend reserves invitation attempts against a shared single/bulk/resend limit of 100 per instructor/IP per hour, bounds concurrent sends to three per batch, and uses the database's unique email constraint to prevent duplicate accounts and duplicate sends from concurrent requests. The limiter is process-local, like the existing sign-in limiter.

The account, blank-registration requirement and audit entry are created atomically before sending. Delivery failures remain saved as failed invitations and cannot sign in until a successful resend. Existing accounts are never automatically resent, re-enabled or changed by bulk submission. Responses never return passwords or password hashes. Provider acceptance is shown separately from actual inbox delivery.

**Stop after current batch** stops future batches; an in-flight batch can finish. If the network interrupts a request, the UI marks it unconfirmed and asks the instructor to check the invitation list before retrying. Refreshing or closing the browser does not undo messages already accepted by the provider. This is a client-orchestrated batch operation, not a background mailing queue.

Loading feedback includes the initial portal skeleton, account placeholder, user-table and HSN-directory skeletons, HSN/account-check spinners, asynchronous action-button spinners and a shared request progress indicator. Existing button labels stay readable. Indicators have accessible status/busy labels and respect reduced-motion settings. Background session checks do not trigger the progress strip.

## Session lifetime

Account sign-in tokens expire after 12 hours and are stored in local storage. Closing and reopening the browser retains the token until expiration or revocation. Clearing site data removes it; clearing cookies alone does not necessarily clear local storage. The separate browser network-approval cookie lasts 90 days. This change does not extend either lifetime.

## Validation

- 97 local tests pass with email transports mocked.
- All 14 access-control tests pass on the isolated Neon PostgreSQL test branch; the disposable schema was removed.
- Browser check: three valid mock recipients, one duplicate, one invalid address and one existing account produce exactly three mock invitations with distinct passwords.
- Slow-response checks verify portal and account-table skeletons and invitation progress. Bulk input and results are checked at desktop and 390px mobile width.
- Production email is not used as a test fixture.
