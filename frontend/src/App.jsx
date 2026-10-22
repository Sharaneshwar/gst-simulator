import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5050/api";

async function request(path, token = "", options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({ message: "The server returned an invalid response." }));
  if (!response.ok) throw new Error(payload.message || "Something went wrong.");
  return payload;
}

const money = (value) => "₹" + Number(value || 0).toLocaleString("en-IN");
const shortDate = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const statusTone = (status = "") => status.toLowerCase().replace(/\s/g, "-");

function Button({ children, className = "primary", ...props }) {
  return <button className={"button " + className} {...props}>{children}</button>;
}

function Brand({ button = false, onClick }) {
  const body = <><span className="brand-mark"><i /><i /><i /></span><span><strong>GST Practice Portal</strong><small>Learn by doing</small></span></>;
  return button ? <button className="brand" onClick={onClick}>{body}</button> : <div className="brand">{body}</div>;
}

function Field({ label, children, help }) {
  return <label className="field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

function Status({ value = "Not started" }) {
  return <span className={"status " + statusTone(value)}>{value}</span>;
}

function Table({ columns, rows, empty = "No records are available in this business case." }) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={columns.length} className="table-empty">{empty}</td></tr>}</tbody></table></div>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("student@demo.com");
  const [password, setPassword] = useState("12345");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setError(""); setPending(true);
    try { await onLogin(email, password); } catch (reason) { setError(reason.message); setPending(false); }
  };
  return <main className="login-page"><section className="login-shell">
    <div className="login-copy"><Brand /><p className="eyebrow">GST workflow playground</p><h1>Get a feel for the full filing journey.</h1><p className="lead">Work with a connected business record. Returns, ledgers, e-way bills and e-invoices all use the same underlying documents.</p><div className="login-points"><span>✓ Explore real-world return routes</span><span>✓ Switch between business cases</span><span>✓ Keep every workflow connected</span></div></div>
    <section className="login-card"><p className="eyebrow">Portal access</p><h2>Sign in</h2><p>Enter your practice portal credentials to continue.</p><form onSubmit={submit}><Field label="Email address"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field><Field label="Password"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field><Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>{error && <div className="form-error">{error}</div>}</form><p className="access-note">Sample access is prefilled for this build.</p></section>
  </section><footer>For educational purposes only.</footer></main>;
}

