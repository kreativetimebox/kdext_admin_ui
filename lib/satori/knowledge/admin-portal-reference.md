# DEXAI Admin Portal — Reference

The DEXAI Admin Portal (a.k.a. TechDexAI Admin Portal, deployed at manage.dexaitech.com) is an
internal web application for managing AI document processing. It lets staff review and correct
extracted results (HITL — human-in-the-loop), audit every client's documents, track processing
bugs, monitor infrastructure, manage users, and post announcements. It also hosts DEXAI Satori,
this in-app AI assistant.

Stack: Next.js (App Router, React), PostgreSQL (single canonical database MAIN_FINANCE_DB), a
separate FastAPI backend (kdext_api) for the customer-facing API, RabbitMQ for events, and AWS S3
for document storage. Documents live across two S3 buckets: the current
kdext-finance-ai-document (ap-southeast-2) and the legacy receipt-hub-new (eu-west-2); the viewer
resolves a document by checking both.

## Authentication & Sessions

Staff/portal users are `internal_users`. They log in with email + password (bcrypt). A signed JWT
is stored in the `auth_token` httpOnly cookie (24h). The JWT carries: userId, email, roles[],
clientId (for client-scoped accounts), and pageAccess (per-page permissions). Middleware verifies
the token on every route and enforces role/route access. The failed-login lockout / rate-limiting
is disabled — no account is locked out on repeated failures (failed attempts are still logged for
audit).

## Roles & Access Control

Access is role-based, with two extra layers: client scoping (a user only sees one client's data)
and per-page permissions (toggles stored per user).

- **SUPER_ADMIN** — Full administrator. Everything: all pages, all clients' data, user management,
  server monitoring, announcements authoring.
- **ADMIN / HITL** — Staff reviewer. Home, Business Audit, HITL Edit, Bug Tracker (all clients).
  HITL reviewers default their client filter to itadmin@capium.com (changeable).
- **SERVER_MONITOR** — Infra viewer. Only the Server Monitoring & Alerts pages. Read-only (cannot
  start/stop containers).
- **CLIENT** — Client portal account. Dashboard, Business Audit, Bug Tracker — all scoped to their
  own client's data only. No HITL Edit, no Servers. Can create sub-users. Read-only (no
  Edit/Reprocess). Per-page toggles can further restrict which of these pages they see.
- **CLIENT_ADMIN / CLIENT_USER** — Legacy client accounts. Scoped to their own client. CLIENT_ADMIN
  can manage CLIENT_USER sub-users.

Every signed-in role can also reach DEXAI Satori and Announcements.

Client scoping: an `internal_users.client_id` ties a client account to one row in the `users`
table (the business/client). All Business-Audit / Bug-Tracker / document APIs force that scope
server-side so a client can never read another client's data.

Per-page permissions: `internal_users.page_access` (JSON) holds `{dashboard, businessAudit,
bugTracker}` booleans. A SUPER_ADMIN sets these when creating a client sub-user; a page toggled off
is hidden and blocked. `null` = every page the role allows.

## Pages & Features

- **Home / Dashboard (`/`)** — Landing page with processing analytics. For client accounts it is
  scoped to their own client.
- **Business Audit (`/dexai`)** — Directory of all companies and their users, with per-user
  document counts and done/total processing stats. Click a company to expand its users; click a
  user to open their results.
  - **User results (`/dexai/[userId]`)** — a searchable, filterable, paginated table of that
    user's documents: Result ID, HITL status, validation, HITL assignee, created date, bug
    status, document type, key environment, missing fields. Filters: type, status, validation, key
    environment, bug status, issue type. Staff can Edit (open in HITL Edit), assign a HITL
    reviewer, set bug status, export CSV, download documents. Client accounts get a read-only view.
  - **Result detail (`/dexai/result/[requestId]`)** — document image + metadata + result. Tabs
    "Original Result" / "HITL Updated", and a JSON / Table view toggle. Includes a Reprocess
    control (staff only) and a Bug Tracking panel (issue type, description, bug status, comments).
