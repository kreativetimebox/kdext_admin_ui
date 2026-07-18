-- Performance indexes for the admin UI's list/search queries
-- (transactions, missing-fields, dexai users/results, user-logs).
--
-- Run manually against MAIN_FINANCE_DB — there is no migration framework in
-- this repo. Run with autocommit, NOT inside a transaction block:
--   psql "$MAIN_FINANCE_DB_URL" -f sql/2026-07-18_admin_ui_perf_indexes.sql
--
-- CREATE INDEX CONCURRENTLY cannot run inside BEGIN/COMMIT, so this file
-- deliberately has no transaction wrapper. Each statement commits on its own.
-- If a statement fails partway through, it leaves an INVALID index behind;
-- drop and retry it before rerunning:
--   DROP INDEX CONCURRENTLY IF EXISTS <index_name>;
--
-- Recommend running during low-traffic hours. CONCURRENTLY avoids locking
-- reads/writes, but still costs real I/O to build on a large table.

-- Every admin list query filters is_deleted = false and orders by
-- submitted_at DESC (getDocumentList, getDocumentsWithMissingFields,
-- getTransactionRecords). Biggest lever — hit on every page load.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dpr_isdeleted_submitted_at
  ON document_processing_requests (is_deleted, submitted_at DESC);

-- Per-user result lists (getDexaiUserResults: WHERE user_id = $1 AND
-- is_deleted = false) and per-user stats subqueries in getDexaiUsers /
-- getUserLogs.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dpr_user_isdeleted
  ON document_processing_requests (user_id, is_deleted);

-- status is filtered directly by dexai user-results' status filter, the
-- missing-fields status filter, and COUNT(*) FILTER(WHERE status = ...)
-- aggregates in getDexaiUsers.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dpr_status
  ON document_processing_requests (status);

-- transaction_id is required IS NOT NULL by transactions.js and
-- getDocumentsWithMissingFields's search; partial index keeps it small
-- since most rows have no transaction_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dpr_transaction_id
  ON document_processing_requests (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- key_environment is filtered in SQL for missing-fields and dexai
-- user-results.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dpr_key_environment
  ON document_processing_requests (key_environment);

-- Every admin query excludes HIDDEN_CLIENT_EMAIL via
-- lower(email) <> lower($1), and getDexaiUsers/getUserLogs search
-- email ILIKE — a functional index on lower(email) speeds both.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_lower_email
  ON users (lower(email));

ANALYZE document_processing_requests;
ANALYZE users;
