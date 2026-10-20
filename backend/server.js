"use strict";

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 5050);
const TOKEN_SECRET = process.env.TOKEN_SECRET || "replace-this-demo-secret-before-production";
const PASSWORD_SALT = process.env.PASSWORD_SALT || "gst-practice-lab-demo-salt";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const app = express();

app.use(express.json({ limit: "1mb" }));

function hashPassword(password) {
  return crypto.createHash("sha256").update(`${password}:${PASSWORD_SALT}`).digest("hex");
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function scenario(idValue, title, group, kind, difficulty, duration, description, steps, extra = {}) {
  return { id: idValue, title, group, kind, kindLabel: extra.kindLabel || kind.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), difficulty, duration, description, steps, instruction: extra.instruction, period: extra.period };
}

function seedScenarios() {
  const core = "Core return practice";
  return [
    scenario("registration-basic", "Register a regular taxpayer", core, "registration", "Foundation", 25, "Create the taxpayer profile and complete the verification step.", ["Applicant profile", "Business details", "Verification", "Review record"], { kindLabel: "Registration workflow", instruction: "Use the Blue Harbor Supplies profile and review the business details before continuing." }),
    scenario("gstr1-oct-online", "GSTR-1 online · October", core, "gstr1", "Foundation", 30, "Classify October outward supplies in the online return flow.", ["Review sales register", "Classify supplies", "Check return summary", "Save for review"], { kindLabel: "Outward supplies return", period: "October 2026" }),
    scenario("gstr1-oct-offline", "GSTR-1 offline · October", core, "offline", "Foundation", 25, "Complete the offline import workflow using a JSON file.", ["Prepare JSON", "Validate file", "Review import summary", "Save for review"], { kindLabel: "Offline return utility", period: "October 2026" }),
    scenario("gstr2b-oct", "View GSTR-2A / 2B · October", core, "gstr2b", "Intermediate", 28, "Reconcile purchase documents before considering input tax credit.", ["Review purchase register", "Match supplier documents", "Identify exceptions", "Save for review"], { kindLabel: "Purchase reconciliation", period: "October 2026" }),
    scenario("payment-oct", "Pay tax · October", core, "payment", "Intermediate", 20, "Use the cash and credit ledger to plan the tax payment.", ["Review liability", "Offset eligible credit", "Create challan", "Save for review"], { kindLabel: "Tax payment workflow", period: "October 2026" }),
    scenario("gstr1-nov-online", "GSTR-1 online · November", core, "gstr1", "Foundation", 30, "Report the November outward-supply period and compare classifications.", ["Review sales register", "Classify supplies", "Check return summary", "Save for review"], { kindLabel: "Outward supplies return", period: "November 2026" }),
    scenario("gstr1-nov-offline", "GSTR-1 offline · November", core, "offline", "Foundation", 25, "Use a new file for the offline import checkpoint.", ["Prepare JSON", "Validate file", "Review import summary", "Save for review"], { kindLabel: "Offline return utility", period: "November 2026" }),
    scenario("gstr2b-nov", "View GSTR-2A / 2B · November", core, "gstr2b", "Intermediate", 28, "Review supplier-side information for the November period.", ["Review purchase register", "Match supplier documents", "Identify exceptions", "Save for review"], { kindLabel: "Purchase reconciliation", period: "November 2026" }),
    scenario("payment-nov", "Pay tax · November", core, "payment", "Intermediate", 20, "Review cash-versus-credit treatment for the November period.", ["Review liability", "Offset eligible credit", "Create challan", "Save for review"], { kindLabel: "Tax payment workflow", period: "November 2026" }),
    scenario("gstr1-dec-online", "GSTR-1 online · December", core, "gstr1", "Intermediate", 30, "Complete a December outward-supply practice run.", ["Review sales register", "Classify supplies", "Check return summary", "Save for review"], { kindLabel: "Outward supplies return", period: "December 2026" }),
    scenario("gstr1-dec-offline", "GSTR-1 offline · December", core, "offline", "Intermediate", 25, "Complete the December offline utility route.", ["Prepare JSON", "Validate file", "Review import summary", "Save for review"], { kindLabel: "Offline return utility", period: "December 2026" }),
    scenario("gstr2b-dec", "View GSTR-2A / 2B · December", core, "gstr2b", "Intermediate", 28, "Review December input-credit evidence before a summary return.", ["Review purchase register", "Match supplier documents", "Identify exceptions", "Save for review"], { kindLabel: "Purchase reconciliation", period: "December 2026" }),
    scenario("gstr3b-dec-online", "GSTR-3B online · December", core, "gstr3b", "Intermediate", 35, "Bring outward supplies and eligible ITC into the summary return.", ["Review outward supplies", "Review input credit", "Check tax liability", "Save for review"], { kindLabel: "Summary return workflow", period: "December 2026" }),
    scenario("gstr3b-dec-offline", "GSTR-3B offline · December", core, "offline", "Intermediate", 25, "Complete the offline preparation route for the summary return.", ["Prepare JSON", "Validate file", "Review import summary", "Save for review"], { kindLabel: "Offline return utility", period: "December 2026" }),
    scenario("nil-registration", "Nil-return taxpayer setup", "Nil return", "registration", "Foundation", 18, "Set up a taxpayer with no activity for the return period.", ["Applicant profile", "Business details", "Verification", "Review record"], { kindLabel: "Registration workflow", period: "October 2026" }),
    scenario("nil-gstr1", "Nil return · October", "Nil return", "nil", "Foundation", 18, "Declare a no-activity period and explain the verification checks.", ["Confirm no activity", "Select reason", "Add declaration", "Save for review"], { kindLabel: "Nil-return workflow", period: "October 2026" }),
    scenario("excess-registration", "Excess-ITC taxpayer setup", "Excess ITC", "registration", "Foundation", 18, "Set up the taxpayer context for a credit-heavy purchase period.", ["Applicant profile", "Business details", "Verification", "Review record"], { kindLabel: "Registration workflow", period: "November 2026" }),
    scenario("excess-additional-documents", "Review additional documents", "Excess ITC", "documents", "Intermediate", 20, "Inspect supporting documents before treating the purchase credit as eligible.", ["Check document register", "Confirm business purpose", "Flag missing evidence", "Save for review"], { kindLabel: "Supporting-document review", period: "November 2026" }),
    scenario("excess-gstr1-online", "Excess ITC · outward supplies", "Excess ITC", "gstr1", "Intermediate", 26, "Record outward supplies alongside a higher purchase-credit position.", ["Review sales register", "Classify supplies", "Check return summary", "Save for review"], { kindLabel: "Outward supplies return", period: "November 2026" }),
    scenario("excess-gstr1-offline", "Excess ITC · offline import", "Excess ITC", "offline", "Intermediate", 23, "Complete file validation for the excess-credit case.", ["Prepare JSON", "Validate file", "Review import summary", "Save for review"], { kindLabel: "Offline return utility", period: "November 2026" }),
    scenario("excess-gstr2b", "Excess ITC · reconcile purchases", "Excess ITC", "gstr2b", "Advanced", 32, "Identify input documents that need investigation before credit is considered.", ["Review purchase register", "Match supplier documents", "Identify exceptions", "Save for review"], { kindLabel: "Purchase reconciliation", period: "November 2026" }),
    scenario("amend-invoice", "Amend a reported invoice", "Invoice amendment", "amendment", "Intermediate", 22, "Correct an invoice after checking the original document and reason.", ["Find original document", "Choose amendment reason", "Enter corrected values", "Save for review"], { kindLabel: "Invoice amendment", period: "December 2026" }),
    scenario("eway-registration", "E-way bill taxpayer setup", "E-way bill", "registration", "Foundation", 15, "Prepare the taxpayer record before creating movement data.", ["Applicant profile", "Business details", "Verification", "Review record"], { kindLabel: "Registration workflow", period: "October 2026" }),
    scenario("eway-online", "Create an e-way bill", "E-way bill", "eway", "Intermediate", 25, "Complete movement, vehicle and goods checks.", ["Enter document details", "Add movement data", "Review goods", "Save for review"], { kindLabel: "E-way bill workflow", period: "October 2026" }),
    scenario("eway-offline", "E-way bill · offline preparation", "E-way bill", "offline", "Intermediate", 20, "Complete file validation for the e-way bill dataset.", ["Prepare JSON", "Validate file", "Review import summary", "Save for review"], { kindLabel: "Offline utility workflow", period: "October 2026" }),
    scenario("eway-cancel", "Cancel an e-way bill", "E-way bill", "eway-cancel", "Foundation", 15, "Complete the checks and explanation required before cancelling a movement document.", ["Locate reference", "Select reason", "Add explanation", "Save for review"], { kindLabel: "E-way bill cancellation", period: "October 2026" }),
    scenario("einvoice-registration", "E-invoice taxpayer setup", "E-invoice", "registration", "Foundation", 15, "Prepare the business context before generating an invoice record.", ["Applicant profile", "Business details", "Verification", "Review record"], { kindLabel: "Registration workflow", period: "October 2026" }),
    scenario("einvoice-offline", "Create an e-invoice", "E-invoice", "einvoice", "Intermediate", 24, "Complete invoice header and item-level validation in the e-invoice workflow.", ["Enter invoice header", "Add recipient", "Check item value", "Save for review"], { kindLabel: "E-invoice workflow", period: "October 2026" }),
    scenario("einvoice-cancel", "Cancel an e-invoice", "E-invoice", "einvoice-cancel", "Foundation", 15, "Record the cancellation rationale for an invoice reference.", ["Locate reference", "Select reason", "Add explanation", "Save for review"], { kindLabel: "E-invoice cancellation", period: "October 2026" })
  ];
}

