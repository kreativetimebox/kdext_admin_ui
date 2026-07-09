// Next.js instrumentation hook — runs once when the server process boots
// (https://nextjs.org/docs/app/guides/instrumentation). Used to start the
// Alerts background poll loop (lib/alertMonitor.js) independently of any
// request ever hitting the app.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertMonitor } = await import("./lib/alertMonitor");
    startAlertMonitor();
  }
}
