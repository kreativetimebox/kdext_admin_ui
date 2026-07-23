// Shared helpers for restricting CLIENT_ADMIN/CLIENT_USER accounts to their
// own client_id — used by every document-mutating API route so a client
// can never read/write another client's document, even by guessing or
// otherwise obtaining a result_id/request_id that isn't theirs. Internal
// roles (SUPER_ADMIN/ADMIN/HITL/SERVER_MONITOR) are never restricted here —
// "for all other roles, data related to all clients is available."
import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";

const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_USER"];

/**
 * Reads the verified role/client_id set by middleware.js from request
 * headers (x-user-roles, x-user-client-id) — never trust a client-supplied
 * query/body param for this, only the JWT-derived headers.
 * @returns {{isClientRole: boolean, clientId: number|null}}
 */
export function getRequesterClientScope(req) {
  let roles = [];
  try {
    roles = JSON.parse(req.headers.get("x-user-roles") || "[]");
  } catch {
    roles = [];
  }
  const isClientRole = roles.some((r) => CLIENT_ROLES.includes(r));
  if (!isClientRole) return { isClientRole: false, clientId: null };

  const raw = req.headers.get("x-user-client-id");
  const clientId = raw ? Number(raw) : null;
  return { isClientRole: true, clientId };
}

/**
 * Verifies the document identified by result_id-or-request_id belongs to
 * the requester's own client_id, when the requester is a client-role
 * account. Returns a 403 Response to short-circuit with if ownership fails
 * (or the account has no client_id at all — a misconfigured client login
 * should never fall through to "everything is theirs"), or null if the
 * caller may proceed (either not a client role, or ownership confirmed).
 * @param {Request} req
 * @param {string} idOrRequestId - result_id or request_id
 */
export async function assertOwnsDocument(req, idOrRequestId) {
  const { isClientRole, clientId } = getRequesterClientScope(req);
  if (!isClientRole) return null;
  if (!clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await dexaiQuery(
    `SELECT user_id FROM document_processing_requests
      WHERE (result_id = $1 OR request_id = $1) AND is_deleted = false
      LIMIT 1`,
    [idOrRequestId]
  );
  const row = result.rows[0];
  if (!row || Number(row.user_id) !== clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
