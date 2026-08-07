// DEXAI Satori conversation storage. kdext_api's /v1/copilot/chat is fully
// stateless (client resends the whole history, nothing persisted server-side),
// so Satori owns its own conversation history here in MAIN_FINANCE_DB —
// scoped per internal_users.internal_user_id, the same id middleware.js puts
// in the x-user-id header.
import { dexaiQuery } from "@/lib/dexaidb";

let tableEnsured = false;

/** Idempotent — safe to call from every route. */
export async function ensureSatoriTables() {
  if (tableEnsured) return;
  await dexaiQuery(`
    CREATE TABLE IF NOT EXISTS satori_conversations (
      id SERIAL PRIMARY KEY,
      internal_user_id INTEGER NOT NULL,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await dexaiQuery(
    `CREATE INDEX IF NOT EXISTS satori_conversations_user_idx
       ON satori_conversations (internal_user_id, updated_at DESC)`
  );
  await dexaiQuery(`
    CREATE TABLE IF NOT EXISTS satori_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES satori_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await dexaiQuery(
    `CREATE INDEX IF NOT EXISTS satori_messages_conv_idx ON satori_messages (conversation_id, id)`
  );
  tableEnsured = true;
}

function titleFrom(text) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 60)}…` : t || "New chat";
}

/** Conversations for the sidebar, newest first. */
export async function listConversations(internalUserId) {
  const result = await dexaiQuery(
    `SELECT id, title, updated_at FROM satori_conversations
      WHERE internal_user_id = $1
      ORDER BY updated_at DESC`,
    [internalUserId]
  );
  return result.rows;
}

/** A conversation's full message thread, or null if not found/not owned. */
export async function getConversationWithMessages(internalUserId, conversationId) {
  const conv = await dexaiQuery(
    `SELECT id, title, updated_at FROM satori_conversations
      WHERE id = $1 AND internal_user_id = $2`,
    [conversationId, internalUserId]
  );
  if (!conv.rows[0]) return null;

  const messages = await dexaiQuery(
    `SELECT role, content, created_at FROM satori_messages
      WHERE conversation_id = $1
      ORDER BY id ASC`,
    [conversationId]
  );
  return { ...conv.rows[0], messages: messages.rows };
}

/** Verifies ownership without pulling messages — used by the chat route. */
export async function ownsConversation(internalUserId, conversationId) {
  const result = await dexaiQuery(
    `SELECT id FROM satori_conversations WHERE id = $1 AND internal_user_id = $2`,
    [conversationId, internalUserId]
  );
  return !!result.rows[0];
}

export async function createConversation(internalUserId, firstMessage) {
  const result = await dexaiQuery(
    `INSERT INTO satori_conversations (internal_user_id, title)
     VALUES ($1, $2) RETURNING id, title, updated_at`,
    [internalUserId, titleFrom(firstMessage)]
  );
  return result.rows[0];
}

export async function appendMessage(conversationId, role, content) {
  await dexaiQuery(
    `INSERT INTO satori_messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
    [conversationId, role, content]
  );
  await dexaiQuery(
    `UPDATE satori_conversations SET updated_at = now() WHERE id = $1`,
    [conversationId]
  );
}

/** Last N messages of a conversation, oldest first — used as few-shot history. */
export async function recentMessages(conversationId, limit) {
  const result = await dexaiQuery(
    `SELECT role, content FROM satori_messages
      WHERE conversation_id = $1
      ORDER BY id DESC LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse();
}

export async function deleteConversation(internalUserId, conversationId) {
  const result = await dexaiQuery(
    `DELETE FROM satori_conversations WHERE id = $1 AND internal_user_id = $2 RETURNING id`,
    [conversationId, internalUserId]
  );
  return !!result.rows[0];
}
