import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getRequesterClientScope } from "@/lib/clientAccess";
import {
  ensureSatoriTables,
  createConversation,
  ownsConversation,
  appendMessage,
  recentMessages,
} from "@/lib/satoriDb";
import { classifyIntent, buildContextBlock } from "@/lib/satoriContext";
import { buildSystemPrompt } from "@/lib/satoriKnowledge";
import { askQwen } from "@/lib/satoriClient";

export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;

// Every signed-in role can reach Satori (see middleware.js ANNOUNCEMENT_PREFIXES).
export async function POST(req) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const internalUserId = Number(user.userId);

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body?.message || "").toString().trim();
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
  const truncatedMessage = message.slice(0, MAX_MESSAGE_CHARS);

  await ensureSatoriTables();

  let conversationId = body?.conversationId ? Number(body.conversationId) : null;
  if (conversationId) {
    const owns = await ownsConversation(internalUserId, conversationId);
    if (!owns) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  } else {
    const conv = await createConversation(internalUserId, truncatedMessage);
    conversationId = conv.id;
  }

  await appendMessage(conversationId, "user", truncatedMessage);

  try {
    const { isClientRole, clientId } = getRequesterClientScope(req);
    const { intent, code } = classifyIntent(truncatedMessage);
    const contextBlock = await buildContextBlock({ intent, code, isClientRole, clientId });
    const systemPrompt = buildSystemPrompt({ roles: user.roles, clientId, contextBlock });

    // recentMessages already includes the user message just inserted above,
    // as the last row — split it off as `prompt` and send the rest as history.
    const history = await recentMessages(conversationId, MAX_HISTORY_MESSAGES + 1);
    const fewShotMessages = history
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

    const reply = await askQwen({
      systemPrompt,
      fewShotMessages,
      prompt: truncatedMessage,
      maxNewTokens: 700,
    });

    const finalReply = reply || "I couldn't generate a response — please try again.";
    await appendMessage(conversationId, "assistant", finalReply);

    return NextResponse.json({ conversationId, reply: finalReply });
  } catch (err) {
    console.error("POST /api/satori/chat error:", err);
    const failMsg = "Sorry, I ran into a problem reaching the assistant service. Please try again in a moment.";
    await appendMessage(conversationId, "assistant", failMsg).catch(() => {});
    return NextResponse.json({ conversationId, reply: failMsg });
  }
}
