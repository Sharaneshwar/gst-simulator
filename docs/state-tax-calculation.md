# State-based practice tax calculation

A completed registration generates its GSTIN using the selected State/UT code and PAN. Outward invoice calculations compare the registered supplier state with Place of Supply. Purchase calculations compare the supplier state (GSTIN prefix) with the entered Place of Supply, defaulting Place of Supply to the recipient's registered state when omitted.

For ordinary taxable supplies, matching supplier/POS states split the GST rate between CGST and state/UT tax; differing states use IGST. GSTR-3B exempt/non-GST inward-supply classification uses the same comparison. A purchase whose supplier and POS are in the same state while the recipient is registered elsewhere is marked **Ineligible**, with a visible reason, and excluded from eligible ITC.

Sources: [IGST Act, section 8](https://taxinformation.cbic.gov.in/content-page/explore-act/1000616/1000001) and the [GST portal GSTR-2B advisory](https://tutorial.gst.gov.in/offlineutilities/returns/GSTR2B/GSTR-2B_Advisory.pdf).

The change applies when calculating new or edited purchase documents. Existing saved invoice amounts and explicitly supplied tax heads in uploads are preserved. This basic comparison does not establish every special place-of-supply, exemption, SEZ, import or ITC-eligibility rule.
