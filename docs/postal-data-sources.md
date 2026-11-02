# Postal address masters

The backend searches a local snapshot of the Department of Posts postal directory. It does not send address searches to an external geocoder. It covers 21,029 distinct PIN/state/district combinations across all 36 states/UTs; 20,908 have estimated postal-area coordinates.

Sources retrieved 2 November 2026:

- Department of Posts via [Open Government Data India](https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month), [downloaded CSV](https://www.data.gov.in/sites/default/files/dataurl31052019/Pincode_30052019.csv), Government Open Data License–India. The source URL retains its historical date; this is a reference snapshot, not a promise of current administrative boundaries.
- [GeoNames India postal data](https://download.geonames.org/export/zip/IN.zip), [format and license](https://download.geonames.org/export/zip/readme.txt), CC BY 4.0. Coordinates are estimated postal-area points; they are not exact premises or tax-jurisdiction boundaries. GeoNames attribution appears beside the address map.

Regenerate `backend/data/postal-directory.json` with:

```sh
python3 utils/import_postal_directory.py --source-dir /path/to/sources
```

The source directory should contain the CSV as `pincodes.csv` and the GeoNames archive as `geonames-IN.zip`. No private student data or identity documents belong in this directory or repository.

State names are normalized to the app's GST state codes; merged territories and Ladakh are mapped explicitly. Users can refine a postal-area point with the draggable map pin. Missing coordinate estimates require manual pin placement rather than fabricated coordinates.

## Jurisdiction data

Postal boundaries do not determine legal tax jurisdiction. The old public CBIC jurisdiction endpoint returned HTTP 404 during implementation. The app therefore provides a **labelled training hierarchy**, with editable state ward and centre commissionerate/division/range selectors, fetch/reset behaviour and invalidation after address changes. It does not misrepresent those fixture names as official mappings.

An instructor can import verified PIN/district jurisdiction mappings in **My Masters → Registration Jurisdiction Masters**. Imported mappings replace the training options for matching locations. Authoritative nationwide jurisdiction mapping is not claimed by this release.
