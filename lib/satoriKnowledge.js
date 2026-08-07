// Builds DEXAI Satori's system prompt: a fixed persona/instructions block,
// the ingested knowledge-base markdown (lib/satori/knowledge/*.md — the
// Admin Portal reference and process-async pipeline docs), a role/scope
// notice, and an optional live DB context block from lib/satoriContext.js.
import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "lib", "satori", "knowledge");
const KNOWLEDGE_FILES = ["admin-portal-reference.md", "process-async-pipeline.md"];

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "HITL", "SERVER_MONITOR"];

let cachedKnowledge = null;
function loadKnowledge() {
  if (cachedKnowledge) return cachedKnowledge;
  cachedKnowledge = KNOWLEDGE_FILES
    .map((f) => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8"))
    .join("\n\n---\n\n");
  return cachedKnowledge;
}

const BASE_INSTRUCTIONS = `You are DEXAI Satori, the AI assistant embedded in the DEXAI Admin Portal.
You help staff and clients understand the portal, the document-processing pipeline, and their own
data. Be concise and plain-spoken; avoid jargon unless the user uses it first.

The reference material below (Admin Portal reference, then the process-async pipeline reference)
is your knowledge base for how this product works. When a DOCUMENT CONTEXT or ACCOUNT SUMMARY JSON
block is supplied further below, use it to answer questions about specific documents or account
activity — summarize status/validation/bug info in plain language rather than repeating raw field
names or JSON. If asked "why did this fail" or "why was this flagged," look at status, validation,
issue_type/issue_description, and any error fields, and explain plainly what appears to be wrong.

Never invent data that isn't present in the reference material or in a JSON context block provided
below. If information isn't available, say so plainly rather than guessing.`;

export function buildSystemPrompt({ roles = [], clientId = null, contextBlock = null }) {
  const isStaff = (roles || []).some((r) => STAFF_ROLES.includes(r));
  const audienceNote = isStaff
    ? "AUDIENCE: the current user is internal staff and may see data across all clients."
    : `AUDIENCE: the current user is a client-portal account scoped to a single client's own data (client_id=${clientId ?? "unknown"}). Never reveal or reference another client's data, even hypothetically.`;

  let prompt = `${BASE_INSTRUCTIONS}\n\n${audienceNote}\n\n${loadKnowledge()}`;
  if (contextBlock) prompt += `\n\n${contextBlock}`;
  return prompt;
}
