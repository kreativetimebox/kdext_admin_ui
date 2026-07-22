import { ZipArchive } from "archiver";
import { getObjectBuffer } from "@/lib/aws";

function extensionFor(documentPath) {
  if (!documentPath) return "";
  const clean = documentPath.split("?")[0].split("#")[0];
  const base = clean.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

// Small fixed-size concurrency pool, same pattern already used in
// lib/alertMonitor.js / lib/bulkReprocessAlerts.js — bounds how many S3
// fetches are in flight at once instead of firing all of them together.
async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  async function runner() {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

/**
 * Builds a zip (as a Node Readable stream) of the given documents, fetched
 * directly from S3 via the SDK (see lib/aws.js's getObjectBuffer). Each
 * entry is named `${name}${extension}` — name
 * is meant to be the result_id/request_id, extension is inferred from the
 * stored document_path. A document that fails to fetch (missing file,
 * expired/broken path, network error) is skipped rather than aborting the
 * whole zip; skipped names are listed in a `_skipped.txt` manifest appended
 * at the end so the download is still self-explanatory.
 *
 * @param {Array<{name: string, documentPath: string|null}>} files
 * @returns {archiver.Archiver} a Node Readable (also writable-into) stream
 */
export function buildDocumentsZip(files) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("warning", (err) => console.warn("[documentZip] archiver warning:", err.message));
  archive.on("error", (err) => console.error("[documentZip] archiver error:", err.message));

  const skipped = [];

  (async () => {
    await runWithConcurrency(files, 5, async (file) => {
      if (!file.documentPath) {
        skipped.push(`${file.name} (no source file on record)`);
        return;
      }
      try {
        const buffer = await getObjectBuffer(file.documentPath);
        if (!buffer) {
          skipped.push(`${file.name} (file not found in storage)`);
          return;
        }
        archive.append(buffer, { name: `${file.name}${extensionFor(file.documentPath)}` });
      } catch (err) {
        skipped.push(`${file.name} (${err.message})`);
      }
    });

    if (skipped.length > 0) {
      archive.append(skipped.join("\n") + "\n", { name: "_skipped.txt" });
    }
    archive.finalize();
  })();

  return archive;
}
