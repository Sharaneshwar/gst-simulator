import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5050/api";

async function request(path, token = "", options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({ message: "The server returned an invalid response." }));
  if (!response.ok) throw new Error(payload.message || "Something went wrong.");
  return payload;
}

const tagText = { available: "Ready", started: "In progress", submitted: "In review", approved: "Reviewed", needs_changes: "Needs changes" };
const groupCodes = { "Core return practice": "CR", "Nil return": "NR", "Excess ITC": "IT", "Invoice amendment": "IA", "E-way bill": "EW", "E-invoice": "EI" };

function Tag({ status = "available" }) { return <span className={`tag ${status}`}>{tagText[status] || status}</span>; }
function Button({ children, className = "primary", ...props }) { return <button className={`button ${className}`} {...props}>{children}</button>; }
function Crumbs({ label, onHome, onPractice }) { return <div className="crumbs"><button onClick={onHome}>Home</button> <span>›</span> {onPractice && <button onClick={onPractice}>Practice centre</button>} {onPractice && <span>›</span>} {label}</div>; }

function Login({ onLogin }) {
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("student1@gstpracticelab.local");
  const [password, setPassword] = useState("Demo@123");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const useDemo = (nextRole) => {
    setRole(nextRole);
    setEmail(nextRole === "instructor" ? "instructor@gstpracticelab.local" : "student1@gstpracticelab.local");
    setPassword("Demo@123");
  };
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setPending(true);
    try { await onLogin(email, password); }
    catch (reason) { setError(reason.message); setPending(false); }
  };
  return <main className="login-page"><section className="login-layout">
    <div className="login-intro"><Brand /><h1>Build confidence in GST workflows.</h1><p>Guided practice for return preparation, reconciliation, payments, e-way bills and e-invoices.</p>
      <ul className="login-points"><li><i>✓</i> Step-by-step workflow practice</li><li><i>✓</i> Student checkpoints and instructor review</li><li><i>✓</i> Clear, repeatable learning paths</li></ul>
    </div>
    <div className="login-card"><h2>Sign in to practise</h2><p>Use a demo account supplied with this deployment.</p>
      <div className="role-toggle"><button type="button" className={role === "student" ? "active" : ""} onClick={() => useDemo("student")}>Student demo</button><button type="button" className={role === "instructor" ? "active" : ""} onClick={() => useDemo("instructor")}>Instructor demo</button></div>
      <form onSubmit={submit}><Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field><Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field><Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in →"}</Button><div className="login-error">{error}</div></form>
      <div className="demo-login"><strong>Deployment demo credentials</strong><span>Student: <code>student1@gstpracticelab.local</code><br />Instructor: <code>instructor@gstpracticelab.local</code><br />Password: <code>Demo@123</code></span></div>
    </div>
  </section><footer className="login-footer">For educational purposes only.</footer></main>;
}

function Brand() { return <div className="brand"><span className="brand-mark">G</span><span><strong>GST Practice Lab</strong><small>Learn by doing</small></span></div>; }
function Field({ label, children, full = false, note = "" }) { return <div className={`field ${full ? "full" : ""}`}><label>{label}</label>{children}{note && <p className="help-text">{note}</p>}</div>; }

function AppShell({ user, screen, onScreen, onLogout, children }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("");
  const nav = [
    ["dashboard", "Home"], ["practice", "Practice centre"], ["reference", "Reference desk"], ["search", "Search taxpayer"], ["einvoice", "E-invoice"]
  ];
  return <div>
    <header className="main-nav"><div className="main-nav__inner"><button className="brand" onClick={() => onScreen(user.role === "instructor" ? "instructor" : "dashboard")}><span className="brand-mark">G</span><span><strong>GST Practice Lab</strong><small>Learn by doing</small></span></button>
      <button className="mobile-menu-button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button>
      <nav className={`nav-links ${menuOpen ? "mobile-open" : ""}`}>{nav.map(([key, label]) => <button key={key} className={`nav-link ${screen === key || (key === "practice" && screen === "workspace") ? "active" : ""}`} onClick={() => { setMenuOpen(false); onScreen(key); }}>{label}</button>)}{user.role === "instructor" && <button className={`nav-link ${screen === "instructor" ? "active" : ""}`} onClick={() => { setMenuOpen(false); onScreen("instructor"); }}>Manual review</button>}<div className="mobile-profile-menu"><span className="avatar">{initials}</span><span><b>{user.name}</b><small>{user.role === "instructor" ? "Instructor workspace" : "Student workspace"}</small></span><button className="mobile-signout" onClick={onLogout}>Sign out</button></div></nav>
      <div className="profile-menu"><button className="profile-chip" onClick={() => setProfileOpen((open) => !open)}><span className="avatar">{initials}</span><span><b>{user.name}</b>{user.role === "instructor" ? "Instructor workspace" : "Student workspace"}</span></button>{profileOpen && <div className="profile-popover"><p>{user.email}</p><Button className="secondary small-button" onClick={onLogout}>Sign out</Button></div>}</div>
    </div></header>
    <main className="shell">{children}</main>
    <footer className="app-footer">For educational purposes only.</footer>
  </div>;
}

