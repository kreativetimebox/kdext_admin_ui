// lib/alertMonitor.js
//
// Background poll loop for the Alerts tab. Started once (see instrumentation.js)
// when the Next.js server boots, so detection runs whether or not anyone has the
// tab open. Polls both servers' system/GPU/container state directly through
// lib/serverMonitor.js (no HTTP round-trip through our own API — this runs
// server-side already) and persists findings to MAIN_FINANCE_DB so the /alerts
// page and the email notifier share one source of truth.
//
// Detection scope and thresholds were tuned against a live inspection of both
// production servers (see the "Alerts" plan): raw WARNING-level log lines are
// noisy and mostly benign in this stack, so log scanning only matches explicit
// ERROR/CRITICAL/FATAL markers. GPU memory sits at a static ~80% by design
// (model weights resident in VRAM) so it is intentionally not thresholded —
// GPU temperature is the meaningful signal instead.

import { createHash } from "crypto";
import { monitorFetch, listServers } from "./serverMonitor";
import { dexaiQuery } from "./dexaidb";
import { sendAlertEmail } from "./mailer";

const POLL_INTERVAL_MS = Number(process.env.ALERT_POLL_INTERVAL_MS) || 30000;
// Two-tier thresholds: "warning" surfaces in the tab as an early heads-up,
// "critical" also sends an email. Defaults follow the same 75%/90% split the
// Servers tab's Bar() already uses visually (amber above 60%, red above 85%).
const CPU_WARN = Number(process.env.ALERT_CPU_WARNING_THRESHOLD) || 75;
const CPU_CRIT = Number(process.env.ALERT_CPU_THRESHOLD) || 90;
const MEM_WARN = Number(process.env.ALERT_MEM_WARNING_THRESHOLD) || 75;
const MEM_CRIT = Number(process.env.ALERT_MEM_THRESHOLD) || 90;
const DISK_WARN = Number(process.env.ALERT_DISK_WARNING_THRESHOLD) || 75;
const DISK_CRIT = Number(process.env.ALERT_DISK_THRESHOLD) || 90;
const GPU_TEMP_WARN = Number(process.env.ALERT_GPU_TEMP_WARNING_THRESHOLD) || 75;
const GPU_TEMP_CRIT = Number(process.env.ALERT_GPU_TEMP_THRESHOLD) || 85;
const LOG_TAIL_LINES = Number(process.env.ALERT_LOG_TAIL_LINES) || 200;
const RENOTIFY_MINUTES = Number(process.env.ALERT_RENOTIFY_MINUTES) || 60;

