# Registration and account consistency

Invitations create **student access from one email address**. They do not collect a business name, trade name, PAN or GSTIN. Email remains the unique, immutable login identifier; invitation expiry, resending and access controls are retained. Existing accounts and their saved businesses are preserved.

New students see an empty registration workspace, without a fabricated company identity, invoices or ledger balances. Returns and document actions become available after registration submission. Registration verification and OTP delivery use the account email. Promoter, authorized signatory and principal-place email fields default to that email; those contact fields remain editable for practising different people. New records get the same defaults. Part A's state/district and mobile populate relevant later fields. Selecting Aadhaar authentication and signing uses saved authorized signatories.

Each submitted registration creates an isolated business workspace with its legal/trade names, PAN, state and a dummy GSTIN. The acknowledgement retains its ARN and pending-validation status; the business is immediately available for practice. A submission does not register a real taxpayer or obtain a real GSTIN. No new external registration service is involved.

**Track Application Status** lists the account's applications, including older drafts and submitted applications, with names, dates, TRN, ARN and status. Search is optional. Continue selects the application and fills its reference; the existing TRN OTP step remains. View opens its acknowledgement. New Registration retains the previous application's details. There is no application-count limit; attachment and per-section record limits still apply.

Business selection and each application's ownership are enforced by the API. Newly created businesses are not included in other accounts' case libraries. Each business keeps independent periods, invoices, returns, ledgers and documents. Restoring business records retains saved registration applications. Amendments target the business that was selected when the request was submitted, even if the student switches businesses before review.

Persistence uses the existing `users`, `case_definitions` and `user_case_state` records and database adapter. Application submission and business creation run in one transaction with optimistic revision checks and an account lock. No schema migration or environment variable is required for this change.

## Verification

See [release validation — 31 October 2026](release-2026-10-31.md) for the current regression, build, upload and isolated Neon results. Earlier test-branch credentials expired; they were replaced with a new schema-only test branch. Production data was preserved.