- **HITL Edit (`/missing-fields`, "All Documents")** — The human review queue: every processed
  document with its HITL status, validation, assignee, bug status, issue type, and missing fields.
  Reviewers open a document, correct the extracted fields, and publish. Filters + search (search is
  global, ignoring the client filter). Not visible to CLIENT accounts.
  - HITL result editing & validation: each document has an immutable `formatted_result` (original
    extraction) and an editable `hitl_updated_result` (human-corrected copy). Publishing an edit
    sets `validation = true` and `status`/`hitl_status = COMPLETED`. The "HITL Updated" tab shows
    `hitl_updated_result`; "Original Result" shows `formatted_result`.
- **Bug Tracker (`/bug-tracker`)** — Every document with an issue logged against it, across all
  companies (or scoped, for clients). Columns: Bug ID (e.g. `BUG-00918`), Result ID, HITL assignee,
  bug status, client email, document type, bug-created date, comments.
  - Issue types: wrong document type; table items are wrong; net amount and tax wrongly
    calculated; supplier name not extracted; single input page multiple output; credit-debit value
    swapping; bank account name/number wrongly extracted; opening/closing date wrongly extracted;
    opening/closing balance wrongly extracted; missing transaction data; quantities not extracted;
    tax amount not extracted; low quality document input; handwritten input document; receipt
    number wrongly extracted; line level discount wrongly extracted; connection error; no issue;
    known issue; other.
  - Bug statuses: Open, TO_BE_TESTED, Closed (or none).
  - Per-document comments (email + message + timestamp), CSV export, document download, bulk
    status updates. Search matches request/result/transaction ids, doc type, client, and Bug ID.
- **Server Monitoring (`/server-monitor`) & Alerts (`/alerts`)** — Live view of the backend
  servers (a Flask monitoring agent on port 5000 per server). Shows CPU/memory/disk/GPU, the Docker
  container list, and container logs (auto-refresh). Admins can start/stop/restart/remove
  containers; SERVER_MONITOR is read-only. Alerts is a feed of monitoring errors/critical events
  with resolve actions.
- **Announcements (`/announcements`)** — Team announcement feed visible to everyone. Only
  SUPER_ADMIN can post (title, rich text, optional PDF/image attachments, optional date/time
  defaulting to now, and a status). Status is a glowing-dot pill: Active (blue), Resolved (green),
  Maintenance (amber), Release Note (purple), Documentation (teal).
- **DEXAI Satori (`/satori`)** — this assistant. An in-app, ChatGPT-style AI assistant available to
  all users. Answers questions about documents, results, and workflows.
- **User Logs / Team Members / Clients (`/user-logs`)** — SUPER_ADMIN sees three tabs: Team
  Members (internal staff), Clients (business users, their portal logins, and nested sub-users),
  and HITL Workload. A super admin can add a sub-user to any client and tick which pages that
  sub-user can see. CLIENT / CLIENT_ADMIN accounts get a restricted version to manage their own
  sub-users.
- **Document viewer (`/view/[id]`)** — Standalone document view: file preview, Original vs
  HITL-Updated result tabs, edit history/audit, and reprocess.

## Core Concepts

- **Document processing lifecycle**: a request (`request_id`, e.g. `req_…`) is submitted,
  processed, and produces a result (`result_id`, e.g. `PDR-136578`). Status flows through
  processing → COMPLETED / TO_BE_TESTED. `validation=true` means it passed mandatory-field
  validation (or a reviewer finalized it).
- **HITL workflow**: documents needing review are TO_BE_TESTED; a reviewer is assigned, edits
  `hitl_updated_result`, and publishes → COMPLETED + validation true. Publishing also fires a
  `document.corrected` webhook to the customer.
- **Bug tracking**: a document gets an `issue_type` (which puts it in the Bug Tracker and assigns
  a Bug ID), an optional description, a bug status, and threaded comments.
- **Client scoping & sub-users**: client accounts are locked to one client's data; a client (or a
  super admin on their behalf) can create sub-users that inherit the same scoped, read-only view.
- **API keys**: business users (the `users` table) each have production/sandbox/test API keys.
  Keys authenticate on the FastAPI backend (kdext_api) and are gated by `keys_active` (admin
  approval, with a 15-day grant that auto-expires and must be renewed).

## Data Model (key tables)

