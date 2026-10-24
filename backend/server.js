"use strict";

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { mountPortal, viewState } = require("./portal-engine");

const PORT = Number(process.env.PORT || 5050);
const TOKEN_SECRET =
  process.env.TOKEN_SECRET || "replace-this-demo-secret-before-production";
const PASSWORD_SALT =
  process.env.PASSWORD_SALT || "gst-practice-portal-demo-salt";
const DATA_DIR = path.join(__dirname, "data");
const DATABASE_PATH =
  process.env.SQLITE_PATH || path.join(DATA_DIR, "gst-playground.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
const app = express();
app.use(express.json({ limit: "1mb" }));

const CASES = [
  {
    slug: "regular-october",
    title: "Regular taxpayer · October",
    description:
      "A trading business with local and inter-state outward supplies.",
    period: "October 2026",
    sector: "Wholesale trading",
    taxpayer: {
      legalName: "Blue Harbor Supplies",
      tradeName: "Blue Harbor Supplies",
      gstin: "29AAFCB0000A1Z4",
      pan: "AAFCB0000A",
      state: "Karnataka",
      status: "Active",
      filingFrequency: "Monthly",
    },
    salesInvoices: [
      {
        number: "BHS/1021",
        date: "2026-10-14",
        recipient: "Aster Retail Pvt Ltd",
        gstin: "29AABCL1234A1Z9",
        supply: "B2B",
        place: "Karnataka",
        taxable: 18750,
        tax: 3375,
        rate: 18,
      },
      {
        number: "BHS/1022",
        date: "2026-10-18",
        recipient: "Walk-in recipients",
        gstin: "",
        supply: "B2C",
        place: "Karnataka",
        taxable: 9400,
        tax: 1692,
        rate: 18,
      },
      {
        number: "BHS/1023",
        date: "2026-10-23",
        recipient: "Lotus Traders",
        gstin: "33AACCL9032R1Z8",
        supply: "B2B",
        place: "Tamil Nadu",
        taxable: 14200,
        tax: 2556,
        rate: 18,
      },
    ],
    purchaseInvoices: [
      {
        number: "UPK-187",
        supplier: "Uday Paper Works",
        gstin: "29AAACU1100A1ZQ",
        taxable: 8900,
        tax: 1068,
        match: "Matched",
      },
      {
        number: "KMD-042",
        supplier: "Kaveri Metals",
        gstin: "29AACCK2011T1ZX",
        taxable: 12500,
        tax: 2250,
        match: "Matched",
      },
      {
        number: "FRT-711",
        supplier: "Swift Freight Co.",
        gstin: "29ABNFS8729E1ZF",
        taxable: 3600,
        tax: 648,
        match: "Action required",
      },
    ],
    ledgers: { cash: 5000, credit: 3966 },
  },
  {
    slug: "nil-october",
    title: "Nil return · October",
    description:
      "A registered business with no reportable activity for the period.",
    period: "October 2026",
    sector: "Professional services",
    taxpayer: {
      legalName: "North Star Advisory",
      tradeName: "North Star Advisory",
      gstin: "29AAGCN4421J1Z0",
      pan: "AAGCN4421J",
      state: "Karnataka",
      status: "Active",
      filingFrequency: "Monthly",
    },
    salesInvoices: [],
    purchaseInvoices: [],
    ledgers: { cash: 0, credit: 0 },
  },
  {
    slug: "itc-review-november",
    title: "ITC review · November",
    description:
      "A purchase-heavy month with one supplier document to investigate.",
    period: "November 2026",
    sector: "Manufacturing",
    taxpayer: {
      legalName: "Cedar Works India",
      tradeName: "Cedar Works",
      gstin: "27AACCC8147N1ZW",
      pan: "AACCC8147N",
      state: "Maharashtra",
      status: "Active",
      filingFrequency: "Monthly",
    },
    salesInvoices: [
      {
        number: "CWI/284",
        date: "2026-11-10",
        recipient: "Modern Home Stores",
        gstin: "27AAFCM2209P1ZP",
        supply: "B2B",
        place: "Maharashtra",
        taxable: 24800,
        tax: 4464,
        rate: 18,
      },
      {
        number: "CWI/285",
        date: "2026-11-21",
        recipient: "Rana Enterprises",
        gstin: "24AADFR1167M1ZJ",
        supply: "B2B",
        place: "Gujarat",
        taxable: 10600,
        tax: 1908,
        rate: 18,
      },
    ],
    purchaseInvoices: [
      {
        number: "RAW-118",
        supplier: "Sona Raw Materials",
        gstin: "27AAKFS9021E1Z4",
        taxable: 16800,
        tax: 3024,
        match: "Matched",
      },
      {
        number: "PKG-031",
        supplier: "Paper Pack Solutions",
        gstin: "27AAIFP0028H1Z5",
        taxable: 9200,
        tax: 1656,
        match: "Matched",
      },
      {
        number: "MCH-209",
        supplier: "MachPro Tools",
        gstin: "27AAHCM1001A1ZZ",
        taxable: 14750,
        tax: 2655,
        match: "Action required",
      },
    ],
    ledgers: { cash: 3000, credit: 4680 },
  },
  {
    slug: "interstate-dispatch",
    title: "Inter-state dispatch",
    description:
      "An invoice-led dispatch flow for e-way bill and e-invoice practice.",
    period: "December 2026",
    sector: "Distribution",
    taxpayer: {
      legalName: "Riverbend Distributors",
      tradeName: "Riverbend",
      gstin: "33AAFCR1912B1ZX",
      pan: "AAFCR1912B",
      state: "Tamil Nadu",
      status: "Active",
      filingFrequency: "Monthly",
    },
    salesInvoices: [
      {
        number: "RBD/638",
        date: "2026-12-03",
        recipient: "Deccan Retail LLP",
        gstin: "36AAGFD8450H1ZQ",
        supply: "B2B",
        place: "Telangana",
        taxable: 42500,
        tax: 7650,
        rate: 18,
      },
      {
        number: "RBD/639",
        date: "2026-12-08",
        recipient: "Portside Stores",
        gstin: "32AAECP1009F1ZW",
        supply: "B2B",
        place: "Kerala",
        taxable: 16200,
        tax: 2916,
        rate: 18,
      },
    ],
    purchaseInvoices: [
      {
        number: "LOG-044",
        supplier: "SouthLine Logistics",
        gstin: "33AAKFS8883B1ZH",
        taxable: 6800,
        tax: 1224,
        match: "Matched",
      },
      {
        number: "STK-726",
        supplier: "Stockwell India",
        gstin: "33AAVFS0601L1ZE",
        taxable: 15400,
        tax: 2772,
        match: "Matched",
      },
    ],
    ledgers: { cash: 9200, credit: 3996 },
  },
];

const TAXPAYERS = [
  {
    legalName: "Aster Retail Pvt Ltd",
    gstin: "29AABCL1234A1Z9",
    state: "Karnataka",
    status: "Active",
  },
  {
    legalName: "Lotus Traders",
    gstin: "33AACCL9032R1Z8",
    state: "Tamil Nadu",
    status: "Active",
  },
  {
    legalName: "Modern Home Stores",
    gstin: "27AAFCM2209P1ZP",
    state: "Maharashtra",
    status: "Active",
  },
  {
    legalName: "Deccan Retail LLP",
    gstin: "36AAGFD8450H1ZQ",
    state: "Telangana",
    status: "Active",
  },
  {
    legalName: "Portside Stores",
    gstin: "32AAECP1009F1ZW",
    state: "Kerala",
    status: "Active",
  },
];

CASES.push({
  ...CASES[2],
  slug: "excess-purchase-october",
  title: "Excess purchases · October",
  description:
    "Input tax credit exceeds outward liability; unused credit carries forward.",
  period: "October 2026",
  salesInvoices: [
    {
      number: "CWI/LOW-01",
      date: "2026-10-10",
      recipient: "Modern Home Stores",
      gstin: "27AAFCM2209P1ZP",
      supply: "B2B",
      place: "Maharashtra",
      taxable: 1000,
      tax: 180,
      rate: 18,
    },
  ],
});

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(`${password}:${PASSWORD_SALT}`)
    .digest("hex");
}
function id() {
  return crypto.randomUUID();
}
function now() {
  return new Date().toISOString();
}
function numeric(value) {
  return Math.max(0, Number(value) || 0);
}
function parse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function sum(items, field) {
  return items.reduce((total, item) => total + numeric(item[field]), 0);
}

function setupDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS case_definitions (slug TEXT PRIMARY KEY, position INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, period TEXT NOT NULL, sector TEXT NOT NULL, seed_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_case_state (user_id TEXT NOT NULL, case_slug TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, case_slug), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (case_slug) REFERENCES case_definitions(slug));`);
  const addCase = db.prepare(
    "INSERT INTO case_definitions (slug, position, title, description, period, sector, seed_json) VALUES (@slug, @position, @title, @description, @period, @sector, @seed_json) ON CONFLICT(slug) DO UPDATE SET position=excluded.position, title=excluded.title, description=excluded.description, period=excluded.period, sector=excluded.sector, seed_json=excluded.seed_json",
  );
  CASES.forEach((entry, position) =>
    addCase.run({ ...entry, position, seed_json: JSON.stringify(entry) }),
  );
  db.prepare(
    "DELETE FROM user_case_state WHERE user_id NOT IN ('user-student-demo', 'user-instructor-demo')",
  ).run();
  db.prepare(
    "DELETE FROM users WHERE id NOT IN ('user-student-demo', 'user-instructor-demo')",
  ).run();
  const addUser = db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (@id, @name, @email, @password_hash, @role, @created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, password_hash=excluded.password_hash, role=excluded.role",
  );
  [
    {
      id: "user-student-demo",
      name: "Student",
      email: "student@demo.com",
      role: "student",
    },
    {
      id: "user-instructor-demo",
      name: "Instructor",
      email: "instructor@demo.com",
      role: "instructor",
    },
  ].forEach((user) =>
    addUser.run({
      ...user,
      password_hash: hashPassword("12345"),
      created_at: now(),
    }),
  );
}

function seedState(definition) {
  return {
    taxpayer: definition.taxpayer,
    salesInvoices: definition.salesInvoices,
    purchaseInvoices: definition.purchaseInvoices,
    ledgers: definition.ledgers,
    returns: { gstr1: null, gstr2b: null, gstr3b: null, payment: null },
    ewayBills: [],
    eInvoices: [],
    activities: [
      {
        id: id(),
        label: "Business case opened",
        detail: `${definition.title} is ready to explore.`,
        at: now(),
      },
    ],
  };
}
function ensureStates(userId) {
  const cases = db
    .prepare("SELECT * FROM case_definitions ORDER BY position")
    .all();
  const existing = new Set(
    db
      .prepare("SELECT case_slug FROM user_case_state WHERE user_id = ?")
      .all(userId)
      .map((row) => row.case_slug),
  );
  const insert = db.prepare(
    "INSERT INTO user_case_state (user_id, case_slug, is_active, state_json, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  cases.forEach((item, index) => {
    if (!existing.has(item.slug))
      insert.run(
        userId,
        item.slug,
        index === 0 ? 1 : 0,
        JSON.stringify(seedState(parse(item.seed_json))),
        now(),
      );
  });
  if (
    !db
      .prepare(
        "SELECT case_slug FROM user_case_state WHERE user_id = ? AND is_active = 1",
      )
      .get(userId) &&
    cases[0]
  )
    db.prepare(
      "UPDATE user_case_state SET is_active = 1 WHERE user_id = ? AND case_slug = ?",
    ).run(userId, cases[0].slug);
}
function caseRows(userId) {
  ensureStates(userId);
  return db
    .prepare(
      "SELECT d.slug, d.title, d.description, d.period, d.sector, s.is_active, s.state_json, s.updated_at FROM case_definitions d JOIN user_case_state s ON s.case_slug = d.slug WHERE s.user_id = ? ORDER BY d.position",
    )
    .all(userId);
}
function hydrateRow(row) {
  return {
    ...row,
    is_active: Boolean(row.is_active),
    state: viewState(parse(row.state_json), row.period),
  };
}
function getActiveCase(userId) {
  const row = caseRows(userId).find((item) => item.is_active);
  return row ? hydrateRow(row) : null;
}
function saveState(userId, slug, state) {
  db.prepare(
    "UPDATE user_case_state SET state_json = ?, updated_at = ? WHERE user_id = ? AND case_slug = ?",
  ).run(JSON.stringify(state), now(), userId, slug);
}
function log(state, label, detail) {
  state.activities.unshift({ id: id(), label, detail, at: now() });
  state.activities = state.activities.slice(0, 8);
}
function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
function sign(payload) {
  const body = encode(payload);
  const signature = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(body)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
function allowedOrigin(origin) {
  const configured = (process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.length
    ? origin && configured.includes(origin)
      ? origin
      : configured[0]
    : "*";
}
function requireAuth(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verify(token);
  const user =
    payload &&
    db.prepare("SELECT * FROM users WHERE id = ?").get(payload.userId);
  if (!user) {
    res.status(401).json({ message: "Please sign in again." });
    return null;
  }
  return user;
}
function activeFor(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  const active = getActiveCase(user.id);
  if (!active) {
    res.status(404).json({ message: "No business case is available." });
    return null;
  }
  return { user, active };
}
function publicCase(row) {
  const { state, state_json, ...metadata } = row;
  return {
    ...metadata,
    summary: {
      invoices: state.salesInvoices.length,
      purchaseInvoices: state.purchaseInvoices.length,
      gstr1: state.returns.gstr1?.status || "Not started",
      gstr3b: state.returns.gstr3b?.status || "Not started",
    },
  };
}

setupDatabase();
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    allowedOrigin(req.headers.origin),
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    service: "gst-practice-portal-api",
    database: "sqlite",
    time: now(),
  }),
);
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || user.password_hash !== hashPassword(password))
    return res
      .status(401)
      .json({ message: "The email or password is incorrect." });
  ensureStates(user.id);
  const token = sign({
    userId: user.id,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  });
  res.json({ token, user: safeUser(user) });
});
app.get("/api/auth/me", (req, res) => {
  const user = requireAuth(req, res);
  if (user) res.json({ user: safeUser(user) });
});
app.get("/api/portal", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const rows = caseRows(user.id).map(hydrateRow);
  const active = rows.find((item) => item.is_active);
  res.json({
    user: safeUser(user),
    activeCase: active && { ...publicCase(active), state: active.state },
    cases: rows.map(publicCase),
  });
});
mountPortal(app, { activeFor, saveState, requireAuth, getActiveCase });
app.post("/api/portal/cases/:slug/activate", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const target = db
    .prepare("SELECT slug FROM case_definitions WHERE slug = ?")
    .get(req.params.slug);
  if (!target)
    return res.status(404).json({ message: "Business case not found." });
  ensureStates(user.id);
  const transaction = db.transaction(() => {
    db.prepare(
      "UPDATE user_case_state SET is_active = 0 WHERE user_id = ?",
    ).run(user.id);
    db.prepare(
      "UPDATE user_case_state SET is_active = 1, updated_at = ? WHERE user_id = ? AND case_slug = ?",
    ).run(now(), user.id, target.slug);
  });
  transaction();
  res.json({ ok: true, activeCase: getActiveCase(user.id).slug });
});
// Stateful workspace routes replace the old one-click prepare/payment endpoints.
app.get("/api/portal/taxpayers", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const query = String(req.query.query || "")
    .trim()
    .toLowerCase();
  const taxpayers = query
    ? TAXPAYERS.filter((item) =>
        `${item.legalName} ${item.gstin}`.toLowerCase().includes(query),
      ).slice(0, 8)
    : [];
  res.json({ taxpayers });
});
app.post("/api/portal/reset", (req, res) => {
  const context = activeFor(req, res);
  if (!context) return;
  const { user, active } = context;
  const definition = db
    .prepare("SELECT seed_json FROM case_definitions WHERE slug = ?")
    .get(active.slug);
  const state = seedState(parse(definition.seed_json));
  log(
    state,
    "Business case reset",
    "The original practice data has been restored.",
  );
  saveState(user.id, active.slug, state);
  res.json({ state });
});
app.use((error, req, res, next) => {
  console.error(error);
  res
    .status(error.status || 500)
    .json({ message: error.message || "An unexpected error occurred." });
});
if (require.main === module)
  app.listen(PORT, () =>
    console.log(
      `GST Practice Portal API listening on http://localhost:${PORT} using SQLite`,
    ),
  );
module.exports = { app, db };
