"use strict";
const crypto = require("node:crypto");
const rules = require("./return-rules");
const ims = require("./ims");
const H = ["igst", "cgst", "sgst", "cess"];
function sync(w, taxpayer, validateInvoice) {
  const at = ims.asOf(w);
  const outcomes = [];
  for (const doc of w.documents.einvoice || []) {
    const sourceDate =
      doc.referenceDate || (doc.issuedAt || doc.createdAt || "").slice(0, 10);
    if (!sourceDate || !doc.invoice) continue;
    const available = new Date(Date.parse(sourceDate) + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    doc.irpAvailableOn = available;
    const period = doc.invoice.date.slice(0, 7),
      p = w.periods[period];
    const existing = Object.values(w.periods)
      .flatMap((data) => data.invoices.map((row) => ({ data, row })))
      .find(
        ({ row }) =>
          row.irn === doc.irn ||
          row.sourceIrn === doc.irn ||
          row.sourceDocumentId === doc.id,
      );
    if (doc.status === "Cancelled") {
      if (existing) {
        if (existing.data.gstr1.status === "Filed" || existing.row.irnEdited) {
          existing.row.irnCancelled = true;
          doc.irpSyncStatus = "Cancelled — review amendment";
        } else {
          existing.data.invoices = existing.data.invoices.filter(
            (row) => row.id !== existing.row.id,
          );
          existing.data.gstr1.revision++;
          delete existing.data.gstr1.summary;
          existing.data.gstr1.status = "In Progress";
          doc.irpSyncStatus = "Cancellation synchronized";
        }
      } else doc.irpSyncStatus = "Cancelled";
      continue;
    }
    if (existing) {
      doc.irpSyncStatus = existing.row.irnEdited
        ? "Edited in GSTR-1"
        : "Auto-populated";
      continue;
    }
    if (doc.irpSuppressed) {
      doc.irpSyncStatus = "Deleted in GSTR-1";
      continue;
    }
    if (at < available) {
      doc.irpSyncStatus = "Awaiting IRP synchronization";
      continue;
    }
    if (p?.gstr1.status === "Filed") {
      doc.irpSyncStatus = "Return filed — review amendment";
      continue;
    }
    if (doc.seller?.gstin && doc.seller.gstin !== taxpayer.gstin) {
      doc.irpSyncStatus = "Supplier mismatch";
      continue;
    }
    const note = /credit/i.test(doc.documentType)
      ? "Credit Note"
      : /debit/i.test(doc.documentType)
        ? "Debit Note"
        : null;
    const registered = !!doc.invoice.gstin && doc.invoice.gstin !== "URP";
    const exportSupply =
      /export/i.test(doc.subType || "") || doc.buyer?.state === "Outside India";
    const section = note
      ? registered
        ? "CDNR"
        : "CDNUR"
      : exportSupply
        ? "EXP"
        : "B2B";
    const items = doc.items?.map((item) => ({
      taxable: item.taxable,
      rate: item.rate,
      cess: item.cess || item.taxes?.cess || 0,
      taxes: item.taxes,
    }));
    const input = {
      ...doc.invoice,
      section,
      place: doc.place || doc.buyer?.state || taxpayer.state,
      items,
      rate: items?.[0]?.rate || 0,
      noteType: note || "Credit Note",
      exportType: /without|wop/i.test(doc.subType || "")
        ? "Without payment of tax"
        : "With payment of tax",
    };
    try {
      const data =
        p ||
        (w.periods[period] = {
          invoices: [],
          purchases: [],
          uploads: [],
          gstr1: { status: "Not Filed", revision: 0 },
          gstr3b: { status: "Not Filed", tables: {}, saved: false },
        });
      const prior = data.invoices.find(
        (row) =>
          row.id === doc.invoiceId ||
          (row.number === input.number && row.section === section),
      );
      if (
        prior &&
        (Math.abs(prior.taxable - input.taxable) > 0.01 ||
          H.some(
            (h) =>
              Math.abs((prior.taxes[h] || 0) - (input.taxes[h] || 0)) > 0.01,
          ))
      )
        throw Error(
          "Existing return document differs; reconcile the duplicate before synchronization.",
        );
      const row = validateInvoice(
        { ...input, ...(prior ? { id: prior.id } : {}) },
        period,
        taxpayer.state,
        data.invoices,
      );
      Object.assign(row, {
        irn: doc.irn,
        sourceIrn: doc.irn,
        sourceDocumentId: doc.id,
        irnDate: sourceDate,
        source: "E-Invoice",
        irnEdited: false,
      });
      if (prior) data.invoices[data.invoices.indexOf(prior)] = row;
      else data.invoices.push(row);
      data.gstr1.revision++;
      data.gstr1.status = "In Progress";
      delete data.gstr1.summary;
      doc.irpSyncStatus = "Auto-populated";
      delete doc.irpError;
      outcomes.push({ id: doc.id, number: input.number, period });
    } catch (error) {
      doc.irpSyncStatus = "Requires reconciliation";
      doc.irpError = error.message;
    }
  }
  return outcomes;
}
module.exports = { sync };
