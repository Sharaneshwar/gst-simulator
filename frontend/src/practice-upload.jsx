import { Btn } from "./lib";
const DOCS = {
  constitution: [
    "Proof of Constitution of Business",
    "Business_Constitution.pdf",
    82000,
  ],
  photograph: ["Photograph", "Photograph.jpg", 48000],
  authorization: [
    "Proof of Appointment of Authorized Signatory",
    "Letter_of_Authorization.pdf",
    96000,
  ],
  premises: ["Proof of Place of Business", "Electricity_Bill.pdf", 128000],
  tenancy: ["Rent / Lease Agreement", "Rent_Agreement.pdf", 164000],
  consent: ["Consent Letter", "Consent_Letter.pdf", 72000],
  ekyc: ["E-KYC Identity Document", "E_KYC_Identity_Proof.pdf", 108000],
  sez: [
    "Letter of Approval / Permission (SEZ)",
    "SEZ_Letter_of_Approval.pdf",
    132000,
  ],
};
export function PracticeUploads({ tab, values, onChange }) {
  const kinds =
    tab === "business"
      ? [
          ...(values.constitution && values.constitution !== "Proprietorship"
            ? ["constitution"]
            : []),
          ...(["SEZ Unit", "SEZ Developer"].includes(values.reason)
            ? ["sez"]
            : []),
        ]
      : tab === "promoters"
        ? ["photograph"]
        : tab === "signatory"
          ? ["authorization", "photograph"]
          : ["principal", "additional"].includes(tab)
            ? [
                "premises",
                ...(["Rented", "Leased"].includes(values.possession)
                  ? ["tenancy"]
                  : values.possession === "Consent"
                    ? ["consent"]
                    : []),
              ]
            : tab === "aadhaar" && values.opted === "No"
              ? ["ekyc"]
              : [];
  if (tab === "additional" && values.hasAdditional !== "Yes") return null;
  return (
    <div className="practice-uploads">
      {kinds.map((kind) => {
        const [label, name, size] = DOCS[kind];
        const file = values.attachments?.[kind];
        const upload = () =>
          onChange({
            ...values.attachments,
            [kind]: { kind, name, size, simulated: true },
          });
        return (
          <div className="document-attachment" key={kind}>
            <strong>{label}</strong>
            <div className="sample-file-control">
              <Btn tone="secondary" onClick={upload}>
                Choose File
              </Btn>
              <span>{file?.name || "No file chosen"}</span>
              <Btn onClick={upload}>UPLOAD</Btn>
            </div>
            <small>
              {kind === "photograph"
                ? "JPEG / PDF • Maximum 100 KB"
                : `PDF / JPEG • Maximum ${kind === "ekyc" ? "2" : "1"} MB`}
            </small>
            {file && (
              <div className="sample-file-success" role="status">
                <span aria-hidden="true">📄</span>
                <span>
                  <b>{file.name}</b>
                  <br />
                  File uploaded successfully
                </span>
                <Btn
                  tone="secondary"
                  onClick={() => {
                    const next = { ...values.attachments };
                    delete next[kind];
                    onChange(next);
                  }}
                >
                  REMOVE
                </Btn>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
