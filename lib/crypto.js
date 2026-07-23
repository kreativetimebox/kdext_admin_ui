// Reversible encryption for client login passwords ONLY.
//
// Every other password in this app (internal_users, users) is one-way
// bcrypt-hashed and can never be recovered — by design, that's the correct
// way to store a password. Client credentials are a deliberate, explicit
// exception: the team asked for the current password to always be visible
// to them (e.g. to hand a client their login again without forcing a
// reset), so this stores a SEPARATE, symmetrically-encrypted copy
// (internal_users.client_password_enc) alongside the normal bcrypt hash
// that's still what actually authenticates the login. Losing/rotating
// CLIENT_PASSWORD_ENC_KEY makes every previously-encrypted password
// undecryptable (the bcrypt hash is unaffected, so logins keep working —
// only the "view current password" admin feature would stop working for
// passwords encrypted under the old key).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const secret = process.env.CLIENT_PASSWORD_ENC_KEY || "dev-only-client-password-key-change-in-production";
  return scryptSync(secret, "client-password-salt", 32);
}

/** @returns {string} `${ivHex}:${authTagHex}:${cipherHex}` */
export function encryptForDisplay(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Inverse of encryptForDisplay. Returns null if the value is malformed/undecryptable. */
export function decryptForDisplay(ciphertext) {
  if (!ciphertext) return null;
  try {
    const [ivHex, authTagHex, dataHex] = ciphertext.split(":");
    const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

/** Random human-typeable password: 3 words + 3 digits, e.g. "kite-plaza-orbit-482". */
export function generateClientPassword() {
  const words = [
    "kite", "plaza", "orbit", "cedar", "delta", "ember", "flint", "grove",
    "haven", "ivory", "jolt", "koala", "lumen", "mango", "nova", "onyx",
    "pilot", "quartz", "raven", "sable", "tango", "umber", "vivid", "willow",
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(100 + Math.random() * 900));
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}
