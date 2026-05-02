import crypto from 'crypto';

interface PtyTicketRecord {
  userId: number;
  expiresAt: number;
}

const TICKET_TTL_MS = 60_000;
const tickets = new Map<string, PtyTicketRecord>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [ticket, record] of tickets.entries()) {
    if (record.expiresAt <= now) tickets.delete(ticket);
  }
}

export function issuePtyTicket(userId: number): string {
  cleanupExpired();
  const ticket = crypto.randomBytes(24).toString('base64url');
  tickets.set(ticket, { userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

export function consumePtyTicket(ticket: string | null | undefined): number | null {
  if (!ticket) return null;
  cleanupExpired();
  const record = tickets.get(ticket);
  if (!record || record.expiresAt <= Date.now()) {
    tickets.delete(ticket || '');
    return null;
  }
  tickets.delete(ticket);
  return record.userId;
}
