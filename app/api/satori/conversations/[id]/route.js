import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { ensureSatoriTables, getConversationWithMessages, deleteConversation } from "@/lib/satoriDb";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await ensureSatoriTables();
  const conversation = await getConversationWithMessages(Number(user.userId), conversationId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversationId = Number(id);
  if (!conversationId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await ensureSatoriTables();
  const deleted = await deleteConversation(Number(user.userId), conversationId);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
