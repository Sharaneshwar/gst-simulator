"use strict";
// Reference: official EWB v1.03 validations, master codes and supply/document mapping.
const SUB_TYPES = {
  1: "Supply",
  2: "Import",
  3: "Export",
  4: "Job Work",
  5: "For Own Use",
  6: "Job Work Returns",
  7: "Sales Return",
  8: "Others",
  9: "SKD/CKD/Lots",
  10: "Line Sales",
  11: "Recipient Not Known",
  12: "Exhibition or Fairs",
};
const DOC_TYPES = {
  INV: "Tax Invoice",
  BIL: "Bill of Supply",
  BOE: "Bill of Entry",
  CHL: "Delivery Challan",
  OTH: "Others",
};
const UQC =
  "BAG BAL BDL BKL BOU BOX BTL BUN CAN CBM CCM CMS CTN DOZ DRM GGK GMS GRS GYD KGS KLR KME LTR MTR MLT MTS NOS OTH PAC PCS PRS QTL ROL SET SQF SQM SQY TBS TGM THD TON TUB UGS UNT YDS".split(
    " ",
  );
const MAPPING = {
  Outward: {
    Supply: ["Tax Invoice", "Bill of Supply"],
    Export: ["Tax Invoice", "Bill of Supply"],
    "Job Work": ["Delivery Challan"],
    "SKD/CKD/Lots": ["Tax Invoice", "Bill of Supply", "Delivery Challan"],
    "Recipient Not Known": ["Delivery Challan", "Others"],
    "For Own Use": ["Delivery Challan"],
    "Exhibition or Fairs": ["Delivery Challan"],
    "Line Sales": ["Delivery Challan"],
    Others: ["Delivery Challan", "Others"],
  },
  Inward: {
    Supply: ["Tax Invoice", "Bill of Supply"],
    Import: ["Bill of Entry"],
    "SKD/CKD/Lots": [
      "Bill of Entry",
      "Tax Invoice",
      "Bill of Supply",
      "Delivery Challan",
    ],
    "Job Work Returns": ["Delivery Challan"],
    "Sales Return": ["Delivery Challan"],
    "Exhibition or Fairs": ["Delivery Challan"],
    "For Own Use": ["Delivery Challan"],
    Others: ["Delivery Challan", "Others"],
  },
};
const fail = (message) => {
  throw Object.assign(Error(message), { status: 400 });
};
const vehicleValid = (value) => {
  const v = String(value || "")
    .replace(/\s/g, "")
    .toUpperCase();
  return (
    /^[A-Z]{2}\d{1,3}[A-Z]{0,3}\d{4}$/.test(v) ||
    /^[A-Z]{3}\d{4}$/.test(v) ||
    /^\d{2}BH\d{4}[A-Z]{2}$/.test(v) ||
    /^(DF|TM|BP|NP)[A-Z0-9]{5,13}$/.test(v)
  );
};
function workingDate(w) {
  const today = new Date().toISOString().slice(0, 10);
  if (w.documentDates?.[w.period]) return w.documentDates[w.period];
  return w.period < today.slice(0, 7)
    ? new Date(
        Date.UTC(Number(w.period.slice(0, 4)), Number(w.period.slice(5)), 0),
      )
        .toISOString()
        .slice(0, 10)
    : today;
}
function workingInstant(w) {
  return `${workingDate(w)}T${w.documentTimes?.[w.period] || "12:00"}:00+05:30`;
}
function extendValidity(doc, input, now, actorGstin) {
  if (doc.status !== "Active" || !doc.validUntil)
    fail("Only an active e-way bill with completed Part B can be extended.");
  if (doc.transporterId && doc.transporterId !== actorGstin)
    fail("Only the current transporter can extend this e-way bill.");
  const instant = Date.parse(now),
    end = Date.parse(doc.validUntil);
  if (
    !Number.isFinite(instant) ||
    !Number.isFinite(end) ||
    Math.abs(instant - end) > 8 * 3600000
  )
    fail(
      "Extend validity within eight hours before or after the existing expiry time.",
    );
  if (
    ![
      "Natural Calamity",
      "Law and Order",
      "Accident",
      "Transshipment",
      "Others",
    ].includes(input.reason) ||
    !String(input.remarks || "").trim()
  )
    fail("Select an extension reason and enter remarks.");
  const remainingDistance = Number(input.remainingDistance);
  if (
    !Number.isFinite(remainingDistance) ||
    remainingDistance <= 0 ||
    remainingDistance > 4000
  )
    fail("Enter a remaining distance greater than zero and up to 4,000 KM.");
  if (!["In Movement", "In Transit"].includes(input.consignmentStatus))
    fail("Select In Movement or In Transit for the consignment.");
  if (
    !String(input.currentPlace || "").trim() ||
    !/^\d{6}$/.test(input.currentPincode || "") ||
    !input.currentState
  )
    fail("Enter the current place, six-digit PIN code and state.");
  if (
    input.consignmentStatus === "In Transit" &&
    !["On Road", "Warehouse", "Others"].includes(input.transitType)
  )
    fail("Select the consignment's transit type.");
  const mode = input.mode || doc.mode;
  if (!["Road", "Rail", "Air", "Ship"].includes(mode))
    fail("Select a valid mode of transport.");
  const vehicle = String(input.vehicle || "")
    .replace(/\s/g, "")
    .toUpperCase();
  const transportDocument = String(input.transportDocument || "");
  if (
    (mode === "Road" ||
      (mode === "Ship" && doc.vehicleType === "Over Dimensional Cargo")) &&
    !vehicleValid(vehicle)
  )
    fail("Enter a valid vehicle number.");
  if (
    ["Rail", "Air", "Ship"].includes(mode) &&
    !/^[A-Za-z0-9/-]{1,15}$/.test(transportDocument)
  )
    fail("Enter a valid transport document number.");
  if (mode === "Rail" && !/^[PFL][A-Z0-9/-]{2,14}$/.test(transportDocument))
    fail("Railway document number must start with P, F or L.");
  const date = now.slice(0, 10);
  if (
    input.transportDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.transportDate) ||
      Number.isNaN(Date.parse(input.transportDate)) ||
      new Date(input.transportDate).toISOString().slice(0, 10) !==
        input.transportDate ||
      input.transportDate > date)
  )
    fail(
      "Enter a valid transport document date on or before the working date.",
    );
  const extended = expiry(date, remainingDistance, doc.vehicleType);
  const issuedDate =
    doc.referenceDate ||
    doc.issuedAt?.slice(0, 10) ||
    doc.createdAt.slice(0, 10);
  const limit = Date.parse(`${issuedDate}T00:00:00+05:30`) + 361 * 86400000 - 1;
  if (Date.parse(extended) > limit)
    fail("Validity cannot extend beyond 360 days from generation.");
  if (Date.parse(extended) <= end)
    fail("The extension must increase the existing validity.");
  return {
    at: now,
    previousValidUntil: doc.validUntil,
    validUntil: extended,
    remainingDistance,
    reason: input.reason,
    remarks: String(input.remarks).trim().slice(0, 500),
    consignmentStatus: input.consignmentStatus,
    transitType:
      input.consignmentStatus === "In Transit" ? input.transitType : "",
    currentPlace: String(input.currentPlace).trim().slice(0, 200),
    currentPincode: input.currentPincode,
    currentState: input.currentState,
    mode,
    vehicle,
    transportDocument,
    transportDate: input.transportDate || "",
  };
}
function expiry(date, distance, vehicleType) {
  const days = Math.max(
    1,
    Math.ceil(
      Number(distance || 0) /
        (vehicleType === "Over Dimensional Cargo" ? 20 : 200),
    ),
  );
  return new Date(
    Date.parse(date + "T00:00:00+05:30") + (days + 1) * 86400000 - 1,
  ).toISOString();
}
function validate(form, taxpayer, date) {
  const f = form;
  f.supplyType ||= "Outward";
  f.subType ||= "Supply";
  f.documentType ||= "Tax Invoice";
  f.transactionType ||= "Regular";
  if (!/^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/.test(f.number || ""))
    fail("Document number must be up to 16 letters/digits, with / or - only.");
  const allowed = MAPPING[f.supplyType]?.[f.subType];
  if (!allowed?.includes(f.documentType))
    fail("Document type is not permitted for this supply type and sub type.");
  if (f.subType === "Others" && !String(f.subSupplyDesc || "").trim())
    fail("Enter the description for sub supply type Others.");
  if (f.date > date)
    fail("Document date cannot be later than the working date.");
  if (
    date >= "2025-01-01" &&
    (Date.parse(date) - Date.parse(f.date)) / 86400000 > 180
  )
    fail("Document date must be within 180 days of the working date.");
  if (f.transportDate && (f.transportDate < f.date || f.transportDate > date))
    fail(
      "Transport document date must be between the document date and working date.",
    );
  if (
    ![
      "Regular",
      "Bill To — Ship To",
      "Bill From — Dispatch From",
      "Combination",
    ].includes(f.transactionType)
  )
    fail("Select a valid transaction type.");
  const owner = f.supplyType === "Inward" ? f.buyer : f.seller;
  if (owner?.gstin !== taxpayer.gstin)
    fail(
      "The selected taxpayer must be the supplier for outward supply or recipient for inward supply.",
    );
  if (
    [
      "For Own Use",
      "Exhibition or Fairs",
      "Line Sales",
      "Recipient Not Known",
    ].includes(f.subType) &&
    f.seller?.gstin !== f.buyer?.gstin
  )
    fail("This sub supply type requires the same bill-from and bill-to GSTIN.");
  const from = ["Bill From — Dispatch From", "Combination"].includes(
      f.transactionType,
    )
      ? f.dispatchDetails
      : f.seller,
    to = ["Bill To — Ship To", "Combination"].includes(f.transactionType)
      ? f.shipDetails
      : f.buyer;
  for (const [name, party] of [
    ["Dispatch from", from],
    ["Ship to", to],
  ])
    if (
      !party?.address ||
      !party?.state ||
      !/^\d{6}$/.test(party?.pincode || "")
    )
      fail(`${name} requires address, state and six-digit PIN code.`);
  const distance = Number(f.distance || 0);
  if (!Number.isFinite(distance) || distance < 0 || distance > 4000)
    fail("Approximate distance must be between 0 and 4,000 km.");
  if (
    from.pincode === to.pincode &&
    distance > (f.subType === "Line Sales" ? 300 : 100)
  )
    fail(
      "For the same dispatch and delivery PIN, distance cannot exceed 100 km (300 km for Line Sales).",
    );
  if ((f.items || []).every((i) => String(i.hsn).startsWith("99")))
    fail(
      "An e-way bill requires at least one goods HSN; services-only SAC records are not accepted.",
    );
  for (const item of f.items || [])
    if (!UQC.includes(item.uqc)) fail("Select a valid unit quantity code.");
  if (f.partAOnly) {
    if (!/^[A-Z0-9]{15}$/.test(f.transporterId || ""))
      fail("A valid 15-character transporter ID is required for Part A.");
    if (f.vehicle || f.transportDocument || f.mode)
      fail(
        "Part A slips must not contain a mode, vehicle or transport document number.",
      );
  } else {
    if (!["Road", "Rail", "Air", "Ship"].includes(f.mode))
      fail("Select a mode of transport.");
    if (f.mode === "Road" && !vehicleValid(f.vehicle))
      fail("Enter a valid vehicle number for road transport.");
    if (["Rail", "Air", "Ship"].includes(f.mode) && !f.transportDocument)
      fail("Rail, air and ship transport require a transport document number.");
    if (
      f.mode === "Rail" &&
      date >= "2025-01-01" &&
      !/^[PFL][A-Z0-9/-]{2,14}$/.test(f.transportDocument || "")
    )
      fail("Railway document number must start with P, F or L.");
    if (
      f.mode === "Ship" &&
      f.vehicleType === "Over Dimensional Cargo" &&
      !vehicleValid(f.vehicle)
    )
      fail("Ship transport with ODC requires a valid vehicle number.");
  }
  if (f.transporterId && !/^[A-Z0-9]{15}$/.test(f.transporterId))
    fail("Transporter ID must contain 15 letters or digits.");
  if (f.transportDocument && !/^[A-Za-z0-9/-]{1,15}$/.test(f.transportDocument))
    fail("Transport document number must be up to 15 letters/digits, / or -.");
  return {
    distance,
    alerts:
      distance === 0
        ? [
            "PIN-to-PIN distance is not available in the practice data. Enter the actual distance before movement.",
          ]
        : [],
  };
}
module.exports = {
  SUB_TYPES,
  DOC_TYPES,
  UQC,
  MAPPING,
  vehicleValid,
  workingDate,
  workingInstant,
  extendValidity,
  expiry,
  validate,
};
