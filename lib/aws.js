import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

/**
 * Generate a pre-signed S3 URL for the given object key.
 * @param {string} key - The S3 object key (path in the bucket)
 * @param {number} expiresIn - Expiry in seconds (default 15 minutes)
 * @returns {Promise<string>} Signed URL
 */
export async function getSignedFileUrl(key, expiresIn = 900) {
  if (!key) return null;

  // Strip any leading s3:// or bucket prefix if present
  let objectKey = key;
  const s3Prefix = `s3://${process.env.AWS_BUCKET_NAME}/`;
  const httpPrefix = `https://${process.env.AWS_BUCKET_NAME}.s3.`;
  if (objectKey.startsWith(s3Prefix)) {
    objectKey = objectKey.slice(s3Prefix.length);
  } else if (objectKey.startsWith("s3/")) {
    // Strip bare "s3/path/..." format used in DB
    objectKey = objectKey.slice(3);
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: objectKey,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn });
}
