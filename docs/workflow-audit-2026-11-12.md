# Workflow audit — 12 November 2026

Scope: the workflows currently exposed by this application. Traces include navigation, validation, source-data changes, saving, reopening, signing/submission and terminal-state locks. This is an engineering audit of the practice application, not a claim that every GST service or every possible statutory case is implemented.

## Gaps fixed in this batch

1. Purchase writes (XLSX, JSON and manual entry) now refresh the GSTR-2B snapshot and draft ITC when computation is available. A read-only Excel preview does not change a statement. Subsequent uploads refresh again without duplicating earlier credit.
2. Records marked Requires Review remain excluded from eligible ITC. Import receipts explain review requirements. Taking an IMS action retains the official explicit recomputation step. GSTR-3B, GSTR-2B and IMS now expose the same confirmation dialog directly; the statement-page recompute button no longer just redirects elsewhere.
3. Stale/unavailable statements are explained on GSTR-3B before payment. The backend still rejects offsets against stale snapshots. Date and quarter restrictions remain visible; an unavailable refresh does not discard an uploaded document or alter a locked return.
4. Applied interest/late fees are bound to their source tax/ITC, processing date, frequency and calendar settings. Later changes mark the calculation stale, explain how to recalculate, and prevent payment with the old calculation.
5. System Generated GSTR-3B can be viewed separately from manual overrides. Previews use the proper table/row order and descriptions, including Net ITC; source statement status and manual differences are visible.
6. Filing selects saved authorized people instead of using a business name as the only person. Companies and LLPs use the DSC practice method. Completed business signatories/constitution persist independently of subsequent practice applications. Known signatories are validated when requesting and consuming signing OTPs; ambiguous shared-email aliases cannot silently choose a person. Legacy businesses without this metadata retain their existing fallback.
7. Additional-place Yes cannot save an empty address. Representative Yes requires identifying/contact details. Supplied contacts, PINs and dates are validated. Inapplicable branch fields are hidden, missing-field errors name the inputs, and Voluntary Basis disables the liability-date input. Copying a promoter into the selected signatory record preserves the other signatories.
8. EWB validity extension now has a usable form, authenticated update, eight-hour window, current-transporter restriction, remaining-distance calculation, 360-day limit, transit/movement details and saved history. The working clock includes IST time so the window can actually be exercised. The original invoice/tax amounts are retained. Generated-date filters use the document's issue date, including bulk records.
9. Cash ledger Available Balance follows the selected minor head, rather than always showing tax cash.
10. Supplier JSON missing both rate and explicit tax amounts is rejected instead of becoming an unintended zero-tax document. Explicit purchase tax heads must agree with supplier state and Place of Supply.

The automatic purchase-upload refresh is a simulator convenience for importing supplier data. It does not imply that GSTN accepts a Tally Excel workbook or that the official IMS recompute step is automatic.

## Flow traces and completion evidence

Evidence files below are executable regression tests, not just endpoint inventories. Each group also received a code/navigation trace. Browser checks were focused on the changed ITC, comparison and EWB flows; this does not claim every button was clicked interactively.

