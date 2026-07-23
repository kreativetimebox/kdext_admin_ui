// Next.js instrumentation hook — runs once when the server process boots
// (https://nextjs.org/docs/app/guides/instrumentation). Used to start
// background poll loops (Alerts: lib/alertMonitor.js, HITL auto-assignment:
// lib/hitlAssignmentMonitor.js, client login auto-provisioning:
// lib/clientProvisioningMonitor.js) independently of any request ever
// hitting the app.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertMonitor } = await import("./lib/alertMonitor");
    startAlertMonitor();

    const { startHitlAssignmentMonitor } = await import("./lib/hitlAssignmentMonitor");
    startHitlAssignmentMonitor();

    const { startClientProvisioningMonitor } = await import("./lib/clientProvisioningMonitor");
    startClientProvisioningMonitor();
  }
}