- `document_processing_requests` — the core table, one row per document. Key columns: `result_id`,
  `request_id`, `user_id`, `ocr_document_type`, `document_path`, `formatted_result` (original
  JSON), `hitl_updated_result` (edited JSON), `processing_result` (raw), `status`, `hitl_status`,
  `validation`, `hitl_assigned_to`, `issue_type`, `issue_description`, `bug_status`,
  `bug_tracker_id`, `bug_flagged_at`, `comments` (JSON array), `submitted_at`, `completed_at`.
- `internal_users` — Staff + client portal accounts. `email`, `password_hash`, `is_active`,
  `client_id` (client scope), `page_access` (per-page toggles), `failed_login_attempts`,
  `locked_until`.
- `users` — Business/customer accounts. API keys (`api_key`, `sandbox_api_key`, `test_api_key`),
  `keys_active`, `keys_activated_at`, `company_name`.
- `roles`, `user_roles` — Roles and the internal_user↔role mapping.
- `announcements`, `announcement_attachments` — Announcement posts and their binary attachments.
- `monitor_alerts` — Server-monitoring alerts/errors.
- `api_logs` — API call audit log.
- `clients`, `businesses` — Client and business records.
- `webhooks`, `webhook_deliveries` — Customer webhook registrations and delivery attempts (e.g.
  `document.corrected` on HITL publish).
- Other tables: `bank_transaction_scores`, `anomaly_models`, `bank_anomaly_models`,
  `dexai_invoices`, `dexai_audit_log`, `document_types`, `document_processing_logs`,
  `internal_activity_logs`, `internal_testing_requests`, `email_verification_tokens`,
  `otp_verifications`, `rate_limit_tracking`, `api_endpoints`.

## Common Workflows

**Review & correct a document (HITL)**: Open HITL EDIT (or click Edit in Business Audit). Open a
TO_BE_TESTED document — the viewer shows the file plus "Original Result" (read-only) and "HITL
Updated" (editable) tabs. Edit fields in HITL Updated (scalars, nested objects, line-item tables;
multi-receipt documents have a per-receipt pager). Click Publish — this saves
`hitl_updated_result`, sets `validation = true` and status = COMPLETED, appends an audit entry, and
fires a `document.corrected` webhook.

**Log & triage a bug**: On a result's Bug Tracking panel (or a Bug Tracker row), pick an Issue Type
— this assigns a permanent Bug ID and lists the document in the Bug Tracker. Add an optional
description, set a Bug Status, add threaded comments. Filter/search by status, issue type, client,
or Bug ID; export CSV or download the source documents.

**Assign / reprocess**: Assign uses the HITL dropdown on a row. Reprocess (on a result detail) picks
the document type and re-runs the pipeline in place (keeps the same request_id) — staff only,
hidden for client accounts.

**Add a client sub-user with page access (super admin)**: User Logs → Clients → find the client →
Add sub-user → enter email/name/password and tick which pages they can see (Dashboard, Business
Audit, Bug Tracker). The sub-user logs in scoped to that client only, read-only, seeing exactly the
ticked pages.

**Activate a client's API keys**: a client has production/sandbox/test keys shown as Active or Not
Active. An admin activation flips `keys_active` on (a 15-day grant); after it expires it reverts to
"pending approval" and must be renewed.

**Post an announcement (super admin)**: Open Announcements, fill title + body, optionally attach
PDFs/images, pick a status, set a date/time (blank = now), click Post.

## Visual Language

- HITL Status: Completed / TO_BE_TESTED / Pending — where a document sits in the review pipeline.
- Validation: green dot = passed validation/finalized; red = still needs review.
- Bug Status: Open / TO_BE_TESTED / Closed — lifecycle of a logged issue.
- Action Status: Model Tuning / Reprocessing / Invalid Bad Image Closed — triage / pipeline action for bug resolution.
- Key Environment: Sandbox / Testing / Production — which API key environment produced the
  document.
- Result ID (e.g. `PDR-136578`) is the primary identifier, with the `req_…` request ID beneath it;
  Bug ID as `BUG-00918`.

## Technical Notes

- Access enforcement is layered: middleware redirects disallowed routes; the nav hides links a
  role/permission can't use; every data API re-checks the role and forces the client scope
  server-side (never trusting client-supplied params).
- Document files are fetched from S3 with short-lived signed URLs; the resolver checks both the
  current and legacy buckets so a file is found regardless of which bucket holds it.