function Dashboard({ user, scenarios, progress, onPractice, onOpen }) {
  const lookup = (id) => progress.find((item) => item.scenarioId === id) || { status: "available", stage: 0 };
  const active = scenarios.filter((item) => ["started", "needs_changes"].includes(lookup(item.id).status)).slice(0, 3);
  const suggested = scenarios.filter((item) => lookup(item.id).status === "available").slice(0, 3);
  const statuses = progress.map((item) => item.status);
  const cards = [["Practice scenarios", scenarios.length, "All self-led workflows"], ["In progress", statuses.filter((x) => ["started", "needs_changes"].includes(x)).length, "Continue from a saved checkpoint"], ["Waiting for review", statuses.filter((x) => x === "submitted").length, "Sent to your instructor"], ["Reviewed", statuses.filter((x) => x === "approved").length, "Instructor feedback received"]];
  return <><Crumbs label="Student dashboard" onHome={() => { }} /><section className="page-heading"><div><h1>Welcome back, {user.name.split(" ")[0]}.</h1><p>Work through common GST return workflows with clear steps and instructor feedback.</p></div><Button onClick={onPractice}>Open practice centre →</Button></section>
    <section className="stats-grid">{cards.map(([label, number, caption]) => <article className="stat card" key={label}><label>{label}</label><b>{number}</b><span>{caption}</span></article>)}</section>
    <section className="dashboard-grid"><article className="card card-pad"><div className="section-title"><div><h2>Pick up where you left off</h2><p>Saved checkpoints are visible only to your instructor.</p></div><Button className="ghost small-button" onClick={onPractice}>See all</Button></div>{active.length ? active.map((item) => { const itemProgress = lookup(item.id); return <div className="continue-row" key={item.id}><div className="continue-icon">{groupCodes[item.group] || "GST"}</div><div><h3>{item.title}</h3><p>{item.group} · Step {Math.min(itemProgress.stage + 1, item.steps.length)} of {item.steps.length}</p><div className="progress-line"><i style={{ width: `${Math.max(10, (itemProgress.stage / item.steps.length) * 100)}%` }} /></div></div><Button className="secondary small-button" onClick={() => onOpen(item)}>Continue</Button></div>; }) : <div className="empty">Nothing is underway yet. Choose a scenario below to begin your first practice run.</div>}</article>
      <aside className="card card-pad"><div className="section-title"><div><h2>Learning path</h2><p>A practical route for a first run.</p></div></div><ul className="check-list"><li><i>✓</i>Explore the scenario library</li><li className={progress.length ? "" : "pending"}><i>{progress.length ? "✓" : ""}</i>Save a practice checkpoint</li><li className={statuses.some((x) => ["submitted", "approved", "needs_changes"].includes(x)) ? "" : "pending"}><i>{statuses.some((x) => ["submitted", "approved", "needs_changes"].includes(x)) ? "✓" : ""}</i>Send one item for instructor review</li></ul></aside>
    </section><section className="section-title" style={{ marginTop: 28 }}><div><h2>Suggested next scenarios</h2><p>Continue building your return-filing workflow skills.</p></div><Button className="secondary small-button" onClick={onPractice}>Browse library</Button></section><section className="scenario-grid">{suggested.map((item) => <ScenarioCard key={item.id} scenario={item} progress={lookup(item.id)} onOpen={onOpen} />)}</section>
  </>;
}

