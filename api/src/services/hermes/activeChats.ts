/**
 * Tracks chat turns that are mid-flight, keyed by agent id.
 *
 * When a turn starts we don't yet know which Hermes session id it will
 * bind to — for a fresh chat the id is only revealed once `hermes chat`
 * exits. During that window the session file already exists on disk, so a
 * background sidebar refresh that runs session discovery could create its
 * own conversation for it and race the chat controller's bind, leaving a
 * duplicate thread (a slow turn like image generation easily outlasts the
 * file-mtime grace window).
 *
 * To prevent the duplicate at the source, the chat controller marks an
 * agent as "chatting" for the whole stream-and-bind window, and discovery
 * skips *creating* new conversations for that agent while the flag is set.
 * Already-linked conversations keep syncing as usual. A counter (rather
 * than a boolean) keeps this correct under concurrent turns for the same
 * agent.
 */
const activeByAgent = new Map<number, number>();

export function beginAgentChat(agentId: number): void {
  activeByAgent.set(agentId, (activeByAgent.get(agentId) ?? 0) + 1);
}

export function endAgentChat(agentId: number): void {
  const next = (activeByAgent.get(agentId) ?? 0) - 1;
  if (next <= 0) activeByAgent.delete(agentId);
  else activeByAgent.set(agentId, next);
}

export function isAgentChatActive(agentId: number): boolean {
  return (activeByAgent.get(agentId) ?? 0) > 0;
}
