"use client";

/**
 * Mandatory-field validation indicator for the audit tables.
 *
 *   validation === true  → green dot + "To be tested"  (passed validation)
 *   validation === false → glowing red dot             (missing mandatory fields)
 *   null / undefined     → muted "—"                   (not yet validated)
 *
 * The glow is driven by the global `valGlow` keyframe (app/globals.css).
 */
export default function ValidationDot({ validation }) {
  if (validation === true) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#22c55e",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#22c55e",
            whiteSpace: "nowrap",
          }}
        >
          To be tested
        </span>
      </span>
    );
  }

  if (validation === false) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          title="Missing mandatory fields"
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "#ef4444",
            flexShrink: 0,
            animation: "valGlow 1.4s ease-in-out infinite",
          }}
        />
      </span>
    );
  }

  return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
}
