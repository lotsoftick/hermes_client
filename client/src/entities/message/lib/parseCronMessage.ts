export interface ParsedCronMessage {
  cronId: string;
  cronName: string;
  body: string;
  currentTime: string | null;
}

const CRON_HEADER_RE = /^\[cron:([^\s\]]+)\s+([^\]]+)\]\s*/;
const CURRENT_TIME_RE = /^Current time:\s*(.+)$/im;
const TRAILER_RE =
  /\n*Return your summary as plain text;[\s\S]*?yourself\.?\s*$/i;

/**
 * Detect the scheduled-task header format that the cron service injects when
 * a cron job fires a message to the agent, and split it into renderable
 * parts. Returns null if the message is a regular user message.
 */
export function parseCronMessage(text: string | undefined | null): ParsedCronMessage | null {
  if (!text) return null;
  const match = text.match(CRON_HEADER_RE);
  if (!match) return null;

  const cronId = match[1].trim();
  const cronName = match[2].trim();

  let remainder = text.slice(match[0].length);
  const timeMatch = remainder.match(CURRENT_TIME_RE);
  const currentTime = timeMatch ? timeMatch[1].trim() : null;
  if (timeMatch) {
    remainder = remainder.replace(timeMatch[0], '').trim();
  }
  remainder = remainder.replace(TRAILER_RE, '').trim();

  return {
    cronId,
    cronName,
    body: remainder,
    currentTime,
  };
}
