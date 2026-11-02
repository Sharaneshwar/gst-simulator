# GST user-manual downloader

`download_gst_manuals.py` downloads public official GST user manuals, including HTML manuals that only offer a Print control. It does not log in to GST or file returns.

## Run

From the `gst-simulator` project root:

```sh
python3 -m venv utils/.venv
utils/.venv/bin/python -m pip install -r utils/requirements-gst-manuals.txt
utils/.venv/bin/python utils/download_gst_manuals.py --output "../GST User Manuals"
```

The default selection is the four requested modules: File Returns, GST Offline Tools, Input Tax Credit (ITC), and Register with GST. The example output resolves to `playground/GST User Manuals`.

An installed Google Chrome is used for PDF printing. If Chrome is unavailable, install the supported Chromium renderer once:

```sh
utils/.venv/bin/python -m playwright install chromium
```

On Windows, use `utils\.venv\Scripts\python.exe` instead of `utils/.venv/bin/python`.

## Options

```sh
# Just File Returns
utils/.venv/bin/python utils/download_gst_manuals.py --modules file-returns --output "../GST User Manuals"

# A different subset
utils/.venv/bin/python utils/download_gst_manuals.py --modules offline-tools itc registration --output "../GST User Manuals"

# Every item in the official Knowledge Portal list
utils/.venv/bin/python utils/download_gst_manuals.py --all --output "../GST User Manuals"

# All modules used by our simulator
utils/.venv/bin/python utils/download_gst_manuals.py --simulator --output "../GST User Manuals"

# Standalone official e-way bill and e-invoice manuals only
utils/.venv/bin/python utils/download_gst_manuals.py --modules eway einvoice --output "../GST User Manuals"

# Discover/list without downloading manuals
utils/.venv/bin/python utils/download_gst_manuals.py --list --output "../GST User Manuals"
```

`--simulator` covers the original four modules plus login/passwords, DSC/EVC, taxpayer dashboard (including profile, taxpayer search and HSN/SAC search), payments, ledgers, news/download instructions, e-way bills and e-invoices. Related manuals within these official help modules may describe features beyond the simulator's current implementation. This is a reference library, not a claim that every documented feature is implemented.

The e-way bill and e-invoice PDF lists are verified against their official NIC landing pages before download. `--all` includes these two standalone systems as well as the Knowledge Portal modules.

Run the same command to resume. Completed PDFs are reused only when their recorded SHA-256 matches. Selecting another module adds its documents while retaining previous downloads in the index and manifest. `--refresh` downloads current source resources again. `--include-faqs` also follows FAQ topics; by default only user manuals are downloaded. Videos are not downloaded. `--match GSTR3B --limit 1` is useful for a small test. `--chrome /path/to/chrome` selects a renderer explicitly.

## How the official site works

- The public help pages contain links to manual topics and direct PDFs.
- The tutorial uses Adobe RoboHelp: its static `whxdata/toc.new.js` and `tocN.new.js` catalogs describe the sidebar hierarchy. The downloader parses their JSON arrays without executing the JavaScript.
- `index.htm#t=Some_Manual.htm` identifies the actual topic HTML file.
- The Print icon publishes `EVT_PRINT_TOPIC`; the topic handler calls `window.print()`. It does not request a generated PDF from a backend API.
- Original PDFs are copied without changes. HTML topic content and screenshots are fetched over HTTPS, then printed to A4 with source links and page numbers. Navigation scripts, browser chrome and tracking pixels are excluded. The script does not redesign the manual or rewrite its instructions.

## Results and incomplete downloads

Open `index.html` in the output folder. `manifest.json` records every source, duplicate reference, local PDF, original-PDF/printed-HTML method, page count, screenshot count, checksum, and any error. Shared manuals are downloaded once; their module/group references remain in `aliases`.

The script waits for every screenshot to be retrieved and decoded before printing. Missing screenshots fail that manual by default, rather than silently creating a broken PDF. For an official page with broken image links, `--allow-missing-images` saves an explicitly marked partial copy and reports the missing resources. Failed or partial items produce a nonzero exit status; rerunning retries them. A partially written PDF is never treated as complete.

For the verified preserved DSC screenshot, explicitly opt in with `--image-recoveries utils/gst-image-recoveries.json`. The same error dialog is available under a working image link beside the broken link in the official manual. This fallback is used only after the original returns 404, is restricted to the exact listed HTTPS URL, and must match the recorded SHA-256. The PDF and manifest disclose the recovery source. Other missing screenshots remain partial; figures are not invented or silently substituted. `--include-recovery-references` adds the government's original IMS **draft** and GST known-issues PDF as separately named companion references, retaining their published versions.

Downloaded material can be large. The hidden `.cache` folder supports retries and avoids fetching the same screenshot repeatedly. Keep it while downloads are running; it can be removed after all manuals have finished if space is needed.

Official starting point: https://www.gst.gov.in/help/helpmodules
