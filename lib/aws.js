import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function normalizeKey(key) {
  let objectKey = key.trim();
  const bucket = process.env.AWS_BUCKET_NAME;

  if (/^https?:\/\//i.test(objectKey)) {
    try {
      const u = new URL(objectKey);
      let path = decodeURIComponent(u.pathname).replace(/^\/+/, "");
      // path-style: s3.<region>.amazonaws.com/<bucket>/<key>
      if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
      return path;
    } catch {
      // fall through to prefix stripping
    }
  }

  const s3Prefix = `s3://${bucket}/`;
  if (objectKey.startsWith(s3Prefix)) return objectKey.slice(s3Prefix.length);
  if (objectKey.startsWith("s3://")) return objectKey.replace(/^s3:\/\/[^/]+\//, "");
  if (objectKey.startsWith("s3/")) return objectKey.slice(3);
  return objectKey;
}

/**
 * Generate a pre-signed S3 URL for the given object key.
 * Returns null if the object does not exist in S3, so callers can surface
 * a clean "file unavailable" state instead of letting the browser render
 * S3's raw NoSuchKey XML response.
 * @param {string} key - The S3 object key (path in the bucket)
 * @param {number} expiresIn - Expiry in seconds (default 15 minutes)
 * @returns {Promise<string|null>} Signed URL, or null if the object is missing
 */
export async function getSignedFileUrl(key, expiresIn = 900) {
  if (!key) return null;

  const objectKey = normalizeKey(key);
  const client = getS3Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: objectKey,
      })
    );
  } catch (err) {
    if (
      err?.name === "NotFound" ||
      err?.$metadata?.httpStatusCode === 404 ||
      err?.Code === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: objectKey,
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

  const objectKey = normalizeKey(key);
  const client = getS3Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: objectKey,
      })
    );
  } catch (err) {
    if (
      err?.name === "NotFound" ||
      err?.$metadata?.httpStatusCode === 404 ||
      err?.Code === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }

  const safeName = (filename || objectKey.split("/").pop() || "download")
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  });

  return getSignedUrl(client, command, { expiresIn });
}