function AppShell({ user, screen, onScreen, onLogout, onCases, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("");
  const nav = [["home", "Home"], ["services", "Services"], ["returns", "Returns"], ["eway", "E-way Bill"], ["einvoice", "E-invoice"], ["search", "Search Taxpayer"]];
  const navigate = (target) => { setMenuOpen(false); onScreen(target); };
  const active = (key) => screen === key || screen.startsWith(key + "-");
  return <div className="app-root">
    <header className="main-nav"><div className="nav-inner">
      <Brand button onClick={() => navigate("home")} />
      <nav className="desktop-nav">{nav.map(([key, label]) => <button key={key} className={active(key) ? "active" : ""} onClick={() => navigate(key)}>{label}</button>)}</nav>
      <div className="nav-actions"><button className="case-button" onClick={onCases}>Switch business</button><button className="profile-button" onClick={() => setProfileOpen((open) => !open)}><span className="avatar">{initials}</span><span>{user.name}</span></button>{profileOpen && <div className="profile-popover"><b>{user.name}</b><small>{user.email}</small><button onClick={onCases}>Switch business case</button><button onClick={onLogout}>Sign out</button></div>}</div>
      <button className="mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Open navigation" aria-expanded={menuOpen}>{menuOpen ? "×" : "☰"}</button>
      {menuOpen && <div className="mobile-drawer">{nav.map(([key, label]) => <button key={key} className={active(key) ? "active" : ""} onClick={() => navigate(key)}>{label}</button>)}<div className="drawer-user"><span className="avatar">{initials}</span><span><b>{user.name}</b><small>{user.email}</small></span></div><button onClick={() => { setMenuOpen(false); onCases(); }}>Switch business case</button><button className="drawer-signout" onClick={onLogout}>Sign out</button></div>}
    </div></header>
    <main className="portal-shell">{children}</main>
    <footer className="app-footer">For educational purposes only.</footer>
  </div>;
}

function TaxpayerStrip({ portal }) {
  const taxpayer = portal.state.taxpayer;
  return <section className="taxpayer-strip"><div><small>Legal name</small><b>{taxpayer.legalName}</b></div><div><small>GSTIN</small><b>{taxpayer.gstin}</b></div><div><small>State</small><b>{taxpayer.state}</b></div><div><small>Return period</small><b>{portal.period}</b></div></section>;
}

function Dashboard({ portal, user, onScreen, onCases }) {
  const state = portal.state;
  const outputTax = state.salesInvoices.reduce((total, invoice) => total + invoice.tax, 0);
  const eligibleItc = state.purchaseInvoices.filter((invoice) => invoice.match === "Matched").reduce((total, invoice) => total + invoice.tax, 0);
  const net = Math.max(0, outputTax - eligibleItc);
  const returns = [
    ["GSTR-1", state.returns.gstr1?.status || "Not started", "Outward supplies", "gstr1"],
    ["GSTR-2B", state.returns.gstr2b?.status || "Not started", "Input tax credit", "gstr2b"],
    ["GSTR-3B", state.returns.gstr3b?.status || "Not started", "Summary return", "gstr3b"]
  ];
  return <><div className="crumbs">Home <span>›</span> Dashboard</div><section className="welcome"><div><p className="eyebrow">Taxpayer dashboard</p><h1>Welcome, {user.name.split(" ")[0]}.</h1><p>Explore how one business record moves through returns, reconciliation, payment and document workflows.</p></div><Button onClick={onCases}>Switch business case</Button></section><TaxpayerStrip portal={portal} />
    <section className="section-heading"><div><h2>Returns at a glance</h2><p>Open a return to work with this taxpayer’s connected data.</p></div><button className="text-button" onClick={() => onScreen("returns")}>View all returns →</button></section>
    <section className="return-summary">{returns.map(([name, status, detail, page]) => <button className="return-tile" key={name} onClick={() => onScreen("returns-" + page)}><div><span className="return-icon">{name.replace("-", "")}</span><Status value={status} /></div><b>{name}</b><small>{detail}</small><span className="tile-arrow">Open →</span></button>)}</section>
    <section className="snapshot-grid"><article className="snapshot-card"><small>Outward supplies</small><b>{money(state.salesInvoices.reduce((total, invoice) => total + invoice.taxable, 0))}</b><span>{state.salesInvoices.length} invoices in this period</span></article><article className="snapshot-card"><small>Eligible ITC</small><b>{money(eligibleItc)}</b><span>{state.purchaseInvoices.filter((invoice) => invoice.match === "Matched").length} matched supplier documents</span></article><article className="snapshot-card"><small>Estimated net tax</small><b>{money(net)}</b><span>Calculated from current documents</span></article></section>
    <section className="dashboard-grid"><article className="card activity-card"><div className="section-heading"><div><h2>Activity record</h2><p>Recent actions for this business case.</p></div></div>{state.activities.map((item) => <div className="activity-row" key={item.id}><span className="activity-dot" /><div><b>{item.label}</b><p>{item.detail}</p></div><small>{shortDate(item.at)}</small></div>)}</article><article className="card next-card"><p className="eyebrow">Next steps</p><h2>Finish the connected flow</h2><ol><li><button onClick={() => onScreen("returns-gstr1")}>Prepare outward supplies in GSTR-1</button></li><li><button onClick={() => onScreen("returns-gstr2b")}>Reconcile the available purchase data</button></li><li><button onClick={() => onScreen("returns-gstr3b")}>Review the GSTR-3B summary</button></li></ol><Button className="secondary" onClick={() => onScreen("services")}>Explore services</Button></article></section></>;
}

function Services({ onScreen }) {
  const cards = [
    ["Returns", "Open the connected GSTR-1, GSTR-2B, GSTR-3B and payment routes.", "returns"], ["E-way Bill", "Generate a movement document from an available outward invoice.", "eway"], ["E-invoice", "Create a document reference from the same invoice register.", "einvoice"], ["Search Taxpayer", "Look up an available counterparty by name or GSTIN.", "search"]
  ];
  return <><div className="crumbs">Home <span>›</span> Services</div><section className="page-head"><p className="eyebrow">Services</p><h1>Choose a workflow</h1><p>Each route uses the currently selected business case, so actions remain connected.</p></section><section className="service-grid">{cards.map(([title, detail, target], index) => <button className="service-card" key={title} onClick={() => onScreen(target)}><span className="service-number">0{index + 1}</span><h2>{title}</h2><p>{detail}</p><span>Open service →</span></button>)}</section></>;
}

function Returns({ portal, onScreen }) {
  const data = portal.state.returns;
  const cards = [
    ["GSTR-1", "Outward supplies details", data.gstr1?.status || "Not started", "gstr1"], ["GSTR-2B", "Input tax credit reconciliation", data.gstr2b?.status || "Not started", "gstr2b"], ["GSTR-3B", "Summary return and payment liability", data.gstr3b?.status || "Not started", "gstr3b"], ["Payment", "Electronic cash and credit ledgers", data.payment?.status || "Not started", "payment"]
  ];
  return <><div className="crumbs">Home <span>›</span> Returns</div><section className="page-head"><p className="eyebrow">Returns dashboard</p><h1>Returns</h1><p>Use the available records from this business case to prepare each return.</p></section><TaxpayerStrip portal={portal} /><section className="return-list">{cards.map(([name, detail, status, page]) => <article className="return-row" key={name}><span className="return-icon">{name.replace("-", "")}</span><div><h2>{name}</h2><p>{detail}</p></div><Status value={status} /><Button className="secondary" onClick={() => onScreen("returns-" + page)}>Open</Button></article>)}</section></>;
}

function ReturnWorkspace({ type, portal, onBack, onAction }) {
  const state = portal.state;
  const [pending, setPending] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [creditOffset, setCreditOffset] = useState("");
  const definition = {
    gstr1: ["GSTR-1", "Outward supplies", "Prepare the return using the sales invoices from this business case."],
    gstr2b: ["GSTR-2B", "Input tax credit", "Reconcile supplier documents before using the credit in the summary return."],
    gstr3b: ["GSTR-3B", "Summary return", "Review output tax and reconciled ITC before creating a payment challan."],
    payment: ["Payment", "Electronic ledgers", "Use the available credit and cash balances against the prepared liability."]
  }[type];
  const run = async () => {
    setPending(true); setPaymentError("");
    try { if (type === "payment") await onAction("/portal/payment", { creditOffset }); else await onAction("/portal/returns/" + type); } catch (error) { setPaymentError(error.message); } finally { setPending(false); }
  };
  const returnData = type === "payment" ? state.returns.payment : state.returns[type];
  const outputTax = state.salesInvoices.reduce((total, invoice) => total + invoice.tax, 0);
  const eligibleItc = state.purchaseInvoices.filter((invoice) => invoice.match === "Matched").reduce((total, invoice) => total + invoice.tax, 0);
  return <><div className="crumbs"><button onClick={onBack}>Returns</button><span>›</span>{definition[0]}</div><section className="workspace-head"><div><p className="eyebrow">{definition[1]}</p><h1>{definition[0]}</h1><p>{definition[2]}</p></div><Status value={returnData?.status || "Not started"} /></section><TaxpayerStrip portal={portal} />
    {type === "gstr1" && <section className="card workspace-card"><div className="workspace-title"><div><h2>Outward supply register</h2><p>Invoice values are already part of the selected case.</p></div><b>{state.salesInvoices.length} documents</b></div><Table columns={["Invoice no.", "Recipient", "Supply type", "Taxable value", "Tax"]} rows={state.salesInvoices.map((invoice) => <tr key={invoice.number}><td><b>{invoice.number}</b><small>{invoice.date}</small></td><td>{invoice.recipient}<small>{invoice.gstin || "Unregistered recipient"}</small></td><td>{invoice.supply}</td><td>{money(invoice.taxable)}</td><td>{money(invoice.tax)}</td></tr>)} empty="There are no outward supplies for this period." /><Summary values={[["Taxable value", money(state.salesInvoices.reduce((total, invoice) => total + invoice.taxable, 0))], ["Output tax", money(outputTax)], ["B2B invoices", state.salesInvoices.filter((invoice) => invoice.supply === "B2B").length]]} /></section>}
    {type === "gstr2b" && <section className="card workspace-card"><div className="workspace-title"><div><h2>Purchase document reconciliation</h2><p>Only matched supplier documents are included in eligible ITC.</p></div><b>{state.purchaseInvoices.length} documents</b></div><Table columns={["Document no.", "Supplier", "Taxable value", "ITC", "Reconciliation"]} rows={state.purchaseInvoices.map((invoice) => <tr key={invoice.number}><td><b>{invoice.number}</b></td><td>{invoice.supplier}<small>{invoice.gstin}</small></td><td>{money(invoice.taxable)}</td><td>{money(invoice.tax)}</td><td><Status value={invoice.match} /></td></tr>)} empty="There are no supplier documents for this period." /><Summary values={[["Eligible ITC", money(eligibleItc)], ["Action required", state.purchaseInvoices.filter((invoice) => invoice.match !== "Matched").length], ["Documents matched", state.purchaseInvoices.filter((invoice) => invoice.match === "Matched").length]]} /></section>}
    {type === "gstr3b" && <section className="card workspace-card"><div className="workspace-title"><div><h2>Return summary</h2><p>Totals are calculated from the outward and reconciled inward supply registers.</p></div><b>{portal.period}</b></div><div className="summary-ledger"><div><span>Output tax</span><b>{money(outputTax)}</b></div><div><span>Eligible ITC</span><b>{money(eligibleItc)}</b></div><div><span>Net tax liability</span><b>{money(Math.max(0, outputTax - eligibleItc))}</b></div></div>{!state.returns.gstr2b && <div className="soft-note">GSTR-2B has not been reconciled yet. The available matched documents are shown for the calculation.</div>}</section>}
    {type === "payment" && <section className="card workspace-card"><div className="workspace-title"><div><h2>Electronic cash and credit ledgers</h2><p>Generate a challan after the GSTR-3B summary has been prepared.</p></div><b>{state.returns.gstr3b ? money(state.returns.gstr3b.liability) : "GSTR-3B required"}</b></div><div className="ledger-cards"><div><span>Credit ledger available</span><b>{money(state.ledgers.credit)}</b></div><div><span>Cash ledger available</span><b>{money(state.ledgers.cash)}</b></div><div><span>Tax liability</span><b>{money(state.returns.gstr3b?.liability)}</b></div></div><Field label="Credit to offset"><input inputMode="decimal" value={creditOffset} onChange={(event) => setCreditOffset(event.target.value)} placeholder={"Up to " + money(state.ledgers.credit)} /></Field>{state.returns.payment && <div className="success-note"><b>Challan created: {state.returns.payment.reference}</b><span>Credit offset {money(state.returns.payment.creditOffset)} · Cash payment {money(state.returns.payment.cashPayment)}</span></div>}</section>}
    {returnData && type !== "payment" && <div className="success-note"><b>{definition[0]} is {returnData.status.toLowerCase()}.</b><span>{returnData.updatedAt ? "Last prepared " + shortDate(returnData.updatedAt) + "." : ""}</span></div>}
    {paymentError && <div className="form-error">{paymentError}</div>}<div className="workspace-actions"><Button className="secondary" onClick={onBack}>Back to returns</Button><Button onClick={run} disabled={pending}>{pending ? "Working…" : type === "payment" ? "Create payment challan" : "Prepare " + definition[0]}</Button></div></>;
}

function Summary({ values }) {
  return <div className="summary-list">{values.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>;
}

function DocumentWorkspace({ type, portal, onBack, onAction }) {
  const [invoiceNumber, setInvoiceNumber] = useState(portal.state.salesInvoices[0]?.number || "");
  const [transporterId, setTransporterId] = useState("29TRANS01Z1A");
  const [vehicleNumber, setVehicleNumber] = useState("KA01AB1234");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const docs = type === "eway" ? portal.state.ewayBills : portal.state.eInvoices;
  const title = type === "eway" ? "E-way Bill" : "E-invoice";
  const submit = async () => {
    setPending(true); setError("");
    try { await onAction("/portal/documents/" + type, type === "eway" ? { invoiceNumber, transporterId, vehicleNumber } : { invoiceNumber }); } catch (reason) { setError(reason.message); } finally { setPending(false); }
  };
  return <><div className="crumbs"><button onClick={onBack}>{title}</button><span>›</span> Generate</div><section className="workspace-head"><div><p className="eyebrow">Document service</p><h1>{title}</h1><p>Select an outward invoice from the same business record, then create a document reference.</p></div><Status value={docs.length ? "Generated" : "Not started"} /></section><TaxpayerStrip portal={portal} /><section className="card form-card"><div className="workspace-title"><div><h2>Invoice selection</h2><p>Only invoices available in the selected business case can be used.</p></div></div><div className="form-grid"><Field label="Outward invoice"><select value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)}>{portal.state.salesInvoices.map((invoice) => <option key={invoice.number} value={invoice.number}>{invoice.number} · {invoice.recipient} · {money(invoice.taxable + invoice.tax)}</option>)}</select></Field>{type === "eway" && <><Field label="Transporter ID"><input value={transporterId} onChange={(event) => setTransporterId(event.target.value)} /></Field><Field label="Vehicle number"><input value={vehicleNumber} onChange={(event) => setVehicleNumber(event.target.value)} /></Field></>}</div>{!portal.state.salesInvoices.length && <div className="soft-note">This business case has no outward invoices available for document generation.</div>}{error && <div className="form-error">{error}</div>}<div className="workspace-actions"><Button className="secondary" onClick={onBack}>Back</Button><Button onClick={submit} disabled={pending || !invoiceNumber}>{pending ? "Generating…" : "Generate " + title}</Button></div></section><section className="card workspace-card"><div className="workspace-title"><div><h2>Generated documents</h2><p>Document history for this business case.</p></div></div><Table columns={type === "eway" ? ["E-way bill no.", "Invoice", "Vehicle", "Status", "Created"] : ["IRN", "Invoice", "Acknowledgement", "Status", "Created"]} rows={docs.map((document) => <tr key={document.number || document.irn}><td><b>{document.number || document.irn}</b></td><td>{document.invoiceNumber}</td><td>{document.vehicleNumber || document.acknowledgement}</td><td><Status value={document.status} /></td><td>{shortDate(document.createdAt)}</td></tr>)} empty={"No " + title.toLowerCase() + " documents have been generated yet."} /></section></>;
}

