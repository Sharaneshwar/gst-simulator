// A guide to the portal's supported rate choices, not an HSN-to-rate tariff.
export const RATE_SOURCES = {
  cbic: {
    title: "CBIC rate schedules",
    url: "https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html",
  },
  reform: {
    title: "2025 rate-reform FAQs",
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163560&lang=1&reg=6",
  },
  current: {
    title: "October 2026 GST overview",
    url: "https://www.pib.gov.in/PressNoteDetails.aspx?ModuleId=3&NoteId=160401&lang=1&reg=3",
  },
  bricks: {
    title: "Official FAQ on brick rates",
    url: "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2167151&lang=2&reg=48",
  },
  exporter: {
    title: "Merchant-exporter concession",
    url: "https://gstcouncil.gov.in/node/4463",
  },
  housing: {
    title: "Real-estate valuation notification",
    url: "https://www.gstcouncil.gov.in/sites/default/files/2024-02/8-rate_notification-igst-01.04.2019.pdf",
  },
  housingFaq: {
    title: "Official real-estate FAQs",
    url: "https://www.gst.karnataka.gov.in/Documents/FAQ/FAQRealestatesector0705.pdf",
  },
  diamond: {
    title: "Diamond rate change, 18 July 2022",
    url: "https://gjepc.org/pdf/REVISED-2-For-online-The-10-Glorious-Years-of-GJEPC.pdf",
  },
};
export const RATE_REFERENCE = [
  {
    rate: 0,
    title: "Nil-rated entries",
    area: "Supplies for which the applicable entry has a nil rate.",
    detail:
      "Keep nil-rated, exempt and non-GST reporting distinct. Zero-rated exports are a separate concept and may use LUT/bond or payment-and-refund procedures.",
    sources: ["cbic"],
  },
  {
    rate: 0.1,
    title: "Merchant-exporter concession",
    area: "Qualifying supplies of goods to registered merchant exporters.",
    detail:
      "A conditional concession, not the rate for every export. The intra-State split is 0.05% CGST plus 0.05% SGST; the corresponding IGST concession is 0.1%.",
    sources: ["exporter"],
  },
  {
    rate: 0.25,
    title: "Specified rough stones",
    area: "Notified rough diamonds and specified precious / semi-precious stones.",
    detail:
      "The exact description and processing stage matter. Do not apply this automatically to cut and polished diamonds.",
    sources: ["cbic"],
  },
  {
    rate: 1,
    title: "Affordable housing (effective rate)",
    area: "Specified affordable residential apartments under the post-April 2019 scheme.",
    detail:
      "An effective rate on total consideration after the permitted land deduction, without ITC. The corresponding notified construction rate can be 1.5% on the reduced taxable base. Do not deduct land and then apply the effective 1% again.",
    sources: ["housingFaq", "housing"],
  },
  {
    rate: 1.5,
    title: "Diamonds / affordable housing",
    area: "Cut and polished diamonds; notified affordable-apartment construction entries.",
    detail:
      "Cut/polished diamonds moved to 1.5% from 18 July 2022. For eligible housing, 1.5% on the prescribed construction base can yield an effective 1% on total consideration. Check the relevant entry and ITC conditions.",
    sources: ["diamond", "housing"],
  },
  {
    rate: 3,
    title: "Specified precious metals / jewellery",
    area: "Notified gold, silver, platinum and jewellery entries.",
    detail:
      "Classification and the nature of the supply matter. A separate job-work or service charge can have a different treatment.",
    sources: ["cbic"],
  },
  {
    rate: 5,
    title: "Concessional goods / specified services",
    area: "Notified essentials, electric vehicles and specified services; a main merit rate after the 2025 reform.",
    detail:
      "Examples and eligibility depend on the exact entry. Housing also has a separate effective 5% route; it is not interchangeable with 7.5% on a reduced construction base.",
    sources: ["reform", "current", "housing"],
  },
  {
    rate: 6,
    title: "Specified bricks, without ITC",
    area: "Brick supplies covered by the special 6% scheme without input tax credit.",
    detail:
      "The official FAQ distinguishes 6% without ITC from 12% with ITC for the covered bricks. Composition turnover rates are a different mechanism and should not be treated as ordinary invoice rates.",
    sources: ["bricks"],
  },
  {
    rate: 7.5,
    title: "Residential housing (construction base)",
    area: "Notified non-affordable residential apartment construction entries.",
    detail:
      "Under the prescribed land-deduction rules, 7.5% on the construction taxable base can yield an effective 5% on total consideration, without ITC. This is not a general works-contract rate.",
    sources: ["housing", "housingFaq"],
  },
  {
    rate: 12,
    title: "Historical slab / notified exceptions",
    area: "A regular slab in older exercises; retained in specific entries such as covered bricks with ITC.",
    detail:
      "Many goods previously at 12% were re-rated in September 2025. For later invoices, use the notification for the exact item rather than assuming the old slab continues.",
    sources: ["cbic", "reform", "bricks"],
  },
  {
    rate: 18,
    title: "Standard rate",
    area: "Many taxable goods and services, including common professional and IT-service entries.",
    detail:
      "A main standard rate in the post-September 2025 structure. It is not an automatic fallback for every unknown HSN/SAC; check concessions, exemptions and conditions.",
    sources: ["current", "cbic"],
  },
  {
    rate: 28,
    title: "Historical higher slab",
    area: "Higher-tax goods in historical exercises and any entry still specifically applicable for the invoice date.",
    detail:
      "Many former 28% entries moved to 18% or 40% in the 2025 reform. Do not use 28% as a blanket current rate for luxury goods; check the effective notification and any separate cess.",
    sources: ["cbic", "reform"],
  },
  {
    rate: 40,
    title: "Notified demerit goods / services",
    area: "Selected demerit goods and services under the reformed rate structure.",
    detail:
      "Introduced through the 2025 reform, with item-specific commencement and transition rules. It is not a rate for every luxury item; some products had separately notified transition dates.",
    sources: ["reform", "current"],
  },
];

export function rateInfo(value, date = "") {
  const found = RATE_REFERENCE.find((row) => row.rate === Number(value));
  if (!found || value === "" || value === null || value === undefined)
    return null;
  const period = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  let periodNote = "Check the entry, conditions and invoice date.";
  if (period && period < "2025-09-22" && found.rate === 40)
    periodNote =
      "The selected date precedes the September 2025 introduction of this rate.";
  if (period && period >= "2025-09-22" && [12, 28].includes(found.rate))
    periodNote =
      "Period-sensitive: many old entries at this rate changed from 22 September 2025.";
  if (period && period < "2022-07-18" && found.rate === 1.5)
    periodNote =
      "The cut/polished-diamond change to 1.5% had not yet taken effect on this date.";
  return {
    ...found,
    periodNote,
    cgst: found.rate / 2,
    sgst: found.rate / 2,
    igst: found.rate,
  };
}

export function findRates(query = "") {
  const text = String(query).trim().toLowerCase();
  if (/^\d+(?:\.\d+)?%?$/.test(text))
    return RATE_REFERENCE.filter(
      (row) => row.rate === Number(text.replace("%", "")),
    );
  const words = text.match(/[a-z0-9]+/g) || [];
  return RATE_REFERENCE.filter((row) => {
    const haystack = `${row.title} ${row.area} ${row.detail}`.toLowerCase();
    const tokens =
      `${row.title} ${row.area}`.toLowerCase().match(/[a-z0-9]+/g) || [];
    return words.every((word) =>
      word.length <= 2 ? tokens.includes(word) : haystack.includes(word),
    );
  });
}
