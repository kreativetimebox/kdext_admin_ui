/**
 * Bulk reprocess: find every document_processing_requests row with
 * status = 'FAILED' and re-run it through the OCR pipeline in place,
 * using the same start -> poll -> commit cycle as the /reprocess API route
 * (see lib/queries.js, lib/ocrClient.js, lib/aws.js).
 *
 * Run from the project root with the env file loaded:
 *   node --env-file=.env scripts/reprocess-failed.mjs [--dry-run] [--limit=N]
 *
 * --dry-run   resolve the document type for each row but don't call the OCR
 *             API or touch the DB.
 * --limit=N   only process the first N failed rows (useful for a test run).
 */
import { dexaiQuery as query } from "../lib/dexaidb.js";
import getPool from "../lib/dexaidb.js";
import {
  getReprocessTarget,
  getRequestStatus,
  commitReprocessedResult,
} from "../lib/queries.js";
import { getSignedFileUrl } from "../lib/aws.js";
import { submitReprocess } from "../lib/ocrClient.js";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

function isPdf(path) {
  return /\.pdf($|\?)/i.test(path || "");
}

/**
 * Map the document's free-text type (ocr_document_type / document_types.type_name)
 * plus the source file extension to the pipeline's enum. Mirrors the type
 * matching in lib/queries.js's RESOLVED_TYPE_LOWER / RESOLVED_TYPE_COMPACT.
 * Returns null when the type can't be confidently classified.
 */
function resolveDocumentType(rawType, sourceFile) {
  const t = (rawType || "").toLowerCase();
  const compact = t.replace(/[^a-z]/g, "");
  const pdf = isPdf(sourceFile);

  if (t.includes("bank statement") || compact.includes("bankstatement")) {
    return "BankStatementPDF"; // no image variant in the pipeline's enum
  }
  if (t.includes("receipt")) return pdf ? "ReceiptPDF" : "ReceiptImage";
  if (t.includes("invoice")) return pdf ? "InvoicePDF" : "InvoiceImage";
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilDone(requestId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const row = await getRequestStatus(requestId);
    const status = row?.status || "PENDING";
    if (TERMINAL_STATUSES.has(status)) {
      return { status, error_message: row?.error_message || null };
    }
  }
  return { status: "TIMEOUT" };
}

async function reprocessOne(row) {
  const target = await getReprocessTarget(row.result_id || row.request_id);
  if (!target) return { ok: false, reason: "reprocess target not found" };
  if (!target.source_file) return { ok: false, reason: "no source file to reprocess" };

  const documentType = resolveDocumentType(target.document_type, target.source_file);
  if (!documentType) {
    return {
      ok: false,
      reason: `could not resolve pipeline document type from "${target.document_type}"`,
    };
  }

  if (DRY_RUN) return { ok: true, dryRun: true, documentType };

  const signedUrl = await getSignedFileUrl(target.source_file);
  if (!signedUrl) return { ok: false, reason: "source file missing in S3" };

  const submitted = await submitReprocess({ s3Url: signedUrl, documentType });
  if (!submitted.ok) return { ok: false, reason: submitted.message || "failed to start reprocessing" };

  const final = await pollUntilDone(submitted.newRequestId);
  if (final.status !== "COMPLETED") {
    return { ok: false, reason: final.error_message || `reprocessing ended as ${final.status}` };
  }

  const committed = await commitReprocessedResult({
    targetId: row.result_id || row.request_id,
    newRequestId: submitted.newRequestId,
    documentType,
  });
  if (!committed) return { ok: false, reason: "commit failed (no matching row)" };

  return { ok: true, documentType };
}

async function main() {
  if (!process.env.MAIN_FINANCE_DB_URL) throw new Error("MAIN_FINANCE_DB_URL is not set");

  const { rows } = await query(
    `SELECT result_id, request_id, document_path, ocr_document_type
       FROM document_processing_requests
      WHERE status = 'FAILED'
        AND is_deleted = false
      ORDER BY submitted_at DESC NULLS LAST`,
    []
  );

  const targets = LIMIT ? rows.slice(0, LIMIT) : rows;
  console.log(
    `Found ${rows.length} FAILED row(s)${LIMIT ? `, processing first ${targets.length}` : ""}.${
      DRY_RUN ? " [DRY RUN]" : ""
    }\n`
  );

  let ok = 0;
  const failures = [];

  for (const [i, row] of targets.entries()) {
    const tag = row.request_id || row.result_id;
    process.stdout.write(`[${i + 1}/${targets.length}] ${tag} ... `);
    try {
      const result = await reprocessOne(row);
      if (result.ok) {
        ok++;
        console.log(
          result.dryRun
            ? `would reprocess as ${result.documentType}`
            : `reprocessed as ${result.documentType}`
        );
      } else {
        failures.push({ tag, reason: result.reason });
        console.log(`SKIPPED — ${result.reason}`);
      }
    } catch (err) {
      failures.push({ tag, reason: err.message });
      console.log(`ERROR — ${err.message}`);
    }
  }

  console.log(`\nDone. ${ok}/${targets.length} succeeded${DRY_RUN ? " (dry run)" : ""}.`);
  if (failures.length) {
    console.log(`\nFailures/skips [${failures.length}]:`);
    failures.forEach((f) => console.log(`  ${f.tag}: ${f.reason}`));
  }

  await getPool().end();
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await getPool().end();
  process.exit(1);
});
