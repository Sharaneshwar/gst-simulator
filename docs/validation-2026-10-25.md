# GST workflow validation — 25 October 2026

Historical validation record. See [31 October release validation](release-2026-10-31.md) for current test and deployment results.

## Outcome

Local API regression checks pass (64/64), and the frontend production build passes. The original Tally companion files were retrieved from the signed-in assignment library and checked without copying their contents into this repository. The e-way bill interface and common validation rules were expanded using the official public portal, published API reference and FAQs.

| Check | Result |
| --- | --- |
| `npm test` | 64 tests, 64 pass, 0 fail |
| `npm run build` | 88 modules transformed; production assets generated; built in 1.28 s |
| `git diff --check` | Pass |
| Earlier isolated Neon API/RBAC suite | 36/36 passed, before the final e-way bill additions |
| Final Neon API suite | Incomplete: established connections timed out (`ETIMEDOUT`); follow-up connections failed DNS lookup (`ENOTFOUND`) |
| Live Brevo OTP | One email sent; provider events confirm `requests` and `delivered` |
| Live Neon OTP persistence | Challenge survived a closed/reopened database connection; valid code consumed; replay rejected |

The cloud result must not be described as a complete pass for the final code. A fresh `test:neon` run is still needed when the test endpoint is reachable. The interrupted run may have left its disposable schema on the isolated test branch; cleanup could not be verified because the endpoint was unreachable. The branch was configured to expire on 25 October 2026 at 18:30 UTC. Production businesses and saved work were not reset or used as test fixtures.

## Original companion data

Files were downloaded from the Tally assignment library: Assignment 1, Assignment 6 (e-way bill), and Assignment 7 (e-invoice). They remain in a private temporary validation folder, outside Git.

| Original file | Result |
| --- | --- |
| GSTR1_OFFLINE_OCT.json | 7 records pass |
| GSTR1_OFFLINE_DEC.json | 32 records pass, including quarter records and non-invoice sections |
| GSTR3B_OFFLINE_DEC.json | Rejected: byte-identical to the December GSTR-1 file, with GSTR-1 sections rather than GSTR-3B tables |
| EWAYBILL_OFFLINE.json | 2 itemised documents pass |
| BE1100 E-INVOICE.json | 1 invoice passes |
| BE1101 E-INVOICE.json | 1 invoice passes |

Compatibility checks use an isolated dummy taxpayer matching the original file and its historical working period. The application's GSTIN/period ownership checks remain enabled: these files cannot be imported into an unrelated student's business. GSTR-3B utility structure is covered by synthetic fixtures; compatibility with a correctly formed original Tally GSTR-3B file remains unverified because that download is mislabeled.

## E-way bill additions

- Separate public home, official-style masthead, transport banner, dummy updates, purple login card, CAPTCHA refresh and mobile navigation drawer.
- Outward/inward supply and allowed document/sub-supply combinations; seller/recipient ownership; separate billing and actual dispatch/ship-to addresses.
- Full unit-code dropdown, itemised values, cess, signed other charges, upload header-total reconciliation and row error reports.
- Document number/date constraints, historical training dates, 180-day document age for working dates from 2025 onward, transport dates, distance limits, goods-only HSN requirement and road/rail/air/ship fields.
- Part A slip with transporter ID; completion through Part B; validity begins at first Part B entry and does not restart after a vehicle update.
- Normal/ODC distance-based validity, IST midnight expiry, expired vehicle-update rejection and 24-hour cancellation checks.

## UI checks

Browser checks used an isolated local API with temporary SQLite and mocked local email. No production return data was changed.

- E-way bill entry checked at widths 375, 390, 768 and 1280: document width equals viewport width. Wide line-item tables scroll within their containers.
- Inward selection moves the bound GSTIN to the recipient side and unlocks the supplier field.
- Combination transactions reveal both dispatch-from and ship-to panels; all 45 unit options are present.
- Mobile drawer opens, selecting a screen closes it, and backdrop/Escape dismissal is implemented.
- At 375 px, registration, returns dashboard, GSTR-3B, both offline-upload screens, supplier entry, GSTR-2A, GSTR-2B and e-invoice login have no document-level horizontal overflow.

This is not a claim of pixel-perfect verification of every authenticated government/Tally screen. Public government pages and published specifications were available; authenticated official return screens were not inspected with a real taxpayer account. The signed-in Tally library supplied the original downloads; its separate simulator login was not a verified UI reference for every internal screen.

## Limits

GSTIN/PAN status, authoritative HSN/PIN masters, PIN-to-PIN routing distance, Aadhaar, SMS, DSC hardware, banks and government IRP/GSTN services remain simulated. Email OTPs are real through Brevo. QR previews contain practice data and are not government-signed QR payloads. Specialized e-way bill functions such as consolidated bills, transporter reassignment, rejection and extension are outside this PDF workflow implementation. No LMS or assignment system was added.

Existing deployment variables are sufficient; no additional schema migration is required. Changes remain uncommitted for local review.

## References

- [Official e-way bill portal](https://ewaybillgst.gov.in/)
- [Official generation schema and validations](https://docs.ewaybillgst.gov.in/apidocs/version1.03/generate-eway-bill.html)
- [Supply/document mapping](https://docs.ewaybillgst.gov.in/apidocs/sub-docType-mapping.html)
- [Master codes](https://docs.ewaybillgst.gov.in/apidocs/master-codes-list.html)
- [Official FAQs: Part A/B and validity](https://docs.ewaybillgst.gov.in/html/faq1.html)
