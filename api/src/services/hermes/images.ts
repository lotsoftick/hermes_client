import fs from 'fs';
import os from 'os';
import path from 'path';
import { HERMES_HOME, UPLOADS_ROOT } from './paths';

/**
 * Inline-image support for assistant turns.
 *
 * Hermes itself (see `agent/image_routing.py` in the agent repo) detects
 * images referenced in free-form text by two signals: local filesystem
 * paths whose suffix is an image extension *and that exist on disk*, and
 * `http(s)` URLs ending in an image extension. We mirror that here so the
 * web client can render images an agent produced (e.g. an image-gen tool
 * that writes a PNG and reports its path in the tool result).
 */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'svg'];
const EXT_GROUP = IMAGE_EXTS.join('|');

const LOCAL_IMAGE_RE = new RegExp(
  `(?:~/|/)(?:[\\w.\\-]+/)*[\\w.\\-]+\\.(?:${EXT_GROUP})\\b`,
  'gi'
);
const IMAGE_URL_RE = new RegExp(
  `https?://[^\\s<>"']+?\\.(?:${EXT_GROUP})(?:\\?[^\\s<>"']*)?`,
  'gi'
);

/**
 * Roots a served image is allowed to live under. We keep this tight on
 * purpose: the agent's Hermes home (where generated media and session
 * workspaces live), the client's own uploads dir, the system temp dir,
 * and the process working directory — `hermes` is spawned without an
 * explicit cwd, so it inherits ours, and image-gen tools commonly drop
 * their output as a relative path (e.g. `ai_image.svg`) right there.
 * Anything else is refused even with a valid auth token.
 */
function allowedRoots(): string[] {
  // `/tmp` is intentionally separate from `os.tmpdir()`: on macOS the
  // latter is a per-user `/var/folders/…/T` path, while agents (and most
  // shell tools) write to the conventional `/tmp`, which resolves to
  // `/private/tmp`. `isWithin` realpaths each root, so listing `/tmp`
  // covers both spellings.
  return [HERMES_HOME, UPLOADS_ROOT, os.tmpdir(), '/tmp', process.cwd()];
}

function isWithin(child: string, parent: string): boolean {
  try {
    const p = fs.realpathSync(parent);
    return child === p || child.startsWith(p + path.sep);
  } catch {
    return false;
  }
}

/**
 * Validate that `input` resolves to an existing image file inside one of
 * the allowed roots. Returns the canonical absolute path, or null when
 * the path is missing, not an image, or outside the allowlist. This is
 * the single chokepoint both the parser and the serve endpoint use.
 */
export function safeImagePath(input: string): string | null {
  if (!input) return null;
  const expanded = input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input;
  if (!path.isAbsolute(expanded)) return null;
  let real: string;
  try {
    real = fs.realpathSync(expanded);
    if (!fs.statSync(real).isFile()) return null;
  } catch {
    return null;
  }
  const ext = path.extname(real).slice(1).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) return null;
  return allowedRoots().some((root) => isWithin(real, root)) ? real : null;
}

/**
 * Scan free-form text fragments (typically tool-call arguments/results)
 * for image references and turn them into client-renderable srcs:
 *   - `http(s)` image URLs are returned as-is.
 *   - Local paths are validated against the allowlist and, when valid,
 *     rewritten to the authenticated serve endpoint.
 * Order-preserving and de-duplicated.
 */
export function collectImageSrcs(fragments: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (src: string): void => {
    if (!seen.has(src)) {
      seen.add(src);
      out.push(src);
    }
  };
  fragments.forEach((fragment) => {
    if (!fragment) return;
    const urlMatches = fragment.match(IMAGE_URL_RE) ?? [];
    urlMatches.forEach((url) => add(url));
    const localMatches = fragment.match(LOCAL_IMAGE_RE) ?? [];
    localMatches.forEach((p) => {
      const real = safeImagePath(p);
      if (real) add(`/api/message/image?path=${encodeURIComponent(real)}`);
    });
  });
  return out;
}
