# Local workflow review

Use isolated test data when exercising filing, payment, registration and invitation flows. Production uses Neon PostgreSQL; deployments do not replace a local SQLite database.

For a disposable local backend, explicitly set `NODE_ENV=development`, `SQLITE_PATH` to a temporary path, `GST_SEED_DEMO_USERS=1` and `GST_ENABLE_CASE_LIBRARY=1`. Mock email delivery for automated/browser fixtures. Never reset real student accounts to run tests. The two local demo logins are `student@demo.com` and `instructor@demo.com`, both with `12345`; these are not production accounts.

Run `npm test`, `npm run test:frontend` and `npm run build` from the project root. SQLite's native module must match the installed Node version; rebuild the dependency if Node was upgraded.

Start the backend and frontend using the commands in the README. Override `VITE_API_BASE` when the isolated API uses a different port. Preview/import real accounting workbooks only in the isolated environment. Identity proof controls use contextual sample metadata and do not open a real file picker.

For the current flow-by-flow checklist, reference manuals, changed behaviour and test limitations, see [12 November workflow audit](workflow-audit-2026-11-12.md). The dated earlier coverage reports are historical evidence, not the current deployment checklist.