function ScenarioCard({ scenario, progress, onOpen }) {
  return <article className="scenario-card card"><div className="scenario-card__top"><span className="group-label">{scenario.group}</span><Tag status={progress.status} /></div><h3>{scenario.title}</h3><p>{scenario.description}</p><div className="scenario-card__meta"><span>◷ {scenario.duration} min</span><span>◉ {scenario.difficulty}</span></div><div className="scenario-card__footer"><span className="tag">{scenario.kindLabel}</span><Button className={`${progress.status === "available" ? "primary" : "secondary"} small-button`} onClick={() => onOpen(scenario)}>{progress.status === "available" ? "Start practice" : progress.status === "approved" ? "View work" : "Continue"}</Button></div></article>;
}

function PracticeCentre({ scenarios, progress, onHome, onOpen }) {
  const [filter, setFilter] = useState("All workflows");
  const groups = ["All workflows", ...new Set(scenarios.map((item) => item.group))];
  const shown = filter === "All workflows" ? scenarios : scenarios.filter((item) => item.group === filter);
  const getProgress = (id) => progress.find((item) => item.scenarioId === id) || { status: "available", stage: 0 };
  return <><Crumbs label="Practice centre" onHome={onHome} /><section className="page-heading"><div><h1>Practice centre</h1><p>Save your progress as you work through each workflow, then send it for instructor review when ready.</p></div></section><div className="filter-bar card"><label htmlFor="workflow-filter">Choose a workflow</label><select id="workflow-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>{groups.map((group) => <option key={group}>{group}</option>)}</select><span className="filter-count">{shown.length} scenarios</span></div><section className="scenario-grid">{shown.map((item) => <ScenarioCard key={item.id} scenario={item} progress={getProgress(item.id)} onOpen={onOpen} />)}</section></>;
}

function Ledger({ purchase = false }) {
  const rows = purchase ? [["UPK-187", "Uday Paper Works", "8,900", "1,068", "Eligible"], ["KMD-042", "Kaveri Metals", "12,500", "2,250", "Eligible"], ["FRT-711", "Swift Freight Co.", "3,600", "648", "Check"]] : [["BHS/1021", "Aster Retail, KA", "18,750", "3,375", "B2B"], ["BHS/1022", "Walk-in recipients", "9,400", "1,692", "B2C"], ["BHS/1023", "Lotus Traders, TN", "14,200", "2,556", "Inter-state"]];
  return <div className="ledger"><table><thead><tr><th>Document no.</th><th>Counterparty</th><th>Taxable value (₹)</th><th>Tax (₹)</th><th>Classification</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}<tr className="total"><td colSpan="2">Practice total</td><td>₹ 44,850</td><td>₹ 7,623</td><td>—</td></tr></tbody></table></div>;
}

