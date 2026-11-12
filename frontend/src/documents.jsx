import { Dropdown } from "./dropdown";
import { RateSelect } from "./rate-guide";
import { HsnSearch } from "./hsn-search";
import { EwayBrand, EwayHome } from "./eway-shell";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Btn,
  Crumbs,
  Input,
  Modal,
  Panel,
  Select,
  Table,
  STATES,
  HEADS,
  money,
  total,
  dateLabel,
  download,
  OtpResend,
  usePortal,
} from "./lib";

const ITEM = {
  name: "",
  description: "",
  hsn: "",
  quantity: 1,
  uqc: "NOS",
  unitPrice: "",
  taxable: "",
  rate: 18,
  cess: 0,
};
const MODES = ["Road", "Rail", "Air", "Ship"];
const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
      " IST"
    : "—";
function Preview({ doc, kind, onClose, intent }) {
  const { active, mutate } = usePortal();
  const [action, setAction] = useState(
      intent === "extend" && doc.status === "Active"
        ? "extend"
        : intent === "cancel" && doc.status !== "Cancelled"
          ? "cancel"
          : "",
    ),
    [reason, setReason] = useState(""),
    [remarks, setRemarks] = useState(""),
    [vehicle, setVehicle] = useState(doc.vehicle || ""),
    [qr, setQr] = useState("");
  const [mode, setMode] = useState(doc.mode || "Road"),
    [transportDocument, setTransportDocument] = useState(
      doc.transportDocument || "",
    ),
    [transportDate, setTransportDate] = useState(doc.transportDate || "");
  const [extension, setExtension] = useState({
    remainingDistance: "",
    consignmentStatus: "In Movement",
    transitType: "",
    currentPlace: "",
    currentPincode: "",
    currentState: "",
  });
  const eway = kind === "eway";
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(
      JSON.stringify(
        eway
          ? { ewb: doc.number, document: doc.invoice.number }
          : {
              irn: doc.irn,
              ack: doc.acknowledgement,
              gstin: active.state.taxpayer.gstin,
            },
      ),
      { width: 160, margin: 1 },
    ).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [doc.id]);
  return (
    <Modal
      title={eway ? "e-Way Bill Details" : "e-Invoice Details"}
      wide
      onClose={onClose}
    >
      <div className="print-sheet">
        <h2>{eway ? "e-Way Bill" : "Invoice Registration"}</h2>
        <dl className="details-list">
          {[
            [
              eway ? "e-Way Bill No." : "Acknowledgement No.",
              eway ? doc.number : doc.acknowledgement,
            ],
            ...(!eway ? [["IRN", doc.irn]] : []),
            ["Generated On", dateTime(doc.issuedAt || doc.createdAt)],
            ["Document No.", doc.invoice.number],
            ["Document Date", dateLabel(doc.invoice.date)],
            [
              "Supplier GSTIN",
              doc.seller?.gstin || active.state.taxpayer.gstin,
            ],
            ["Recipient GSTIN", doc.invoice.gstin || "URP"],
            ["Recipient Name", doc.invoice.recipient],
            ["Status", doc.status],
            ...(eway
              ? [
                  ["Vehicle", doc.vehicle],
                  ["Mode", doc.mode],
                  ["Approximate Distance", `${doc.distance || 0} KM`],
                  ["Valid Until", dateTime(doc.validUntil)],
                  ["Transport Document", doc.transportDocument],
                  ["Transport Document Date", dateLabel(doc.transportDate)],
                  [
                    "Dispatch / Destination",
                    `${doc.dispatch || doc.seller?.address || ""} → ${doc.destination || doc.buyer?.address || ""}`,
                  ],
                ]
              : []),
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="break-all">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        {qr && (
          <img
            className="qr-preview"
            src={qr}
            alt={eway ? "E-way bill details QR code" : "IRN details QR code"}
          />
        )}
        <Table
          columns={[
            "Item",
            "HSN",
            "Qty",
            "Unit",
            "Taxable Value",
            ...HEADS.map((h) => h.toUpperCase()),
          ]}
          count={doc.items?.length || 0}
        >
          {(doc.items || []).map((i, n) => (
            <tr key={n}>
              <td>{i.name}</td>
              <td>{i.hsn}</td>
              <td>{i.quantity}</td>
              <td>{i.uqc}</td>
              <td>{money(i.taxable)}</td>
              {HEADS.map((h) => (
                <td key={h}>{money(i.taxes[h])}</td>
              ))}
            </tr>
          ))}
        </Table>
        <p>
          Total Taxable Value: ₹ {money(doc.invoice.taxable)} · Total Invoice
          Value: ₹ {money(doc.invoice.invoiceValue)}
        </p>
        {!!doc.extensions?.length && (
          <section>
            <h3>Validity Extension History</h3>
            <Table
              columns={[
                "Extended On (IST)",
                "Reason",
                "Current Place",
                "Remaining KM",
                "Valid Until (IST)",
              ]}
            >
              {doc.extensions.map((record, index) => (
                <tr key={index}>
                  <td>{dateTime(record.at)}</td>
                  <td>
                    {record.reason} — {record.remarks}
                  </td>
                  <td>{record.currentPlace}</td>
                  <td>{record.remainingDistance}</td>
                  <td>{dateTime(record.validUntil)}</td>
                </tr>
              ))}
            </Table>
          </section>
        )}
        {doc.status === "Cancelled" && (
          <p>
            Reason: {doc.reason} · Remarks: {doc.remarks}
          </p>
        )}
      </div>
      {action === "extend" && (
        <Panel title="Extend Validity">
          <p>
            Only the current transporter can extend validity within eight hours
            before or after expiry. Invoice and tax values stay with the
            original document.
          </p>
          <div className="form-grid">
            <Select
              label="Extension Reason"
              required
              value={reason}
              options={[
                "Natural Calamity",
                "Law and Order",
                "Accident",
                "Transshipment",
                "Others",
              ]}
              onChange={(e) => setReason(e.target.value)}
            />
            <Input
              label="Remarks"
              required
              value={remarks}
              maxLength={500}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <Select
              label="Consignment Status"
              required
              value={extension.consignmentStatus}
              options={["In Movement", "In Transit"]}
              onChange={(e) =>
                setExtension({
                  ...extension,
                  consignmentStatus: e.target.value,
                })
              }
            />
            {extension.consignmentStatus === "In Transit" && (
              <Select
                label="Transit Type"
                required
                value={extension.transitType}
                options={["On Road", "Warehouse", "Others"]}
                onChange={(e) =>
                  setExtension({ ...extension, transitType: e.target.value })
                }
              />
            )}
            <Input
              label="Current Place / Address"
              required
              value={extension.currentPlace}
              onChange={(e) =>
                setExtension({ ...extension, currentPlace: e.target.value })
              }
            />
            <Input
              label="Current PIN Code"
              required
              value={extension.currentPincode}
              maxLength={6}
              onChange={(e) =>
                setExtension({ ...extension, currentPincode: e.target.value })
              }
            />
            <Select
              label="Current State / UT"
              required
              value={extension.currentState}
              options={STATES.filter(
                (state) => !["Other State", "Outside India"].includes(state),
              )}
              onChange={(e) =>
                setExtension({ ...extension, currentState: e.target.value })
              }
            />
            <Input
              label="Approximate Remaining Distance (KM)"
              type="number"
              required
              min={1}
              max={4000}
              value={extension.remainingDistance}
              onChange={(e) =>
                setExtension({
                  ...extension,
                  remainingDistance: e.target.value,
                })
              }
            />
          </div>
        </Panel>
      )}
      {action === "cancel" && (
        <div className="form-grid">
          <Select
            label="Cancel Reason"
            required
            value={reason}
            options={[
              "Duplicate",
              "Order Cancelled",
              "Data Entry Mistake",
              "Others",
            ]}
            onChange={(e) => setReason(e.target.value)}
          />
          <Input
            label="Remarks"
            required
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      )}
      {["vehicle", "extend"].includes(action) && (
        <div className="form-grid">
          {(doc.status === "Part A" || action === "extend") && (
            <>
              <Select
                label="Mode"
                value={mode}
                options={MODES}
                onChange={(e) => setMode(e.target.value)}
              />
              <Input
                label="Transport Document Number"
                value={transportDocument}
                onChange={(e) => setTransportDocument(e.target.value)}
              />
              <Input
                label="Transport Document Date"
                type="date"
                value={transportDate}
                onChange={(e) => setTransportDate(e.target.value)}
              />
            </>
          )}
          <Input
            label="New Vehicle Number"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value.toUpperCase())}
          />
        </div>
      )}
      <div className="actions">
        <Btn tone="secondary" onClick={() => window.print()}>
          PRINT / SAVE AS PDF
        </Btn>
        <Btn
          tone="secondary"
          onClick={() =>
            download(`${eway ? doc.number : doc.acknowledgement}.json`, doc)
          }
        >
          DOWNLOAD JSON
        </Btn>
        {doc.status !== "Cancelled" && !action && (
          <>
            {eway && (
              <Btn tone="secondary" onClick={() => setAction("vehicle")}>
                {doc.status === "Part A" ? "UPDATE PART B" : "UPDATE VEHICLE"}
              </Btn>
            )}
            {eway && doc.status === "Active" && (
              <Btn tone="secondary" onClick={() => setAction("extend")}>
                EXTEND VALIDITY
              </Btn>
            )}
            <Btn tone="danger" onClick={() => setAction("cancel")}>
              CANCEL {eway ? "EWB" : "IRN"}
            </Btn>
          </>
        )}
        {action && (
          <Btn
            onClick={async () => {
              if (action === "cancel" && !remarks.trim())
                throw Error("Enter cancellation remarks.");
              await mutate("documents/update", {
                kind,
                id: doc.id,
                action,
                reason,
                remarks,
                vehicle,
                mode,
                transportDocument,
                transportDate,
                ...(action === "extend" ? extension : {}),
              });
              onClose();
            }}
          >
            SUBMIT
          </Btn>
        )}
        <Btn tone="secondary" onClick={onClose}>
          EXIT
        </Btn>
      </div>
    </Modal>
  );
}