| Offered flow | Trace to completion / failure handling | Evidence |
| --- | --- | --- |
| Account invitation and bulk invitation | Normalize/deduplicate emails → preview → invite → delivery result → first login; duplicates, failed delivery and unauthorized callers rejected | `access.test.js`, `bulk-invites.test.js` |
| Login, profile and passwords | Existing login → profile → current-password verification/reset → replacement session; disabled/revoked users and old passwords rejected | `access.test.js`, `passwords.test.js` |
| Registration Part A / TRN | Account email → Part A → shared emailed OTP → TRN → resume OTP → draft; wrong/replayed codes rejected | `registration-flow.test.js`, `portal.test.js`, `otp.test.js` |
| Registration Part B | Save/reopen sections → conditional address/representative validation → HSN/SAC selection → saved signatory → verification → signing OTP → ARN | `registration-flow.test.js`, `portal.test.js`, `registration-people.test.js`, `hsn.test.js` |
| Practice business and application tracking | Submit → isolated business → track/select old draft/application → switch businesses → preserve independent records | `registration-flow.test.js` |
| Maps and sample proofs | Postal/state lookup → coordinates/address confirmation → canonical sample attachment → save/reopen; invalid coordinates/real bytes rejected | `completion.test.js`, `excel-import.test.js`, `address-locations.test.mjs` |
| Returns dashboard / frequency | FY/quarter/month → persisted period → monthly/IFF/quarter-end views; filed locks and prior-return requirements | `portal.test.js`, `completion.test.js` |
| GSTR-1 manual sections | Recipient/section → add/edit/delete → multi-rate applicable tax heads → summary regeneration → declaration/OTP filing → filed preview/locks | `portal.test.js`, `return-realism.test.js`, `workflow-guidance.test.mjs` |
| Notes, exports, HSN, nil and document totals | Section-specific input → validation → section summary → return aggregation; amendments retain their baseline | `portal.test.js`, `completion.test.js`, `return-realism.test.js` |
| Tables 14/14A/15/15A | Correct supplier/operator and recipient categories → immutable filed originals → signed amendment difference → cash-only operator liability | `advanced-http.test.js`, `completion.test.js` |
| Offline GSTR-1 / processing errors | JSON validation → queued processing → refresh → processed/error records → correct/discard → summary/filing guard | `portal.test.js`, `advanced-http.test.js` |
| Excel purchases/sales | Read-only preview → source/rate/POS corrections and warning review → atomic revalidation/import → reopen → duplicate protection → statement refresh | `portal.test.js`, `excel-import.test.js`, `completion.test.js` |
| Supplier records / GSTR-2A / GSTR-2B | Supplier entry/import → filed/included/review status → fresh or explicitly stale statement → ITC projection | `portal.test.js`, `advanced-http.test.js`, `state-tax.test.js`; local browser recomputation verified |
| IMS actions | Select → accept/reject/pending/no action → remarks/reductions → save → explicit recompute → updated 2B; carry-forward and finalization prevent double claims | `advanced-http.test.js`, `completion.test.js`; local browser acceptance/recompute transition verified |
| GSTR-3B | Computed vs edited tables → net ITC/reversals/RCM/ECO → interest review → save → shortfall → cash/ITC offset → OTP filing → filed preview | `portal.test.js`, `advanced-http.test.js`, `completion.test.js`, `workflow-guidance.test.mjs` |
| Nil returns | Empty-data eligibility → GSTR-1 filing → zero-liability 3B save/offset/file; non-empty periods cannot claim nil | `portal.test.js` |
| Interest / filing-calendar settings | Due date/turnover/balance inputs → calculate → apply → review/save; source changes invalidate prior calculation | `advanced-http.test.js`, `completion.test.js` |
| Challans / PMT-06 | Create → saved CPIN → online bank OTP or NEFT mandate/UTR or OTC instrument → settlement → receipt; expiry/replay/minor-head constraints | `portal.test.js`, `challan-rules.test.js`, `completion.test.js` |
| Cash / credit / liability ledgers | Deposit/offset/transfer → separate heads → date filter → opening/running/closing → CSV/print; draft ITC is distinct from posted credit | `portal.test.js`, `advanced-http.test.js`, `return-entry.test.mjs` |
| PMT-09 | Draft → sequential balance preview → clear or OTP-bound filing → conserved balances → ARN/history/receipt; changed drafts invalidate OTP | `advanced-http.test.js`, `completion.test.js` |
| My Masters | Add/edit → validated atomic import → reuse → delete; duplicate/invalid mixed batches retain saved data | `advanced-http.test.js`, `completion.test.js` |
| E-invoice / IRP integration | Document-portal registration/login → generate/bulk/print → delayed IRP sync → idempotent return entry → HSN replacement/source Excel → cancellation reconciliation | `portal.test.js`, `completion.test.js`; new authenticated HTTP sync/HSN/workbook trace |
| E-way bills | Portal registration/login → generate/bulk/Part A → Part B/vehicle → print/cancel/extend → return import; duplicate/expired/window errors explained | `portal.test.js`, `eway-rules.test.js`; local browser extension saved/reopened with new expiry and vehicle |
| Network/tenant controls | Home range or existing route grant → account authentication → account-scoped actions; rejected networks and foreign records remain blocked | `network-gateway.test.js`, `network-access.test.js`, `access.test.js` |

## Official reference set

Downloaded manuals are stored outside Git in `../GST User Manuals`; their manifest records original URLs, PDF paths, page counts and image warnings. Relevant pages were extracted with Poppler; the official registration and IMS HTML were also checked on 12 November.

- [Registration](https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm), [saved applications](https://tutorial.gst.gov.in/userguide/registration/My_Saved_Applications.htm).
- [GSTR-1](https://tutorial.gst.gov.in/userguide/returns/Creation_of_Outward_Supplies_Return_in_GSTR-1.htm), [GSTR-3B](https://tutorial.gst.gov.in/userguide/returns/Create_and_Submit_GSTR3B.htm), [GSTR-2B](https://tutorial.gst.gov.in/userguide/returns/Manual_gstr2b.htm), [IMS](https://tutorial.gst.gov.in/userguide/returns/Manual_IMS_Dashboard.htm).
- [Challans](https://tutorial.gst.gov.in/userguide/payments/Create_Challan_(Post_Login).htm), [cash ledger](https://tutorial.gst.gov.in/userguide/ledgers/View_the_Cash_balance.htm), [PMT-09](https://tutorial.gst.gov.in/userguide/ledgers/Manual_pmt09.htm).
- [NIC EWB user manual, section 5.10](https://docs.ewaybillgst.gov.in/Documents/usermanual_ewb.pdf), [NIC e-invoice web manual](https://einvoice1.gst.gov.in/Documents/EINVOICE_UserManual_Web.pdf).

## Verification and limits

- `npm test`: 179 passed, 0 failed. `npm run test:frontend`: 35 passed, 0 failed. `npm run build`: passed (2.32 seconds); existing MapLibre/main-bundle chunk-size warnings remain.
- Local browser checks: stale GSTR-3B → direct recompute confirmation → 180 IGST visible; system-generated preview opens; EWB extension → save → reopen with new vehicle and expiry. No production filing, payment or registration was performed.
- Deployment completion must be verified separately from these local results; a successful build alone does not prove Render is running the new commit.
- Automated API tests use isolated temporary SQLite fixtures and mocked mail. The production application remains on Neon PostgreSQL. No schema migration, environment change or production-data repair is required for these code changes.
- The separate Neon test-branch run failed authentication (`28P01`) with its existing stored credentials. It did not run the selected tests or mutate production. A read-only production check confirmed Bharat's five October purchases, fresh five-record 2B snapshot and projected IGST 19,674 / CGST 14,840 / SGST 14,840 before this release.
- Identity uploads, PAN/Aadhaar lookup, DSC hardware, bank settlement, IRP and transporter responses are practice behaviour. The shared email/mobile OTP and sample-file controls follow the user's explicit requirements. No real government, identity, bank or transporter APIs were added.
- Jurisdiction mappings and map coordinates remain the documented training/reference data. Officer back offices and separately unoffered return types/taxpayer-specific services remain outside this application's normal-taxpayer practice scope; this audit is not a full GST.gov.in implementation certification.
