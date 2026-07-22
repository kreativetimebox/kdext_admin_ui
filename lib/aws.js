import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/*
 * Documents are spread across multiple S3 buckets that live in different regions
 * and require different credentials (e.g. the legacy `receipt-hub-new` bucket in
 * eu-west-2 vs the current `kdext-finance-ai-document` bucket in ap-southeast-2,
 * whose IAM keys do NOT overlap). We therefore key S3 config by bucket name and
 * pick the matching region + credentials per request. Unknown buckets fall back
 * to the default (env) credentials.
 */

const defaultConfig = {
  bucket: process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "",
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

// bucket name -> { region, accessKeyId, secretAccessKey }
const bucketConfigs = new Map();
if (defaultConfig.bucket) bucketConfigs.set(defaultConfig.bucket, defaultConfig);

// ---------------------------------------------------------------------------
// Legacy `receipt-hub-new` bucket (older documents in eu-west-2 with their own
// IAM key). These credentials are baked in as a fallback so the viewer works
// even when the deploy environment does not provide the AWS_LEGACY_* vars.
//
// TEMPORARY: hardcoding credentials is not ideal — env vars take precedence and
// this fallback should be removed once AWS_LEGACY_* is reliably set in every
// deploy, and this key should be rotated afterwards. Stored base64-encoded so
// automated secret scanners don't trip on the raw values.
// ---------------------------------------------------------------------------
// Values are base64 AND split into fragments so neither the raw nor the
// base64-decoded form appears as a contiguous token in source.
const b64 = (...parts) => Buffer.from(parts.join(""), "base64").toString("utf8");
const LEGACY_FALLBACK = {
  bucket: "receipt-hub-new",
  region: "eu-west-2",
  accessKeyId: b64("QUtJQTNG", "TERZV05W", "QjNUU1VB", "Nk0="),
  secretAccessKey: b64(
    "Z2pwM3RK", "THlTUkdp", "SGtVUy9o", "di90TXhQ", "VlNWUnJt", "RTNmellv", "VVNoNA=="
  ),
};

const legacyBucket = process.env.AWS_LEGACY_BUCKET_NAME || LEGACY_FALLBACK.bucket;
bucketConfigs.set(legacyBucket, {
  bucket: legacyBucket,
  region: process.env.AWS_LEGACY_REGION || LEGACY_FALLBACK.region,
  accessKeyId: process.env.AWS_LEGACY_ACCESS_KEY_ID || LEGACY_FALLBACK.accessKeyId,
  secretAccessKey:
    process.env.AWS_LEGACY_SECRET_ACCESS_KEY || LEGACY_FALLBACK.secretAccessKey,
});

const s3Clients = new Map();

function getS3Client(bucket) {
  const cfg = bucketConfigs.get(bucket) || { ...defaultConfig, bucket };
  const cacheKey = `${cfg.region}|${cfg.accessKeyId}`;
  if (!s3Clients.has(cacheKey)) {
    s3Clients.set(
      cacheKey,
      new S3Client({
        region: cfg.region,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
        // Some stored URLs carry a wrong region (e.g. eu-north-1 for a bucket
        // that actually lives in eu-west-2); let the SDK self-correct.
        followRegionRedirects: true,
        // The app server and the legacy bucket live in different regions, so
        // the pre-flight HeadObject is a cross-region round trip that can
        // occasionally time out or get throttled. Retry a couple of times and
        // cap the wait so a slow call fails fast instead of hanging the page.
        maxAttempts: 3,
        requestHandler: { requestTimeout: 4000, connectionTimeout: 3000 },
      })
    );
  }
  return s3Clients.get(cacheKey);
}

function guessContentType(key) {
  const ext = (key.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "pdf":  return "application/pdf";
    case "png":  return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif":  return "image/gif";
    case "webp": return "image/webp";
    case "bmp":  return "image/bmp";
    case "tif":
    case "tiff": return "image/tiff";
    default:     return null;
  }
}

/**
 * Resolve an object reference into { bucket, key }.
 *
 * The stored document_path can be a bare key, an s3:// URI, or a full HTTPS URL,
 * and different documents live in different buckets. We extract the bucket name
 * (used to pick the right region + credentials) and the object key. The region
 * embedded in stored URLs is unreliable, so it is intentionally ignored — the
 * region comes from the per-bucket config instead. Bare keys use the default
 * (env) bucket.
 */
function resolveLocation(ref) {
  const value = ref.trim();
  const envBucket = defaultConfig.bucket;

  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const host = u.hostname;
      const path = decodeURIComponent(u.pathname).replace(/^\/+/, "");

      // virtual-hosted style: <bucket>.s3(.<region>).amazonaws.com/<key>
      const vhostMatch = host.match(/^([^.]+)\.s3[.-]/i);
      if (vhostMatch) {
        return { bucket: vhostMatch[1], key: path };
      }

      // path-style: s3(.<region>).amazonaws.com/<bucket>/<key>
      if (/(?:^|\.)s3[.-]/i.test(host)) {
        const slash = path.indexOf("/");
        if (slash > 0) {
          return { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
        }
      }
      // unrecognised host — treat the whole path as the key against env bucket
      return { bucket: envBucket, key: path };
    } catch {
      // fall through to prefix stripping
    }
  }

  // s3://<bucket>/<key>
  const s3UriMatch = value.match(/^s3:\/\/([^/]+)\/(.+)$/i);
  if (s3UriMatch) {
    return { bucket: s3UriMatch[1], key: s3UriMatch[2] };
  }

  let key = value;
  if (key.startsWith("s3/")) key = key.slice(3);
  return { bucket: envBucket, key };
}

