/**
 * Copy text to the clipboard with a fallback for non-secure (HTTP) origins.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS or localhost).
 * When the app is served over plain HTTP (e.g. an internal IP) that API is
 * undefined, so we fall back to a hidden <textarea> + document.execCommand.
 *
 * @param {*} value - value to copy; coerced to a string.
 * @returns {Promise<boolean>} whether the copy succeeded.
 */
export async function copyToClipboard(value) {
  const text = value == null ? "" : String(value);
  if (!text) return false;

  // Preferred path: async Clipboard API (secure contexts only).
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy path */
    }
  }

  // Legacy fallback: works on HTTP and older browsers.
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
