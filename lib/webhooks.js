// lib/webhooks.js
// Direct database-driven document webhook notification dispatcher.
// Triggers registered client endpoints (from `webhooks` table) when HITL data is updated.
// Sends HTTP POST with HMAC-SHA256 signature and records delivery in `webhook_deliveries`.

import crypto from "crypto";
import { dexaiQuery } from "@/lib/dexaidb";
import { publishDocumentCorrected } from "@/lib/events";

/**
 * Normalise document type to standard categories (invoice, receipt, bank-statement, etc.)
 */
function normalizeDocType(docType) {
  if (!docType) return null;
  const lower = String(docType).toLowerCase().trim();
  if (lower.includes("invoice")) return "invoice";
  if (lower.includes("receipt")) return "receipt";
  if (lower.includes("bank") || lower.includes("statement")) return "bank-statement";
  return lower;
}

/**
 * Sends a `document.corrected` notification to all active webhooks registered for the client.
 *
 * @param {object} params
 * @param {string} params.documentId - The request_id known to the client (e.g. "req_...")
 * @param {number} params.userId - The client's users.user_id
 * @param {string} [params.resultId] - PDR-... result ID
 * @param {string} [params.documentType] - Document type
 * @param {string} [params.clientDocumentType] - Client's own freeform label
 * @param {string} [params.keyEnvironment] - 'production' | 'testing' | 'sandbox'
 * @param {number} [params.version] - Result version (incremented per correction)
 * @returns {Promise<Array<{webhookId: number, url: string, status: string, statusCode: number|null}>>}
 */
export async function sendDocumentCorrectedNotification({
  documentId,
  userId,
  resultId,
  documentType,
  clientDocumentType,
  keyEnvironment,
  version = 2,
}) {
  if (!userId || !documentId) {
    console.warn("[webhooks] Missing userId or documentId for notification");
    return [];
  }

  // Also publish to message broker (best-effort)
  try {
    await publishDocumentCorrected({
      documentId,
      userId,
      version,
    });
  } catch (brokerErr) {
    // Ignore broker issues; direct DB dispatch proceeds
  }

  // Look up registered active webhooks for this client
  const webhooksResult = await dexaiQuery(
    `SELECT webhook_id, user_id, url, secret, events, is_active, key_environment
     FROM webhooks
     WHERE user_id = $1
       AND is_active = true
       AND (key_environment IS NULL OR key_environment = $2 OR $2 IS NULL)`,
    [userId, keyEnvironment || null]
  );

  const activeWebhooks = webhooksResult.rows.filter((w) => {
    if (!w.url) return false;
    if (!w.events) return true; // null events = subscribed to all
    if (Array.isArray(w.events)) return w.events.includes("document.corrected");
    if (typeof w.events === "string") {
      try {
        const parsed = JSON.parse(w.events);
        return Array.isArray(parsed) ? parsed.includes("document.corrected") : true;
      } catch {
        return true;
      }
    }
    return true;
  });

  if (activeWebhooks.length === 0) {
    console.log(`[webhooks] No active webhook found for user_id=${userId}, env=${keyEnvironment}`);
    return [];
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const docType = documentType || clientDocumentType || "invoice";
  const clientDocType = clientDocumentType || documentType || "invoice";

  const payloadObj = {
    event: "document.corrected",
    documentId: String(documentId),
    documentType: docType,
    clientDocumentType: clientDocType,
    status: "corrected",
    version: version || 2,
    timestamp,
    error: null,
  };

  const rawBody = JSON.stringify(payloadObj);
  const deliveryResults = [];

  for (const wh of activeWebhooks) {
    const deliveryId = crypto.randomUUID();
    let signature = "";
    if (wh.secret) {
      signature = crypto.createHmac("sha256", wh.secret).update(rawBody).digest("hex");
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Event": "document.corrected",
      "X-Timestamp": timestamp,
      "X-Delivery-Id": deliveryId,
      ...(signature ? { "X-Signature": signature } : {}),
      "User-Agent": "DexAI-Notifications/1.0",
    };

    let statusCode = null;
    let responseBodyText = "";
    let deliveryStatus = "failed";

    try {
      console.log(`[webhooks] Dispatching document.corrected to ${wh.url} (deliveryId=${deliveryId})`);
      const response = await fetch(wh.url, {
        method: "POST",
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      statusCode = response.status;
      responseBodyText = (await response.text().catch(() => "")).slice(0, 2000);
      deliveryStatus = response.ok ? "delivered" : "failed";
      console.log(`[webhooks] Delivered to ${wh.url} -> status=${statusCode}`);
    } catch (err) {
      console.error(`[webhooks] Failed to POST to ${wh.url}:`, err.message);
      responseBodyText = String(err.message || "Network Error").slice(0, 1000);
      deliveryStatus = "failed";
    }

    // Record delivery attempt in webhook_deliveries table
    try {
      await dexaiQuery(
        `INSERT INTO webhook_deliveries (
           webhook_id,
           event,
           event_id,
           document_id,
           payload,
           status,
           attempt_count,
           response_status_code,
           response_body,
           last_attempt_at,
           created_at
         ) VALUES ($1, $2, $3, $4, $5::json, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          wh.webhook_id,
          "document.corrected",
          deliveryId,
          String(documentId),
          rawBody,
          deliveryStatus,
          1,
          statusCode,
          responseBodyText,
        ]
      );
    } catch (dbLogErr) {
      console.error("[webhooks] Failed to record webhook_delivery in DB:", dbLogErr.message);
    }

    deliveryResults.push({
      webhookId: wh.webhook_id,
      url: wh.url,
      status: deliveryStatus,
      statusCode,
      deliveryId,
    });
  }

  return deliveryResults;
}