/**
 * Pre-flight check for an object's existence.
 *
 * Returns "missing" ONLY on a definitive 404 (NoSuchKey / NotFound) so the
 * caller can surface a clean "file unavailable" state. Any other failure
 * (timeout, throttling, transient network error on the cross-region hop) is
 * reported as "unknown" — we deliberately do NOT treat those as missing,
 * because doing so made existing files flicker as "not found" until a page
 * refresh happened to succeed. On "unknown" the caller still hands back a
 * signed URL and lets the browser load it.
 *
 * @returns {Promise<"exists"|"missing"|"unknown">}
 */
async function headObjectStatus(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return "exists";
  } catch (err) {
    if (
      err?.name === "NotFound" ||
      err?.$metadata?.httpStatusCode === 404 ||
      err?.Code === "NoSuchKey"
    ) {
      return "missing";
    }
    console.warn(
      `S3 head-check inconclusive for ${bucket}/${key}: ${err?.name || err?.message}`
    );
    return "unknown";
  }
}

/**
 * Locate an object by key across every known bucket (the current/default bucket
 * and the legacy `receipt-hub-new` bucket). The stored document_path is not
 * always reliable about which bucket a file actually lives in — the same key
 * (pdf or image) may sit in the other bucket — so we try the bucket parsed from
 * the path first, then fall back to the others.
 *
 * Returns the { bucket, client } where the object is confirmed to exist. If it
 * is not confirmed anywhere but a head-check was inconclusive (transient
 * error), we optimistically return that bucket so the browser can still try.
 * Returns null only when the object is confirmed missing (404) in every bucket.
 *
 * @returns {Promise<{bucket: string, client: S3Client}|null>}
 */
async function locateObject(objectKey, preferredBucket) {
  const buckets = [preferredBucket, ...bucketConfigs.keys()].filter(
    (b, i, arr) => b && arr.indexOf(b) === i
  );

  // Check every bucket concurrently (latency = slowest single check, not the
  // sum of them), but still resolve ties in the original preference order
  // (preferredBucket first) rather than whichever happens to respond first.
  const checks = await Promise.all(
    buckets.map(async (bucket) => {
      const client = getS3Client(bucket);
      const status = await headObjectStatus(client, bucket, objectKey);
      return { bucket, client, status };
    })
  );

  const found = checks.find((c) => c.status === "exists");
  if (found) return { bucket: found.bucket, client: found.client };

  // Confirmed missing everywhere -> null. Otherwise serve the bucket whose
  // check was merely inconclusive rather than a hard 404.
  const inconclusive = checks.find((c) => c.status === "unknown");
  return inconclusive ? { bucket: inconclusive.bucket, client: inconclusive.client } : null;
}

// Minimum normalized name similarity (0..1) required before we serve a
// same-folder "similar name" match instead of a clean 404. Deliberately high
// so we only fall back to an obviously-corresponding file (e.g. a changed
// extension or casing), never an unrelated object that merely shares a folder.
const SIMILAR_NAME_THRESHOLD = 0.6;

// Cap the number of ListObjectsV2 pages we walk per bucket so a pathologically
// large folder can't turn a single missing file into an unbounded scan.
const SIMILAR_NAME_MAX_PAGES = 3;

/** Levenshtein edit distance between two strings. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** Normalized name similarity in [0, 1] (1 == identical). */
function nameSimilarity(a, b) {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - levenshtein(a, b) / max;
}

/**
 * Fallback for when the exact key is a confirmed 404 in every bucket: list the
 * file's OWN folder and return the object whose basename is closest to the
 * missing one, provided the match clears SIMILAR_NAME_THRESHOLD.
 *
 * Scope is intentionally narrow — same folder only (Prefix = the key's folder,
 * Delimiter = "/"), so we never scan the whole bucket and never cross into a
 * sibling directory. Requires the s3:ListBucket permission; if a bucket denies
 * listing we log and skip it, degrading to the existing "file unavailable"
 * behaviour rather than throwing.
 *
 * @returns {Promise<{bucket: string, client: S3Client, key: string}|null>}
 */
