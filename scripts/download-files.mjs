/**
 * One-off: download the source PDF/image for a list of request_id /
 * transaction_id / result_id values from S3.
 *
 * Run from the project root with the env file loaded:
 *   node --env-file=.env scripts/download-files.mjs
 *
 * Files land in ./downloads/ named `<request_id>__<original_filename>`.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { getDownloadFileUrl } from "../lib/aws.js";

const IDS = [
  "019ea61d-9fd4-7128-95b6-1ccba61fc330",
  "019ea61b-ddb7-7364-9233-d90394e9666d",
  "019ea603-36f7-703e-a767-b3ef25d3ed21",
  "019ea5ac-ce13-7756-89ea-975f27494bc3",
  "019ea5ac-4a96-7319-8622-15adb2d26ad7",
  "019ea5ab-df61-7390-be23-7fa773ac0e11",
  "019ea5a8-b091-7014-b75d-8e9840054d27",
  "019ea5a8-4f54-77ea-8e52-8b7a7d63b7aa",
  "019ea5a7-617e-773e-b056-cd32cc9299cf",
  "019ea5a8-309f-71da-b483-eb07e347f656",
  "019ea64d-aa91-74c9-b7f6-02f965da3984",
  "019ea5a4-4d82-704c-9c81-2de71e5a243f",
  "019ea5a4-7198-74af-9c31-8426431b8da4",
  "019ea5a5-15d9-735c-8df9-228a92d468ae",
  "019ea5a4-fd84-71be-9589-735312aaa9cc",
  "019ea5a6-2f9a-7508-a395-19c045f5de0c",
  "019ea5a5-61fc-74dd-a651-2c6101f62c9e",
  "019ea5a6-4e2e-7788-a409-80dbadc624f0",
  "019ea5a7-0f0d-75b8-9e08-335679cd04a3",
  "019ea5a0-4e1b-727e-bfb6-5c4e72b55027",
  "req_db3e9e2e523c4349a44a286e468985b1",
  "req_e8a9de86c6e04d15ab841d84685617c0",
  "req_0dcbd0373d44441b8671a7d11272b95e",
  "req_15f330da9617494db8bb6516b5def0ff",
  "req_be4ae2d5cbeb4ab68d9306af20c65652",
  "req_b607b9bcc01b452fa451f8ec09bf219e",
  "req_cfa987c1250d40708308f64ecb928f0b",
  "req_5403f8d5d98e48a0945b65be04365608",
  "req_f4e2615960cf4138a50ec9b725d8c488",
  "req_d32b0c1d15c74620b94fc4376d452dae",
  "req_25abcc23cbc4485db86bc07cfa26c0b7",
  "req_941ebe10e7a34193b530f9ff2d9ccbed",
  "req_30e4f85ab1bf4e8ab1cc5300e625b089",
  "req_26258a00841e4f0a8cc446b7a0a7bf6c",
  "req_956741c890e1475fae1eaff2f008f6d6",
  "req_589243d7fc8a4ddabeb048a872abcf65",
  "019e97ef-b81b-752d-9abd-602a09530040",
  "req_cda19adc37c94f719743983ea085e2d3",
  "req_b9b2f7d9a29247bc87eb421efa60c404",
  "019e97f3-83d3-76bc-8b2f-03ddf91ea8de",
  "019e9824-d710-74ef-8f50-a1c539e52636",
  "3326b7bb-2326-4002-8914-038e029c3ac0",
  "req_3f65a52cc8cd4905aa8349f55e69af02",
  "e9ea6619-70ab-4fb4-83c8-9b7d82457f51",
  "b1b9ab27-e760-4933-af96-08be9e7fadf5",
  "dc13c3d6-b57f-44a7-93db-d19413cc7ce1",
  "51529f7a-2f3e-44d8-8584-598351213709",
  "34b12a32-a7af-4f7a-b370-972f4f6dcf4f",
  "d0c1f720-9677-41f6-9b50-9cca4e1894ea",
  "92ae2fe9-ac61-4b19-89a6-a533368f3a6f",
  "8390444f-9ac6-4bfa-b04a-71b0134263e1",
  "37fafc20-e6d0-4052-92dd-94f34663bd21",
  "5932787b-7aa1-4790-9df2-5e48301d2151",
  "d7386e49-0cb1-4165-8bbf-69f02ae087c1",
  "bb3038fa-e6f1-466b-a7cf-4fc5f15c2b6e",
  "54eaa115-d499-40ee-aded-e026c4c20781",
  "772051bf-705c-4c77-8523-82f10564f8bb",
];

const ids = [...new Set(IDS)];
const OUT_DIR = path.resolve("downloads");

function sanitize(name) {
  return String(name || "file").replace(/[\/\\:*?"<>|\r\n]/g, "_");
}

async function main() {
  if (!process.env.MAIN_FINANCE_DB_URL) throw new Error("MAIN_FINANCE_DB_URL not set");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: process.env.MAIN_FINANCE_DB_URL });

  const { rows } = await pool.query(
    `SELECT request_id, transaction_id, result_id, document_path, original_filename,
            COALESCE(NULLIF(BTRIM(ocr_document_type), ''), '') AS doc_type, status
       FROM document_processing_requests
      WHERE request_id = ANY($1)
         OR transaction_id = ANY($1)
         OR result_id::text = ANY($1)`,
    [ids]
  );

  // Which of the requested ids did we match?
  const matched = new Set();
  for (const r of rows) {
    [r.request_id, r.transaction_id, r.result_id != null ? String(r.result_id) : null]
      .filter(Boolean)
      .forEach((v) => { if (ids.includes(v)) matched.add(v); });
  }
  const notFound = ids.filter((id) => !matched.has(id));

  console.log(`Requested ${ids.length} unique ids → matched ${rows.length} DB rows.`);

  let ok = 0;
  const noPath = [];
  const notInS3 = [];
  const failed = [];

  for (const row of rows) {
    const tag = row.request_id || row.transaction_id || String(row.result_id);
    if (!row.document_path) { noPath.push(tag); continue; }

    const base = sanitize(row.original_filename || row.document_path.split("/").pop() || tag);
    const outName = `${sanitize(tag)}__${base}`;
    const outPath = path.join(OUT_DIR, outName);

    try {
      const url = await getDownloadFileUrl(row.document_path, base);
      if (!url) { notInS3.push(`${tag}  (${row.document_path})`); continue; }
      const res = await fetch(url);
      if (!res.ok) { failed.push(`${tag}  HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outPath, buf);
      ok++;
      console.log(`  ✓ ${outName}  (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failed.push(`${tag}  ${err.message}`);
    }
  }

  await pool.end();

  console.log(`\nDownloaded ${ok} file(s) into ${OUT_DIR}`);
  if (noPath.length)   console.log(`\nNo document_path (nothing to download) [${noPath.length}]:\n  ${noPath.join("\n  ")}`);
  if (notInS3.length)  console.log(`\nMissing in S3 [${notInS3.length}]:\n  ${notInS3.join("\n  ")}`);
  if (failed.length)   console.log(`\nFailed [${failed.length}]:\n  ${failed.join("\n  ")}`);
  if (notFound.length) console.log(`\nNo DB row for these ids [${notFound.length}]:\n  ${notFound.join("\n  ")}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
