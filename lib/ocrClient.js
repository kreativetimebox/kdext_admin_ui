/*
 * Thin server-side client for the external OCR API (apiocr.dexaitech.com).
 *
 * Only used by the reprocess flow: it submits an existing document's S3 URL to
 * /process-document so the pipeline re-extracts it. The endpoint authenticates
 * with an external user's API key (X-API-Key) — the admin UI otherwise talks
 * straight to the DB, so this is the one place it needs OCR_API_KEY.
 *
 * Responses are TOON (a line-oriented `key: value` text format), not JSON, so
 * we parse the handful of scalar fields we care about ourselves.
 */

const OCR_API_BASE_URL = (
  process.env.OCR_API_BASE_URL || "https://apiocr.dexaitech.com"
).replace(/\/+$/, "");

// External OCR API key (X-API-Key for /process-document). Env var takes
// precedence; the hardcoded value is the fallback.
const OCR_API_KEY =
  process.env.OCR_API_KEY || "sk_mny__Oogmjf4zk92I3OX2v4b1xQMgpg6UXteAaFF-50";

/**
 * Parse a flat TOON document (top-level scalar fields only) into an object.
 * Values are unquoted where possible; nested/array TOON is ignored since the
 * process-document response we consume is flat.
 */
export function parseToonFlat(text) {
  const out = {};
  if (!text) return out;
  for (const rawLine of String(text).split("\n")) {
    const line = rawLine.trimEnd();
    // Only top-level `key: value` lines (no leading indentation → not nested).
    const m = /^([A-Za-z0-9_]+):\s?(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    // Strip surrounding quotes TOON adds around strings with special chars.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * Submit a document (by URL) to /process-document for re-extraction.
 *
 * @param {object} args
 * @param {string} args.s3Url        - a downloadable URL to the source document
 * @param {string} args.documentType - document type hint passed to the pipeline
 * @returns {Promise<{ok: boolean, newRequestId?: string, status?: string, message?: string, httpStatus: number}>}
 */
export async function submitReprocess({ s3Url, documentType }) {
  if (!OCR_API_KEY) {
    throw new Error("OCR_API_KEY is not configured on the admin server");
  }

  const res = await fetch(`${OCR_API_BASE_URL}/v1/documents/process-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": OCR_API_KEY,
    },
    body: JSON.stringify({ s3_url: s3Url, document_type: documentType }),
  });

  const text = await res.text();
  const parsed = parseToonFlat(text);

  // 422 = classifier couldn't identify the document; error key = hard failure.
  if (!res.ok || parsed.error) {
    return {
      ok: false,
      httpStatus: res.status,
      status: parsed.status,
      message: parsed.error || parsed.message || `OCR API returned ${res.status}`,
    };
  }

  if (!parsed.request_id) {
    return {
      ok: false,
      httpStatus: res.status,
      message: parsed.message || "OCR API response did not include a request_id",
    };
  }

  return {
    ok: true,
    httpStatus: res.status,
    newRequestId: parsed.request_id,
    status: parsed.status,
    message: parsed.message,
  };
}
