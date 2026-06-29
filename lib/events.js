// lib/events.js
//
// Publishes document lifecycle events to the Gateway's RabbitMQ topic exchange
// (`document.events`). Used when the HITL team publishes a correction so the
// customer's registered webhook is notified automatically — the admin UI never
// calls a webhook itself; it just emits the event and the Gateway's webhook
// worker (app/workers/webhook_worker.py) delivers it.
//
// The message shape MUST match the Gateway publisher (kdext_api
// app/core/events.py): the webhook worker routes by `user_id` and dedupes by
// `event_id`, and forwards `{event, documentId, status, version, timestamp}` to
// the customer.
import amqp from "amqplib";
import { randomUUID } from "crypto";

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EXCHANGE = process.env.RABBITMQ_EVENTS_EXCHANGE || "document.events";

// Cache the connection/channel across route invocations (Next runs a long-lived
// Node server). Reset on error/close so the next publish reconnects.
let connPromise = null;
let channel = null;

async function getChannel() {
  if (channel) return channel;
  if (!RABBITMQ_URL) {
    throw new Error("RABBITMQ_URL is not configured");
  }
  if (!connPromise) {
    connPromise = amqp.connect(RABBITMQ_URL);
  }
  const conn = await connPromise;
  const reset = () => {
    connPromise = null;
    channel = null;
  };
  conn.on("close", reset);
  conn.on("error", reset);
  channel = await conn.createChannel();
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  return channel;
}

// Match the Gateway's timestamp format: ISO-8601, second precision, "Z" suffix.
function eventTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Publish a `document.corrected` event so the customer's webhook fires.
 * Best-effort: callers should not let a publish failure break the DB save.
 *
 * @param {object} args
 * @param {string} args.documentId - the request_id the customer knows the doc by
 * @param {number} args.userId     - owner user_id (webhook worker routes by this)
 * @param {number} [args.version]  - result revision (incremented per correction)
 * @returns {Promise<string>} the generated event_id
 */
export async function publishDocumentCorrected({ documentId, userId, version }) {
  const ch = await getChannel();
  const eventId = randomUUID();
  const body = {
    event: "document.corrected",
    event_id: eventId,
    documentId: String(documentId),
    user_id: userId,
    status: "corrected",
    version: version || 1,
    timestamp: eventTimestamp(),
  };
  ch.publish(EXCHANGE, "document.corrected", Buffer.from(JSON.stringify(body)), {
    contentType: "application/json",
    persistent: true,
    messageId: eventId,
  });
  return eventId;
}