export function Documents({ kind }) {
  const { active, p, w, user, mutate, api, setError } = usePortal();
  const taxpayer = active.state.taxpayer,
    eway = kind === "eway",
    title = eway ? "e-Way Bill System" : "e-Invoice System";
  const account = w.documentPortals?.[kind],
    logged = account?.sessionUntil > Date.now();
  const empty = () => ({
    number: "",
    date: `${w.period}-01`,
    supplyType: "Outward",
    subType: "Supply",
    documentType: "Tax Invoice",
    transactionType: "Regular",
    seller: {
      gstin: taxpayer.gstin,
      name: taxpayer.legalName,
      address: taxpayer.address || "",
      city: "",
      pincode: "",
      state: taxpayer.state,
    },
    buyer: {
      gstin: "",
      name: "",
      address: "",
      city: "",
      pincode: "",
      state: "",
    },
    place: "",
    dispatch: "",
    destination: "",
    distance: "",
    vehicle: "",
    vehicleType: "Regular",
    transporter: "",
    transporterId: "",
    otherValue: 0,
    mode: "Road",
    transportDocument: "",
    transportDate: "",
    items: [{ ...ITEM }],
  });
  const [page, setPage] = useState(logged ? "list" : eway ? "home" : "login"),
    [selected, setSelected] = useState(null),
    [form, setForm] = useState(empty),
    [file, setFile] = useState(null),
    [report, setReport] = useState(null);
  const [username, setUsername] = useState(user.email),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [otp, setOtp] = useState(""),
    [challenge, setChallenge] = useState(null),
    [gstin, setGstin] = useState(taxpayer.gstin);
  const [lookup, setLookup] = useState(""),
    [lookupType, setLookupType] = useState(eway ? "number" : "acknowledgement"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [working, setWorking] = useState(w.documentDate || "");
  const [workingTime, setWorkingTime] = useState(w.documentTime || "12:00");
  useEffect(() => {
    setWorking(w.documentDate || "");
    setWorkingTime(w.documentTime || "12:00");
  }, [w.documentDate, w.documentTime]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const navigate = (next) => {
    setPage(next);
    setDrawer(false);
  };
  const [captcha, setCaptcha] = useState(null),
    [captchaCode, setCaptchaCode] = useState("");
  const refreshCaptcha = async () => {
    const result = await api("/workspace/documents/captcha", {
      kind,
      period: w.period,
    });
    setCaptcha(result.captcha);
    setCaptchaCode("");
  };
  useEffect(() => {
    if (eway && !logged && page === "login")
      refreshCaptcha().catch((e) => setError(e.message));
  }, [kind, logged, page]);
  const set = (k, v) => setForm((old) => ({ ...old, [k]: v }));
  const setParty = (party, k, v) =>
    setForm((old) => ({ ...old, [party]: { ...old[party], [k]: v } }));
  const setItem = (i, k, v) =>
    setForm((old) => ({
      ...old,
      items: old.items.map((row, n) => (n === i ? { ...row, [k]: v } : row)),
    }));
  const docs = w.documents[kind].filter(
    (d) =>
      (!from || (d.issuedAt || d.createdAt).slice(0, 10) >= from) &&
      (!to || (d.issuedAt || d.createdAt).slice(0, 10) <= to),
  );
  const subtotal = form.items.reduce(
    (n, i) =>
      n +
      Number(
        i.taxable !== "" ? i.taxable : Number(i.quantity) * Number(i.unitPrice),
      ),
    0,
  );
  const tax = form.items.reduce(
    (n, i) =>
      n +
      (Number(
        i.taxable !== "" ? i.taxable : Number(i.quantity) * Number(i.unitPrice),
      ) *
        Number(i.rate)) /
        100 +
      Number(i.cess || 0),
    0,
  );
  async function sendOtp() {
    const result = await mutate("documents/registration-otp", { kind, gstin });
    setChallenge(result.otp);
    setOtp("");
  }
  function sample() {
    return {
      ...empty(),
      number: "BE-1000",
      seller: {
        ...empty().seller,
        address: "Nasik",
        city: "Nasik",
        pincode: "422001",
      },
      buyer: {
        gstin: "27ASHKT9687G1ZC",
        name: "Example Buyer",
        address: "Pune",
        city: "Pune",
        pincode: "411028",
        state: "Maharashtra",
      },
      place: "Maharashtra",
      dispatch: "Nasik",
      destination: "Pune",
      vehicle: "MH15BN1019",
      distance: 200,
      items: [
        {
          ...ITEM,
          name: "Washing Machine",
          hsn: "8450",
          quantity: 4,
          unitPrice: 40000,
          taxable: 160000,
        },
      ],
    };
  }
  if (eway && !logged && !["login", "register"].includes(page))
    return (
      <EwayHome
        onLogin={() => setPage("login")}
        onRegister={() => setPage("register")}
      />
    );
  return (
    <div
      className={`container document-portal ${eway ? "eway-portal" : ""} ${eway && !logged && page !== "register" ? "eway-login" : ""}`}
    >
      {eway && <EwayBrand onHome={() => setPage(logged ? "list" : "home")} />}
      {eway && (
        <nav className="eway-public-nav">
          <button onClick={() => navigate(logged ? "list" : "home")}>
            Home
          </button>
          <button onClick={() => navigate("register")}>Registration</button>
          <button onClick={() => navigate(logged ? "bulk" : "login")}>
            Forms / Bulk Upload
          </button>
          <button onClick={() => navigate(logged ? "cancel" : "login")}>
            Search / Cancel
          </button>
          <button onClick={() => navigate("login")}>Login</button>
        </nav>
      )}
      <Crumbs items={["Services", title]} />
      <header className="document-header">
        <div>
          <h1>{title}</h1>
          <span>
            {taxpayer.legalName} · GSTIN: {taxpayer.gstin}
          </span>
        </div>
        <span>{eway ? "Movement of Goods" : "Invoice Registration"}</span>
      </header>
      {!logged ? (
        <div className="portal-login">
          {eway && page !== "register" && (
            <img
              className="eway-login-emblem"
              src="/eway-emblem.png"
              alt="National Emblem of India"
            />
          )}
          <div className="tabs">
            <button
              className={page !== "register" ? "active" : ""}
              onClick={() => setPage("login")}
            >
              LOGIN
            </button>
            <button
              className={page === "register" ? "active" : ""}
              onClick={() => setPage("register")}
            >
              REGISTRATION
            </button>
          </div>
          {page === "register" ? (
            <Panel title={`${eway ? "e-Way Bill" : "e-Invoice"} Registration`}>
              <Input
                label="GSTIN"
                required
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
              <p>Legal Name: {taxpayer.legalName}</p>
              <p>Registered Email: {user.email}</p>
              <div className="actions">
                <Btn onClick={sendOtp}>SEND OTP</Btn>
              </div>
              {challenge && (
                <>
                  <Input
                    label="OTP"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <OtpResend delivery={challenge} onResend={sendOtp} />
                  <Input label="Username" value={user.email} readOnly />
                  <Input
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Input
                    label="Confirm Password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <div className="actions">
                    <Btn
                      onClick={async () => {
                        if (password !== confirm)
                          throw Error("Passwords do not match.");
                        await mutate("documents/register", {
                          kind,
                          challengeId: challenge.challengeId,
                          otp,
                          password,
                        });
                        setPage("login");
                        setPassword("");
                        setChallenge(null);
                      }}
                    >
                      SUBMIT
                    </Btn>
                  </div>
                </>
              )}
            </Panel>
          ) : (
            <Panel title={`${title} Login`}>
              <Input
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {eway && (
                <div className="eway-captcha">
                  <div>
                    {captcha && (
                      <img
                        src={captcha.image}
                        alt="CAPTCHA verification image"
                      />
                    )}
                    <Btn tone="secondary" onClick={refreshCaptcha}>
                      ↻ REFRESH
                    </Btn>
                  </div>
                  <Input
                    label="Enter Captcha"
                    required
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                  />
                </div>
              )}
              <div className="actions">
                <Btn
                  onClick={async () => {
                    await mutate("documents/login", {
                      kind,
                      username,
                      password,
                      captchaId: captcha?.id,
                      captcha: captchaCode,
                    });
                    setPassword("");
                    setPage("list");
                  }}
                >
                  LOGIN
                </Btn>
                <Btn tone="secondary" onClick={() => setPage("register")}>
                  {account ? "RESET PORTAL PASSWORD" : "NEW REGISTRATION"}
                </Btn>
              </div>
            </Panel>
          )}
        </div>
      ) : (
        <>
          <div className="eway-working-date">
            <Input
              label="Working Date"
              type="date"
              value={working}
              onChange={(e) => setWorking(e.target.value)}
            />
            <Input
              label="Working Time (IST)"
              type="time"
              value={workingTime}
              onChange={(e) => setWorkingTime(e.target.value)}
            />
            <Btn
              tone="secondary"
              onClick={() =>
                mutate("documents/date", { date: working, time: workingTime })
              }
            >
              SET DATE
            </Btn>
            {eway && (
              <button
                className="eway-menu-toggle"
                aria-expanded={drawer}
                onClick={() => setDrawer(!drawer)}
              >
                ☰ e-Waybill Menu
              </button>
            )}
          </div>
          {eway && drawer && (
            <button
              className="eway-mobile-backdrop"
              aria-label="Close e-waybill menu"
              onClick={() => setDrawer(false)}
            />
          )}
          <div className="document-layout">
            <aside
              className={eway ? `eway-portal-menu ${drawer ? "open" : ""}` : ""}
              role={drawer ? "dialog" : undefined}
              aria-modal={drawer ? true : undefined}
              aria-label="e-Waybill navigation"
            >
              {[
                ["list", eway ? "EWBs Generated by Me" : "Generations"],
                ["generate", eway ? "Generate New" : "Generate IRN"],
                ["bulk", eway ? "Generate Bulk" : "Bulk Upload"],
                ["cancel", "Cancel"],
                ...(eway ? [["extend", "Extend Validity"]] : []),
              ].map(([k, n]) => (
                <button
                  key={k}
                  className={page === k ? "active" : ""}
                  onClick={() => navigate(k)}
                >
                  {n}
                  <span>›</span>
                </button>
              ))}
              <button onClick={() => mutate("documents/logout", { kind })}>
                Logout
              </button>
            </aside>
            <div>
              {page === "list" && (
                <Panel
                  title={
                    eway
                      ? "e-Way Bills Generated by Me"
                      : "e-Invoices Generated by Me"
                  }
                  extra={
                    <Btn onClick={() => setPage("generate")}>GENERATE NEW</Btn>
                  }
                >
                  <div className="filter-row">
                    <Input
                      label="From Date"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                    <Input
                      label="To Date"
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                  <Table
                    columns={[
                      eway ? "EWB Number" : "Acknowledgement No.",
                      "Document Number",
                      "Generated On",
                      "Invoice Value",
                      "Status",
                      "Action",
                    ]}
                    count={docs.length}
                  >
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td>{eway ? d.number : d.acknowledgement}</td>
                        <td>{d.invoice.number}</td>
                        <td>{dateLabel(d.issuedAt || d.createdAt)}</td>
                        <td>{money(d.invoice.invoiceValue)}</td>
                        <td>{d.status}</td>
                        <td>
                          <button
                            className="link"
                            onClick={() => setSelected(d)}
                          >
                            VIEW
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Panel>
              )}
              {["cancel", "extend"].includes(page) && (
                <Panel
                  title={
                    page === "extend"
                      ? "Extend e-Way Bill Validity"
                      : eway
                        ? "Cancel e-Way Bill"
                        : "Cancel e-Invoice"
                  }
                >
                  <div className="form-grid">
                    {!eway && (
                      <Select
                        label="Search By"
                        value={lookupType}
                        options={[
                          ["acknowledgement", "Ack No."],
                          ["irn", "IRN"],
                        ]}
                        onChange={(e) => setLookupType(e.target.value)}
                      />
                    )}
                    <Input
                      label={
                        eway
                          ? "e-Way Bill No."
                          : lookupType === "irn"
                            ? "IRN"
                            : "Acknowledgement Number"
                      }
                      value={lookup}
                      onChange={(e) => setLookup(e.target.value)}
                    />
                  </div>
                  <Btn
                    onClick={() => {
                      const found = w.documents[kind].find(
                        (d) => d[lookupType] === lookup.trim(),
                      );
                      if (!found) throw Error("No matching document found.");
                      setSelected(found);
                    }}
                  >
                    GO
                  </Btn>
                </Panel>
              )}
              {page === "bulk" && (
                <>
                  <Panel
                    title={
                      eway ? "Generate Bulk e-Way Bills" : "Invoice Bulk Upload"
                    }
                  >
                    <Input
                      label="Select JSON file"
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => setFile(e.target.files[0])}
                    />
                    <div className="actions">
                      <Btn
                        tone="secondary"
                        onClick={() =>
                          download(`${kind}-bulk-template.json`, {
                            gstin: taxpayer.gstin,
                            documents: [sample()],
                          })
                        }
                      >
                        DOWNLOAD TEMPLATE
                      </Btn>
                      <Btn
                        disabled={!file}
                        onClick={async () => {
                          if (file.size > 6000000)
                            throw Error(
                              "Choose a JSON file smaller than 6 MB.",
                            );
                          const result = await mutate("documents/bulk", {
                            kind,
                            name: file.name,
                            data: await file.text(),
                          });
                          setReport(result.upload);
                        }}
                      >
                        UPLOAD
                      </Btn>
                    </div>
                    {report && (
                      <>
                        <p>
                          Successfully generated: {report.accepted} · Failed:{" "}
                          {report.errors.length}
                        </p>
                        {Boolean(report.errors.length) && (
                          <Btn
                            tone="secondary"
                            onClick={() =>
                              download("bulk-errors.json", report.errors)
                            }
                          >
                            DOWNLOAD ERROR REPORT
                          </Btn>
                        )}
                        <Btn onClick={() => setPage("list")}>
                          VIEW GENERATED DOCUMENTS
                        </Btn>
                      </>
                    )}
                  </Panel>
                  <Panel title="Upload History">
                    <Table
                      columns={["File", "Date", "Generated", "Errors"]}
                      count={
                        (w.documentUploads || []).filter((u) => u.kind === kind)
                          .length
                      }
                    >
                      {(w.documentUploads || [])
                        .filter((u) => u.kind === kind)
                        .map((u) => (
                          <tr key={u.id}>
                            <td>{u.name}</td>
                            <td>{dateLabel(u.at)}</td>
                            <td>{u.accepted}</td>
                            <td>
                              <button
                                className="link"
                                onClick={() =>
                                  download("errors.json", u.errors)
                                }
                              >
                                {u.errors.length}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </Table>
                  </Panel>
                </>
              )}
              {page === "generate" && (
                <>
                  <Panel
                    title={
                      eway
                        ? "e-Waybill Entry Form"
                        : "Generate Invoice Reference Number"
                    }
                  >
                    <Select
                      label="Copy an Existing Outward Invoice (optional)"
                      value=""
                      options={p.invoices
                        .filter((i) =>
                          ["B2B", "B2CL", "EXP"].includes(i.section),
                        )
                        .map((i) => [i.id, i.number])}
                      onChange={(e) => {
                        const i = p.invoices.find(
                          (x) => x.id === e.target.value,
                        );
                        if (i)
                          setForm({
                            ...empty(),
                            number: i.number,
                            date: i.date,
                            place: i.place,
                            buyer: {
                              ...empty().buyer,
                              gstin: i.gstin || "URP",
                              name: i.recipient || "",
                              state: i.place,
                            },
                            items: [
                              {
                                ...ITEM,
                                taxable: i.taxable,
                                rate: i.rate,
                                quantity: i.quantity || 1,
                                hsn: i.hsn || "",
                              },
                            ],
                          });
                      }}
                    />
                    <div className="form-grid">
                      {eway && (
                        <>
                          <Select
                            label="Supply Type"
                            value={form.supplyType}
                            options={["Outward", "Inward"]}
                            onChange={(e) => {
                              const supplyType = e.target.value;
                              setForm((old) => ({
                                ...old,
                                supplyType,
                                subType: "Supply",
                                documentType: "Tax Invoice",
                                seller:
                                  supplyType === "Inward"
                                    ? empty().buyer
                                    : empty().seller,
                                buyer:
                                  supplyType === "Inward"
                                    ? empty().seller
                                    : empty().buyer,
                              }));
                            }}
                          />
                          <Select
                            label="Sub Type"
                            value={form.subType}
                            options={Object.keys(
                              w.ewayMasters?.mapping?.[form.supplyType] || {
                                Supply: [],
                              },
                            )}
                            onChange={(e) => {
                              const subType = e.target.value;
                              setForm((old) => ({
                                ...old,
                                subType,
                                documentType:
                                  w.ewayMasters?.mapping?.[old.supplyType]?.[
                                    subType
                                  ]?.[0] || "Tax Invoice",
                              }));
                            }}
                          />
                          <Select
                            label="Transaction Type"
                            value={form.transactionType}
                            options={[
                              "Regular",
                              "Bill To — Ship To",
                              "Bill From — Dispatch From",
                              "Combination",
                            ]}
                            onChange={(e) =>
                              set("transactionType", e.target.value)
                            }
                          />
                        </>
                      )}
                      <Select
                        label="Document Type"
                        value={form.documentType}
                        options={
                          eway
                            ? w.ewayMasters?.mapping?.[form.supplyType]?.[
                                form.subType
                              ] || ["Tax Invoice"]
                            : ["Tax Invoice", "Credit Note", "Debit Note"]
                        }
                        onChange={(e) => set("documentType", e.target.value)}
                      />
                      <Input
                        label="Document Number"
                        required
                        value={form.number}
                        onChange={(e) => set("number", e.target.value)}
                      />
                      <Input
                        label="Document Date"
                        required
                        type="date"
                        value={form.date}
                        onChange={(e) => set("date", e.target.value)}
                      />
                    </div>
                  </Panel>
                  {["seller", "buyer"].map((party) => (
                    <Panel
                      key={party}
                      title={
                        party === "seller"
                          ? "Bill From / Dispatch From"
                          : "Bill To / Ship To"
                      }
                    >
                      <div className="form-grid">
                        {[
                          ["gstin", "GSTIN"],
                          ["name", "Legal / Trade Name"],
                          ["address", "Address"],
                          ["city", "Place / City"],
                          ["pincode", "PIN Code"],
                        ].map(([k, l]) => (
                          <Input
                            key={k}
                            label={l}
                            required
                            value={form[party][k]}
                            readOnly={
                              k === "gstin" &&
                              party ===
                                (form.supplyType === "Inward"
                                  ? "buyer"
                                  : "seller")
                            }
                            onChange={(e) => setParty(party, k, e.target.value)}
                          />
                        ))}
                        <Select
                          label="State"
                          required
                          value={form[party].state}
                          options={STATES}
                          onChange={(e) => {
                            setParty(party, "state", e.target.value);
                            if (party === "buyer") set("place", e.target.value);
                          }}
                        />
                      </div>
                      {eway && (
                        <Input
                          label={
                            party === "seller"
                              ? "Dispatch From Address (if different)"
                              : "Ship To Address (if different)"
                          }
                          value={
                            party === "seller"
                              ? form.dispatch
                              : form.destination
                          }
                          onChange={(e) =>
                            set(
                              party === "seller" ? "dispatch" : "destination",
                              e.target.value,
                            )
                          }
                        />
                      )}
                    </Panel>
                  ))}
                  {eway &&
                    [
                      [
                        "dispatchDetails",
                        "Dispatch From Details",
                        ["Bill From — Dispatch From", "Combination"],
                      ],
                      [
                        "shipDetails",
                        "Ship To Details",
                        ["Bill To — Ship To", "Combination"],
                      ],
                    ]
                      .filter(([, , types]) =>
                        types.includes(form.transactionType),
                      )
                      .map(([key, label]) => (
                        <Panel key={key} title={label}>
                          <div className="form-grid">
                            {[
                              ["address", "Address"],
                              ["city", "Place / City"],
                              ["pincode", "PIN Code"],
                            ].map(([field, label]) => (
                              <Input
                                key={field}
                                label={label}
                                required
                                value={form[key]?.[field] || ""}
                                onChange={(e) =>
                                  set(key, {
                                    ...form[key],
                                    [field]: e.target.value,
                                  })
                                }
                              />
                            ))}
                            <Select
                              label="Actual State"
                              options={STATES}
                              value={form[key]?.state || ""}
                              onChange={(e) =>
                                set(key, {
                                  ...form[key],
                                  state: e.target.value,
                                })
                              }
                            />
                          </div>
                        </Panel>
                      ))}
                  <Panel title="Item Details">
                    <Select
                      label="Add Product from My Master"
                      options={(w.masters?.products || []).map((product) => [
                        product.id,
                        product.name,
                      ])}
                      value=""
                      onChange={(e) => {
                        const product = w.masters.products.find(
                          (product) => product.id === e.target.value,
                        );
                        if (!product) return;
                        const item = {
                          ...ITEM,
                          name: product.name,
                          description: product.description,
                          hsn: product.hsn,
                          uqc: product.uqc,
                          rate: product.rate,
                        };
                        set(
                          "items",
                          form.items.length === 1 && !form.items[0].name
                            ? [item]
                            : [...form.items, item],
                        );
                      }}
                    />
                    <Select
                      label="Place of Supply"
                      required
                      value={form.place}
                      options={STATES}
                      onChange={(e) => set("place", e.target.value)}
                    />
                    <div className="table-scroll">
                      <table className="editable-table">
                        <thead>
                          <tr>
                            {[
                              "Product Name",
                              "Description",
                              "HSN",
                              "Quantity",
                              "Unit",
                              "Unit Price",
                              "Taxable Value",
                              "GST Rate (%)",
                              "Cess",
                              "Action",
                            ].map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((i, n) => (
                            <tr key={n}>
                              {[
                                ["name", "text"],
                                ["description", "text"],
                                ["hsn", "text"],
                                ["quantity", "number"],
                              ].map(([k, t]) => (
                                <td key={k}>
                                  {k === "hsn" ? (
                                    <HsnSearch
                                      compact
                                      required
                                      ariaLabel={`Item ${n + 1} hsn`}
                                      value={i.hsn}
                                      type={eway ? "Goods" : ""}
                                      onChange={(value) =>
                                        setItem(n, "hsn", value)
                                      }
                                      onSelect={(record) =>
                                        setForm((old) => ({
                                          ...old,
                                          items: old.items.map((row, index) =>
                                            index === n
                                              ? {
                                                  ...row,
                                                  hsn: record.code,
                                                  description:
                                                    record.description,
                                                  name:
                                                    row.name ||
                                                    record.description,
                                                }
                                              : row,
                                          ),
                                        }))
                                      }
                                    />
                                  ) : (
                                    <input
                                      aria-label={`Item ${n + 1} ${k}`}
                                      type={t}
                                      min="0"
                                      value={i[k]}
                                      onChange={(e) =>
                                        setItem(n, k, e.target.value)
                                      }
                                    />
                                  )}
                                </td>
                              ))}
                              <td>
                                <Dropdown
                                  aria-label="Unit"
                                  value={i.uqc}
                                  onChange={(e) =>
                                    setItem(n, "uqc", e.target.value)
                                  }
                                  options={
                                    eway
                                      ? w.ewayMasters?.units || [
                                          "NOS",
                                          "PCS",
                                          "KGS",
                                          "MTR",
                                          "LTR",
                                          "OTH",
                                        ]
                                      : [
                                          "NOS",
                                          "PCS",
                                          "KGS",
                                          "MTR",
                                          "LTR",
                                          "OTH",
                                        ]
                                  }
                                />
                              </td>
                              {["unitPrice", "taxable"].map((k) => (
                                <td key={k}>
                                  <input
                                    aria-label={`Item ${n + 1} ${k}`}
                                    type="number"
                                    min="0"
                                    value={i[k]}
                                    placeholder={
                                      k === "taxable"
                                        ? String(
                                            Number(i.unitPrice) *
                                              Number(i.quantity),
                                          )
                                        : undefined
                                    }
                                    onChange={(e) =>
                                      setItem(n, k, e.target.value)
                                    }
                                  />
                                </td>
                              ))}
                              <td>
                                <RateSelect
                                  compact
                                  portal
                                  aria-label="GST Rate"
                                  value={i.rate}
                                  date={form.date}
                                  onChange={(e) =>
                                    setItem(n, "rate", e.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  aria-label="Cess"
                                  type="number"
                                  min="0"
                                  value={i.cess}
                                  onChange={(e) =>
                                    setItem(n, "cess", e.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  className="link"
                                  disabled={form.items.length === 1}
                                  onClick={() =>
                                    set(
                                      "items",
                                      form.items.filter((_, j) => j !== n),
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions">
                      <Btn
                        tone="secondary"
                        onClick={() =>
                          set("items", [...form.items, { ...ITEM }])
                        }
                      >
                        + ADD ITEM
                      </Btn>
                    </div>
                    <div className="form-grid">
                      <Input
                        label="Other Charges (+ / −)"
                        type="number"
                        value={form.otherValue}
                        onChange={(e) => set("otherValue", e.target.value)}
                      />
                      {form.subType === "Others" && (
                        <Input
                          label="Other Sub Supply Description"
                          value={form.subSupplyDesc || ""}
                          onChange={(e) => set("subSupplyDesc", e.target.value)}
                        />
                      )}
                    </div>
                    <div className="item-totals">
                      <span>
                        Taxable Value: <b>₹ {money(subtotal)}</b>
                      </span>
                      <span>
                        Total Tax: <b>₹ {money(tax)}</b>
                      </span>
                      <span>
                        Invoice Value:{" "}
                        <b>
                          ₹{" "}
                          {money(subtotal + tax + Number(form.otherValue || 0))}
                        </b>
                      </span>
                    </div>
                  </Panel>
                  {eway && (
                    <Panel title="Transportation Details — Part B">
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={!!form.partAOnly}
                          onChange={(e) => {
                            set("partAOnly", e.target.checked);
                            if (e.target.checked) {
                              set("mode", "");
                              set("vehicle", "");
                              set("transportDocument", "");
                            } else set("mode", "Road");
                          }}
                        />{" "}
                        Generate Part A slip (transport details to follow)
                      </label>
                      <div className="form-grid">
                        <Input
                          label="Transporter Name"
                          value={form.transporter}
                          onChange={(e) => set("transporter", e.target.value)}
                        />
                        <Input
                          label="Transporter ID"
                          value={form.transporterId}
                          maxLength={15}
                          onChange={(e) =>
                            set("transporterId", e.target.value.toUpperCase())
                          }
                        />
                        <Input
                          label="Approximate Distance (KM)"
                          type="number"
                          min="0"
                          max="4000"
                          value={form.distance}
                          onChange={(e) => set("distance", e.target.value)}
                        />
                        <Select
                          label="Mode"
                          disabled={form.partAOnly}
                          value={form.mode}
                          options={MODES}
                          onChange={(e) => set("mode", e.target.value)}
                        />
                        <Select
                          label="Vehicle Type"
                          value={form.vehicleType}
                          options={["Regular", "Over Dimensional Cargo"]}
                          onChange={(e) => set("vehicleType", e.target.value)}
                        />
                        <Input
                          label="Vehicle Number"
                          disabled={form.partAOnly}
                          value={form.vehicle}
                          onChange={(e) =>
                            set("vehicle", e.target.value.toUpperCase())
                          }
                        />
                        <Input
                          label="Transporter Document Number"
                          disabled={form.partAOnly}
                          value={form.transportDocument}
                          onChange={(e) =>
                            set("transportDocument", e.target.value)
                          }
                        />
                        <Input
                          label="Transporter Document Date"
                          type="date"
                          value={form.transportDate}
                          onChange={(e) => set("transportDate", e.target.value)}
                        />
                      </div>
                    </Panel>
                  )}
                  <div className="actions">
                    <Btn tone="secondary" onClick={() => setPage("list")}>
                      BACK
                    </Btn>
                    <Btn
                      onClick={async () => {
                        const result = await mutate("documents/create", {
                          kind,
                          form,
                        });
                        setSelected(result.document);
                        setForm(empty());
                        setPage("list");
                      }}
                    >
                      SUBMIT
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {selected && (
        <Preview
          doc={selected}
          kind={kind}
          intent={page}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