function seedStore() {
  return {
    users: [
      { id: "user-instructor", name: "Aarav Instructor", email: "instructor@gstpracticelab.local", passwordHash: hashPassword("Demo@123"), role: "instructor" },
      { id: "user-student-1", name: "Priya Student", email: "student1@gstpracticelab.local", passwordHash: hashPassword("Demo@123"), role: "student" },
      { id: "user-student-2", name: "Kiran Learner", email: "student2@gstpracticelab.local", passwordHash: hashPassword("Demo@123"), role: "student" }
    ],
    scenarios: seedScenarios(),
    progress: [],
    submissions: []
  };
}

function readStore() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const store = seedStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    return store;
  }
  const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  // The scenario catalogue is product-owned seed data. Keep existing learner progress,
  // while allowing a deployment to receive newly added or corrected scenario metadata.
  let changed = false;
  seedScenarios().forEach((seed) => {
    const existing = store.scenarios.find((item) => item.id === seed.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(seed)) { Object.assign(existing, seed); changed = true; }
    }
    else { store.scenarios.push(seed); changed = true; }
  });
  if (changed) writeStore(store);
  return store;
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(payload) {
  const body = encode(payload);
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, receivedSignature] = token.split(".");
  const expectedSignature = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function allowedOrigin(origin) {
  const configured = (process.env.FRONTEND_ORIGIN || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!configured.length) return "*";
  return origin && configured.includes(origin) ? origin : configured[0];
}

