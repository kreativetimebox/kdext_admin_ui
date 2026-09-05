import { NextResponse } from "next/server";
import { setBugMuted, isBugMuted } from "@/lib/bugNotificationService";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const { bugTrackerId, isMuted } = body || {};

    if (!bugTrackerId) {
      return NextResponse.json({ ok: false, error: "bugTrackerId is required" }, { status: 400 });
    }

    const changedBy = req.headers.get("x-user-email") || "Admin";
    await setBugMuted(Number(bugTrackerId), isMuted, changedBy);
    const updatedStatus = await isBugMuted(Number(bugTrackerId));

    return NextResponse.json({ ok: true, bugTrackerId, isMuted: updatedStatus });
  } catch (error) {
    console.error("POST /api/bug-tracker/notifications/toggle-bug error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
