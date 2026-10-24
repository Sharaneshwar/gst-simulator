# Neon database setup

The app remains React/Vite on Vercel and Express on Render. Neon stores the data, not the frontend. Existing instructor/student invitation login remains unchanged; enabling managed Neon Auth is not a login migration. Template-provisioned Auth, Functions and Realtime are unused by application code.

## Server environment

Set the following privately in Render and `backend/.env`:

- `DATABASE_URL`: pooled Neon PostgreSQL URL.
- `DATABASE_URL_UNPOOLED`: direct URL to the same database, used for versioned migrations.
- `TOKEN_SECRET`, `OTP_SECRET`: stable random secrets; changing them invalidates sessions or outstanding OTPs.
- `FRONTEND_ORIGIN`: the Vercel origin.
- Existing mail settings; Gmail SMTP ports are blocked on Render Free, independently of the database migration.

No database password, OTP secret, or signing key belongs in Vercel's browser environment or Git. Root `.env.local` and backend `.env*` are ignored. The application uses a module-scoped pool with at most five connections, verified TLS for Neon URLs, idle error handling, transaction-scoped connections and advisory locks for OTP operations.

## Initial migration from SQLite

Before starting the PostgreSQL-backed server for the first time, from `backend`:

```sh
npm run db:import-sqlite
# Or provide a specific existing SQLite file:
npm run db:import-sqlite -- /absolute/path/to/existing.sqlite
```

The source is opened read-only. Import copies users, cases, saved business state, access audits and OTP delivery-rate records in one transaction. It refuses nonempty destination tables instead of overwriting accounts or saved returns. Outstanding OTP challenges are intentionally not imported; request fresh codes after cutover. Keep the original SQLite file as a recoverable copy.

Startup applies checksum-verified SQL files from `backend/migrations/` under a transaction lock, then inserts missing fixture users/cases without replacing existing passwords or business records. Workspace revisions reject conflicting concurrent saves instead of silently discarding another request's changes. New schema changes must be new numbered migration files, not edits to applied migrations.

## Verification

```sh
# Repository root
npm run build
npm test
```

Local tests use isolated SQLite fixtures and mocked email. For PostgreSQL tests, pull only an isolated, expiring test branch into ignored `backend/.env.neon-test`, then run from `backend`:

```sh
neon env pull --branch gst-migration-test-20261024 --service postgres --file backend/.env.neon-test
npm run test:neon
```

Run the env-pull command from the repository root. The test loader requires the exact isolated branch name and never substitutes production credentials. These integration fixtures create test users and filing records, so never point them at production. Use a fresh test branch for repeat runs because fixture emails are deliberately unique. The temporary migration branch is configured to expire on 25 October 2026 at 18:30 UTC.

`npm start` starts the API. `/api/health` executes a database query and reports `database: "postgres"`; it is not merely a static process-alive check. Test login, saved-state persistence after restarting the backend, registration/TRN OTP and both filing flows before cutover. Automated mail transports are mocked, not proof of production email delivery.

## One business per account

Normal startup binds each account to its current business, including instructor accounts. Alternate fixture businesses are enabled only in non-production tests with `GST_ENABLE_CASE_LIBRARY=1`. The one-time `node scripts/prune-extra-businesses.js` maintenance command preserves the bound/current business, backs up extra records to `business_cleanup_backup`, removes extras and removes unused template definitions. On the initial production cleanup it removed eight extra records, leaving two accounts with two businesses. Both saved business workspaces were retained; the original SQLite file was also left unchanged.

## Deployment boundaries

Push/redeploy is a separate step. The Render service must receive the environment variables above before deploying this backend version. Vercel retains its existing `VITE_API_BASE`; it never connects directly to PostgreSQL. Neon storage survives Render restarts and redeploys, but free-plan quotas, provider outages and backup requirements still apply.
