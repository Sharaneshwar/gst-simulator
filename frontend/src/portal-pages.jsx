import { useEffect, useState } from "react";
import {
  Btn,
  Crumbs,
  Field,
  Input,
  Panel,
  Table,
  TaxpayerBar,
  download,
  money,
  periodLabel,
  usePortal,
} from "./lib";

const NEWS = [
  [
    "October return filing window is now available",
    "Oct 16th, 2026",
    "RETURNS",
    "The October return filing window is available. Select the financial year, quarter and return period from the Returns Dashboard to open your records.",
  ],
  [
    "Advisory on reviewing invoice details before generating a summary",
    "Oct 13th, 2026",
    "RETURNS",
    "Review GSTIN, place of supply and tax values in each section. Generate a fresh summary after adding or amending documents.",
  ],
  [
    "New help topics for electronic cash and credit ledgers",
    "Oct 10th, 2026",
    "OTHERS",
    "The Help section explains challan creation, payment confirmation, ledger balances and liability offset.",
  ],
];

export function Home() {
  const { go } = usePortal();
  const [quarterly, setQuarterly] = useState(false);
  return (
    <>
      <div
        className="industry-banner"
        role="img"
        aria-label="Industry, manufacturing and commerce"
      />
      <div className="announcement">
        <div className="container">
          ♟{" "}
          <span>
            Welcome to the GST portal. Review your return details before filing.
          </span>
        </div>
      </div>
      <div className="container home-content">
        <div className="home-columns">
          <section>
            <div className="section-title">
              <h2>News and Updates</h2>
              <button onClick={() => go("news")}>VIEW ALL</button>
            </div>
            <div className="news-list">
              {NEWS.map(([title, date, tag], i) => (
                <button key={title} onClick={() => go(`news/${i}`)}>
                  <strong>{title}</strong>
                  <span>
                    {date}
                    <small>{tag}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="section-title">
              <h2>Popular Help Topics</h2>
            </div>
            <div className="help-list">
              {[
                ["How do I register with GST?", "registration"],
                ["How do I apply for refund?", "help/refunds"],
                ["How do I file returns?", "help/returns"],
                ["How can I use Returns Offline Tool?", "downloads"],
                ["How do I view my electronic ledgers?", "ledgers"],
                ["How do I create a payment challan?", "challans"],
              ].map(([label, path]) => (
                <button key={label} onClick={() => go(path)}>
                  {label}
                  <span>›</span>
                </button>
              ))}
            </div>
            <div className="help-desk">
              <div>
                Need assistance?
                <br />
                <b>Contact your instructor</b>
              </div>
              <div>
                Find answers here
                <br />
                <button onClick={() => go("help")}>
                  Help and Taxpayer Facilities ↗
                </button>
              </div>
            </div>
          </section>
        </div>
        <div className="section-title">
          <h2>Upcoming Due Dates</h2>
          <button onClick={() => go("help/dates")}>VIEW DETAILS</button>
        </div>
        <div className="due-dates">
          <div className="tabs">
            <button
              className={!quarterly ? "active" : ""}
              onClick={() => setQuarterly(false)}
            >
              Monthly
            </button>
            <button
              className={quarterly ? "active" : ""}
              onClick={() => setQuarterly(true)}
            >
              Quarterly
            </button>
          </div>
          <div className="date-grid">
            {(quarterly
              ? [
                  ["GSTR-1", "Jul–Sep, 2026", "13 OCT"],
                  ["GSTR-3B", "Jul–Sep, 2026", "22 / 24 OCT"],
                  ["CMP-08", "Jul–Sep, 2026", "18 OCT"],
                ]
              : [
                  ["GSTR-3B", "Sep, 2026", "20 OCT"],
                  ["GSTR-1", "Sep, 2026", "11 OCT"],
                  ["IFF (Optional)", "Sep, 2026", "13 OCT"],
                  ["GSTR-6", "Sep, 2026", "13 OCT"],
                ]
            ).map(([name, period, date]) => (
              <div key={name}>
                <span>
                  {name}
                  <small>{period}</small>
                </span>
                <strong>{date}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="section-title">
          <h2>GST Media</h2>
          <button onClick={() => go("help")}>VIEW ALL ↗</button>
        </div>
        <div className="media-grid">
          {[
            [
              "Registration",
              "Know the steps in the registration process",
              "registration",
            ],
            [
              "Returns",
              "Prepare, save and file your outward supplies",
              "returns",
            ],
            [
              "Payments",
              "Understand cash, credit and liability ledgers",
              "ledgers",
            ],
          ].map(([name, text, path]) => (
            <button onClick={() => go(path)} key={name}>
              <div className="media-art">
                <span>▶</span>
                <b>{name}</b>
              </div>
              <strong>{text}</strong>
              <small>Updated: October 2026</small>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function Login() {
  const { login, setError, go, user } = usePortal();
  const [email, setEmail] = useState("student@demo.com");
  const [password, setPassword] = useState("12345");
  const [busy, setBusy] = useState(false);
  return (
    <div className="container">
      <Crumbs items={["Login"]} />
      <section className="white-page login-page">
        <form
          className="narrow-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await login(email, password);
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h1>Login</h1>
          <p className="mandatory">
            <b className="required">●</b> indicates mandatory fields
          </p>
          {user && (
            <p className="info">
              You are already signed in.{" "}
              <button
                type="button"
                className="link"
                onClick={() => go("dashboard")}
              >
                Continue to Dashboard
              </button>
            </p>
          )}
          <Input
            label="Username"
            required
            value={email}
            autoComplete="username"
            placeholder="Enter Username"
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            required
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder="Enter Password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Btn type="submit" disabled={busy}>
            {busy ? "LOGGING IN…" : "LOGIN"}
          </Btn>
          <div className="login-recovery">
            <button type="button" onClick={() => go("help/access")}>
              Forgot Username
            </button>
            <button type="button" onClick={() => go("help/access")}>
              Forgot Password
            </button>
          </div>
          <p>
            ⓘ <b>First time login:</b> Use your portal credentials to log in.
          </p>
          <div className="demo-access">
            <b>Available accounts</b>
            <button type="button" onClick={() => setEmail("student@demo.com")}>
              student@demo.com
            </button>
            <button
              type="button"
              onClick={() => setEmail("instructor@demo.com")}
            >
              instructor@demo.com
            </button>
            <small>Password: 12345</small>
          </div>
        </form>
      </section>
    </div>
  );
}

export function Dashboard() {
  const { active, w, go, user } = usePortal();
  return (
    <div className="container">
      <Crumbs />
      <div className="dashboard-title">
        <h1>Welcome, {user.name}</h1>
        <button className="link" onClick={() => go("profile")}>
          My Profile ▸
        </button>
      </div>
      <TaxpayerBar />
      <Panel title="Dashboard">
        <div className="dashboard-actions">
          {[
            ["▤", "FILE RETURNS", "returns"],
            ["₹", "CREATE CHALLAN", "challans"],
            ["▥", "VIEW LEDGERS", "ledgers"],
            ["☑", "VIEW FILED RETURNS", "filed"],
          ].map(([icon, name, path]) => (
            <button key={name} onClick={() => go(path)}>
              <span>{icon}</span>
              <b>{name}</b>
            </button>
          ))}
        </div>
      </Panel>
      <div className="two-columns">
        <Panel title="Taxpayer Details">
          <dl className="details-list">
            <dt>Legal Name of Business</dt>
            <dd>{active.state.taxpayer.legalName}</dd>
            <dt>Trade Name</dt>
            <dd>{active.state.taxpayer.tradeName}</dd>
            <dt>GSTIN</dt>
            <dd>{active.state.taxpayer.gstin}</dd>
            <dt>Registration Status</dt>
            <dd className="green">Active</dd>
            <dt>Return Filing Frequency</dt>
            <dd>{active.state.taxpayer.filingFrequency}</dd>
          </dl>
          <button className="link" onClick={() => go("business")}>
            Switch Business ▸
          </button>
        </Panel>
        <Panel title="Electronic Ledgers">
          <Table columns={["Ledger", "Available balance (₹)"]}>
            <tr>
              <td>Electronic Cash Ledger</td>
              <td className="number">
                {money(Object.values(w.cash).reduce((n, i) => n + i, 0))}
              </td>
            </tr>
            <tr>
              <td>Electronic Credit Ledger</td>
              <td className="number">
                {money(Object.values(w.credit).reduce((n, i) => n + i, 0))}
              </td>
            </tr>
          </Table>
          <div className="actions">
            <Btn onClick={() => go("ledgers")}>VIEW DETAILS</Btn>
          </div>
        </Panel>
      </div>
      <Panel title="Notices and Orders">
        <p className="empty-cell">No notices or orders are available.</p>
      </Panel>
      <Panel title="News and Updates">
        <div className="news-list compact">
          {NEWS.map(([title, date], i) => (
            <button key={title} onClick={() => go(`news/${i}`)}>
              <strong>{title}</strong>
              <small>{date}</small>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function Cases() {
  const { portal, active, selectCase, api, load, setNotice } = usePortal();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="container">
      <Crumbs items={["Switch Business"]} />
      <Panel title="Select Business">
        <Table
          columns={[
            "Legal Name / Business",
            "Return Period",
            "Details",
            "Action",
          ]}
        >
          {portal.cases.map((c) => (
            <tr key={c.slug}>
              <td>
                <b>{c.title}</b>
                {c.is_active && <span className="status">Selected</span>}
              </td>
              <td>{c.period}</td>
              <td>{c.description}</td>
              <td>
                <Btn disabled={c.is_active} onClick={() => selectCase(c.slug)}>
                  OPEN
                </Btn>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Restore Business Records">
        <p>
          Restore the original records for{" "}
          <b>{active.state.taxpayer.legalName}</b>. This clears saved filings,
          invoices and payments for this business only.
        </p>
        {confirm ? (
          <div className="actions">
            <Btn tone="secondary" onClick={() => setConfirm(false)}>
              CANCEL
            </Btn>
            <Btn
              tone="danger"
              onClick={async () => {
                await api("/portal/reset", {});
                await load();
                setConfirm(false);
                setNotice("Original business records restored.");
              }}
            >
              CONFIRM RESTORE
            </Btn>
          </div>
        ) : (
          <Btn tone="secondary" onClick={() => setConfirm(true)}>
            RESTORE ORIGINAL RECORDS
          </Btn>
        )}
      </Panel>
    </div>
  );
}

export function SearchTaxpayer({ byPan }) {
  const { api, user, go } = usePortal();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  return (
    <div className="container">
      <Crumbs
        items={[
          "Search Taxpayer",
          byPan ? "Search by PAN" : "Search by GSTIN/UIN",
        ]}
      />
      <Panel
        title={
          byPan ? "Search Taxpayer by PAN" : "Search Taxpayer by GSTIN/UIN"
        }
      >
        <div className="search-form">
          <Input
            label={
              byPan
                ? "Permanent Account Number (PAN)"
                : "GSTIN/UIN of the Taxpayer"
            }
            required
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder={byPan ? "Enter PAN" : "Enter GSTIN/UIN"}
          />
          <Btn
            onClick={async () => {
              if (!user) {
                go("login");
                return;
              }
              const result = await api(
                `/portal/taxpayers?query=${encodeURIComponent(query)}`,
              );
              setResults(result.taxpayers);
            }}
          >
            SEARCH
          </Btn>
        </div>
        {results && (
          <Table
            columns={["GSTIN", "Legal Name of Business", "State", "Status"]}
            count={results.length}
          >
            {results.map((t) => (
              <tr key={t.gstin}>
                <td>{t.gstin}</td>
                <td>{t.legalName}</td>
                <td>{t.state}</td>
                <td className="green">{t.status}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

export function InfoPage({ page }) {
  const { route, go, w, active } = usePortal();
  const sub = route.split("/")[1];
  const [open, setOpen] = useState("");
  const headings = {
    news: "News and Updates",
    help: "Help and Taxpayer Facilities",
    law: "GST Law",
    downloads: "Downloads",
    about: "About the Portal",
    policies: "Website Policies",
    contact: "Contact Us",
  };
  return (
    <div className="container">
      <Crumbs items={[headings[page] || "Page not found"]} />
      <Panel title={headings[page] || "Page not found"}>
        {page === "news" ? (
          sub !== undefined && NEWS[Number(sub)] ? (
            <article className="article">
              <h1>{NEWS[Number(sub)][0]}</h1>
              <small>{NEWS[Number(sub)][1]}</small>
              <p>{NEWS[Number(sub)][3]}</p>
              <Btn tone="secondary" onClick={() => go("news")}>
                BACK
              </Btn>
            </article>
          ) : (
            <div className="news-list">
              {NEWS.map(([title, date, tag], i) => (
                <button key={title} onClick={() => go(`news/${i}`)}>
                  <strong>{title}</strong>
                  <span>
                    {date}
                    <small>{tag}</small>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : page === "downloads" ? (
          <>
            <p>
              Download a JSON template, populate the invoice records and upload
              the file from the Returns Dashboard.
            </p>
            <div className="download-grid">
              <Btn
                onClick={() =>
                  download("GSTR1-template.json", {
                    gstin: active?.state.taxpayer.gstin || "29AAFCB0000A1Z4",
                    fp: w ? w.period.slice(5) + w.period.slice(0, 4) : "102026",
                    invoices: [
                      {
                        section: "B2B",
                        number: "INV-001",
                        date: `${w?.period || "2026-10"}-15`,
                        gstin: "29AABCL1234A1Z9",
                        recipient: "Aster Retail Pvt Ltd",
                        place: active?.state.taxpayer.state || "Karnataka",
                        taxable: 10000,
                        rate: 18,
                        cess: 0,
                      },
                    ],
                  })
                }
              >
                GSTR-1 JSON TEMPLATE ↓
              </Btn>
              <Btn tone="secondary" onClick={() => go("offline")}>
                UPLOAD RETURN JSON
              </Btn>
            </div>
            <p className="info">
              Supported import formats: portal invoice JSON and single-rate B2B
              records from the GST offline utility. Multi-rate invoices and
              other utility sections need their online forms.
            </p>
          </>
        ) : page === "help" || page === "law" ? (
          <div className="faq-list">
            {[
              [
                "Registration",
                "Choose Register, enter the Part A details, verify mobile and email OTPs, and use the TRN to complete the ten Part B tabs.",
                "registration",
              ],
              [
                "Filing GSTR-1",
                "Choose Services → Returns, select the period, add or amend the section records, generate a summary, preview it and file using EVC or DSC.",
                "returns",
              ],
              [
                "Filing GSTR-3B",
                "Review the section values and ITC, save the return, proceed to payment, offset liabilities and verify the filing.",
                "gstr3b",
              ],
              [
                "Cash and credit ledgers",
                "A paid challan credits the cash ledger. Liability offset uses eligible tax credit and the remaining cash, keeping each tax head separate.",
                "ledgers",
              ],
              [
                "Login details",
                "Use student@demo.com or instructor@demo.com with password 12345. Both accounts have independent records.",
                "login",
              ],
            ].map(([title, text, path]) => (
              <section key={title}>
                <button
                  className="faq-title"
                  onClick={() => setOpen(open === title ? "" : title)}
                >
                  {title}
                  <span>{open === title ? "−" : "+"}</span>
                </button>
                {open === title && (
                  <div className="faq-body">
                    <p>{text}</p>
                    <Btn tone="secondary" onClick={() => go(path)}>
                      OPEN
                    </Btn>
                  </div>
                )}
              </section>
            ))}
            <p>
              <a
                href="https://tutorial.gst.gov.in/"
                target="_blank"
                rel="noreferrer"
              >
                Open official GST user manuals ↗
              </a>
            </p>
          </div>
        ) : page === "policies" ? (
          <>
            <h3>Disclaimer</h3>
            <p>For educational purposes only.</p>
            <h3>Data</h3>
            <p>
              Records are saved to your portal account. Use fictional business
              and contact details in exercises.
            </p>
          </>
        ) : page === "contact" ? (
          <>
            <p>
              For help with portal access and exercises, contact your course
              instructor.
            </p>
            <Btn tone="secondary" onClick={() => go("help")}>
              BROWSE HELP TOPICS
            </Btn>
          </>
        ) : (
          <>
            <p>
              This portal provides an interactive environment for practising
              registration, return preparation, ledgers and document workflows.
            </p>
            <Btn onClick={() => go("home")}>HOME</Btn>
          </>
        )}
      </Panel>
    </div>
  );
}
