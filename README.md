# GST Practice Portal

An original, connected GST workflow playground for a practical Tally Prime with GST course. It gives students a familiar portal-like experience without course lessons, assignments, grading, or instructor-review screens.

Every business case has one shared data model: taxpayer profile, outward invoices, purchase invoices, ledgers, returns, e-way bills, and e-invoices. A learner can prepare GSTR-1, reconcile GSTR-2B, prepare GSTR-3B, generate a challan, and then create document references from the same invoice register.

## Stack

- **Frontend:** React 19 + Vite, deployed to Vercel.
- **Backend:** Express 5 API, deployed to Render.
- **Storage:** SQLite through `better-sqlite3` (the database is kept in `backend/data/` or the path supplied in `SQLITE_PATH`).
- **Practice model:** separate student logins, four selectable business cases, and stateful workflows. There is no LMS, assignment authoring, automatic grading, or instructor-review queue in the portal.

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

Demo logins:

| Account | Email | Password |
| --- | --- | --- |
| Sample learner | `student1@gstpracticelab.local` | `Demo@123` |

## Deploy the API to Render

1. Push this project to a Git repository.
2. In Render, create a Node **Web Service** with `backend` as the root directory, or use the root `render.yaml` Blueprint.
3. Set `FRONTEND_ORIGIN` to the final Vercel URL (for example, `https://gst-practice-lab.vercel.app`).
4. Set strong private values for `TOKEN_SECRET` and `PASSWORD_SALT`.
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

SQLite is deliberately used for this build. On Render, point `SQLITE_PATH` at a persistent disk before using the portal with real students; the default Render filesystem can be replaced on redeploy. Before live use, add account provisioning, password-reset flows, Argon2/bcrypt password hashing, rate limiting, audit logs, backups, and a privacy policy. Validate every instructional workflow against current official GST guidance before teaching it.

## Design boundary

The interface is original. It uses general public-service portal conventions—navigation, taxpayer context, ledgers, returns, and document dashboards—without copying government branding, commercial-course content, or protected interface assets.