function ScenarioInputs({ kind }) {
  if (kind === "registration") return <><div className="form-section"><h3>Applicant profile</h3><div className="form-grid"><Field label="Taxpayer type"><select name="taxpayerType"><option>Regular taxpayer</option><option>Composition taxpayer</option></select></Field><Field label="State / UT"><select name="state"><option>Karnataka</option><option>Tamil Nadu</option><option>Maharashtra</option></select></Field><Field label="Legal business name"><input name="legalName" defaultValue="Blue Harbor Supplies" /></Field><Field label="PAN"><input name="pan" defaultValue="AAFCB0000A" /></Field><Field label="Principal place of business" full><input name="address" defaultValue="14 Harbor Lane, Bengaluru" /></Field></div></div><div className="form-section"><h3>Verification</h3><div className="form-grid"><Field label="Email verification code"><input name="otp" placeholder="Enter any six digits" /></Field><Field label="Security prompt"><input name="captcha" placeholder="What is 4 + 3?" /></Field></div></div></>;
  if (["gstr1", "gstr3b", "nil"].includes(kind)) return <ReturnInputs kind={kind} />;
  if (kind === "offline") return <><div className="form-section"><h3>Offline utility</h3><div className="callout">Select a JSON file to prepare the offline workflow and review the document summary.</div><div className="form-grid" style={{ marginTop: 15 }}><Field label="JSON file"><input name="practiceFile" type="file" accept=".json" /></Field><Field label="Import status"><input name="importStatus" defaultValue="Ready to import" readOnly /></Field></div></div><div className="form-section"><h3>Document summary</h3><Ledger /></div></>;
  if (kind === "gstr2b") return <><div className="form-section"><h3>Reconcile purchase documents</h3><Ledger purchase /><div className="form-grid" style={{ marginTop: 15 }}><Field label="Eligible ITC after review (₹)"><input name="eligibleItc" defaultValue="3318" /></Field><Field label="Documents held for follow-up"><input name="followUp" defaultValue="1" /></Field></div></div></>;
  if (kind === "documents") return <><div className="form-section"><h3>Supporting-document review</h3><div className="callout">Select supporting evidence, review the outcome, and record any follow-up needed.</div><div className="form-grid" style={{ marginTop: 15 }}><Field label="Evidence file"><input name="evidenceFile" type="file" accept=".pdf,.jpg,.jpeg,.png" /></Field><Field label="Evidence check outcome"><select name="evidenceOutcome"><option>Supporting evidence reviewed</option><option>More evidence needed</option><option>Document mismatch identified</option></select></Field><Field full label="Evidence review note"><textarea name="evidenceNote" placeholder="Record the documents checked and follow-up needed." /></Field></div></div><div className="form-section"><h3>Purchase-document register</h3><Ledger purchase /></div></>;
  if (kind === "payment") return <><div className="form-section"><h3>Cash and credit ledger</h3><div className="ledger"><table><thead><tr><th>Ledger</th><th>Balance available (₹)</th><th>Amount proposed (₹)</th></tr></thead><tbody><tr><td>Electronic credit ledger</td><td>3,966</td><td><input name="creditOffset" defaultValue="3966" /></td></tr><tr><td>Electronic cash ledger</td><td>5,000</td><td><input name="cashPayment" defaultValue="3657" /></td></tr><tr className="total"><td>Net tax liability</td><td colSpan="2">₹ 7,623</td></tr></tbody></table></div></div><div className="form-section"><h3>Challan details</h3><div className="form-grid"><Field label="Payment mode"><select name="paymentMode"><option>Internet banking</option><option>Over the counter</option></select></Field><Field label="Challan reference"><input name="challan" defaultValue="CPIN-2026-1048" /></Field></div></div></>;
  if (kind === "eway") return <><div className="form-section"><h3>Movement details</h3><div className="form-grid"><Field label="Document type"><select name="documentType"><option>Tax invoice</option><option>Bill of supply</option></select></Field><Field label="Document number"><input name="documentNo" defaultValue="BHS/1021" /></Field><Field label="From pincode"><input name="fromPincode" defaultValue="560001" /></Field><Field label="To pincode"><input name="toPincode" defaultValue="600001" /></Field><Field label="Transporter ID"><input name="transporter" defaultValue="29TRANS01Z1A" /></Field><Field label="Vehicle no."><input name="vehicle" defaultValue="KA01AB1234" /></Field></div></div><div className="form-section"><h3>Goods detail</h3><div className="form-grid three"><Field label="HSN"><input name="hsn" defaultValue="4819" /></Field><Field label="Taxable value (₹)"><input name="taxable" defaultValue="18750" /></Field><Field label="Distance (km)"><input name="distance" defaultValue="350" /></Field></div></div></>;
  if (kind === "einvoice") return <><div className="form-section"><h3>Invoice header</h3><div className="form-grid"><Field label="Document number"><input name="invoiceNo" defaultValue="BHS/1021" /></Field><Field label="Document date"><input name="invoiceDate" type="date" defaultValue="2026-10-14" /></Field><Field label="Recipient GSTIN"><input name="recipientGstin" defaultValue="29AABCL1234A1Z9" /></Field><Field label="Recipient name"><input name="recipientName" defaultValue="Aster Retail Pvt Ltd" /></Field></div></div><div className="form-section"><h3>Item value</h3><div className="form-grid three"><Field label="Taxable value (₹)"><input name="taxable" defaultValue="18750" /></Field><Field label="Tax rate"><select name="rate"><option>18%</option><option>12%</option><option>5%</option></select></Field><Field label="Total invoice value (₹)"><input name="total" defaultValue="22125" /></Field></div></div></>;
  if (kind === "amendment") return <><div className="form-section"><h3>Original document</h3><div className="form-grid"><Field label="Original invoice number"><input name="originalInvoice" defaultValue="BHS/1016" /></Field><Field label="Original period"><select name="originalPeriod"><option>November 2026</option><option>October 2026</option></select></Field><Field full label="Reason for amendment"><select name="reason"><option>Taxable value correction</option><option>Recipient details correction</option><option>Tax rate correction</option></select></Field></div></div><div className="form-section"><h3>Amended values</h3><div className="form-grid three"><Field label="Taxable value (₹)"><input name="amendedTaxable" defaultValue="16200" /></Field><Field label="Tax amount (₹)"><input name="amendedTax" defaultValue="2916" /></Field><Field label="Supporting note"><input name="note" placeholder="Reason checked" /></Field></div></div></>;
  return <CancelInputs label={kind === "eway-cancel" ? "E-way bill" : "IRN"} />;
}

