/**
 * Registry of Hermes session ids recently claimed by chat turns in this
 * process.
 *
 * When a fresh `hermes chat` run finishes without us having parsed its
 * `session_id: …` line, we fall back to "the latest session started since
 * the turn began". With two chats running concurrently on the same profile
 * that heuristic can return the *other* chat's session. Every turn therefore
 * registers the session id it resolved (via regex capture, resume, or the
 * gateway handshake), and the fallback resolution excludes all registered
 * ids so it can only ever pick a session no other turn owns.
 *
 * Entries expire after a TTL — the registry only needs to cover the window
 * in which two turns could plausibly overlap.
 */
const CLAIM_TTL_MS = 10 * 60_000;

const claims = new Map<string, number>();

function prune(): void {
  const cutoff = Date.now() - CLAIM_TTL_MS;
  claims.forEach((claimedAt, id) => {
    if (claimedAt < cutoff) claims.delete(id);
  });
}

export function claimSessionId(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  prune();
  claims.set(sessionId, Date.now());
}

export function claimedSessionIds(): string[] {
  prune();
  return Array.from(claims.keys());
}
