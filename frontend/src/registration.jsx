import { useState } from "react";
import {
  Btn,
  Crumbs,
  Input,
  Panel,
  REG_TABS,
  STATES,
  Select,
  Signing,
  Table,
  dateLabel,
  usePortal,
} from "./lib";

const FIELDS = {
  business: [
    ["tradeName", "Trade Name", "text", true],
    [
      "constitution",
      "Constitution of Business",
      [
        "Proprietorship",
        "Partnership",
        "Private Limited Company",
        "Public Limited Company",
        "Limited Liability Partnership",
        "Trust",
        "Society",
      ],
      true,
    ],
    [
      "reason",
      "Reason to obtain registration",
      [
        "Crossing the threshold",
        "Inter-state supply",
        "Voluntary Basis",
        "Transfer of business",
        "Change in constitution of business",
      ],
      true,
    ],
    ["commencement", "Date of commencement of Business", "date", true],
    ["liabilityDate", "Date on which liability to register arises", "date"],
    ["district", "District", "text"],
  ],
  promoters: [
    ["name", "First Name / Full Name", "text", true],
    ["fatherName", "Father's Name", "text"],
    ["dob", "Date of Birth", "date"],
    [
      "designation",
      "Designation / Status",
      ["Proprietor", "Partner", "Director", "Trustee"],
      true,
    ],
    ["pan", "Permanent Account Number (PAN)", "text", true],
    ["mobile", "Mobile Number", "tel"],
    ["email", "Email Address", "email"],
    ["address", "Residential Address", "text"],
  ],
  signatory: [
    ["name", "Name of Authorized Signatory", "text", true],
    ["designation", "Designation / Status", "text"],
    ["pan", "Permanent Account Number (PAN)", "text"],
    ["email", "Email Address", "email", true],
    ["mobile", "Mobile Number", "tel", true],
    ["address", "Residential Address", "text"],
  ],
  representative: [
    ["appointed", "Do you have an Authorized Representative?", ["No", "Yes"]],
    ["name", "Name of Representative", "text"],
    ["enrolment", "Enrolment ID", "text"],
  ],
  principal: [
    ["address", "Building No. / Flat No. / Building Name", "text", true],
    ["street", "Road / Street", "text"],
    ["locality", "Locality / Sub Locality", "text"],
    ["city", "City / Town / Village", "text", true],
    ["district", "District", "text"],
    ["pincode", "PIN Code", "text", true],
    [
      "possession",
      "Nature of possession of premises",
      ["Own", "Leased", "Rented", "Consent", "Shared", "Others"],
      true,
    ],
    [
      "activity",
      "Nature of Business Activity",
      [
        "Wholesale Business",
        "Retail Business",
        "Factory / Manufacturing",
        "Office / Sale Office",
        "Supplier of Services",
        "Warehouse / Depot",
      ],
    ],
  ],
  additional: [
    [
      "hasAdditional",
      "Do you have additional places of business?",
      ["No", "Yes"],
    ],
    ["address", "Address of Additional Place of Business", "text"],
    ["pincode", "PIN Code", "text"],
  ],
  goods: [
    ["hsn", "Search HSN / SAC", "text", true],
    ["description", "Description of Goods / Services", "text", true],
    ["type", "Type of Supply", ["Goods", "Services", "Goods and Services"]],
  ],
  state: [
    ["professionalTax", "Professional Tax Employee Code (EC) No.", "text"],
    [
      "registrationCert",
      "Professional Tax Registration Certificate (RC) No.",
      "text",
    ],
    ["stateExcise", "State Excise License No.", "text"],
  ],
  aadhaar: [
    [
      "opted",
      "Would you like to opt for Aadhaar authentication?",
      ["Yes", "No"],
    ],
    ["person", "Select person for authentication", "text"],
  ],
  verification: [
    ["signatory", "Name of Authorized Signatory", "text", true],
    ["place", "Place", "text", true],
  ],
};