function ReturnInputs({ kind }) {
  if (kind === "nil") return <div className="form-section"><h3>Nil-return declaration</h3><div className="callout">Use this workflow when there are no reportable inward or outward supplies, tax liability, or eligible credit for the period.</div><div className="form-grid" style={{ marginTop: 14 }}><Field label="Reason for nil filing"><select name="nilReason"><option>No business activity</option><option>Business not commenced</option><option>Seasonal closure</option></select></Field><Field label="Declaration initials"><input name="declaration" placeholder="Type initials" /></Field></div></div>;
  return <><div className="form-section"><h3>{kind === "gstr3b" ? "Summary of outward supplies and input tax credit" : "Reported outward supplies"}</h3><Ledger /><div className="form-grid three" style={{ marginTop: 16 }}><Field label="Taxable outward supplies (₹)"><input name="outwardTaxable" defaultValue="44850" /></Field><Field label="Output tax (₹)"><input name="outputTax" defaultValue="7623" /></Field><Field label={kind === "gstr3b" ? "Eligible ITC (₹)" : "Document count"}><input name={kind === "gstr3b" ? "itc" : "invoiceCount"} defaultValue={kind === "gstr3b" ? "3966" : "3"} /></Field></div></div><div className="form-section"><h3>Practice confirmation</h3><Field label="Review note for instructor"><input name="reviewNote" placeholder="What did you check?" /></Field></div></>;
}

function CancelInputs({ label }) { return <div className="form-section"><h3>Cancellation details</h3><div className="form-grid"><Field label={`${label} reference`}><input name="reference" defaultValue="2026-1048001" /></Field><Field label="Reason"><select name="reason"><option>Duplicate entry</option><option>Data entry error</option><option>Order cancelled</option></select></Field><Field full label="Explanation"><textarea name="explanation" placeholder="Explain the review checks made before cancellation." /></Field></div></div>; }

function Workspace({ scenario, progress, user, onHome, onPractice, onSave, onReview }) {
  const formRef = useRef(null);
  const stage = progress?.stage || 0;
  const snapshot = () => Object.fromEntries([...new FormData(formRef.current).entries()].map(([key, value]) => [key, value instanceof File ? value.name : value]));
  const responseClass = progress?.status === "approved" ? "approved" : progress?.status === "needs_changes" ? "changes" : "";
  return <><Crumbs label={scenario.title} onHome={onHome} onPractice={onPractice} /><section className="workspace-head card"><div className="card-pad"><div className="section-title"><div><span className="group-label">{scenario.group}</span><h2 style={{ marginTop: 4 }}>{scenario.title}</h2><p>{scenario.description}</p></div><Tag status={progress?.status || "available"} /></div></div></section><section className="taxpayer-strip"><div><label>Business</label><b>Blue Harbor Supplies</b></div><div><label>GSTIN</label><b>29AAFCB0000A1Z4</b></div><div><label>Return period</label><b>{scenario.period || "October 2026"}</b></div><div><label>Workspace</label><b>GST Practice Lab</b></div></section>
    <div className="stepper">{scenario.steps.map((item, index) => <div key={item} className={`step ${index < stage ? "done" : index === stage ? "active" : ""}`} data-num={index + 1}><b>{item}</b></div>)}</div>
    <div className="workspace-grid"><section className="card form-panel"><h2>{scenario.kindLabel}</h2><p>Complete the details below, save your work, and request review when you are ready.</p>{progress?.status && progress.status !== "started" && progress.status !== "available" && <div className={`review-note ${responseClass}`}><strong>{progress.status === "submitted" ? "Sent for manual review" : progress.status === "approved" ? "Instructor review completed" : "Instructor requests changes"}</strong>{progress.feedback || "Your instructor will review this work manually."}</div>}<form ref={formRef}><ScenarioInputs kind={scenario.kind} /></form><div className="action-bar"><p>Your progress is saved to your learner profile.</p><div className="action-bar__buttons"><Button className="secondary" onClick={() => onSave(scenario, snapshot())}>Save checkpoint</Button><Button disabled={progress?.status === "submitted"} onClick={() => onReview(scenario, snapshot())}>{progress?.status === "submitted" ? "Awaiting review" : "Request instructor review"}</Button></div></div></section>
      <aside><section className="utility-card card"><h3>Scenario guide</h3><p>{scenario.instruction || "Read each value, reconcile it to the scenario, then save your practice checkpoint."}</p>{scenario.steps.map((item, index) => <div className="status-row" key={item}><span>{index + 1}. {item}</span><b>{index < stage ? "Done" : index === stage ? "Now" : "Next"}</b></div>)}</section><section className="utility-card card"><h3>Instructor review</h3><p>Your instructor sees your submitted note, saved stage, scenario title, and the details you choose to send for review.</p><div className="callout">Your instructor reviews manually; there is no automatic score or assignment generation in this portal.</div></section></aside>
    </div></>;
}

