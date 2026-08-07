# Document Processing Pipeline — /v1/documents/process-async

This describes how a document submitted to kdext_api's customer-facing API actually gets
processed, notified, and how its status can be checked — useful for explaining "why is this
document stuck", "what does wait=true/false mean", or "how do webhooks/notifications work" to
staff or clients.

## Architecture

A single call to `POST /v1/documents/process-async` touches two independent backend services
(kdext_api and kdext_document_api_v2), three RabbitMQ queues, the shared Postgres database
(`document_processing_requests` row), and — once the document finishes — two parallel notification
channels (webhooks and WebSockets). kdext_document_api_v2 never calls kdext_api back over HTTP or
RabbitMQ; it writes its result straight into the shared `document_processing_requests` Postgres
row, and kdext_api's worker (plus the polling GET endpoint) learns the outcome by reading that same
row.

The three queues:
- `document_processing` (kdext_api) — internal hand-off from the HTTP router to kdext_api's own
  worker. This is the queue `wait=true`'s reply-queue mechanics attach to.
- `document_processing_exchange` / `document_processing_queue` (kdext_document_api_v2) — the actual
  extraction hand-off, carrying only `{request_id, published_at}` (the heavy payload already lives
  in Postgres).
- `document.events` (kdext_api, topic exchange) — fan-out for the three customer-facing lifecycle
  events, consumed by the webhook worker and, inside every API process, the event consumer that
  feeds the `/v1/ws/events` WebSocket.

## The `wait` parameter — sync vs. async submission

`wait` can be supplied as a query param (`?wait=true`), a JSON body field, or a multipart form
field — in that precedence order (query > JSON body > form field). Accepted truthy values: `1`,
`true`, `yes`, `on` (case-insensitive). Anything else, or omitting it, defaults to **false**
(fire-and-forget).

