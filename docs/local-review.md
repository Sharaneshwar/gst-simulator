# Local review

The changes are intentionally uncommitted so the interface and workflows can be reviewed locally first. No deployment is required to run this build.

## Access

- Frontend: http://127.0.0.1:4173/
- Backend: http://localhost:5050/api/health
- Accounts: `student@demo.com` and `instructor@demo.com`, both using `12345`.
- Verification codes are delivered by email; there are no fixed OTPs.
- For registration, enter the same emailed code in both Mobile OTP and Email OTP. One request sends one email and no SMS.

## Suggested walkthrough

1. Compare the public homepage, government masthead, navigation, news panels, login and registration Part A with the open GST reference tabs. Check mobile navigation: Menu opens a vertical overlay with profile and logout actions, closes with its X, the backdrop or Escape, and keeps keyboard focus inside.
2. Sign in, choose Services → Returns, select financial year, quarter and month, then Search. Open GSTR-1 → B2B. Add or edit an invoice and check the local/inter-state tax split. A duplicate number, invalid GSTIN or date outside the selected period should fail.
3. Generate GSTR-1 summary, preview and file through the declaration, signatory and EVC screens. Editing after filing must fail. Changing a draft after summary generation requires a fresh summary.
4. Open GSTR-2A/2B to view supplier records. Open GSTR-3B, review/edit supply and ITC rows, save, then proceed to payment. Create a challan for any tax-head shortfall. Creation should not change balances; paying should credit cash once. Offset should use eligible credit and cash once, then allow filing. Filed records appear under View Filed Returns.
5. Switch to the nil-return business and complete both filings. Switch to excess purchases and check unused ITC carries forward. Periods after the starting month require the preceding month's GSTR-3B before GSTR-1 filing.
6. For a later-period amendment, enter the original period and document number from a filed return. The summary should include the difference from the original, while the filed original remains unchanged.
7. Download the JSON template under Downloads. Fill new document numbers and upload it from Prepare Offline. Check successful records, row-level errors, duplicate detection and mismatched-period rejection. Unsupported utility sections and multi-rate utility invoices are explicitly rejected rather than silently miscalculated.
8. Complete normal-taxpayer registration: Part A → one emailed OTP entered in both fields → TRN → TRN CAPTCHA (`729461`) → emailed OTP → saved application → ten Part B tabs → verification. Save each tab before submission. Track the resulting ARN; submitted applications are locked. Resending must wait 60 seconds, codes expire in 10 minutes and five incorrect attempts lock a challenge. A used or superseded code must fail.
9. In the dispatch business, generate an e-way bill from an invoice, update its vehicle, print and cancel. Generate an e-invoice IRN, view/print and cancel it. Duplicate active references and cancellation after 24 hours should fail.
10. Refresh and restart the backend to confirm SQLite retains records. Confirm the instructor account does not see the student's records. Restore Original Records under Switch Business clears only that account's selected business and requires explicit confirmation in the UI.

## Review boundaries

This pass targets the core routes above, not every service on GST.gov.in. Compare each teaching exercise with the real portal before signing off on parity. Areas still simplified include multi-line/multi-rate invoice entry, specialized registration details and repeated person/place records, state-by-state GSTR-3B 3.2 entry, full offline-utility schemas and separate external document-portal layouts. Upload controls for registration save filename/size, not file bytes. Dummy news and example due dates do not update from live legislation. The two seed accounts are for demonstration; there is no account-provisioning interface.

OTP delivery uses Gmail SMTP with the private backend configuration. SMS is not sent and the shared registration code verifies email access only. Actual GSTN authentication, Aadhaar, DSC hardware and bank/IRP connections remain local practice responses. The only public educational disclaimer is in the footer.

Render free service storage remains ephemeral. A keep-alive monitor does not make the SQLite file durable across redeployments.