function Reference({ onHome }) { const notes = [["Return sequence", "Start from registration, record sales, reconcile purchase credits, then practise payment and summary-return workflows."], ["Offline practice", "Use a JSON file to practise the import route and review the document summary."], ["Document systems", "E-way bill and e-invoice exercises are separate tracks so learners understand the different data checks."], ["Manual assessment", "Ask learners to request review only after completing their notes. The instructor workspace holds that queue."], ["Current guidance", "Verify every GST procedure against current official guidance before applying it in practice."], ["Discussion prompts", "Use a learner’s saved review note to discuss eligibility, documentary evidence, reconciliation, and correction choices."]]; return <><Crumbs label="Reference desk" onHome={onHome} /><section className="page-heading"><div><h1>Reference desk</h1><p>Teaching notes for a practical Tally Prime with GST classroom.</p></div></section><section className="scenario-grid">{notes.map(([title, body]) => <article className="scenario-card card" key={title}><span className="group-label">Teaching note</span><h3>{title}</h3><p>{body}</p></article>)}</section></>; }

function Search({ onHome }) { const [query, setQuery] = useState(""); const [result, setResult] = useState(""); return <><Crumbs label="Search taxpayer" onHome={onHome} /><section className="page-heading"><div><h1>Search taxpayer</h1><p>Look up a counterparty before recording a transaction.</p></div></section><section className="card form-panel" style={{ maxWidth: 720 }}><h2>Taxpayer lookup</h2><p>Search by GSTIN or business name.</p><div className="form-grid"><Field label="GSTIN or business name"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="For example, Aster Retail" /></Field><div className="field" style={{ alignSelf: "end" }}><Button onClick={() => setResult(query ? "Aster Retail Pvt Ltd · 29AABCL1234A1Z9 · Active" : "Enter a name or GSTIN to search.")}>Search</Button></div></div>{result && <div className="review-note" style={{ marginTop: 18 }}><strong>Record found</strong>{result}</div>}</section></>; }

