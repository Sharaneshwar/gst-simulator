"""Convert the official GST workbook to a reproducible local search snapshot.

Usage: python3 scripts/import-hsn-directory.py /path/HSN_SAC.xlsx --as-of YYYY-MM-DD
Uses only Python's standard library. Does not modify the source workbook.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("workbook", type=pathlib.Path)
parser.add_argument("--as-of", default=datetime.date.today().isoformat())
args = parser.parse_args()
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
rel_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
data = {
    "source": "https://tutorial.gst.gov.in/downloads/HSN_SAC.xlsx",
    "retrievedOn": args.as_of,
    "sha256": hashlib.sha256(args.workbook.read_bytes()).hexdigest(),
    "excluded": [],
    "normalizedCodes": [],
    "alternateDescriptions": [],
}

with zipfile.ZipFile(args.workbook) as book:
    strings = []
    if "xl/sharedStrings.xml" in book.namelist():
        strings = ["".join(si.itertext()) for si in ET.fromstring(book.read("xl/sharedStrings.xml"))]
    relations = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))}
    sheets = ET.fromstring(book.read("xl/workbook.xml")).find("s:sheets", ns)
    for sheet in sheets:
        kind = {"HSN_MSTR": "goods", "SAC_MSTR": "services"}.get(sheet.attrib["name"])
        if not kind:
            continue
        target = relations[sheet.attrib[f"{{{rel_ns}}}id"]]
        target = target.lstrip("/") if target.startswith("/") else "xl/" + target
        rows = ET.fromstring(book.read(target)).findall("s:sheetData/s:row", ns)
        records = {}
        unspaced = set()
        for row in rows[1:]:
            values = {}
            for cell in row:
                raw = cell.find("s:v", ns)
                text = raw.text if raw is not None else "".join(cell.findtext("s:is/s:t", "", ns))
                values[re.sub(r"\d", "", cell.attrib["r"])] = strings[int(text)] if cell.attrib.get("t") == "s" else text
            original = str(values.get("A", "")).strip()
            code = re.sub(r"\s+", "", original)
            description = re.sub(r"\s+", " ", str(values.get("B", "")).replace("_x000D_", " ")).strip()
            if not re.fullmatch(r"\d{2}(?:\d{2}){0,3}", code) or not description or (kind == "services" and len(code) > 6):
                data["excluded"].append({"sheet": sheet.attrib["name"], "row": int(row.attrib["r"]), "code": original, "reason": "Invalid code length or missing description; no inferred digits"})
                continue
            if original != code:
                data["normalizedCodes"].append({"original": original, "code": code})
            if code in records and records[code] != description:
                # Prefer the source row whose code is already unspaced. Preserve
                # the other description as searchable source text, not a new code.
                if code in unspaced and original == code:
                    raise ValueError(f"Conflicting descriptions for {kind} code {code}")
                alternate = records[code] if original == code else description
                data["alternateDescriptions"].append({"kind": kind, "code": code, "description": alternate})
                if code in unspaced:
                    continue
            records[code] = description
            if original == code:
                unspaced.add(code)
        data[kind] = [[code, records[code]] for code in sorted(records)]

if len(data.get("goods", [])) < 20000 or len(data.get("services", [])) < 600:
    raise ValueError("Unexpectedly incomplete GST directory; snapshot not replaced")
output = pathlib.Path(__file__).resolve().parent.parent / "data" / "hsn-sac.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
print(json.dumps({"goods": len(data["goods"]), "services": len(data["services"]), "excluded": data["excluded"], "normalizedCodes": data["normalizedCodes"]}, indent=2))