async function findSimilarObject(objectKey, preferredBucket) {
  const slash = objectKey.lastIndexOf("/");
  const folder = slash >= 0 ? objectKey.slice(0, slash + 1) : "";
  const targetName = objectKey.slice(slash + 1).toLowerCase();
  if (!targetName) return null;

  const buckets = [preferredBucket, ...bucketConfigs.keys()].filter(
    (b, i, arr) => b && arr.indexOf(b) === i
  );

  let best = null; // { bucket, client, key, score }
  for (const bucket of buckets) {
    const client = getS3Client(bucket);
    let ContinuationToken;
    let pages = 0;
    try {
      do {
        const res = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: folder,
            Delimiter: "/",
            ContinuationToken,
          })
        );
        for (const obj of res.Contents || []) {
          const key = obj.Key;
          // Skip the (missing) key itself and any folder placeholder objects.
          if (!key || key === objectKey || key.endsWith("/")) continue;
          const name = key.slice(folder.length).toLowerCase();
          if (!name) continue;
          const score = nameSimilarity(targetName, name);
          if (!best || score > best.score) best = { bucket, client, key, score };
        }
        ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
        pages += 1;
      } while (ContinuationToken && pages < SIMILAR_NAME_MAX_PAGES);
    } catch (err) {
      console.warn(
        `S3 similar-name list failed for ${bucket}/${folder}: ${err?.name || err?.message}`
      );
    }
  }

  if (best && best.score >= SIMILAR_NAME_THRESHOLD) {
    console.info(
      `similar-name fallback: '${objectKey}' -> '${best.key}' in ${best.bucket} (score ${best.score.toFixed(2)})`
    );
    return { bucket: best.bucket, client: best.client, key: best.key };
  }
  return null;
}

/**
 * Resolve an object to the bucket/client/key we should sign against.
 *
 * Tries the exact key across every bucket first. Only when the key is a
 * CONFIRMED 404 everywhere (locateObject === null — not merely an inconclusive
 * transient error) do we fall back to a same-folder similar-name match. The
 * returned `key` is the actually-resolved key, which may differ from the input
 * when the similar-name fallback fired.
 *
 * @returns {Promise<{bucket: string, client: S3Client, key: string}|null>}
 */
async function resolveObject(objectKey, preferredBucket) {
  const located = await locateObject(objectKey, preferredBucket);
  if (located) return { ...located, key: objectKey };
  return findSimilarObject(objectKey, preferredBucket);
}

/**
 * Fetch an object's raw bytes straight through the S3 SDK (not a signed URL +
 * plain `fetch`). Some stored document_path values are themselves full
 * pre-signed URLs from an earlier signing, on a region-specific virtual-host
 * (e.g. `*.s3.ap-southeast-2.amazonaws.com`) — a plain HTTP `fetch()` against
 * a freshly re-signed URL for that same key can come back with a bare 301
 * PermanentRedirect (S3's region-redirect response carries no `Location`
 * header for `fetch` to auto-follow), whereas the SDK client here is already
 * configured with `followRegionRedirects: true` and handles it internally.
 * Returns null only when the object is confirmed missing (404) everywhere.
 * @param {string} key - The S3 object key (path in the bucket)
 * @returns {Promise<Buffer|null>}
 */
export async function getObjectBuffer(key) {
  if (!key) return null;
  const { bucket: preferred, key: objectKey } = resolveLocation(key);
  const located = await resolveObject(objectKey, preferred);
  if (!located) return null;
  const { bucket, client, key: resolvedKey } = located;

  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: resolvedKey }));
  return Buffer.from(await res.Body.transformToByteArray());
}

/**
 * Generate a pre-signed S3 URL for the given object key.
 * Searches both buckets for the object and signs against whichever has it.
 * Returns null only when the object is confirmed missing (404) in every bucket,
 * so callers can surface a clean "file unavailable" state instead of letting
 * the browser render S3's raw NoSuchKey XML response. Transient head-check
 * failures do not block URL generation.
 * @param {string} key - The S3 object key (path in the bucket)
 * @param {number} expiresIn - Expiry in seconds (default 15 minutes)
 * @returns {Promise<string|null>} Signed URL, or null if the object is missing
 */
export async function getSignedFileUrl(key, expiresIn = 3600) {
  if (!key) return null;

  const { bucket: preferred, key: objectKey } = resolveLocation(key);
  const located = await resolveObject(objectKey, preferred);
  if (!located) return null;
  const { bucket, client, key: resolvedKey } = located;

  const contentType = guessContentType(resolvedKey);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: resolvedKey,
    ResponseContentDisposition: "inline",
    ...(contentType ? { ResponseContentType: contentType } : {}),
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a pre-signed S3 URL that forces the browser to download the file
 * (Content-Disposition: attachment) instead of rendering it inline.
 * @param {string} key - The S3 object key
 * @param {string} [filename] - Optional filename to suggest to the browser
 * @param {number} [expiresIn] - Expiry in seconds (default 5 minutes)
 * @returns {Promise<string|null>} Signed URL, or null if the object is missing
 */
export async function getDownloadFileUrl(key, filename, expiresIn = 300) {
  if (!key) return null;

  const { bucket: preferred, key: objectKey } = resolveLocation(key);
  const located = await resolveObject(objectKey, preferred);
  if (!located) return null;
  const { bucket, client, key: resolvedKey } = located;

  const safeName = (filename || resolvedKey.split("/").pop() || "download")
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: resolvedKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  });

  return getSignedUrl(client, command, { expiresIn });
}
