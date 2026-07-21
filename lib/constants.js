/**
 * Shared dropdown option lists for the bug-tracking fields
 * (issue_type / bug_status) on document_processing_requests.
 * Used by the view page and the two table pages (HITL-EDIT, Business Users)
 * so the lists can't drift between them.
 */
// Lowercase to match the dpr_issue_type_chk CHECK constraint on
// document_processing_requests.issue_type in the DB.
export const ISSUE_TYPES = [
  "no issue",
  "known issue",
  "wrong document type",
  "table items are wrong",
  "net amount and tax wrongly calculated",
  "supplier name is not extracted",
  "single input page, multiple output",
  "credit-debit value swapping",
  "bank account name and number wrongly extracted",
  "opening date and closing date wrongly extracted",
  "opening balance and closing balance wrongly extracted",
  "missing transaction data",
  "quantities are not extracted",
  "tax amount not extracted",
  "low quality document input",
  "handwritten input document",
  "receipt number wrongly extracted",
  "line level discount wrongly extracted",
  "connection error",
  "other",
];

export const BUG_STATUSES = ["Open", "TO_BE_TESTED", "Closed"];
