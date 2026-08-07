import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { ensureSatoriTables, listConversations } from "@/lib/satoriDb";

export const dynamic = "force-dynamic";

// History sidebar — every signed-in role sees only their own conversations.
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureSatoriTables();
  const conversations = await listConversations(Number(user.userId));
  return NextResponse.json({ conversations });
}
