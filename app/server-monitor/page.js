"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Box,
  FileText,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  X,
  Download,
} from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";

export const dynamic = "force-dynamic";

const SERVERS = [
  { id: "1", name: "Server 1" },
  { id: "2", name: "Server 2" },
];

function isRunning(c) {
  return (c?.state?.Status || "").toLowerCase() === "running";
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div
      style={{
        flex: "1 1 200px",
        minWidth: 200,
        padding: 16,
        background: "var(--panel-bg, var(--input-bg))",
        border: "1px solid var(--panel-border)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={16} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Bar({ percent }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const color = p > 85 ? "#ef4444" : p > 60 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ height: 6, background: "var(--panel-border)", borderRadius: 4, overflow: "hidden", marginTop: 6 }}>
      <div style={{ width: `${p}%`, height: "100%", background: color }} />
    </div>
  );
}

export default function ServerMonitorPage() {
  const { user, loading: authLoading } = useAuth();
  // SUPER_ADMIN and the restricted SERVER_MONITOR role may both view this page.
  const canView = user && user.roles?.some((r) => ["SUPER_ADMIN", "SERVER_MONITOR"].includes(r));
  // Only full admins may perform container actions; SERVER_MONITOR is read-only.
  const canControl = user && user.roles?.includes("SUPER_ADMIN");

  const [server, setServer] = useState("1");
  const [selected, setSelected] = useState(null); // container for log view
  const [logs, setLogs] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busy, setBusy] = useState(null); // container id currently acting on
  const logBoxRef = useRef(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["server-monitor", server],
    queryFn: async () => (await axios.get("/api/server-monitor/dashboard", { params: { server } })).data,
    enabled: canView === true && authLoading === false,
    refetchInterval: 10000,
  });

  const loadLogs = async (container) => {
    if (!container) return;
    setLogsLoading(true);
    try {
      const res = await axios.get("/api/server-monitor/logs", {
        params: { server, container: container.id, lines: "all" },
      });
      setLogs(res.data.logs || "(no output)");
    } catch (e) {
      setLogs(`Error fetching logs: ${e.response?.data?.error || e.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const downloadLogs = () => {
    if (!selected || !logs) return;
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name}-server${server}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Open a container's logs
  const openLogs = (container) => {
    setSelected(container);
    setLogs("");
    loadLogs(container);
  };

  // Auto-refresh logs for the open container
  useEffect(() => {
    if (!selected || !autoRefresh) return;
    const t = setInterval(() => loadLogs(selected), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, autoRefresh, server]);

  // Keep the log box scrolled to bottom on new content
  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs]);

  const doAction = async (container, action) => {
    // Confirm before any disruptive action (stop / restart / remove).
    if (action !== "start" &&
        !window.confirm(`${action.toUpperCase()} container "${container.name}"?`)) return;
    setBusy(container.id);
    try {
      await axios.post("/api/server-monitor/action", {
        server,
        container_id: container.id,
        action,
      });
      toast.success(`${action} sent to ${container.name}`);
      setTimeout(refetch, 1200);
    } catch (e) {
      toast.error(e.response?.data?.error || `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !canView) {
      toast.error("Access denied.");
      window.location.href = "/";
    }
  }, [authLoading, canView]);

  if (authLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  if (!canView) return null;

  const sys = data?.system;
  const mem = sys?.memory;
  const cpu = sys?.cpu;
  const disks = sys ? Object.values(sys.disk || {}) : [];
  const rootDisk = disks.sort((a, b) => b.total_gb - a.total_gb)[0];
  const containers = data?.containers || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Navbar />
      <main style={{ flex: 1, padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: 0, marginBottom: 6 }}>
              Server Monitoring
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
              Docker containers, logs and system health across servers
            </p>
          </div>
          <button
            onClick={() => refetch()}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              background: "var(--input-bg)", border: "1px solid var(--panel-border)",
              borderRadius: 8, color: "var(--foreground)", cursor: "pointer", fontSize: 13,
            }}
          >
            <RefreshCw size={14} className={isFetching ? "spin" : ""} /> Refresh
          </button>
        </div>

        {/* Server switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {SERVERS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setServer(s.id); setSelected(null); setLogs(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
                borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                border: "1px solid var(--panel-border)",
                background: server === s.id ? "var(--accent, #2563eb)" : "var(--input-bg)",
                color: server === s.id ? "#fff" : "var(--foreground)",
              }}
            >
              <Server size={15} /> {s.name}
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {SERVERS.find((x) => x.id === s.id) && data?.servers?.find((x) => x.id === s.id)?.host}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: 14, background: "#ef444422", border: "1px solid #ef4444", borderRadius: 8, color: "#ef4444", marginBottom: 16 }}>
            Failed to reach monitor: {error.response?.data?.error || error.message}
          </div>
        )}

        {/* System stat cards */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
          <div style={{ flex: "1 1 200px", minWidth: 200 }}>
            <StatCard icon={Cpu} label="CPU" value={cpu ? `${cpu.usage_percent}%` : "—"} sub={cpu ? `${cpu.count} cores` : ""} />
            {cpu && <div style={{ padding: "0 16px" }}><Bar percent={cpu.usage_percent} /></div>}
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 200 }}>
            <StatCard icon={MemoryStick} label="Memory" value={mem ? `${mem.percent}%` : "—"} sub={mem ? `${mem.used_gb} / ${mem.total_gb} GB` : ""} />
            {mem && <div style={{ padding: "0 16px" }}><Bar percent={mem.percent} /></div>}
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 200 }}>
            <StatCard icon={HardDrive} label="Disk" value={rootDisk ? `${rootDisk.percent}%` : "—"} sub={rootDisk ? `${rootDisk.used_gb} / ${rootDisk.total_gb} GB` : ""} />
            {rootDisk && <div style={{ padding: "0 16px" }}><Bar percent={rootDisk.percent} /></div>}
          </div>
          <StatCard icon={Box} label="Containers" value={isLoading ? "…" : containers.length} sub={`${containers.filter(isRunning).length} running`} />
        </div>

        {/* GPU (only if present) */}
        {data?.gpuAvailable && data.gpus?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
            {data.gpus.map((g) => (
              <div
                key={g.index}
                style={{
                  flex: "1 1 260px", minWidth: 260, padding: 16,
                  background: "var(--panel-bg, var(--input-bg))",
                  border: "1px solid var(--panel-border)", borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Cpu size={16} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    GPU {g.index} · {g.name}
                  </span>
                </div>

                {/* GPU utilisation */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                  <span>Utilisation</span>
                  <span style={{ fontWeight: 700, color: "var(--foreground)" }}>{g.gpu_util_percent}%</span>
                </div>
                <Bar percent={g.gpu_util_percent} />

                {/* GPU memory */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
                  <span>Memory</span>
                  <span style={{ fontWeight: 700, color: "var(--foreground)" }}>
                    {g.memory_percent}% · {Math.round(g.memory_used_mb)}/{Math.round(g.memory_total_mb)} MB
                  </span>
                </div>
                <Bar percent={g.memory_percent} />

                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
                  {g.temperature_c}°C · {g.power_w}W
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Containers + logs split */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Container list */}
          <div style={{ flex: "1 1 420px", minWidth: 340, border: "1px solid var(--panel-border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--panel-border)", fontWeight: 600, color: "var(--foreground)" }}>
              Containers
            </div>
            {isLoading ? (
              <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading…</div>
            ) : containers.length === 0 ? (
              <div style={{ padding: 20, color: "var(--text-muted)" }}>
                {data?.dockerAvailable === false ? "Docker not available" : "No containers"}
              </div>
            ) : (
              containers.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                    borderBottom: "1px solid var(--panel-border)",
                    background: selected?.id === c.id ? "var(--input-bg)" : "transparent",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isRunning(c) ? "#22c55e" : "#ef4444" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.image} · {c.status}
                    </div>
                  </div>
                  <button title="Logs" onClick={() => openLogs(c)} style={iconBtn}>
                    <FileText size={15} />
                  </button>
                  {canControl && (isRunning(c) ? (
                    <>
                      <button title="Restart" disabled={busy === c.id} onClick={() => doAction(c, "restart")} style={iconBtn}><RotateCw size={15} /></button>
                      <button title="Stop" disabled={busy === c.id} onClick={() => doAction(c, "stop")} style={iconBtn}><Square size={15} /></button>
                    </>
                  ) : (
                    <button title="Start" disabled={busy === c.id} onClick={() => doAction(c, "start")} style={iconBtn}><Play size={15} /></button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Logs panel */}
          <div style={{ flex: "1 1 460px", minWidth: 340, border: "1px solid var(--panel-border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--panel-border)" }}>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                {selected ? `Logs · ${selected.name}` : "Logs"}
                {selected && logs && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                    ({logs.split("\n").length.toLocaleString()} lines · full)
                  </span>
                )}
              </span>
              {selected && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                    Auto-refresh
                  </label>
                  <button title="Download" onClick={downloadLogs} style={iconBtn}><Download size={14} /></button>
                  <button title="Reload" onClick={() => loadLogs(selected)} style={iconBtn}><RefreshCw size={14} className={logsLoading ? "spin" : ""} /></button>
                  <button title="Close" onClick={() => { setSelected(null); setLogs(""); }} style={iconBtn}><X size={14} /></button>
                </div>
              )}
            </div>
            <pre
              ref={logBoxRef}
              style={{
                margin: 0, padding: 14, height: 420, overflow: "auto",
                fontSize: 12, lineHeight: 1.5, fontFamily: "ui-monospace, monospace",
                color: "var(--foreground)", background: "var(--code-bg, #0b0f17)", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
            >
              {selected ? (logs || (logsLoading ? "Loading logs…" : "")) : "Select a container to view its logs."}
            </pre>
          </div>
        </div>
      </main>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const iconBtn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 6, cursor: "pointer",
  background: "var(--input-bg)", border: "1px solid var(--panel-border)",
  color: "var(--foreground)", flexShrink: 0,
};
