/**
 * Bulk reprocess: find every document_processing_requests row with
 * status = 'FAILED' and re-run it through the OCR pipeline in place.
 * Thin CLI wrapper around lib/reprocessFailedDocuments.js — the same logic
 * also backs the automatic nightly trigger (lib/failedDocumentMonitor.js).
 *
 * Run from the project root with the env file loaded:
 *   node --env-file=.env scripts/reprocess-failed.mjs [--dry-run] [--limit=N] [--concurrency=N]
 *
 * --dry-run       resolve the document type for each row but don't call the
 *                 OCR API or touch the DB.
 * --limit=N       only process the first N failed rows (useful for a test run).
 * --concurrency=N documents in flight at once (default 5).
 */
import getPool from "../lib/dexaidb.js";
import { reprocessFailedDocuments } from "../lib/reprocessFailedDocuments.js";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 5;

async function main() {
  if (!process.env.MAIN_FINANCE_DB_URL) throw new Error("MAIN_FINANCE_DB_URL is not set");

  const { attempted, ok, failures } = await reprocessFailedDocuments({
    limit: LIMIT,
    concurrency: CONCURRENCY,
    dryRun: DRY_RUN,
    onStart: (found, attempted) => {
      console.log(
        `Found ${found} FAILED row(s)${LIMIT ? `, processing first ${attempted}` : ""}, ` +
          `concurrency=${CONCURRENCY}.${DRY_RUN ? " [DRY RUN]" : ""}\n`
      );
    },
    onItemDone: (done, total, result) => {
      const tag = result.tag;
      if (result.ok) {
        console.log(
          `[${done}/${total}] ${tag} ... ` +
            (result.dryRun
              ? `would reprocess as ${result.documentType}`
              : `reprocessed as ${result.documentType}`)
        );
      } else {
        console.log(`[${done}/${total}] ${tag} ... SKIPPED — ${result.reason}`);
      }
    },
    onHeartbeat: (tag, status, elapsedS) => {
      console.log(`  ... ${tag} still ${status} after ${elapsedS}s`);
    },
  });

  console.log(`\nDone. ${ok}/${attempted} succeeded${DRY_RUN ? " (dry run)" : ""}.`);
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
