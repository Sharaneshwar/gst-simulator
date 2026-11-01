import { networkHeaders } from "./network-client";
import {
  OfflineReturn,
  PurchaseData,
  SupplierStatement,
  NilSupplies,
} from "./workflows";
import { useEffect, useRef, useState } from "react";
import {
  PortalContext,
  Panel,
  PageSkeleton,
  RequestProgress,
  Skeleton,
} from "./lib";
import {
  Home,
  Login,
  InfoPage,
  SearchTaxpayer,
  Dashboard,
  Cases,
} from "./portal-pages";
import {
  ReturnsDashboard,
  Gstr1,
  Gstr1Section,
  Gstr3b,
  Ledgers,
  Challans,
  FiledReturns,
} from "./returns";
import { Registration, TrackApplication } from "./registration";
import { Documents } from "./documents";
import { MyProfile, UserAccess } from "./access-pages";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5050/api";
const publicRoutes = [
  "home",
  "login",
  "news",
  "help",
  "law",
  "downloads",
  "about",
  "policies",
  "contact",
  "search",
];
const currentRoute = () =>
  decodeURIComponent(window.location.hash.slice(2) || "home");

function Shell({ children, ctx }) {
  const { user, active, route, go, logout, loading, pending } = ctx;
  const [menu, setMenu] = useState("");
  const [mobile, setMobile] = useState(false);
  const navRef = useRef(null);
  const [fontSize, setFontSize] = useState(14);
  const [contrast, setContrast] = useState(false);
  const services = user
    ? [
        ["Registration", "registration"],
        ["Returns", "returns"],
        ["Payments", "challans"],
        ["Ledgers", "ledgers"],
        ["User Services", "profile"],
        ["e-Way Bill System", "eway"],
        ["Track Application Status", "track"],
      ]
    : [
        ["Registration", "registration"],
        ["Payments", "challans"],
        ["User Services", "profile"],
        ["e-Way Bill System", "eway"],
        ["Track Application Status", "track"],
      ];
  const menus = [
    [user ? "Dashboard" : "Home", user ? "dashboard" : "home"],
    ["Services", services],
    ["GST Law", "law"],
    [
      "Downloads",
      [
        ["Returns Offline Utility", "downloads"],
        ["Supplier Return Data", "supplier-data"],
        ["GSTR-1 JSON Template", "downloads"],
        ["User Manuals", "help"],
      ],
    ],
    [
      "Search Taxpayer",
      [
        ["Search by GSTIN/UIN", "search"],
        ["Search by PAN", "search/pan"],
      ],
    ],
    ["Help and Taxpayer Facilities", "help"],
    ["e-Invoice", "einvoice"],
    ["News and Updates", "news"],
  ];
  useEffect(() => {
    setMenu("");
    setMobile(false);
  }, [route]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const buttons = () =>
      Array.from(navRef.current.querySelectorAll("button:not([disabled])"));
    buttons()[0]?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const items = buttons();
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    navRef.current.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      navRef.current?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [mobile]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") {
        setMenu("");
        setMobile(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (route.split("/")[0] === "eway")
    return (
      <div className="eway-site">
        {pending > 0 && <RequestProgress />}
        <main id="main-content">{children}</main>
        <footer className="eway-footer">
          <span>GST Practice Portal</span>
          <strong>For educational purposes only.</strong>
          <button onClick={() => go("dashboard")}>GST Portal</button>
        </footer>
      </div>
    );
  return (
    <div
      className={`site ${contrast ? "high-contrast" : ""}`}
      style={{ "--base-font": `${fontSize}px` }}
    >
      {pending > 0 && <RequestProgress />}
      <div className="utility-bar">
        <div className="container">
          <button
            aria-label="Toggle contrast"
            onClick={() => setContrast(!contrast)}
          >
            ◐
          </button>
          <button
            aria-label="Increase font size"
            onClick={() => setFontSize(Math.min(18, fontSize + 1))}
          >
            A⁺
          </button>
          <button
            aria-label="Decrease font size"
            onClick={() => setFontSize(Math.max(12, fontSize - 1))}
          >
            A⁻
          </button>
        </div>
      </div>
      <header className="masthead">
        <div className="container masthead-inner">
          <button className="identity" onClick={() => go("home")}>
            <img
              className="national-emblem"
              src="/emblem-of-india.svg"
              alt="National Emblem of India"
            />
            <span>
              <strong>Goods and Services Tax</strong>
              <small>Government of India, States and Union Territories</small>
            </span>
          </button>
          <div className="account-links">
            {loading ? (
              <Skeleton className="account-skeleton" height="36px" />
            ) : user ? (
              <>
                <button
                  onClick={() => setMenu(menu === "profile" ? "" : "profile")}
                >
                  {user.name.toUpperCase()} ▾
                </button>
                {menu === "profile" && (
                  <div className="profile-menu">
                    <b>{active?.state.taxpayer.legalName || user.email}</b>
                    <span>{user.email}</span>
                    <button onClick={() => go("profile")}>My Profile</button>
                    <button onClick={() => go("business")}>
                      Switch Business
                    </button>
                    <button onClick={() => go("track")}>My Applications</button>
                    {user.role === "instructor" && (
                      <>
                        <button onClick={() => go("access")}>
                          User Access
                        </button>
                      </>
                    )}
                    <button onClick={logout}>Logout</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button onClick={() => go("registration")}>REGISTER</button>
                <button
                  className="multi-register"
                  onClick={() => go("registration")}
                >
                  MULTI-STATE REGISTRATION
                </button>
                <button onClick={() => go("login")}>LOGIN</button>
              </>
            )}
          </div>
          <button
            className="hamburger"
            aria-label={mobile ? "Close navigation" : "Open navigation"}
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? "×" : "☰"}
          </button>
        </div>
      </header>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation overlay"
          onClick={() => setMobile(false)}
        />
      )}
      <nav
        ref={navRef}
        className={`navigation ${mobile ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="container nav-items">
          {mobile && (
            <div className="drawer-heading">
              <b>Menu</b>
              <button aria-label="Close menu" onClick={() => setMobile(false)}>
                ×
              </button>
            </div>
          )}
          {menus.map(([label, destination]) => (
            <div className="nav-item" key={label}>
              <button
                className={
                  (
                    Array.isArray(destination)
                      ? menu === label
                      : route.split("/")[0] === destination
                  )
                    ? "selected"
                    : ""
                }
                aria-expanded={
                  Array.isArray(destination) ? menu === label : undefined
                }
                onClick={() =>
                  Array.isArray(destination)
                    ? setMenu(menu === label ? "" : label)
                    : go(destination)
                }
              >
                {label}
                {Array.isArray(destination) && <span className="caret">▾</span>}
              </button>
              {Array.isArray(destination) && menu === label && (
                <div className="dropdown">
                  {destination.map(([name, path]) => (
                    <button key={name} onClick={() => go(path)}>
                      {name}
                      <span>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {mobile && (
            <div className="mobile-profile">
              <b>{user ? user.name : "Portal access"}</b>
              {user ? (
                <>
                  <button onClick={() => go("profile")}>My Profile</button>
                  {user.role === "instructor" && (
                    <>
                      <button onClick={() => go("access")}>User Access</button>
                      <button onClick={() => go("business")}>
                        Switch Business
                      </button>
                    </>
                  )}
                  <button onClick={logout}>Logout</button>
                </>
              ) : (
                <button onClick={() => go("login")}>LOGIN</button>
              )}
            </div>
          )}
        </div>
      </nav>
      <main id="main-content">{children}</main>
      <footer>
        <div className="footer-main">
          <div className="container footer-columns">
            {[
              [
                "About GST",
                ["About the Portal", "about"],
                ["GST History", "about"],
              ],
              [
                "Website Policies",
                ["Website Policy", "policies"],
                ["Terms and Conditions", "policies"],
                ["Disclaimer", "policies"],
              ],
              [
                "Related Sites",
                ["GST Portal", "about"],
                ["State Tax Websites", "about"],
              ],
              [
                "Help and Taxpayer Facilities",
                ["System Requirements", "help"],
                ["GST Knowledge Portal", "help"],
                ["Site Map", "help"],
              ],
              ["Contact Us", ["Help Desk", "contact"], ["Feedback", "contact"]],
            ].map(([title, ...links]) => (
              <div key={title}>
                <h3>{title}</h3>
                {links.map(([name, path]) => (
                  <button key={name} onClick={() => go(path)}>
                    {name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="footer-bottom">
          <div className="container">
            <span>© 2026 GST Practice Portal</span>
            <strong>For educational purposes only.</strong>
            <span>Best viewed at 1024 × 768 resolution or above</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [token, setToken] = useState(
    () => localStorage.getItem("gstPortalToken") || "",
  );
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [intended, setIntended] = useState("dashboard");
  const user = portal?.user,
    active = portal?.activeCase,
    w = active?.state.workspace,
    p = w?.periods[w.period];
  async function api(
    path,
    body,
    authToken = token,
    { background = false } = {},
  ) {
    if (!background) setPending((value) => value + 1);
    try {
      const res = await fetch(API_BASE + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(await networkHeaders()),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res
        .json()
        .catch(() => ({ message: "The server returned an invalid response." }));
      if (!res.ok) {
        if (data.code === "NETWORK_ACCESS_REQUIRED") window.location.reload();
        if (
          authToken &&
          authToken === localStorage.getItem("gstPortalToken") &&
          ["ACCOUNT_DISABLED", "SESSION_REVOKED"].includes(data.code)
        ) {
          localStorage.removeItem("gstPortalToken");
          setToken("");
          setPortal(null);
          window.location.hash = "/login";
        }
        throw new Error(data.message || "Unable to complete the request.");
      }
      return data;
    } finally {
      if (!background) setPending((value) => Math.max(0, value - 1));
    }
  }
  async function load(authToken = token) {
    const data = await api("/portal", undefined, authToken);
    setPortal(data);
    return data;
  }
  function go(path) {
    setError("");
    if (path === "login" && route.startsWith("registration"))
      setIntended("registration");
    if (!user && !publicRoutes.includes(path.split("/")[0])) {
      setIntended(path);
      path = "login";
    }
    window.location.hash = "/" + encodeURI(path);
  }
  useEffect(() => {
    const update = () => {
      setRoute(currentRoute());
      setError("");
      setNotice("");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let alive = true;
    api("/portal")
      .then((data) => {
        if (alive) setPortal(data);
      })
      .catch(() => {
        if (alive) {
          localStorage.removeItem("gstPortalToken");
          setToken("");
          setPortal(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  useEffect(() => {
    if (!token) return;
    // Idle pages discover access revocation within a minute; every API request checks it immediately.
    const timer = setInterval(
      () =>
        api("/auth/me", undefined, token, { background: true }).catch(() => {}),
      60000,
    );
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (error || notice)
      document
        .querySelector(".message")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error, notice]);
  async function login(email, password) {
    const data = await api("/auth/login", { email, password });
    await load(data.token);
    localStorage.setItem("gstPortalToken", data.token);
    setToken(data.token);
    const destination = publicRoutes.includes(route.split("/")[0])
      ? intended
      : route;
    window.location.hash = "/" + destination;
  }
  function acceptSession(value) {
    localStorage.setItem("gstPortalToken", value);
    setToken(value);
  }
  function logout() {
    setIntended("dashboard");
    localStorage.removeItem("gstPortalToken");
    setToken("");
    setPortal(null);
    window.location.hash = "/home";
  }
  async function mutate(path, body = {}) {
    setError("");
    const result = await api("/workspace/" + path, {
      period: w.period,
      ...body,
    });
    if (result.state)
      setPortal((old) => ({
        ...old,
        activeCase: { ...old.activeCase, state: result.state },
      }));
    if (path.startsWith("registration/")) await load();
    setNotice(result.message || "Details saved successfully.");
    return result;
  }
  async function selectCase(slug) {
    await api(`/portal/cases/${slug}/activate`, {});
    await load();
    go("dashboard");
  }
  const ctx = {
    route,
    token,
    loading,
    pending,
    portal,
    user,
    active,
    w,
    p,
    api,
    load,
    go,
    login,
    acceptSession,
    logout,
    mutate,
    selectCase,
    error,
    setError,
    setNotice,
  };
  const parts = route.split("/");
  let content;
  if (loading) content = <PageSkeleton />;
  else if (!user && !publicRoutes.includes(parts[0])) content = <Login />;
  else if (
    user?.registrationRequired &&
    ![
      "home",
      "dashboard",
      "login",
      "registration",
      "track",
      "profile",
      "business",
      "access",
      "help",
      "news",
      "contact",
      "about",
      "policies",
    ].includes(parts[0])
  )
    content = (
      <div className="container page-space">
        <Panel title="Complete your registration">
          <p>Register a business to open its returns, documents and ledgers.</p>
          <Btn onClick={() => go("registration")}>NEW REGISTRATION</Btn>
        </Panel>
      </div>
    );
  else if (parts[0] === "home") content = <Home />;
  else if (parts[0] === "login") content = <Login />;
  else if (parts[0] === "registration")
    content = <Registration key={`${user?.id}:${active?.slug}`} />;
  else if (parts[0] === "track") content = <TrackApplication />;
  else if (parts[0] === "dashboard") content = <Dashboard />;
  else if (parts[0] === "business")
    content = user.role === "instructor" ? <Cases /> : <MyProfile />;
  else if (parts[0] === "access") content = <UserAccess />;
  else if (parts[0] === "returns") content = <ReturnsDashboard />;
  else if (parts[0] === "gstr1")
    content =
      parts[1] === "NIL" ? (
        <NilSupplies key={w.period} />
      ) : parts[1] ? (
        <Gstr1Section key={parts[1] + w.period} section={parts[1]} />
      ) : (
        <Gstr1 />
      );
  else if (parts[0] === "offline") content = <OfflineReturn />;
  else if (parts[0] === "offline3b") content = <OfflineReturn type="GSTR-3B" />;
  else if (parts[0] === "supplier-data")
    content = <PurchaseData key={w.period} />;
  else if (parts[0] === "gstr2a" || parts[0] === "gstr2b")
    content = <SupplierStatement key={parts[0] + w.period} type={parts[0]} />;
  else if (parts[0] === "gstr3b") content = <Gstr3b />;
  else if (parts[0] === "ledgers") content = <Ledgers />;
  else if (parts[0] === "challans") content = <Challans />;
  else if (parts[0] === "filed") content = <FiledReturns />;
  else if (parts[0] === "search")
    content = <SearchTaxpayer byPan={parts[1] === "pan"} />;
  else if (parts[0] === "eway" || parts[0] === "einvoice")
    content = <Documents key={parts[0]} kind={parts[0]} />;
  else if (parts[0] === "profile") content = <MyProfile />;
  else content = <InfoPage page={parts[0]} />;
  return (
    <PortalContext.Provider value={ctx}>
      <Shell ctx={ctx}>
        {(error || notice) && (
          <div className="container">
            <div
              className={`message ${error ? "error" : "success"}`}
              role={error ? "alert" : "status"}
            >
              {error || notice}
              <button
                aria-label="Dismiss message"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {content}
      </Shell>
    </PortalContext.Provider>
  );
}
