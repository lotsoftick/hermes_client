/**
 * Strip Hermes-side noise from chat text so the UI shows what the human
 * actually wrote, not the model-facing prompt-engineering wrappers.
 *
 * Two distinct sources of noise need cleaning:
 *
 *   1. **User messages** stored in the session JSON: when an image is
 *      attached, Hermes auto-prepends a `[The user attached an image.
 *      Here's what it contains: …]` block (the result of an internal
 *      vision_analyze call) and a `[If you need a closer look, use
 *      vision_analyze with image_url: …]` hint, plus we ourselves append
 *      an `Attached file(s):\n- name: /abs/path` footer so the model
 *      can find the file on disk.
 *
 *   2. **Assistant messages** streamed from `hermes chat -Q --resume <id>`:
 *      Hermes prints a `↻ Resumed session 20260425_161620_6c9e14 "test"
 *      (1 user message, 2 total messages)` banner to stdout before the
 *      actual response. We capture all stdout, so this banner ends up in
 *      our DB and in the SSE stream unless we strip it.
 *
 * Both classes of noise are unwanted at display time but, even more
 * importantly, they make our DB rows diverge from the session-file rows
 * — which breaks `syncConversationFromHermes`'s exact-text claim
 * matching and causes duplicate rows on every poll. So we apply these
 * cleanups uniformly: when persisting (so future reads are clean) and
 * when matching (so legacy / freshly-saved rows still claim cleanly).
 */

const VISION_PREAMBLE_RE =
  /^\[The user attached[\s\S]*?\]\s*(?=(?:\n*\[If you need a closer look)|\n+\S|\n*$)/;
const VISION_HINT_RE = /^\s*\[If you need a closer look[\s\S]*?\]\s*/;
const ATTACHED_FILES_FOOTER_RE = /\n+Attached file\(s\):[\s\S]*$/;

/**
 * Match Hermes's resume banner. Format:
 *   `↻ Resumed session 20260425_161620_6c9e14 "test" (1 user message, 2 total messages)`
 * Sometimes followed by a newline, sometimes the response runs straight on.
 * The session id and title parts are optional defensively.
 */
const RESUME_BANNER_RE =
  /^[↻↺\u21BB\u21BA\s]*Resumed session\s+\S+(?:\s+"[^"]*")?(?:\s*\([^)]*\))?\s*/;

/** Strip Hermes's auto-injected wrappers from a user message. */
export function cleanUserMessageText(text: string): string {
  if (!text) return text;
  let out = text.replace(VISION_PREAMBLE_RE, '').replace(VISION_HINT_RE, '');
  out = out.replace(ATTACHED_FILES_FOOTER_RE, '');
  return out.trim();
}

/** Strip Hermes's `↻ Resumed session …` banner from an assistant message. */
export function cleanAssistantMessageText(text: string): string {
  if (!text) return text;
  return text.replace(RESUME_BANNER_RE, '').trim();
}

/** Apply the role-appropriate cleanup. Pass-through for unknown roles. */
export function cleanMessageText(role: 'user' | 'assistant', text: string): string {
  return role === 'user' ? cleanUserMessageText(text) : cleanAssistantMessageText(text);
}

/**
 * Aggressive normalization for *matching* DB rows against session-file
 * rows. Strips wrapper noise on both sides, lowercases, and collapses
 * whitespace so two semantically-identical messages compare equal even
 * when one was saved before the cleanups were in place.
 */
export function normalizeForMatch(role: 'user' | 'assistant', text: string): string {
  const cleaned = cleanMessageText(role, text || '');
  return cleaned.replace(/\s+/g, ' ').trim().toLowerCase();
}
