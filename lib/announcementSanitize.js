// The announcement composer's rich-text toolbar (bold/italic/underline/font-size/color)
// only ever produces this shape via execCommand — allowlisted narrowly since
// this HTML is rendered verbatim (dangerouslySetInnerHTML) for every signed-in
// viewer, not just the posting admin. Shared by the create (POST) and edit
// (PATCH) routes so both stay in sync.
export const BODY_SANITIZE_OPTIONS = {
  allowedTags: ["b", "strong", "i", "em", "u", "span", "font", "div", "p", "br"],
  allowedAttributes: {
    span: ["style"],
    font: ["style", "color", "size"],
    div: ["style"],
    p: ["style"],
  },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
      "font-size": [/^\d+(\.\d+)?px$/],
    },
  },
};