function Instructor({ scenarios, queue, students, onHome, onRefresh, onReview }) {
  const awaiting = queue.filter((item) => item.status === "submitted").length;
  return <><Crumbs label="Manual review" onHome={onHome} /><section className="page-heading"><div><h1>Manual review desk</h1><p>Review submitted workflows, then send feedback. This screen keeps review manual.</p></div><Button className="secondary" onClick={onRefresh}>Refresh queue</Button></section><section className="stats-grid"><article className="stat card"><label>Students</label><b>{students.length}</b><span>Learner accounts</span></article><article className="stat card"><label>Awaiting review</label><b>{awaiting}</b><span>Submitted by students</span></article><article className="stat card"><label>All submissions</label><b>{queue.length}</b><span>Manual feedback history</span></article><article className="stat card"><label>Workflow library</label><b>{scenarios.length}</b><span>Ready-to-use practice cases</span></article></section><section className="card card-pad"><div className="section-title"><div><h2>Review queue</h2><p>Approve a completed practice run or ask the learner to make changes.</p></div></div>{queue.length ? <div className="queue"><table><thead><tr><th>Learner</th><th>Scenario</th><th>Submitted note</th><th>Status</th><th>Manual action</th></tr></thead><tbody>{queue.map((item) => <tr key={item.id}><td><b>{item.studentName}</b><small>{item.studentEmail}</small></td><td><b>{item.scenarioTitle}</b><small>{item.group}</small></td><td className="notes">{item.notes || "No note included."}</td><td><Tag status={item.status} /></td><td>{item.status === "submitted" ? <div className="review-controls"><Button className="primary small-button" onClick={() => onReview(item, "approved")}>Approve</Button><Button className="danger small-button" onClick={() => onReview(item, "needs_changes")}>Changes</Button></div> : <small>{item.feedback || "Reviewed"}</small>}</td></tr>)}</tbody></table></div> : <div className="empty">There are no submissions yet. Student work will appear here once they request instructor review.</div>}</section><section className="section-title" style={{ marginTop: 28 }}><div><h2>Student accounts</h2><p>Student logins are managed separately; this screen is only for an instructor’s overview.</p></div></section><section className="student-cards">{students.map((student) => <article className="student-card card" key={student.id}><h3>{student.name}</h3><p>{student.email}</p><dl><div><dt>Started</dt><dd>{student.started}</dd></div><div><dt>Reviewed</dt><dd>{student.reviewed}</dd></div></dl></article>)}</section></>;
}

