"use client";

/**
 * Mandatory-field validation indicator for the audit tables.
 *
 *   validation === true  → green dot + "Valid"          (all mandatory fields present)
 *   validation === false → glowing red dot + "To be tested"
 *                          (missing mandatory fields → needs human review)
 *   null / undefined     → muted "—"                    (not yet validated)
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
          Valid
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
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#ef4444",
            whiteSpace: "nowrap",
          }}
        >
          To be tested
        </span>
      </span>
    );
  }

  return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
}
