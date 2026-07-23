import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { provisionAllMissingClients } from "@/lib/clientProvisioning";

// One-time (or repeatable) bulk-provision trigger for the Clients tab's
// "Generate All Logins" button — the background poller
// (lib/clientProvisioningMonitor.js) does the same thing automatically on an
// interval, this just lets a SUPER_ADMIN force it to run immediately.
export async function POST(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const results = await provisionAllMissingClients();
    const created = results.filter((r) => r.ok && !r.skipped);
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json(
      { created: created.length, failed: failed.map((f) => ({ userId: f.userId, error: f.error })) },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/user-logs/provision-all error:", err);
    return NextResponse.json({ error: "Failed to bulk-provision clients" }, { status: 500 });
  }
}