function NoteModal({ title, text, placeholder, confirmLabel, onCancel, onConfirm }) { const [value, setValue] = useState(""); return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><h2>{title}</h2><p>{text}</p><textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} /><div className="modal__actions"><Button className="secondary" onClick={onCancel}>Cancel</Button><Button onClick={() => onConfirm(value.trim())}>{confirmLabel}</Button></div></section></div>; }

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gstLabToken") || "");
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [scenarios, setScenarios] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeScenario, setActiveScenario] = useState(null);
  const [queue, setQueue] = useState([]);
  const [students, setStudents] = useState([]);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  const refreshInstructor = async (activeToken = token) => { const [queueData, studentData] = await Promise.all([request("/review-queue", activeToken), request("/students", activeToken)]); setQueue(queueData.submissions || []); setStudents(studentData.students || []); };
  const refreshProgress = async (activeToken = token) => { const data = await request("/progress", activeToken); setProgress(data.progress || []); };
  const loadApp = async (activeUser, activeToken = token) => { const [scenarioData, progressData] = await Promise.all([request("/scenarios", activeToken), activeUser.role === "student" ? request("/progress", activeToken) : Promise.resolve({ progress: [] })]); setScenarios(scenarioData.scenarios || []); setProgress(progressData.progress || []); if (activeUser.role === "instructor") await refreshInstructor(activeToken); };

  useEffect(() => { if (!token) return; (async () => { try { const data = await request("/auth/me", token); setUser(data.user); setScreen(data.user.role === "instructor" ? "instructor" : "dashboard"); await loadApp(data.user, token); } catch { localStorage.removeItem("gstLabToken"); setToken(""); setNotice({ text: "Your previous session expired. Please sign in again.", type: "error" }); } finally { setLoading(false); } })(); }, []);
  useEffect(() => { if (!notice) return undefined; const timer = window.setTimeout(() => setNotice(null), 3800); return () => window.clearTimeout(timer); }, [notice]);

  const login = async (email, password) => { const data = await request("/auth/login", "", { method: "POST", body: JSON.stringify({ email, password }) }); localStorage.setItem("gstLabToken", data.token); setToken(data.token); setUser(data.user); setScreen(data.user.role === "instructor" ? "instructor" : "dashboard"); await loadApp(data.user, data.token); };
  const logout = () => { localStorage.removeItem("gstLabToken"); setToken(""); setUser(null); setScenarios([]); setProgress([]); setQueue([]); setStudents([]); };
  const openScenario = (scenario) => { setActiveScenario(scenario); setScreen("workspace"); };
  const saveWork = async (scenario, snapshot) => { const current = progress.find((item) => item.scenarioId === scenario.id) || { status: "available", stage: 0 }; const stage = Math.min((current.stage || 0) + 1, scenario.steps.length - 1); try { await request(`/progress/${scenario.id}`, token, { method: "PATCH", body: JSON.stringify({ stage, status: current.status === "needs_changes" ? "needs_changes" : "started", snapshot }) }); await refreshProgress(); setNotice({ text: "Checkpoint saved. You can return to it anytime.", type: "success" }); } catch (reason) { setNotice({ text: reason.message, type: "error" }); } };
  const sendForReview = async (notes) => { const { scenario, snapshot } = modal; try { await request("/submissions", token, { method: "POST", body: JSON.stringify({ scenarioId: scenario.id, notes, output: snapshot }) }); await refreshProgress(); setModal(null); setNotice({ text: "Sent to your instructor for manual review.", type: "success" }); } catch (reason) { setNotice({ text: reason.message, type: "error" }); } };
  const reviewSubmission = async (feedback) => { const { item, reviewStatus } = modal; try { await request(`/submissions/${item.id}/review`, token, { method: "POST", body: JSON.stringify({ reviewStatus, feedback }) }); await refreshInstructor(); setModal(null); setNotice({ text: "Manual review saved.", type: "success" }); } catch (reason) { setNotice({ text: reason.message, type: "error" }); } };
  const nav = (next) => { if (next === "einvoice") { setScreen("practice"); setActiveScenario(null); } else { setScreen(next); if (next !== "workspace") setActiveScenario(null); } };

  if (!user) return <>{loading ? <main className="shell"><div className="loading"><span className="loader" />Opening your practice workspace…</div></main> : <Login onLogin={login} />}{notice && <div className={`toast-container`}><div className={`toast ${notice.type}`}>{notice.text}</div></div>}</>;
  let page = null;
  if (screen === "dashboard") page = <Dashboard user={user} scenarios={scenarios} progress={progress} onPractice={() => nav("practice")} onOpen={openScenario} />;
  if (screen === "practice") page = <PracticeCentre scenarios={scenarios} progress={progress} onHome={() => nav(user.role === "instructor" ? "instructor" : "dashboard")} onOpen={openScenario} />;
  if (screen === "workspace" && activeScenario) page = <Workspace key={activeScenario.id} scenario={activeScenario} progress={progress.find((item) => item.scenarioId === activeScenario.id)} user={user} onHome={() => nav("dashboard")} onPractice={() => nav("practice")} onSave={saveWork} onReview={(scenario, snapshot) => setModal({ type: "submit", scenario, snapshot })} />;
  if (screen === "reference") page = <Reference onHome={() => nav(user.role === "instructor" ? "instructor" : "dashboard")} />;
  if (screen === "search") page = <Search onHome={() => nav(user.role === "instructor" ? "instructor" : "dashboard")} />;
  if (screen === "instructor") page = <Instructor scenarios={scenarios} queue={queue} students={students} onHome={() => nav("instructor")} onRefresh={async () => { await refreshInstructor(); setNotice({ text: "Review queue refreshed.", type: "success" }); }} onReview={(item, reviewStatus) => setModal({ type: "review", item, reviewStatus })} />;
  return <><AppShell user={user} screen={screen} onScreen={nav} onLogout={logout}>{page}</AppShell>{modal?.type === "submit" && <NoteModal title="Request instructor review" text="Add a short note about what you checked or learned. The instructor will evaluate this manually." placeholder="For example: I matched the outward-supply total to the invoices." confirmLabel="Send for review" onCancel={() => setModal(null)} onConfirm={sendForReview} />}{modal?.type === "review" && <NoteModal title={modal.reviewStatus === "approved" ? "Approve practice run" : "Request changes"} text={modal.reviewStatus === "approved" ? "Add optional feedback for the learner." : "Explain the change the learner should make before resubmitting."} placeholder={modal.reviewStatus === "approved" ? "Good reconciliation checks." : "Please review the unmatched freight document."} confirmLabel={modal.reviewStatus === "approved" ? "Approve" : "Send changes"} onCancel={() => setModal(null)} onConfirm={reviewSubmission} />}{notice && <div className="toast-container"><div className={`toast ${notice.type}`}>{notice.text}</div></div>}</>;
}
