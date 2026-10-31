# HSN/SAC directory and search

Source: [GST Portal HSN/SAC directory](https://tutorial.gst.gov.in/downloads/HSN_SAC.xlsx), linked by the [official search page](https://services.gst.gov.in/services/searchhsnsac). Downloaded 25 October 2026. The snapshot stores the source SHA-256 checksum and retrieval date in `backend/data/hsn-sac.json`.

The app searches its bundled snapshot; it does not send students’ queries to GST or Tally and needs no third-party API key. It includes 21,928 unique goods codes and 681 service codes. Descriptions and codes were cross-checked against the workbook using an independent reader. Rates are not included in this source and are not inferred.

Two source codes contain embedded spaces and duplicate already unspaced codes. Their alternate descriptions remain searchable. Five source rows have malformed 5/7-digit code strings; they are listed in the snapshot metadata and excluded, with no guessed digits. Leading zeroes are preserved.

## Behaviour

- Search by numeric prefix (at least two digits) or description words (at least three characters), with exact codes first.
- Registration has separate Goods and Services tabs. Selecting a result adds the code, fills its official description and type, and permits removal. Up to five goods and five services can be selected; duplicates and unknown codes are rejected on the server. Goods registration uses four-digit HSN headings, matching the official registration guide; longer item codes remain available in document/return lookup. Service classification entries use the supplied SAC headings/codes. Two-digit chapter headings cannot be added as registration entries.
- The visible **VIEW HSN / SAC CODE LIST** button opens a paginated directory with codes and descriptions before any query is entered. Students can browse or filter by a familiar name, then select a record.
- GSTR-1 HSN entry and document item fields reuse the search component. E-way bill lookup is filtered to goods. Choosing a result fills the code/description; tax rate and business-specific amounts remain separate.
- Suggestions support keyboard arrows, Enter and Escape. Results are rendered above scrolling tables and constrained to the viewport on mobile. The API returns bounded, paginated results; the UI shows the first 20 and asks for a narrower query when more exist.
- Existing registration records remain unchanged until explicitly saved. On saving the goods/services section, known codes resolve to the official description and inferred supply type; incompatible types, duplicates and category limits are rejected without replacing saved selections.

The registration interaction follows the [GST registration manual’s Goods and Services section](https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm). The snapshot does not reproduce the public portal’s AI-based trade-description suggestions, live tariff updates, taxpayer-specific composition restrictions or rate determination.

## Refresh

Download the workbook from the official URL, then run:

```sh
python3 backend/scripts/import-hsn-directory.py /path/to/HSN_SAC.xlsx --as-of YYYY-MM-DD
npm test
npm run build
```

The importer uses Python’s standard library. Review the checksum, excluded rows and code-count changes before committing the new snapshot. Only the public catalog JSON is allowed through the data-directory Git ignore rules; local databases remain ignored. No database migration or additional deployment variables are needed.

## Validation on 25 October 2026

- `npm test`: 71 tests pass, including actual HTTP lookup, code/description matching, canonical registration persistence, invalid saves, duplicate detection and separate category limits.
- Production frontend build passes; the catalog stays in the backend rather than increasing the frontend bundle by the complete directory size.
- Real browser testing at 375 px verified goods-description search (`cotton woven` → `5208`), service-description search (`information technology` → `998313`), keyboard selection, automatic descriptions, and Save & Continue. Both categories persisted when the tab was reopened. Document width was 375 px, and the suggestion overlay stayed within the viewport.
- Desktop browser testing verified numeric search (`8450`) and adding a second goods record. The shared lookup was also checked in GSTR-1 with keyboard selection.
- Browser fixtures used a separate temporary SQLite database with mocked mail, not production Neon or real messages.

The registration layout was compared directly with the official guide's [Goods screenshot](https://tutorial.gst.gov.in/userguide/registration/assets/images/M_Image_3.png) and [Services screenshot](https://tutorial.gst.gov.in/userguide/registration/assets/images/R1.20.png). It uses the same name/code search and selected-code table, including the four-digit goods heading column and separate categories. The directory button is an additional browsing aid. Mobile directory search/selection and pagination were tested with no document-level horizontal overflow. Three goods and one service were saved and retained when the section was reopened.
