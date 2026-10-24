# GST Practice Portal

A GST portal practice environment for a practical Tally Prime with GST course. The interface follows the GST portal observed on 24 October 2026: masthead, navigation, homepage, login, registration forms, return tiles, section tables and payment routes. There are no lessons, assignments, grading or instructor-review screens.

Each account has independent business records. Each business has separate monthly invoices, supplier statements, GSTR-1 and GSTR-3B filings, with shared cash/credit ledgers, challans, registration applications and documents. GSTR-2A/2B are read-only statements. Challan creation, cash deposit, tax offset and filing are separate operations. Neon PostgreSQL stores accounts, invitations, OTP delivery state and saved returns independently of the backend deployment.

## Stack

- **Frontend:** React 19 + Vite, deployed to Vercel.
- **Backend:** Express 5 API, deployed to Render.
- **Storage:** Neon PostgreSQL through a shared `pg` connection pool. SQLite is available only as an explicit non-production test/development option with `SQLITE_PATH`.
- **Practice model:** one independent business per account, monthly return state and filing history. Five business fixtures remain available only to explicit non-production regression tests.
- **Reference styling:** Verdana, matching the observed live portal. The masthead emblem and industrial banner are local copies of publicly served GST portal assets; their source URLs are listed below.

## Local development

Install dependencies once from each app folder:

```bash
# Terminal 1 — API
cd /Users/sharaneshwar.p/Desktop/playground/gst-simulator/backend
npm install
npm start
```

```bash
# Terminal 2 — React frontend
cd /Users/sharaneshwar.p/Desktop/playground/gst-simulator/frontend
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). The frontend defaults to `http://localhost:5050/api`.

Configure `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, for migrations) in `backend/.env`, plus stable private `TOKEN_SECRET` and `OTP_SECRET`. The server also loads the ignored root `.env.local` produced by `neon deploy`; explicit process variables take priority, then `backend/.env`, then root `.env.local`. Database secrets must never use a `VITE_` prefix.

Run `npm test` from `backend` for isolated temporary-SQLite regression tests; these do not change teaching records. Run `npm run build` from the repository root to verify the production frontend bundle. See [Neon setup and migration](docs/neon-setup.md) for import and cloud test commands.

See [the local review guide](docs/local-review.md) for suggested browser checks and the boundaries of this review build.

## Email OTPs

On Render Free, set `MAIL_PROVIDER=brevo`, `BREVO_API_KEY` and `EMAIL_FROM` in the backend environment. Verify that sender in Brevo first. The same HTTPS transport sends OTPs and account invitations as **GST Simulator**. For local use, a present `BREVO_API_KEY` automatically selects Brevo, and the existing `SMTP_USER` can supply the sender when `EMAIL_FROM` is unset. Never put these credentials in the frontend or commit `.env` files. Brevo may rewrite free-domain senders such as Gmail to its compliant sender domain; use a verified custom domain for branded sender addresses.

Registration sends one email containing one code; learners use the same code in the Mobile OTP and Email OTP fields. No SMS is sent. TRN resume and registration/return filing also send real email verification codes. Demo login addresses remain unchanged; filing dialogs ask for an actual email address to receive the OTP.

Codes are cryptographically generated, hashed in SQLite, valid for 10 minutes, limited to five failed attempts and consumed once. Resending waits 60 seconds and invalidates the previous challenge. Sending is rate-limited per account and email address. Codes are bound to the user, business, purpose and filing details. Failed deliveries never fall back to a hard-coded OTP.

Run `node scripts/check-email.js` from `backend` to verify the provider credentials and active configured sender without sending a message. Add `--send-self` to send one delivery-test email to the configured sender's inbox. Automated tests mock SMTP and HTTPS transports and never send real messages. Provider acceptance is not a guarantee of inbox delivery.

Gmail SMTP remains available for local or SMTP-enabled hosting by setting `MAIL_PROVIDER=smtp`, `SMTP_USER` and `SMTP_PASS`. Render Free blocks SMTP ports 25, 465 and 587; Brevo uses HTTPS on port 443 instead. Brevo failures never retry through SMTP or silently fall back to hard-coded OTPs. Keep a strong `TOKEN_SECRET` and `OTP_SECRET` in the backend environment.

Demo logins:

| Account    | Email                 | Password |
| ---------- | --------------------- | -------- |
| Student    | `student@demo.com`    | `12345`  |
| Instructor | `instructor@demo.com` | `12345`  |

## Deploy the API to Render

1. Push this project to a Git repository.
2. In Render, create a Node **Web Service** with `backend` as the root directory, or use the root `render.yaml` Blueprint.
3. Set `FRONTEND_ORIGIN` to the final Vercel URL (for example, `https://gst-practice-lab.vercel.app`).
4. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and stable strong private values for `TOKEN_SECRET` and `OTP_SECRET`. Remove `SQLITE_PATH` from the deployed environment.
5. Copy the deployed API URL, for example `https://gst-practice-lab-api.onrender.com`.

## Deploy the frontend to Vercel

1. Import the repository into Vercel and set its **Root Directory** to `frontend`.
2. Add the environment variable below before deploying:

```text
VITE_API_BASE=https://gst-practice-lab-api.onrender.com/api
```

3. Vercel will run `npm run build` and publish `dist/` automatically (the project configuration is in `frontend/vercel.json`).
4. Update the Render `FRONTEND_ORIGIN` value after Vercel gives you its final URL.

## Production checklist

The backend requires Neon PostgreSQL in production and does not silently fall back to local SQLite. Keep independent database backups, private stable signing keys, a privacy policy and a recovery procedure. Invite-only access, scrypt password hashing, revocation and access audit logs remain managed by this application's existing login system. Neon Auth, Functions and Realtime were provisioned by the supplied template, but are not used by the app: the owner explicitly chose to retain the existing login and use Neon for database storage. Validate every instructional workflow against current official GST guidance before teaching it.

## Reference snapshot and coverage

Reference date: **24 October 2026**. Public pages were compared against the live GST homepage, registration and login pages. Post-login return structure uses the official user manuals. The Tally account's scenario list was inspected, but its simulator login rejected the supplied password; its internal forms were not used as verified references.

- [GST homepage](https://www.gst.gov.in/)
- [Registration guide](https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm)
- [GSTR-3B guide](https://tutorial.gst.gov.in/userguide/returns/Create_and_Submit_GSTR3B.htm)
- [Banner asset](https://static.gst.gov.in/uiassets/images/banner/banner_image_large.jpg)
- [Masthead emblem asset](https://static.gst.gov.in/uiassets/images/Emblem_of_India-white.svg)

This is a local review build, not a claim of complete parity with every GST service. The main registration/returns/payment journeys work, while specialized registrations, multi-state registration, QRMP/IFF, IMS, annual returns, refunds and notices are not implemented. Some invoice/registration fields are simplified, JSON import supports the provided invoice template and single-rate B2B utility records, attachment controls retain file metadata only, and GSTN/signing/bank responses use local dummy values. Email OTP delivery is real; SMS, Aadhaar and DSC hardware are not connected. E-way bill and e-invoice screens implement generation, viewing, printing and cancellation but are not complete replicas of the external portals. Validate these boundaries with the instructor before treating the build as a finished training reference.
