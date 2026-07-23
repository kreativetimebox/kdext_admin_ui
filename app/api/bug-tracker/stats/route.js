import { NextResponse } from "next/server";
import { getBugTrackerStats } from "@/lib/bugTracker";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    let clientIds = (searchParams.get("clientIds") || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));

    // CLIENT_ADMIN/CLIENT_USER only ever see stats for their own client —
    // forced from the verified JWT-derived header, never the query param.
    const { isClientRole, clientId } = getRequesterClientScope(req);
    if (isClientRole) {
      if (!clientId) {
        return NextResponse.json({ totals: { open: 0, toBeTested: 0, closed: 0 }, byDocType: [] }, { status: 200 });
      }
      clientIds = [clientId];
    }

    const { totals, byDocType } = await getBugTrackerStats({ clientIds });

    return NextResponse.json({ totals, byDocType }, { status: 200 });
  } catch (error) {
    console.error("GET /api/bug-tracker/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bug tracker stats", totals: { open: 0, toBeTested: 0, closed: 0 }, byDocType: [] },
      { status: 200 }
    );
  }
}
