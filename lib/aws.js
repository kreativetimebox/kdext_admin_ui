import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
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

// Optional second (legacy) bucket with its own credentials.
if (process.env.AWS_LEGACY_BUCKET_NAME) {
  bucketConfigs.set(process.env.AWS_LEGACY_BUCKET_NAME, {
    bucket: process.env.AWS_LEGACY_BUCKET_NAME,
    region: process.env.AWS_LEGACY_REGION || defaultConfig.region,
    accessKeyId: process.env.AWS_LEGACY_ACCESS_KEY_ID || defaultConfig.accessKeyId,
    secretAccessKey:
      process.env.AWS_LEGACY_SECRET_ACCESS_KEY || defaultConfig.secretAccessKey,
  });
}

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
 * Generate a pre-signed S3 URL for the given object key.
 * Returns null only when the object is confirmed missing (404), so callers can
 * surface a clean "file unavailable" state instead of letting the browser
 * render S3's raw NoSuchKey XML response. Transient head-check failures do not
 * block URL generation.
 * @param {string} key - The S3 object key (path in the bucket)
 * @param {number} expiresIn - Expiry in seconds (default 15 minutes)
 * @returns {Promise<string|null>} Signed URL, or null if the object is missing
 */
export async function getSignedFileUrl(key, expiresIn = 3600) {
  if (!key) return null;

  const { bucket, key: objectKey } = resolveLocation(key);
  const client = getS3Client(bucket);

  if ((await headObjectStatus(client, bucket, objectKey)) === "missing") {
    return null;
  }

  const contentType = guessContentType(objectKey);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
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

  const { bucket, key: objectKey } = resolveLocation(key);
  const client = getS3Client(bucket);

  if ((await headObjectStatus(client, bucket, objectKey)) === "missing") {
    return null;
  }

  const safeName = (filename || objectKey.split("/").pop() || "download")
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  });

  return getSignedUrl(client, command, { expiresIn });
}