// Substring match (case-insensitive) against each container's name.
const WATCHED_CONTAINERS = (
  process.env.ALERT_WATCHED_CONTAINERS ||
  "lightonocr,kdext-qwen,kdext-document-api,kdext-api,kdext-worker,kdext-webhook-worker"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Explicit failure markers only — bare "WARNING"/"ERROR" keyword grep produced
// false positives against real logs on both servers (routine slow-request and
// not-found-in-db warnings logged at WARNING level). Covers all three log
// formats seen across the watched containers: JSON (lightonocr/kdext-qwen),
// bracket "[ERROR]" (kdext-api/kdext-webhook-worker), and pipe-delimited
// "| ERROR |" (kdext-document-api).
const LOG_ERROR_PATTERNS = [
  /"level"\s*:\s*"(error|critical)"/i,
  /\[(ERROR|CRITICAL)\]/,
  /\|\s*(ERROR|CRITICAL)\s*\|/,
  /\bCRITICAL\b/,
  /\bFATAL\b/,
  /Traceback \(most recent call last\)/,
  /CUDA out of memory/i,
  /CUDA error/i,
];

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

const DOWN_STATUS_PATTERNS = [/\(unhealthy\)/i, /^Exited/i, /^Restarting/i, /^Dead/i];

function isContainerDown(c) {
  const state = (c?.state?.Status || "").toLowerCase();
  if (state && state !== "running") return true;
  return DOWN_STATUS_PATTERNS.some((re) => re.test(c?.status || ""));
}

function fingerprintFor(serverId, containerName, category, message) {
  return createHash("sha1")
    .update(`${serverId}|${containerName || ""}|${category}|${message}`)
    .digest("hex");
}

let tableEnsured = false;

/** Idempotent — safe to call from every poll cycle and from the API routes. */
export async function ensureAlertsTable() {
  if (tableEnsured) return;
  await dexaiQuery(`
    CREATE TABLE IF NOT EXISTS monitor_alerts (
      id SERIAL PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      severity TEXT NOT NULL,
      server_id TEXT NOT NULL,
      server_name TEXT,
      container_name TEXT,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      occurrences INTEGER NOT NULL DEFAULT 1,
      notified_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ
    )
  `);
  await dexaiQuery(
    `CREATE INDEX IF NOT EXISTS monitor_alerts_resolved_idx ON monitor_alerts (resolved_at)`
  );
  tableEnsured = true;
}

/**
 * Upsert a detected problem by fingerprint and email (severity "critical"
 * only) at most once per ALERT_RENOTIFY_MINUTES while it stays active.
 * `message` must be a stable, value-free description (e.g. "CPU usage high")
 * so repeated detections of the same underlying issue dedupe onto one row;
 * put the live number in `detail` instead.
 */
async function recordAlert({ serverId, serverName, containerName, source, severity, category, message, detail }) {
  const fingerprint = fingerprintFor(serverId, containerName, category, message);
  const result = await dexaiQuery(
    `INSERT INTO monitor_alerts
       (fingerprint, source, severity, server_id, server_name, container_name, category, message, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (fingerprint) DO UPDATE SET
       last_seen = now(),
       occurrences = monitor_alerts.occurrences + 1,
       detail = EXCLUDED.detail,
       resolved_at = NULL
     RETURNING id, notified_at, (xmax = 0) AS inserted`,
    [fingerprint, source, severity, serverId, serverName, containerName, category, message, detail]
  );
  const row = result.rows[0];
  const shouldNotify =
    severity === "critical" &&
    (row.inserted ||
      !row.notified_at ||
      Date.now() - new Date(row.notified_at).getTime() > RENOTIFY_MINUTES * 60000);

  if (shouldNotify) {
    const subject = `[Alert][${serverName}]${containerName ? `[${containerName}]` : ""} ${message}`;
    const text = [
      `Server: ${serverName} (${serverId})`,
      containerName ? `Container: ${containerName}` : null,
      `Category: ${category}`,
      `Message: ${message}`,
      detail ? `Detail: ${detail}` : null,
      `Time: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");
    const sent = await sendAlertEmail({ subject, text });
    if (sent) {
      await dexaiQuery("UPDATE monitor_alerts SET notified_at = now() WHERE id = $1", [row.id]);
    }
  }
}

/**
 * Resolve an alert and clear its notification cooldown. Clearing notified_at
 * means that if this exact problem (same fingerprint) comes back later, it's
 * treated as a fresh incident and emails immediately — instead of staying
 * silent until the original hourly cooldown from the prior episode expires.
 */
async function resolveByFingerprint(fingerprint) {
  await dexaiQuery(
    "UPDATE monitor_alerts SET resolved_at = now(), notified_at = NULL WHERE fingerprint = $1 AND resolved_at IS NULL",
    [fingerprint]
  );
}

async function checkMetric(server, category, value, warnThreshold, critThreshold, label, unit, containerName = null) {
  if (value == null) return;
  const message = `${label} high`;
  const fp = fingerprintFor(server.id, containerName, category, message);

  const severity = value > critThreshold ? "critical" : value > warnThreshold ? "warning" : null;
  if (severity) {
    await recordAlert({
      serverId: server.id,
      serverName: server.name,
      containerName,
      source: "system",
      severity,
      category,
      message,
      detail: `${value}${unit} (warn ${warnThreshold}${unit} / critical ${critThreshold}${unit})`,
    });
  } else {
    await resolveByFingerprint(fp);
  }
}

async function checkSystemThresholds(server, sys) {
  if (!sys) return;
  const disks = sys.disk ? Object.values(sys.disk) : [];
  const rootDisk = disks.sort((a, b) => b.total_gb - a.total_gb)[0];

  await checkMetric(server, "cpu", sys.cpu?.usage_percent, CPU_WARN, CPU_CRIT, "CPU usage", "%");
  await checkMetric(server, "memory", sys.memory?.percent, MEM_WARN, MEM_CRIT, "Memory usage", "%");
  if (rootDisk) {
    await checkMetric(server, "disk", rootDisk.percent, DISK_WARN, DISK_CRIT, "Disk usage", "%");
  }
}

async function checkGpu(server, gpus) {
  for (const g of gpus || []) {
    await checkMetric(
      server,
      "gpu_temp",
      g.temperature_c,
      GPU_TEMP_WARN,
      GPU_TEMP_CRIT,
      `GPU ${g.index} temperature`,
      "°C",
      `GPU ${g.index}`
    );
  }
}

async function checkContainerLogs(server, c) {
  let logs;
  try {
    const res = await monitorFetch(
      server.id,
      `/server_monitor/api/docker/logs/${encodeURIComponent(c.id)}?lines=${LOG_TAIL_LINES}`
    );
    logs = res?.logs || "";
  } catch {
    // A failing log fetch isn't itself alert-worthy — container_down / the
    // unreachable check already cover real outages.
    return;
  }

  for (const rawLine of logs.split("\n")) {
    // Strip ANSI color codes (kdext-document-api colorizes its level column)
    // so patterns match regardless of terminal coloring.
    const line = rawLine.replace(ANSI_ESCAPE, "").trim();
    if (!line) continue;
    if (LOG_ERROR_PATTERNS.some((re) => re.test(line))) {
      await recordAlert({
        serverId: server.id,
        serverName: server.name,
        containerName: c.name,
        source: "log",
        severity: "critical",
        category: "log_error",
        message: line.slice(0, 300),
        detail: `${server.name} / ${c.name}`,
      });
    }
  }
}

/**
 * Catches document-level failures directly from the source of truth —
 * document_processing_requests — rather than hoping the failure also happens
 * to produce a matching log line. Runs once per cycle (not per-server: it's
 * one shared DB, not server-specific). Re-scans a rolling window each cycle;
 * recordAlert's fingerprint (keyed on request_id via containerName) dedupes
 * so re-seeing the same failed request across cycles doesn't spam.
 */
async function checkDocumentFailures() {
  const result = await dexaiQuery(`
    SELECT
      d.request_id,
      d.error_message,
      d.formatted_result::jsonb->>'error' AS result_error,
      d.original_filename,
      COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
      u.email AS user_email
    FROM document_processing_requests d
    LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
    LEFT JOIN users u ON u.user_id = d.user_id
    WHERE d.is_deleted = false
      AND d.submitted_at > now() - interval '15 minutes'
      AND (
        d.status = 'FAILED'
        OR d.error_message IS NOT NULL
        OR d.formatted_result::jsonb->>'status' = 'error'
      )
    ORDER BY d.submitted_at DESC
    LIMIT 50
  `);

  for (const row of result.rows) {
    const errorText = row.error_message || row.result_error || "Unknown error";
    await recordAlert({
      serverId: "app",
      serverName: "Document Pipeline",
      containerName: row.request_id, // doubles as the dedupe key and the UI's link target
      source: "document",
      severity: "critical",
      category: "document_failed",
      message: `Document processing failed: ${row.document_type || "unknown type"}`,
      detail: `file=${row.original_filename || "—"} · user=${row.user_email || "—"} · error=${errorText}`,
    });
  }
}

async function checkContainers(server, containers) {
  const watched = containers.filter((c) =>
    WATCHED_CONTAINERS.some((w) => (c.name || "").toLowerCase().includes(w))
  );

  for (const c of watched) {
    const downMessage = `Container ${c.name} is not running`;
    const downFp = fingerprintFor(server.id, c.name, "container_down", downMessage);

    if (isContainerDown(c)) {
      await recordAlert({
        serverId: server.id,
        serverName: server.name,
        containerName: c.name,
        source: "container",
        severity: "critical",
        category: "container_down",
        message: downMessage,
        detail: c.status || "",
      });
      continue; // don't bother scanning logs of a dead container
    }

    await resolveByFingerprint(downFp);
    await checkContainerLogs(server, c);
  }
}

async function pollServer(server) {
  const safe = async (path) => {
    try {
      return { ok: true, data: await monitorFetch(server.id, path) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  const [system, containers, gpu] = await Promise.all([
    safe("/server_monitor/api/system"),
    safe("/server_monitor/api/docker/containers?all=true"),
    safe("/server_monitor/api/gpu"),
  ]);

  const unreachableMessage = `Cannot reach server-monitor agent on ${server.name}`;
  const unreachableFp = fingerprintFor(server.id, null, "unreachable", unreachableMessage);

  // All three endpoints failing together means the agent itself is down
  // (login failure, network partition, process crash) rather than one
  // sub-feature erroring — GPU-less boxes, for instance, fail only the /gpu call.
  if (!system.ok && !containers.ok && !gpu.ok) {
    await recordAlert({
      serverId: server.id,
      serverName: server.name,
      containerName: null,
      source: "system",
      severity: "critical",
      category: "unreachable",
      message: unreachableMessage,
      detail: system.error,
    });
    return;
  }
  await resolveByFingerprint(unreachableFp);

  if (system.ok) await checkSystemThresholds(server, system.data?.data);
  if (gpu.ok) await checkGpu(server, gpu.data?.data);
  if (containers.ok) await checkContainers(server, containers.data?.data || []);
}

export async function runPollCycle() {
  for (const server of listServers()) {
    try {
      await pollServer(server);
    } catch (err) {
      console.error(`[alert-monitor] poll failed for ${server.name}:`, err.message);
    }
  }
  try {
    await checkDocumentFailures();
  } catch (err) {
    console.error("[alert-monitor] document failure check failed:", err.message);
  }
}

/** Idempotent singleton starter — see instrumentation.js. */
export function startAlertMonitor() {
  if (globalThis.__alertMonitorStarted) return;
  globalThis.__alertMonitorStarted = true;

  (async () => {
    try {
      await ensureAlertsTable();
    } catch (err) {
      console.error("[alert-monitor] Failed to ensure monitor_alerts table:", err.message);
      return;
    }
    console.log(`[alert-monitor] polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
    const tick = () => runPollCycle().catch((err) => console.error("[alert-monitor] poll cycle failed:", err.message));
    tick();
    setInterval(tick, POLL_INTERVAL_MS);
  })();
}