function send(res, status, data, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin(origin),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  if (req.body !== undefined) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; if (raw.length > 1_000_000) reject(new Error("Request body is too large.")); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Request body must be valid JSON.")); } });
    req.on("error", reject);
  });
}

function auth(req, res, store, origin, role) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verify(token);
  const user = payload && store.users.find((item) => item.id === payload.userId);
  if (!user) { send(res, 401, { message: "Please sign in again." }, origin); return null; }
  if (role && user.role !== role) { send(res, 403, { message: "This action is only available to an instructor." }, origin); return null; }
  return user;
}

function findScenario(store, scenarioId) {
  return store.scenarios.find((item) => item.id === scenarioId);
}

function routePath(url) {
  return new URL(url, "http://localhost").pathname.replace(/\/$/, "") || "/";
}

app.use(async (req, res) => {
  const origin = req.headers.origin;
  const pathname = routePath(req.url);
  if (req.method === "OPTIONS") { send(res, 204, {}, origin); return; }
  try {
    let store = readStore();
    if (req.method === "GET" && pathname === "/api/health") { send(res, 200, { ok: true, service: "gst-practice-lab-api", time: now() }, origin); return; }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const { email = "", password = "" } = await getBody(req);
      const user = store.users.find((item) => item.email.toLowerCase() === String(email).toLowerCase());
      if (!user || user.passwordHash !== hashPassword(String(password))) { send(res, 401, { message: "The email or password is incorrect." }, origin); return; }
      const token = sign({ userId: user.id, exp: Date.now() + (12 * 60 * 60 * 1000) });
      send(res, 200, { token, user: safeUser(user) }, origin); return;
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const user = auth(req, res, store, origin); if (!user) return;
      send(res, 200, { user: safeUser(user) }, origin); return;
    }

    if (req.method === "GET" && pathname === "/api/scenarios") {
      const user = auth(req, res, store, origin); if (!user) return;
      send(res, 200, { scenarios: store.scenarios }, origin); return;
    }

    const scenarioMatch = pathname.match(/^\/api\/scenarios\/([a-z0-9-]+)$/);
    if (req.method === "GET" && scenarioMatch) {
      const user = auth(req, res, store, origin); if (!user) return;
      const found = findScenario(store, scenarioMatch[1]);
      if (!found) { send(res, 404, { message: "Scenario not found." }, origin); return; }
      send(res, 200, { scenario: found }, origin); return;
    }

    if (req.method === "GET" && pathname === "/api/progress") {
      const user = auth(req, res, store, origin, "student"); if (!user) return;
      send(res, 200, { progress: store.progress.filter((item) => item.userId === user.id) }, origin); return;
    }

    const progressMatch = pathname.match(/^\/api\/progress\/([a-z0-9-]+)$/);
    if (req.method === "PATCH" && progressMatch) {
      const user = auth(req, res, store, origin, "student"); if (!user) return;
      const found = findScenario(store, progressMatch[1]);
      if (!found) { send(res, 404, { message: "Scenario not found." }, origin); return; }
      const body = await getBody(req);
      let progress = store.progress.find((item) => item.userId === user.id && item.scenarioId === found.id);
      if (!progress) { progress = { id: id(), userId: user.id, scenarioId: found.id, status: "started", stage: 0, feedback: "", snapshot: {}, updatedAt: now() }; store.progress.push(progress); }
      if (["started", "needs_changes"].includes(body.status)) progress.status = body.status;
      if (Number.isFinite(Number(body.stage))) progress.stage = Math.max(0, Math.min(found.steps.length - 1, Number(body.stage)));
      if (body.snapshot && typeof body.snapshot === "object") progress.snapshot = body.snapshot;
      progress.updatedAt = now();
      writeStore(store);
      send(res, 200, { progress }, origin); return;
    }

    if (req.method === "POST" && pathname === "/api/submissions") {
      const user = auth(req, res, store, origin, "student"); if (!user) return;
      const body = await getBody(req);
      const found = findScenario(store, body.scenarioId);
      if (!found) { send(res, 404, { message: "Scenario not found." }, origin); return; }
      const pending = store.submissions.find((item) => item.userId === user.id && item.scenarioId === found.id && item.status === "submitted");
      if (pending) { send(res, 409, { message: "This scenario is already waiting for instructor review." }, origin); return; }
      const submission = { id: id(), userId: user.id, scenarioId: found.id, notes: String(body.notes || "").slice(0, 1000), output: body.output && typeof body.output === "object" ? body.output : {}, status: "submitted", feedback: "", submittedAt: now(), reviewedAt: null };
      store.submissions.unshift(submission);
      let progress = store.progress.find((item) => item.userId === user.id && item.scenarioId === found.id);
      if (!progress) { progress = { id: id(), userId: user.id, scenarioId: found.id, stage: found.steps.length - 1, feedback: "", snapshot: submission.output, updatedAt: now() }; store.progress.push(progress); }
      progress.status = "submitted"; progress.stage = found.steps.length - 1; progress.snapshot = submission.output; progress.updatedAt = now();
      writeStore(store);
      send(res, 201, { submission }, origin); return;
    }

    if (req.method === "GET" && pathname === "/api/review-queue") {
      const user = auth(req, res, store, origin, "instructor"); if (!user) return;
      const submissions = store.submissions.map((item) => {
        const student = store.users.find((candidate) => candidate.id === item.userId);
        const scenarioData = findScenario(store, item.scenarioId);
        return { ...item, studentName: student ? student.name : "Unknown student", studentEmail: student ? student.email : "", scenarioTitle: scenarioData ? scenarioData.title : "Unknown scenario", group: scenarioData ? scenarioData.group : "" };
      });
      send(res, 200, { submissions }, origin); return;
    }

    const reviewMatch = pathname.match(/^\/api\/submissions\/([a-f0-9-]+)\/review$/);
    if (req.method === "POST" && reviewMatch) {
      const user = auth(req, res, store, origin, "instructor"); if (!user) return;
      const body = await getBody(req);
      if (!["approved", "needs_changes"].includes(body.reviewStatus)) { send(res, 400, { message: "Choose approved or needs_changes." }, origin); return; }
      const submission = store.submissions.find((item) => item.id === reviewMatch[1]);
      if (!submission) { send(res, 404, { message: "Submission not found." }, origin); return; }
      submission.status = body.reviewStatus; submission.feedback = String(body.feedback || "").slice(0, 1000); submission.reviewedAt = now(); submission.reviewerId = user.id;
      const progress = store.progress.find((item) => item.userId === submission.userId && item.scenarioId === submission.scenarioId);
      if (progress) { progress.status = body.reviewStatus; progress.feedback = submission.feedback; progress.updatedAt = now(); }
      writeStore(store);
      send(res, 200, { submission }, origin); return;
    }

    if (req.method === "GET" && pathname === "/api/students") {
      const user = auth(req, res, store, origin, "instructor"); if (!user) return;
      const students = store.users.filter((item) => item.role === "student").map((student) => {
        const records = store.progress.filter((item) => item.userId === student.id);
        return { ...safeUser(student), started: records.filter((item) => item.status !== "available").length, reviewed: records.filter((item) => item.status === "approved").length };
      });
      send(res, 200, { students }, origin); return;
    }

    send(res, 404, { message: "Route not found." }, origin);
  } catch (error) {
    console.error(error);
    send(res, 500, { message: error.message || "An unexpected error occurred." }, origin);
  }
});

app.listen(PORT, () => console.log(`GST Practice Lab Express API listening on http://localhost:${PORT}`));
