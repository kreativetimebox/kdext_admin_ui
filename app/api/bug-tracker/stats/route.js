import { NextResponse } from "next/server";
import { getBugTrackerStats } from "@/lib/bugTracker";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const clientIds = (searchParams.get("clientIds") || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));

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
