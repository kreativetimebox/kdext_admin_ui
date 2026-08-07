// Intent classification + live DB context for DEXAI Satori — mirrors the
// approach kdext_api's own /v1/copilot/chat uses internally (regex/keyword
// intent detection, no second LLM round-trip), but reads document_processing_requests
// directly via the admin UI's own DB pool instead of going through kdext_api,
// since the admin UI can see every client's data a staff member is allowed to
// see (and kdext_api's copilot endpoint has no notion of internal_users at all).
import { dexaiQuery } from "@/lib/dexaidb";

const REQUEST_ID_RE = /\breq_[0-9a-f]{16,64}\b/i;
// Matches result IDs (PDR-136578) and Bug IDs (BUG-00918) alike.
const DOC_CODE_RE = /\b[A-Za-z]{2,6}-\d{3,9}\b/;

const LIST_INTENT_KEYWORDS = [
  "my documents", "my document", "recent documents", "recent uploads",
  "processing history", "how many", "dashboard", "flagged documents",
  "documents processed", "failed validation", "bug tracker", "open bugs",
  "hitl queue", "to be tested", "pending review", "this week", "this month",
];

const MAX_CONTEXT_CHARS = 6000;

/** @returns {{intent: 'document'|'list'|'general', code: string|null}} */
export function classifyIntent(latestMessage) {
  const text = latestMessage || "";
  const reqMatch = REQUEST_ID_RE.exec(text);
  if (reqMatch) return { intent: "document", code: reqMatch[0] };
  const docMatch = DOC_CODE_RE.exec(text);
  if (docMatch) return { intent: "document", code: docMatch[0] };
  if (LIST_INTENT_KEYWORDS.some((kw) => text.toLowerCase().includes(kw))) {
    return { intent: "list", code: null };
  }
  return { intent: "general", code: null };
}

/**
 * Builds an optional JSON context block to append to the system prompt.
 * Client-scoped accounts (isClientRole) only ever see their own clientId's
 * rows — a missing clientId short-circuits to "no data" rather than falling
 * through to an unscoped query.
 */
export async function buildContextBlock({ intent, code, isClientRole, clientId }) {
  if (intent === "document") {
    // bug_tracker_id is an integer column; its human-friendly "BUG-00918" form
    // is only ever constructed on the fly (see lib/bugTracker.js), so match it
    // the same way here rather than comparing the raw integer to text.
    const params = [code.toUpperCase()];
    let clause = `(
      UPPER(result_id) = $1
      OR UPPER(request_id) = $1
      OR ('BUG-' || LPAD(bug_tracker_id::text, 5, '0')) = $1
    ) AND is_deleted = false`;
    if (isClientRole) {
      if (!clientId) {
        return "NOTE TO ASSISTANT: this account has no client scope configured — do not disclose any document data, tell the user to contact support.";
      }
      params.push(clientId);
      clause += " AND user_id = $2";
    }

    const result = await dexaiQuery(
      `SELECT result_id, request_id, user_id, ocr_document_type, status, hitl_status, validation,
              issue_type, issue_description, bug_status, bug_tracker_id, submitted_at, completed_at,
              formatted_result, hitl_updated_result
         FROM document_processing_requests
        WHERE ${clause}
        LIMIT 1`,
      params
    );
    const row = result.rows[0];
    if (!row) {
      return (
        `NOTE TO ASSISTANT: the user referenced "${code}" but no matching document was found` +
        (isClientRole ? " under this client's account" : "") +
        `. Tell them plainly you couldn't find it and ask them to double-check the ID.`
      );
    }
    return "DOCUMENT CONTEXT (JSON):\n" + JSON.stringify(row, null, 0).slice(0, MAX_CONTEXT_CHARS);
  }

  if (intent === "list") {
    const params = [];
    let clause = "is_deleted = false";
    if (isClientRole) {
      if (!clientId) return null;
      params.push(clientId);
      clause += " AND user_id = $1";
    }

    const [counts, recent] = await Promise.all([
      dexaiQuery(
        `SELECT status, COUNT(*) FROM document_processing_requests WHERE ${clause} GROUP BY status`,
        params
      ),
      dexaiQuery(
        `SELECT result_id, request_id, ocr_document_type, status, hitl_status, validation, submitted_at
           FROM document_processing_requests WHERE ${clause}
          ORDER BY submitted_at DESC LIMIT 8`,
        params
      ),
    ]);

    return (
      "ACCOUNT SUMMARY (JSON" +
      (isClientRole ? ", scoped to the current client" : ", across all clients — this user is internal staff") +
      "):\n" +
      JSON.stringify({
        by_status: Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.count)])),
        recent_8: recent.rows,
      })
    );
  }

  return null;
}