function TaxpayerSearch({ token }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const search = async (event) => {
    event.preventDefault(); setError(""); setPending(true);
    try { const data = await request("/portal/taxpayers?query=" + encodeURIComponent(query), token); setResults(data.taxpayers || []); } catch (reason) { setError(reason.message); } finally { setPending(false); }
  };
  return <><div className="crumbs">Home <span>›</span> Search Taxpayer</div><section className="page-head"><p className="eyebrow">Taxpayer search</p><h1>Search taxpayer</h1><p>Search the available counterparty records by legal name or GSTIN.</p></section><section className="card search-card"><form onSubmit={search}><Field label="Legal name or GSTIN"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="For example, Aster Retail or 29AABCL1234A1Z9" /></Field><Button type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</Button></form>{error && <div className="form-error">{error}</div>}{query && !pending && <Table columns={["Legal name", "GSTIN", "State", "Status"]} rows={results.map((taxpayer) => <tr key={taxpayer.gstin}><td><b>{taxpayer.legalName}</b></td><td>{taxpayer.gstin}</td><td>{taxpayer.state}</td><td><Status value={taxpayer.status} /></td></tr>)} empty="No matching taxpayer was found in the practice directory." />}</section></>;
}

function CaseModal({ cases, activeSlug, onSelect, onClose, onReset }) {
  const [pending, setPending] = useState("");
  const select = async (slug) => { setPending(slug); await onSelect(slug); setPending(""); };
  return <div className="modal-backdrop" role="presentation"><section className="case-modal" role="dialog" aria-modal="true" aria-label="Switch business case"><button className="modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Business cases</p><h2>Switch business</h2><p>Each case has its own taxpayer, invoices, returns, ledger balances and document history.</p><div className="case-list">{cases.map((item) => <button key={item.slug} className={"case-row " + (item.slug === activeSlug ? "selected" : "")} onClick={() => select(item.slug)} disabled={Boolean(pending)}><span className="case-radio">{item.slug === activeSlug && "✓"}</span><span><b>{item.title}</b><small>{item.description}</small><em>{item.period} · {item.sector}</em></span>{pending === item.slug && <i>Loading…</i>}</button>)}</div><div className="modal-footer"><Button className="danger-text" onClick={() => { if (window.confirm("Reset the current business case to its original data?")) onReset(); }}>Reset current data</Button><Button className="secondary" onClick={onClose}>Done</Button></div></section></div>;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gstPortalToken") || "");
  const [user, setUser] = useState(null);
  const [portal, setPortal] = useState(null);
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(Boolean(token));
  const [notice, setNotice] = useState("");
  const [casesOpen, setCasesOpen] = useState(false);
  const loadPortal = async (activeToken = token) => { const data = await request("/portal", activeToken); setUser(data.user); setPortal(data); return data; };
  useEffect(() => {
    if (!token) return;
    (async () => { try { await request("/auth/me", token); await loadPortal(token); } catch { localStorage.removeItem("gstPortalToken"); setToken(""); } finally { setLoading(false); } })();
  }, [token]);
  useEffect(() => { if (!notice) return undefined; const timer = window.setTimeout(() => setNotice(""), 3500); return () => window.clearTimeout(timer); }, [notice]);
  const login = async (email, password) => { const data = await request("/auth/login", "", { method: "POST", body: JSON.stringify({ email, password }) }); localStorage.setItem("gstPortalToken", data.token); setToken(data.token); setUser(data.user); };
  const logout = () => { localStorage.removeItem("gstPortalToken"); setToken(""); setUser(null); setPortal(null); setScreen("home"); };
  const runAction = async (path, body) => { const data = await request(path, token, { method: "POST", body: body ? JSON.stringify(body) : undefined }); if (data.state) setPortal((current) => ({ ...current, activeCase: { ...current.activeCase, state: data.state } })); setNotice("Your business case has been updated."); return data; };
  const selectCase = async (slug) => { await request("/portal/cases/" + slug + "/activate", token, { method: "POST" }); await loadPortal(); setScreen("home"); setCasesOpen(false); setNotice("Business case switched."); };
  const reset = async () => { await runAction("/portal/reset"); setCasesOpen(false); };
  const content = useMemo(() => {
    if (!portal) return null;
    if (screen === "services") return <Services onScreen={setScreen} />;
    if (screen === "returns") return <Returns portal={portal.activeCase} onScreen={setScreen} />;
    if (screen.startsWith("returns-")) return <ReturnWorkspace type={screen.replace("returns-", "")} portal={portal.activeCase} onBack={() => setScreen("returns")} onAction={runAction} />;
    if (screen === "eway" || screen === "einvoice") return <DocumentWorkspace type={screen} portal={portal.activeCase} onBack={() => setScreen("home")} onAction={runAction} />;
    if (screen === "search") return <TaxpayerSearch token={token} />;
    return <Dashboard portal={portal.activeCase} user={user} onScreen={setScreen} onCases={() => setCasesOpen(true)} />;
  }, [portal, screen, user, token]);
  if (loading) return <div className="loading-screen"><Brand /><span>Opening portal…</span></div>;
  if (!user || !portal) return <Login onLogin={login} />;
  return <AppShell user={user} screen={screen} onScreen={setScreen} onLogout={logout} onCases={() => setCasesOpen(true)}>{notice && <div className="toast">{notice}</div>}{content}{casesOpen && <CaseModal cases={portal.cases} activeSlug={portal.activeCase.slug} onSelect={selectCase} onClose={() => setCasesOpen(false)} onReset={reset} />}</AppShell>;
}