**wait=false (the default, fire-and-forget)**: the HTTP response returns the instant the job
message is confirmed published — never after the worker actually processes anything. Steps: mint a
`request_id` (`req_` + uuid4 hex) → validate content-type/size → the uploaded file is re-uploaded
to S3 as kdext_api's own durable copy (done *before* classification, so a crash never loses the
original) → classification is deliberately skipped here (confidence/document_type stay null in the
response — classification happens later, off the request's critical path, inside the worker) → a
DB row is created with `status="PENDING"`, then immediately updated to `"QUEUED"` → the job is
published to RabbitMQ with no `reply_to`/`correlation_id` → **202 Accepted** is returned with
`request_id`, `status_url`, `poll_interval_seconds: 5`, and a `Retry-After: 5` header. The client is
expected to poll `GET /v1/requests/{request_id}` or wait for a webhook/WebSocket push.

**wait=true (blocking RPC)**: identical steps 1–9 as above (auth, upload, durable S3 copy, DB row
PENDING→QUEUED), but the job is published using classic AMQP direct-reply RPC: a fresh
`correlation_id` is minted, the router registers an in-memory future, and publishes with
`reply_to` pointed at this API process's own exclusive auto-delete callback queue. The router then
awaits that future with a **900-second timeout** (`RABBITMQ_RPC_TIMEOUT`). The worker, once done,
publishes its reply with the same `correlation_id` to the `reply_to` queue; a late reply after
timeout finds no matching future and is silently dropped (the DB row it caused is unaffected).
- On success: HTTP **200**, with `request_id`, `status`, `validation`, `document_type`,
  `client_document_type`, `confidence`, `message`, `document_url`, `formatted_result` all embedded
  in the body. **Important: HTTP 200 does not mean the document processed successfully** — if the
  embedded `status` is `"failed"` or `"invalid"`, the wire-level HTTP status is *still* 200; only
  the embedded `status` field tells the real story.
- On timeout (900s with no reply): the router does **not** return 504/408 — it falls back to the
  identical 202 tracking payload used by the fire-and-forget success case. The worker keeps running
  independently; the client must fall back to polling `GET /v1/requests/{request_id}`.

**Design consequence**: a client that only cares about the eventual result should prefer
`wait=false` plus a registered webhook (or an open `/v1/ws/events` socket) over holding an HTTP
connection open with `wait=true` for up to 900 seconds. `wait=true` is best reserved for
low-latency documents where the caller genuinely cannot proceed without an inline result.

## Downstream processing (kdext_document_api_v2)

Once kdext_api's own worker classifies the document, it hands the job to kdext_document_api_v2 for
extraction — a second, entirely separate queue hop. A competing-consumer subscription picks up the
message; a parse failure (bad JSON / missing request_id) is the *only* path that sends a message to
the dead-letter queue. Otherwise the row is re-fetched, flipped to `PROCESSING` (with a stale-claim
guard so a slower retry can never clobber a newer attempt's result), routed by document type to the
right processor/mapper (bank statement, invoice, receipt — anything else raises "Unsupported
document type" and becomes `INVALID`), and the result is written straight to Postgres
(`complete_processing_request()` / `fail_processing_request()` / `timeout_processing_request()` /
`invalidate_processing_request()`). The message is always ACKed after this, regardless of outcome —
the queue consumer never re-decides retry eligibility itself.

**Retry & dead-letter policy**: a row stuck in `TIMEOUT` with `retry_count < max_retries` (and
enough backoff time elapsed: 5 minutes × 2^retry_count, i.e. 5m/10m/20m/…) gets automatically
re-queued by a periodic retry sweep. A malformed message goes to the dead-letter queue. **Rows that
exhaust their retry count are NOT dead-lettered** — they simply stop being retry candidates and
stay in `TIMEOUT` permanently (this differs from what the module's own documentation claims).
`FAILED` rows are excluded from the retry-candidate query entirely — in practice only `TIMEOUT` rows
are ever retried automatically.

## Notifications — Webhooks

A durable, HMAC-signed, retried HTTP push to a URL the customer registers once per API-key tier
(production/sandbox/test each have their own webhook registration, since `key_environment` is
always derived from whichever API key authenticated the call — a sandbox key can never overwrite
the production webhook URL).

- `POST /v1/notifications/register` — register/update a webhook URL + which events to receive.
  The signing secret is returned in full only on this call.
- `GET /v1/notifications` / `/all` — read current registration(s), secret masked.
- `DELETE /v1/notifications` — deactivate.
- `POST /v1/notifications/echo` (unauthenticated test receiver) + `GET /v1/notifications/echo` —
  lets a customer sanity-check their integration.

Three lifecycle events: `document.processing.completed`, `document.processing.failed`,
`document.corrected` (fired when an admin/validator publishes a HITL correction).

Delivery payload (customer-facing fields only): `event`, `documentId`, `documentType`,
`clientDocumentType`, `status`, `version`, `timestamp`, `error`. Signed with
`HMAC_SHA256(secret, canonical-sorted-key JSON)`; sent with headers `X-Event`, `X-Timestamp`,
`X-Signature`, `X-Webhook-Id`, `X-Delivery-Id`. Delivery is retried up to 5 attempts with
exponential backoff (2s, 4s, 8s, 16s… capped at 300s), 10s timeout per attempt. Idempotency: a
delivery row keyed by `event_id` records PENDING → SUCCESS | FAILED; a redelivered message whose
event already succeeded is skipped. **There is no true dead-letter for webhooks** — after 5 failed
attempts the delivery is marked FAILED and the underlying queue message is still acked (no further
automatic retry); recovery relies on the customer polling `GET /v1/notifications/echo` or
`GET /v1/requests/{id}`, not webhook redelivery. If no active webhook exists for the tier, or the
event isn't in the webhook's subscribed events list, the notification is simply dropped — no
delivery, no retry, no error recorded.

## Notifications — WebSocket `/v1/ws/events`

The live-connection equivalent of a webhook: the same three lifecycle events, pushed over an open
socket instead of an HTTP callback — "the live connection IS the subscription, no URL to host, no
HMAC to verify." Connect via `ws://host/v1/ws/events?x-api-key=YOUR_KEY` (auth happens before the
socket accepts, resolving the API key from the header or query param). Server → client messages:
`{"action":"connection","status":"connected"}` on accept; `{"action":"heartbeat","timestamp":...}`
every 25s; `{"event":"document.processing.completed", "documentId", "documentType",
"clientDocumentType", "status", "version", "timestamp"}` — note there is **no `error` field** here,
unlike the webhook payload. There's no explicit subscribe/filter on this endpoint — a connected
socket receives *all* of that user's lifecycle events; per-event-name filtering is only available
via a webhook's `events` list.

## Companion WebSocket `/v1/ws/status`

Solves a different problem than `/v1/ws/events`: instead of "push me everything for my account," a
client explicitly subscribes to specific `request_id`s and gets DB-polled status snapshots for
exactly those requests (polls Postgres directly every 1.5s per connection; touches neither RabbitMQ
nor the events hub). Client sends `{"action":"subscribe","request_id":"..."}` → gets an immediate
snapshot event, then periodic `update` events whenever the row's status/timestamps/result actually
change, or a `heartbeat` event if unchanged for 5+ seconds. Once a subscribed request reaches a
terminal status, it auto-unsubscribes — no more updates for it. Client can `unsubscribe` or `ping`
(server replies `pong`) at any time.

## End-to-end timeline — the key fact

The HTTP response and the two notification channels (webhook, WebSocket) run on **entirely
independent clocks**. Whether `wait=true` or `wait=false` was used only changes when the *HTTP
call* returns — it never changes when the webhook fires or when the WebSocket push happens, because
both are driven off the same completion event at the end of the job, regardless of how the job was
originally submitted.

## Known behavioral quirks (useful for explaining odd support tickets)

1. An unrecognized document type is **not** rejected inline at submission time — it's accepted,
   queued, and only surfaces later (via polling/webhook/WebSocket) with a DB status of `INVALID`.
2. **HTTP 200 from a `wait=true` call does not guarantee success** — always check the embedded
   `status` field, not just the HTTP status code.
3. A document can get permanently stuck in `TIMEOUT` status if it exhausts its retry count — there
   is no dead-letter notification for this case, so it will not show up anywhere except by directly
   looking at that document's status.
4. Webhook delivery failures are not retried forever — after 5 attempts (~5.5 minutes of backoff)
   a failed delivery is abandoned; the source of truth is always `GET /v1/requests/{id}` (or the
   admin portal's own view of `document_processing_requests`), not the webhook itself.
5. The DB status column values (ground truth) are: `PENDING`, `QUEUED`, `PROCESSING`, `COMPLETED`,
   `FAILED`, `CANCELLED`, `TIMEOUT`, `INVALID` (lowercased on the wire for the polling API).
