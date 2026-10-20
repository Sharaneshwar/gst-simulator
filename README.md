# GST Practice Lab

An original, classroom-oriented GST practice platform for a practical Tally Prime with GST course. It covers taxpayer registration, GSTR-1 online/offline practice, GSTR-2A/2B purchase reconciliation, tax payment, GSTR-3B, nil returns, excess-ITC cases, invoice amendments, e-way bills, and e-invoices.

## Stack

- **Frontend:** React 19 + Vite, deployed to Vercel.
- **Backend:** Express 5 API, deployed to Render.
- **Storage:** JSON seed store for this demo build.
- **Roles:** separate student and instructor accounts. Students save checkpoints and request manual review; instructors approve or request changes. There is no assignment-authoring workflow or automatic grading.

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

| Role | Email | Password |
| --- | --- | --- |
| Student | `student1@gstpracticelab.local` | `Demo@123` |
| Instructor | `instructor@gstpracticelab.local` | `Demo@123` |

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

This is a usable review build, not the final live-student architecture. Render’s local filesystem is ephemeral, so demo JSON data can reset on restarts or redeploys. Before live use, migrate the store to PostgreSQL and add account provisioning, password-reset flows, Argon2/bcrypt password hashing, rate limiting, audit logs, backups, and a privacy policy. Validate every instructional workflow against current official GST guidance before teaching it.

## Design boundary

The interface is original. It uses familiar learning-portal conventions—navigation, taxpayer context, form steps, ledgers, and return dashboards—without copying government branding, commercial-course content, or protected interface assets.
