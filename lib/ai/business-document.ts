import { z } from "zod";
import { AI_MODEL, getAnthropic } from "@/lib/ai/client";
import { toDateOnly } from "@/lib/import/schedule";

/**
 * Reads a business document PDF — a customer's purchase order, or one of
 * Evertech's own invoices / receipts — into the few facts the automation in
 * scripts/inbox.ts needs to file it against the right project and payment.
 *
 * Forced tool-use like the other extractors. Nothing is written here; the
 * caller decides what (if anything) to do with the result, and anything it
 * can't match unambiguously is reported for a person instead of acted on.
 */

export type BusinessDocumentType =
  | "purchase_order"
  | "invoice"
  | "receipt"
  | "tax_invoice"
  | "quotation"
  | "other";

export interface BusinessDocument {
  doc_type: BusinessDocumentType;
  document_number: string | null;
  document_date: string | null;
  /** Quotation numbers printed anywhere on it, e.g. "EVT26QT029R3". */
  quotation_refs: string[];
  /** For a PO: the customer's PO number. */
  po_number: string | null;
  customer_name: string | null;
  currency: string | null;
  /** Before VAT — the basis payment terms are tracked on. */
  subtotal_ex_vat: number | null;
  /** e.g. "1st installment — 40% when confirm order". */
  installment_label: string | null;
  percent: number | null;
  due_date: string | null;
}

const RECORD_DOCUMENT_TOOL = {
  name: "record_document",
  description: "Record what this business document is and its key facts.",
  input_schema: {
    type: "object" as const,
    properties: {
      doc_type: {
        type: "string",
        enum: ["purchase_order", "invoice", "receipt", "tax_invoice", "quotation", "other"],
        description:
          "purchase_order = a CUSTOMER'S order to Evertech Cooling (or a quotation the customer stamped/signed as their order). invoice = Evertech's invoice / billing note (ใบแจ้งหนี้/ใบวางบิล). receipt = Evertech's receipt (ใบเสร็จรับเงิน). tax_invoice = tax invoice / delivery note (ใบกำกับภาษี/ใบส่งของ). quotation = an unsigned quotation. other = anything else (drawings, reports, specs, letters).",
      },
      document_number: { type: "string", description: "The document's own number, e.g. EVT26IV009, or the customer's PO number for a PO." },
      document_date: { type: "string", description: "Issue date as YYYY-MM-DD, Gregorian year." },
      quotation_refs: {
        type: "array",
        items: { type: "string" },
        description: "Every quotation number printed on the document (e.g. EVT26QT029R3, BP26QT0012), including in reference fields like 'PO #: Stamped on EVT26QT029R3'. Exactly as printed.",
      },
      po_number: { type: "string", description: "For a purchase order: the customer's PO number. Omit if none is printed." },
      customer_name: { type: "string", description: "The customer (the company buying from Evertech Cooling)." },
      currency: { type: "string", description: "3-letter code, e.g. THB or USD." },
      subtotal_ex_vat: { type: "number", description: "The amount billed / paid / ordered BEFORE VAT, in the document's currency." },
      installment_label: {
        type: "string",
        description: "For an invoice or receipt: a short name for this instalment, e.g. '1st installment — 40% on order confirmation' or 'Balance payment'.",
      },
      percent: { type: "number", description: "If this instalment is stated as a percent of the contract, that percent (0-100)." },
      due_date: { type: "string", description: "Payment due date as YYYY-MM-DD, only if printed." },
    },
    required: ["doc_type", "quotation_refs"],
  },
};

const SYSTEM_PROMPT = `
You read business documents for Evertech Cooling Co., Ltd., a cooling-tower
contractor in Thailand. Documents may be in English, Thai, or both.

Rules:
- Use only what is printed. Never invent a number, date, or amount.
- Dates: output YYYY-MM-DD with a Gregorian (CE) year. Thai Buddhist Era
  years (e.g. 2569) must have 543 subtracted. Numeric dates like 26-6-2026
  or 05/03/26 are day-month-year.
- Evertech Cooling is always the seller. The customer is the other party.
- Leave out any field the document doesn't state.
`.trim();

const extracted = z.object({
  doc_type: z
    .enum(["purchase_order", "invoice", "receipt", "tax_invoice", "quotation", "other"])
    .catch("other"),
  document_number: z.string().trim().nullish(),
  document_date: z.string().nullish(),
  quotation_refs: z.array(z.string()).catch([]),
  po_number: z.string().trim().nullish(),
  customer_name: z.string().trim().nullish(),
  currency: z.string().trim().nullish(),
  subtotal_ex_vat: z.number().nullish(),
  installment_label: z.string().trim().nullish(),
  percent: z.number().nullish(),
  due_date: z.string().nullish(),
});

export async function readBusinessDocument(base64Pdf: string): Promise<BusinessDocument> {
  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [RECORD_DOCUMENT_TOOL],
    tool_choice: { type: "tool", name: "record_document" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
          { type: "text", text: "What is this document? Record its key facts." },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (b) => b.type === "tool_use" && b.name === "record_document",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model did not return structured data for this document.");
  }
  const d = extracted.parse(toolUse.input);

  const percent =
    typeof d.percent === "number" && d.percent > 0 && d.percent <= 100 ? d.percent : null;
  const subtotal =
    typeof d.subtotal_ex_vat === "number" && d.subtotal_ex_vat >= 0
      ? Math.round(d.subtotal_ex_vat * 100) / 100
      : null;

  return {
    doc_type: d.doc_type,
    document_number: d.document_number || null,
    document_date: toDateOnly(d.document_date),
    quotation_refs: [...new Set(d.quotation_refs.map((r) => r.trim().toUpperCase()).filter(Boolean))],
    po_number: d.po_number || null,
    customer_name: d.customer_name || null,
    currency: d.currency && /^[A-Za-z]{3}$/.test(d.currency) ? d.currency.toUpperCase() : null,
    subtotal_ex_vat: subtotal,
    installment_label: d.installment_label || null,
    percent,
    due_date: toDateOnly(d.due_date),
  };
}
