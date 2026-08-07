// Thin server-side client for the self-hosted Qwen2.5-VL inference service
// that kdext_api's own /v1/copilot/chat and /v1/risk-review/chat proxy to.
// We call it directly (bypassing kdext_api's copilot wrapper) because that
// wrapper hardcodes a system prompt for a different, customer-facing product
// surface and only accepts role: "user"|"assistant" (no way to inject the
// Admin Portal knowledge base) — see lib/satoriKnowledge.js.
const QWEN_SERVICE_URL = (
  process.env.QWEN_SERVICE_URL || "http://217.16.188.48:8007"
).replace(/\/+$/, "");

const QWEN_TIMEOUT_MS = 60_000;

/**
 * @param {object} args
 * @param {string} args.systemPrompt
 * @param {{role: 'user'|'assistant', content: string}[]} args.fewShotMessages
 * @param {string} args.prompt - the latest user message
 * @param {number} [args.maxNewTokens]
 * @returns {Promise<string>} the model's reply text
 */
export async function askQwen({ systemPrompt, fewShotMessages, prompt, maxNewTokens = 700 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QWEN_TIMEOUT_MS);
  try {
    const res = await fetch(`${QWEN_SERVICE_URL}/infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        few_shot_messages: fewShotMessages,
        prompt,
        max_new_tokens: maxNewTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Qwen service returned ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return (data.raw_text || "").trim();
  } finally {
    clearTimeout(timeout);
  }
}
