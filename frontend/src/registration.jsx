import { useState } from "react";
import { RegistrationGoods } from "./hsn-search";
import {
  Btn,
  Crumbs,
  Input,
  OtpResend,
  Panel,
  REG_TABS,
  STATES,
  Select,
  Signing,
  Table,
  dateLabel,
  download,
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

const PERSON_FIELDS = [
  ["middleName", "Middle Name", "text"],
  ["lastName", "Last Name", "text"],
  ["gender", "Gender", ["Male", "Female", "Other"]],
  ["telephone", "Telephone Number (with STD Code)", "tel"],
  ["din", "Director Identification Number", "text"],
  ["citizen", "Are you a citizen of India?", ["Yes", "No"]],
  ["country", "Country", "text"],
  ["pincode", "PIN Code", "text"],
  ["state", "State / UT", "text"],
  ["district", "District", "text"],
  ["city", "City / Town / Village", "text"],
  ["locality", "Locality / Sub Locality", "text"],
  ["street", "Road / Street", "text"],
  ["building", "Name of Premises / Building", "text"],
  ["flat", "Building / Flat Number", "text"],
  ["floor", "Floor Number", "text"],
  ["landmark", "Nearby Landmark", "text"],
];
FIELDS.business.push(
  ["additionalTradeName", "Additional Trade Name", "text"],
  ["casual", "Are you applying as a casual taxable person?", ["No", "Yes"]],
  ["cin", "Corporate Identity Number (CIN)", "text"],
  ["registrationType", "Other Registration Type", "text"],
  ["registrationNumber", "Registration Number", "text"],
  ["registrationDate", "Date of Registration", "date"],
);
FIELDS.promoters.push(...PERSON_FIELDS, [
  "alsoSignatory",
  "Also Authorized Signatory",
  ["Yes", "No"],
]);
FIELDS.signatory.push(
  ["primary", "Primary Authorized Signatory", ["Yes", "No"]],
  ["dob", "Date of Birth", "date"],
  ["fatherName", "Father's Name", "text"],
  ...PERSON_FIELDS,
  [
    "proofType",
    "Proof of Authorized Signatory",
    [
      "Letter of Authorization",
      "Copy of resolution passed by BoD / Managing Committee",
    ],
  ],
);
FIELDS.principal.push(
  ["state", "State / UT", "text"],
  ["floor", "Floor Number", "text"],
  ["landmark", "Nearby Landmark", "text"],
  ["jurisdiction", "State Jurisdiction", "text"],
  ["ward", "Sector / Circle / Ward / Charge / Unit", "text"],
  ["centreJurisdiction", "Centre Jurisdiction", "text"],
  ["latitude", "Latitude", "text"],
  ["longitude", "Longitude", "text"],
  ["email", "Email Address", "email"],
  ["mobile", "Mobile Number", "tel"],
  ["telephone", "Telephone Number", "tel"],
  [
    "proofType",
    "Proof of Principal Place of Business",
    [
      "Electricity Bill",
      "Property Tax Receipt",
      "Rent / Lease Agreement",
      "Consent Letter",
      "Ownership Document",
    ],
  ],
);
FIELDS.additional.push(
  ["city", "City / Town / Village", "text"],
  ["state", "State / UT", "text"],
  [
    "possession",
    "Nature of Possession",
    ["Own", "Leased", "Rented", "Consent", "Shared", "Others"],
  ],
);
const REPEATED = ["promoters", "signatory", "additional", "goods"];
const readAttachment = (file) =>
  new Promise((resolve, reject) => {
    if (file.size > 1048576) {
      reject(Error("Select a PDF or image smaller than 1 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ name: file.name, size: file.size, data: reader.result });
    reader.onerror = () => reject(Error("Unable to read this file."));
    reader.readAsDataURL(file);
  });

export function Registration() {
  const { user, w, mutate, go, setNotice, setError } = usePortal();
  const r = w?.registration;
  const [kind, setKind] = useState(r?.trn ? "trn" : "new");
  const draftKey = `gstRegistrationDraft:${user?.id || "guest"}:${r?.id || r?.trn || "new"}`;
  const [a, setA] = useState(() => {
    try {
      return {
        ...(r?.partA || {}),
        ...(!r?.createdAt
          ? JSON.parse(sessionStorage.getItem(draftKey)) || {}
          : {}),
        email: user?.email || "",
      };
    } catch {
      return { email: user?.email || "" };
    }
  });
  const [mobileOtp, setMobileOtp] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [trn, setTrn] = useState(r?.trn || "");
  const [email, setEmail] = useState(r?.partA.email || user?.email || "");
  const [resumeOtp, setResumeOtp] = useState(null);
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState("business");
  const [recordIndex, setRecordIndex] = useState(0);
  const [values, setValues] = useState(r?.tabs.business || {});
  const [declaration, setDeclaration] = useState(false);
  const [signing, setSigning] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const updateA = (key, value) => {
    const next = { ...a, [key]: value };
    setA(next);
    sessionStorage.setItem(draftKey, JSON.stringify(next));
  };
  const start = async () => {
    if (!user) {
      setNotice("Sign in to save this registration application.");
      go("login");
      return;
    }
    await mutate("registration/start", { partA: { ...a, email: user.email } });
    sessionStorage.removeItem(draftKey);
    setMobileOtp("");
    setEmailOtp("");
  };
  const defaults = (key, fields = {}) => ({
    ...(key === "business"
      ? {
          district: r?.partA.district || "",
          tradeName: r?.partA.legalName || "",
        }
      : {}),
    ...(["principal", "additional"].includes(key)
      ? {
          state: r?.partA.state || "",
          ...(key === "principal" ? { district: r?.partA.district || "" } : {}),
        }
      : {}),
    ...(["promoters", "signatory", "principal"].includes(key)
      ? { email: user?.email || "", mobile: r?.partA.mobile || "" }
      : {}),
    ...fields,
  });
  function selectTab(key) {
    setRecordIndex(0);
    setTab(key);
    setValues(defaults(key, r.tabs[key]));
  }
  function setField(key, value) {
    setValues((old) => {
      const next = { ...old, [key]: value };
      if (old.records)
        next.records = old.records.map((r, i) =>
          i === recordIndex ? { ...r, [key]: value } : r,
        );
      return next;
    });
  }
  function addRecord() {
    const records = values.records || [{ ...values }];
    if (records.length >= 20) throw Error("Add at most 20 records.");
    const next = [...records, defaults(tab)];
    setRecordIndex(next.length - 1);
    setValues({ records: next });
  }
  const valuesForSave = () =>
    values.records
      ? {
          ...defaults(tab, values.records[0]),
          records: values.records.map((record) => defaults(tab, record)),
        }
      : defaults(tab, values);
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
            <Btn onClick={() => go("dashboard")}>OPEN BUSINESS DASHBOARD</Btn>
            <Btn tone="secondary" onClick={() => go("track")}>
              TRACK APPLICATION STATUS
            </Btn>
            <Btn
              tone="secondary"
              onClick={async () => {
                await mutate("registration/new");
                sessionStorage.removeItem(draftKey);
                sessionStorage.removeItem(
                  `gstRegistrationDraft:${user.id}:new`,
                );
                setA({ email: user.email });
                setEdit(false);
                setValues({});
              }}
            >
              NEW REGISTRATION
            </Btn>
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
          {REPEATED.includes(tab) && tab !== "goods" && (
            <div className="record-list">
              <p>
                {tab === "goods" ? "Goods / services" : "Records"}:{" "}
                {values.records?.length || 1}
              </p>
              {values.records?.map((record, i) => (
                <button
                  key={i}
                  className={`btn ${i === recordIndex ? "primary" : "secondary"}`}
                  onClick={() => {
                    setRecordIndex(i);
                    setValues({
                      ...defaults(tab, record),
                      records: values.records,
                    });
                  }}
                >
                  {record.name || record.hsn || `Record ${i + 1}`}
                </button>
              ))}
              <Btn tone="secondary" onClick={addRecord}>
                ADD NEW
              </Btn>
              {values.records?.length > 1 && (
                <Btn
                  tone="danger"
                  onClick={() => {
                    const records = values.records.filter(
                      (_, i) => i !== recordIndex,
                    );
                    setRecordIndex(0);
                    setValues({ ...records[0], records });
                  }}
                >
                  REMOVE RECORD
                </Btn>
              )}
            </div>
          )}
          {tab === "signatory" && (
            <div className="actions">
              <Btn
                tone="secondary"
                onClick={() => {
                  const promoter =
                    r.tabs.promoters?.records?.find(
                      (p) => p.alsoSignatory === "Yes",
                    ) || r.tabs.promoters;
                  if (promoter)
                    setValues({
                      ...promoter,
                      primary: "Yes",
                      records: undefined,
                    });
                }}
              >
                COPY PROMOTER DETAILS
              </Btn>
            </div>
          )}
          {tab === "goods" ? (
            <RegistrationGoods values={values} onChange={setValues} />
          ) : (
            <div className="form-grid">
              {FIELDS[tab].map(([key, label, type, required]) =>
                (tab === "aadhaar" && key === "person") ||
                (tab === "verification" && key === "signatory") ? (
                  tab === "aadhaar" && values.opted !== "Yes" ? null : (
                    <Select
                      key={key}
                      label={label}
                      required
                      disabled={!w.registrationSignatories?.length}
                      placeholder={
                        w.registrationSignatories?.length
                          ? "Select authorized signatory"
                          : "Add an authorized signatory first"
                      }
                      help={
                        !w.registrationSignatories?.length
                          ? "Save the Authorized Signatory section to populate this list."
                          : ""
                      }
                      options={w.registrationSignatories || []}
                      value={(() => {
                        const current =
                          tab === "verification"
                            ? values.signatoryId || values[key]
                            : values[key];
                        const people = w.registrationSignatories || [];
                        const exact = people.find(
                          (person) => person.value === current,
                        );
                        if (exact) return exact.value;
                        const matches = people.filter((person) =>
                          person.aliases?.includes(current),
                        );
                        return matches.length === 1 ? matches[0].value : "";
                      })()}
                      onChange={(e) => {
                        setField(key, e.target.value);
                        if (tab === "verification")
                          setField("signatoryId", e.target.value);
                      }}
                    />
                  )
                ) : Array.isArray(type) ? (
                  <Select
                    key={key}
                    label={label}
                    required={required}
                    options={type}
                    value={values[key] ?? defaults(tab)[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                ) : (
                  <Input
                    key={key}
                    label={label}
                    required={required}
                    type={type}
                    readOnly={tab === "principal" && key === "state"}
                    value={values[key] ?? defaults(tab)[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                ),
              )}
            </div>
          )}
          {[
            "business",
            "promoters",
            "signatory",
            "principal",
            "additional",
          ].includes(tab) && (
            <div className="document-attachment">
              <Input
                label={
                  tab === "principal"
                    ? "Proof of Principal Place of Business"
                    : "Supporting Document / Photograph"
                }
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  try {
                    setField("attachment", await readAttachment(file));
                  } catch (error) {
                    setError(error.message);
                  }
                }}
              />
              {values.attachment && (
                <p>
                  Attached: <b>{values.attachment.name}</b> (
                  {Math.ceil(values.attachment.size / 1024)} KB)
                  {values.attachment.data && (
                    <Btn
                      tone="secondary"
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = values.attachment.data;
                        link.download = values.attachment.name;
                        link.click();
                      }}
                    >
                      DOWNLOAD
                    </Btn>
                  )}
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
                go("track");
              }}
            >
              BACK TO APPLICATIONS
            </Btn>
            <Btn
              onClick={async () => {
                await mutate("registration/save", {
                  tab,
                  values: valuesForSave(),
                });
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
            purpose="registration-submit"
            onClose={() => setSigning(false)}
            onSubmit={(form) => mutate("registration/submit", form)}
          />
        )}
      </div>
    );
  return (
    <div className="container">
      <Crumbs items={["Registration"]} />
      {r?.createdAt && (
        <div className="actions">
          <Btn tone="secondary" onClick={() => go("track")}>
            MY APPLICATIONS
          </Btn>
          <Btn
            tone="secondary"
            onClick={async () => {
              await mutate("registration/new");
              sessionStorage.removeItem(draftKey);
              sessionStorage.removeItem(`gstRegistrationDraft:${user.id}:new`);
              setA({ email: user.email });
              setKind("new");
              setTrn("");
              setResumeOtp(null);
              setEdit(false);
              setValues({});
            }}
          >
            NEW REGISTRATION
          </Btn>
        </div>
      )}
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
              : kind === "trn"
                ? "Temporary Reference Number (TRN)"
                : "New Registration"}
          </h1>
          <p className="mandatory">
            <b className="required">●</b> indicates mandatory fields
          </p>
          {r?.stage === "otp" && kind === "new" ? (
            <>
              <p className="info">
                One OTP was emailed to{" "}
                <b>{r.otp?.recipient || r.partA.email}</b>. Enter that same code
                in both the Mobile OTP and Email OTP fields. The code expires in
                10 minutes.
              </p>
              <Input
                label="Mobile OTP"
                required
                value={mobileOtp}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(e) => setMobileOtp(e.target.value)}
              />
              <Input
                label="Email OTP"
                required
                value={emailOtp}
                maxLength={6}
                inputMode="numeric"
                onChange={(e) => setEmailOtp(e.target.value)}
              />
              <OtpResend delivery={r.otp} onResend={start} />
              <div className="actions">
                <Btn
                  onClick={async () => {
                    await mutate("registration/verify", {
                      mobileOtp,
                      emailOtp,
                    });
                    sessionStorage.removeItem(draftKey);
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
                An OTP was emailed to{" "}
                <b>{r.resumeOtp?.recipient || r.partA.email}</b>. Enter the code
                from that email to continue. It expires in 10 minutes.
              </p>
              <Input
                label="Mobile / Email OTP"
                required
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={resumeOtp}
                onChange={(e) => setResumeOtp(e.target.value)}
              />
              <OtpResend
                delivery={r.resumeOtp}
                onResend={async () => {
                  await mutate("registration/resume", {
                    trn: trn || r.trn,
                    email: email || r.partA.email,
                  });
                  setResumeOtp("");
                }}
              />
              <div className="actions">
                <Btn
                  onClick={async () => {
                    await mutate("registration/resume-verify", {
                      otp: resumeOtp,
                    });
                    setResumeOtp(null);
                    setEdit(true);
                    selectTab("business");
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
                    value={email || user?.email || ""}
                    readOnly
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
                    required
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
                    value={user?.email || ""}
                    readOnly
                    help="Your account email is used for registration and OTP verification."
                  />
                  <Input
                    label="Mobile Number"
                    type="tel"
                    required
                    value={a.mobile || ""}
                    placeholder="Enter Mobile Number"
                    maxLength={10}
                    help="ⓘ Use the same code delivered by email for Mobile OTP."
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
  const { portal, user, go, api, load, mutate } = usePortal();
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState("");
  const applications = (portal?.applications || []).filter((item) =>
    `${item.legalName} ${item.tradeName} ${item.trn || ""} ${item.arn || ""} ${item.status}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const label = (status) =>
    ({
      new: "Part A",
      otp: "Awaiting OTP",
      trn: "Part B pending",
      draft: "Draft",
    })[status] || status;
  return (
    <div className="container">
      <Crumbs items={["Services", "Track Application Status"]} />
      <div className="dashboard-title">
        <h1>My Registration Applications</h1>
        <Btn
          onClick={async () => {
            if (!user) return go("login");
            await mutate("registration/new");
            sessionStorage.removeItem(`gstRegistrationDraft:${user.id}:new`);
            go("registration");
          }}
        >
          NEW REGISTRATION
        </Btn>
      </div>
      <Panel title="Track Application Status">
        {!user ? (
          <Btn onClick={() => go("login")}>LOGIN TO VIEW APPLICATIONS</Btn>
        ) : (
          <>
            <Input
              label="Find an application"
              type="search"
              placeholder="Business name, ARN, TRN or status"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Table
              columns={[
                "Legal / Trade Name",
                "TRN",
                "ARN",
                "Created",
                "Status",
                "Action",
              ]}
              count={applications.length}
              empty="No applications found. Start a new registration to practise."
            >
              {applications.map((item) => (
                <tr key={item.trn || item.reference}>
                  <td>
                    <b>{item.legalName}</b>
                    {item.tradeName && item.tradeName !== item.legalName && (
                      <small className="access-muted">{item.tradeName}</small>
                    )}
                  </td>
                  <td>{item.trn || "—"}</td>
                  <td>{item.arn || "—"}</td>
                  <td>{dateLabel(item.createdAt)}</td>
                  <td>{label(item.status)}</td>
                  <td>
                    <Btn
                      tone="secondary"
                      disabled={Boolean(opening)}
                      onClick={async () => {
                        setOpening(item.reference);
                        try {
                          await api("/portal/applications/open", {
                            reference: item.reference,
                          });
                          await load();
                          go(
                            item.status === "Pending for Validation" ||
                              item.status === "Approved"
                              ? "registration"
                              : "registration/resume",
                          );
                        } finally {
                          setOpening("");
                        }
                      }}
                    >
                      {item.arn ? "VIEW" : "CONTINUE"}
                    </Btn>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Panel>
    </div>
  );
}
