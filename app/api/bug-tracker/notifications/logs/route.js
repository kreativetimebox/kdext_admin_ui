import { NextResponse } from "next/server";
import { getNotificationLogs } from "@/lib/bugNotificationService";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const bugTrackerId = searchParams.get("bugTrackerId");
    const eventType = searchParams.get("eventType");
    const status = searchParams.get("status");
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

    const result = await getNotificationLogs({
      bugTrackerId: bugTrackerId ? Number(bugTrackerId) : null,
      eventType: eventType || null,
      status: status || null,
      search,
      page,
      pageSize,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("GET /api/bug-tracker/notifications/logs error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