export function Registration() {
  const { user, w, mutate, go, setNotice } = usePortal();
  const r = w?.registration;
  const [kind, setKind] = useState("new");
  const [a, setA] = useState(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem("gstRegistrationDraft")) ||
        r?.partA ||
        {}
      );
    } catch {
      return {};
    }
  });
  const [mobileOtp, setMobileOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [trn, setTrn] = useState("");
  const [email, setEmail] = useState("");
  const [resumeOtp, setResumeOtp] = useState(null);
  const [apps, setApps] = useState(false);
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState("business");
  const [values, setValues] = useState(r?.tabs.business || {});
  const [declaration, setDeclaration] = useState(false);
  const [signing, setSigning] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const updateA = (key, value) => {
    const next = { ...a, [key]: value };
    setA(next);
    sessionStorage.setItem("gstRegistrationDraft", JSON.stringify(next));
  };
  const start = async () => {
    if (!user) {
      setNotice("Sign in to save this registration application.");
      go("login");
      return;
    }
    await mutate("registration/start", { partA: a });
  };
  function selectTab(key) {
    setTab(key);
    setValues(r.tabs[key] || {});
  }
  if (r?.stage === "Pending for Validation")
    return (
      <div className="container">
        <Crumbs items={["Registration", "Acknowledgement"]} />
        <Panel title="Application Submitted">
          <div className="submission-success">✓</div>
          <h2 className="center">
            Your application has been submitted successfully.
          </h2>
          <dl className="details-list">
            <dt>Application Reference Number (ARN)</dt>
            <dd>{r.arn}</dd>
            <dt>Legal Name</dt>
            <dd>{r.partA.legalName}</dd>
            <dt>Submitted On</dt>
            <dd>{dateLabel(r.submittedAt)}</dd>
            <dt>Status</dt>
            <dd>Pending for Validation</dd>
          </dl>
          <div className="actions">
            <Btn tone="secondary" onClick={() => window.print()}>
              PRINT ACKNOWLEDGEMENT
            </Btn>
            <Btn onClick={() => go("track")}>TRACK APPLICATION STATUS</Btn>
          </div>
        </Panel>
      </div>
    );
  if (edit && r?.trn)
    return (
      <div className="container">
        <Crumbs items={["Registration", "New Registration"]} />
        <div className="application-heading">
          <h1>Application for Registration</h1>
          <span>
            TRN: <b>{r.trn}</b> · Status: <b>Draft</b>
          </span>
        </div>
        <div className="registration-progress">
          <span style={{ width: `${r.savedTabs.length * 10}%` }} />
        </div>
        <div className="registration-tabs">
          {REG_TABS.map(([key, title], i) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => selectTab(key)}
            >
              <span>{r.savedTabs.includes(key) ? "✓" : i + 1}</span>
              {title}
            </button>
          ))}
        </div>
        <Panel title={REG_TABS.find(([key]) => key === tab)[1]}>
          <p className="mandatory">
            <b className="required">●</b> indicates mandatory fields
          </p>
          <div className="registration-context">
            <span>
              Legal Name: <b>{r.partA.legalName}</b>
            </span>
            <span>
              PAN: <b>{r.partA.pan}</b>
            </span>
            <span>
              State: <b>{r.partA.state}</b>
            </span>
          </div>
          <div className="form-grid">
            {FIELDS[tab].map(([key, label, type, required]) =>
              Array.isArray(type) ? (
                <Select
                  key={key}
                  label={label}
                  required={required}
                  options={type}
                  value={values[key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                />
              ) : (
                <Input
                  key={key}
                  label={label}
                  required={required}
                  type={type}
                  value={values[key] || ""}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.value })
                  }
                />
              ),
            )}
          </div>
          {["promoters", "signatory", "principal"].includes(tab) && (
            <div className="document-attachment">
              <Input
                label={
                  tab === "principal"
                    ? "Proof of Principal Place of Business"
                    : "Supporting Document / Photograph"
                }
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file)
                    setValues({
                      ...values,
                      attachment: { name: file.name, size: file.size },
                    });
                }}
              />
              {values.attachment && (
                <p>
                  Attached: <b>{values.attachment.name}</b> (
                  {Math.ceil(values.attachment.size / 1024)} KB)
                </p>
              )}
            </div>
          )}
          {tab === "aadhaar" && (
            <p className="info">
              Authentication preference will be recorded with this application.
            </p>
          )}
          {tab === "verification" && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={declaration}
                onChange={(e) => setDeclaration(e.target.checked)}
              />
              I hereby solemnly affirm and declare that the information given
              herein is true and correct.
            </label>
          )}
          <div className="actions">
            <Btn
              tone="secondary"
              onClick={() => {
                setEdit(false);
                setApps(true);
              }}
            >
              BACK TO APPLICATIONS
            </Btn>
            <Btn
              onClick={async () => {
                await mutate("registration/save", { tab, values });
                const i = REG_TABS.findIndex(([key]) => key === tab);
                if (i < REG_TABS.length - 1) selectTab(REG_TABS[i + 1][0]);
              }}
            >
              SAVE & CONTINUE
            </Btn>
            {tab === "verification" && (
              <Btn
                disabled={
                  !declaration || r.savedTabs.length !== REG_TABS.length
                }
                onClick={() => setSigning(true)}
              >
                SUBMIT WITH EVC / DSC
              </Btn>
            )}
          </div>
        </Panel>
        {signing && (
          <Signing
            title="Submit Registration Application"
            onClose={() => setSigning(false)}
            onSubmit={(form) => mutate("registration/submit", form)}
          />
        )}
      </div>
    );
  if (apps && r?.trn)
    return (
      <div className="container">
        <Crumbs items={["Registration", "My Saved Applications"]} />
        <Panel title="My Saved Applications">
          <Table
            columns={[
              "Form No.",
              "Form Description",
              "Date of Creation",
              "Status",
              "Action",
            ]}
          >
            <tr>
              <td>GST REG-01</td>
              <td>Application for Registration</td>
              <td>{dateLabel(new Date())}</td>
              <td>Draft</td>
              <td>
                <Btn
                  onClick={() => {
                    setEdit(true);
                    selectTab("business");
                  }}
                >
                  EDIT ✎
                </Btn>
              </td>
            </tr>
          </Table>
        </Panel>
      </div>
    );
  return (
    <div className="container">
      <Crumbs items={["Registration"]} />
      <section className="white-page registration-page">
        <div className="stepper">
          <div className={r?.stage !== "otp" ? "active" : "done"}>
            <b>1</b>
            <span>User Credentials</span>
          </div>
          <i />
          <div
            className={r?.stage === "otp" || resumeOtp !== null ? "active" : ""}
          >
            <b>2</b>
            <span>OTP Verification</span>
          </div>
        </div>
        <div className="narrow-form">
          <h1>
            {r?.stage === "otp" || resumeOtp !== null
              ? "OTP Verification"
              : "New Registration"}
          </h1>
          <p className="mandatory">
            <b className="required">●</b> indicates mandatory fields
          </p>
          {r?.stage === "otp" && kind === "new" ? (
            <>
              <p className="info">
                Mobile OTP: <b>123456</b> · Email OTP: <b>654321</b>
              </p>
              <Input
                label="Mobile OTP"
                required
                value={mobileOtp}
                maxLength={6}
                onChange={(e) => setMobileOtp(e.target.value)}
              />
              <Input
                label="Email OTP"
                required
                value={emailOtp}
                maxLength={6}
                onChange={(e) => setEmailOtp(e.target.value)}
              />
              <button className="link" onClick={start}>
                Click here to resend the OTP
              </button>
              <div className="actions">
                <Btn
                  onClick={async () => {
                    await mutate("registration/verify", {
                      mobileOtp,
                      emailOtp,
                    });
                    sessionStorage.removeItem("gstRegistrationDraft");
                  }}
                >
                  PROCEED
                </Btn>
              </div>
            </>
          ) : r?.stage === "trn" && kind === "new" ? (
            <>
              <div className="success-note">
                You have successfully completed Part A of the registration
                process.
              </div>
              <p>
                Your Temporary Reference Number (TRN) is <b>{r.trn}</b>.
              </p>
              <p>Please use this TRN to complete Part B.</p>
              <Btn
                onClick={() => {
                  setKind("trn");
                  setTrn(r.trn);
                  setEmail(r.partA.email);
                }}
              >
                PROCEED
              </Btn>
            </>
          ) : resumeOtp !== null ? (
            <>
              <p className="info">
                Mobile / Email OTP: <b>123456</b>
              </p>
              <Input
                label="Mobile / Email OTP"
                required
                maxLength={6}
                value={resumeOtp}
                onChange={(e) => setResumeOtp(e.target.value)}
              />
              <div className="actions">
                <Btn
                  onClick={async () => {
                    await mutate("registration/resume-verify", {
                      otp: resumeOtp,
                    });
                    setResumeOtp(null);
                    setApps(true);
                  }}
                >
                  PROCEED
                </Btn>
              </div>
            </>
          ) : (
            <>
              <div className="radio-row">
                <label>
                  <input
                    type="radio"
                    name="registration-kind"
                    checked={kind === "new"}
                    onChange={() => setKind("new")}
                  />
                  New Registration
                </label>
                <label>
                  <input
                    type="radio"
                    name="registration-kind"
                    checked={kind === "trn"}
                    onChange={() => setKind("trn")}
                  />
                  Temporary Reference Number (TRN)
                </label>
              </div>
              {kind === "trn" ? (
                <>
                  <Input
                    label="Temporary Reference Number (TRN)"
                    required
                    value={trn}
                    onChange={(e) => setTrn(e.target.value)}
                  />
                  <Input
                    label="Email Address"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    label="Type the characters you see in the image below"
                    required
                    value={captcha}
                    onChange={(e) => setCaptcha(e.target.value)}
                  />
                  <div className="captcha" aria-label="CAPTCHA 729461">
                    7 2 9 4 6 1
                  </div>
                  <div className="actions">
                    <Btn
                      onClick={async () => {
                        if (!user) {
                          go("login");
                          return;
                        }
                        if (captcha.replace(/\s/g, "") !== "729461")
                          throw new Error(
                            "The characters entered do not match.",
                          );
                        await mutate("registration/resume", { trn, email });
                        setResumeOtp("");
                      }}
                    >
                      PROCEED
                    </Btn>
                  </div>
                </>
              ) : (
                <>
                  <Select
                    label="I am a"
                    required
                    value={a.type || ""}
                    onChange={(e) => updateA("type", e.target.value)}
                    options={["Taxpayer"]}
                  />
                  <Select
                    label="State/UT"
                    required
                    value={a.state || ""}
                    onChange={(e) => updateA("state", e.target.value)}
                    options={STATES.filter(
                      (s) => !["Outside India", "Other State"].includes(s),
                    )}
                  />
                  <Input
                    label="District"
                    value={a.district || ""}
                    onChange={(e) => updateA("district", e.target.value)}
                  />
                  <Input
                    label="Legal Name of the Business (As mentioned in PAN)"
                    required
                    value={a.legalName || ""}
                    placeholder="Enter Legal Name of Business"
                    onChange={(e) => updateA("legalName", e.target.value)}
                  />
                  <Input
                    label="Permanent Account Number (PAN)"
                    required
                    value={a.pan || ""}
                    placeholder="Enter Permanent Account Number (PAN)"
                    maxLength={10}
                    onChange={(e) =>
                      updateA("pan", e.target.value.toUpperCase())
                    }
                  />
                  <Input
                    label="Email Address"
                    type="email"
                    required
                    value={a.email || ""}
                    placeholder="Enter Email Address"
                    help="ⓘ OTP will be sent to this Email Address"
                    onChange={(e) => updateA("email", e.target.value)}
                  />
                  <Input
                    label="Mobile Number"
                    type="tel"
                    required
                    value={a.mobile || ""}
                    placeholder="Enter Mobile Number"
                    maxLength={10}
                    help="ⓘ Separate OTP will be sent to this mobile number"
                    onChange={(e) => updateA("mobile", e.target.value)}
                  />
                  <div className="actions">
                    <Btn onClick={start}>PROCEED</Btn>
                  </div>
                  {r?.trn && (
                    <button
                      className="link"
                      onClick={() => {
                        setKind("trn");
                        setTrn(r.trn);
                        setEmail(r.partA.email);
                      }}
                    >
                      Resume saved application using TRN
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function TrackApplication() {
  const { w, user, go } = usePortal();
  const [reference, setReference] = useState("");
  const [searched, setSearched] = useState(false);
  const r = w?.registration;
  const found = r && [r.arn, r.trn].filter(Boolean).includes(reference.trim());
  return (
    <div className="container">
      <Crumbs items={["Services", "Track Application Status"]} />
      <Panel title="Track Application Status">
        <div className="search-form">
          <Input
            label="ARN / TRN"
            required
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setSearched(false);
            }}
          />
          <Btn
            onClick={() => {
              if (!user) go("login");
              else setSearched(true);
            }}
          >
            SEARCH
          </Btn>
        </div>
        {searched &&
          (found ? (
            <Table
              columns={["Reference Number", "Form", "Legal Name", "Status"]}
            >
              <tr>
                <td>{reference}</td>
                <td>GST REG-01</td>
                <td>{r.partA.legalName}</td>
                <td>
                  {r.stage === "Pending for Validation"
                    ? "Pending for Validation"
                    : "Draft"}
                </td>
              </tr>
            </Table>
          ) : (
            <div className="info">
              No application found for this reference number.
            </div>
          ))}
      </Panel>
    </div>
  );
}
