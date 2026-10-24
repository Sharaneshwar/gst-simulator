# GST Practice Portal

A GST portal practice environment for a practical Tally Prime with GST course. The interface follows the GST portal observed on 24 October 2026: masthead, navigation, homepage, login, registration forms, return tiles, section tables and payment routes. There are no lessons, assignments, grading or instructor-review screens.

Each account has independent business records. Each business has separate monthly invoices, supplier statements, GSTR-1 and GSTR-3B filings, with shared cash/credit ledgers, challans, registration applications and documents. GSTR-2A/2B are read-only statements. Challan creation, cash deposit, tax offset and filing are separate operations. A saved return survives refresh and backend restart when the SQLite file is retained.

## Stack

- **Frontend:** React 19 + Vite, deployed to Vercel.
- **Backend:** Express 5 API, deployed to Render.
- **Storage:** SQLite through `better-sqlite3` (the database is kept in `backend/data/` or the path supplied in `SQLITE_PATH`).
- **Practice model:** two independent demo accounts, five selectable businesses (regular supplies, nil return, ITC review, inter-state dispatch and excess purchases), monthly return state and filing history.
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

Run `npm test` from `backend` for the API integration suite. Tests create their own temporary SQLite database and do not change the local teaching records. Run `npm run build` from `frontend` to verify the production bundle.

See [the local review guide](docs/local-review.md) for suggested browser checks and the boundaries of this review build.

Demo logins:

| Account    | Email                 | Password |
| ---------- | --------------------- | -------- |
| Student    | `student@demo.com`    | `12345`  |
| Instructor | `instructor@demo.com` | `12345`  |

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

## Reference snapshot and coverage

Reference date: **24 October 2026**. Public pages were compared against the live GST homepage, registration and login pages. Post-login return structure uses the official user manuals. The Tally account's scenario list was inspected, but its simulator login rejected the supplied password; its internal forms were not used as verified references.

- [GST homepage](https://www.gst.gov.in/)
- [Registration guide](https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm)
- [GSTR-3B guide](https://tutorial.gst.gov.in/userguide/returns/Create_and_Submit_GSTR3B.htm)
- [Banner asset](https://static.gst.gov.in/uiassets/images/banner/banner_image_large.jpg)
- [Masthead emblem asset](https://static.gst.gov.in/uiassets/images/Emblem_of_India-white.svg)

This is a local review build, not a claim of complete parity with every GST service. The main registration/returns/payment journeys work, while specialized registrations, multi-state registration, QRMP/IFF, IMS, annual returns, refunds and notices are not implemented. Some invoice/registration fields are simplified, JSON import supports the provided invoice template and single-rate B2B utility records, attachment controls retain file metadata only, and verification/signing/bank responses use local dummy values. E-way bill and e-invoice screens implement generation, viewing, printing and cancellation but are not complete replicas of the external portals. Validate these boundaries with the instructor before treating the build as a finished training reference.
