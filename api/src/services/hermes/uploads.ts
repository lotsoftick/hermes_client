import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { conversationUploadsDir } from './paths';

export interface SavedUpload {
  /** Absolute path on disk (under ~/.hermes_client/uploads/<conv>/). */
  absolutePath: string;
  /** File name we'll surface back to the client (random-prefixed). */
  storedName: string;
  /** Original file name as uploaded by the user. */
  originalName: string;
  size: number;
  mimetype: string;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

export function isImage(filename: string): boolean {
  return IMAGE_RE.test(filename);
}

/**
 * Move a multer-staged temp file into the conversation's uploads directory,
 * giving it a non-guessable filename. The original name is preserved in
 * the returned metadata for display.
 */
export function persistUpload(
  conversationId: number | string,
  tempPath: string,
  originalName: string,
  mimetype: string,
  size: number
): SavedUpload {
  const dir = conversationUploadsDir(conversationId);
  const ext = path.extname(originalName) || '';
  const storedName = `${crypto.randomBytes(12).toString('hex')}${ext}`;
  const absolutePath = path.join(dir, storedName);
  fs.renameSync(tempPath, absolutePath);
  return { absolutePath, storedName, originalName, mimetype, size };
}

export function uploadAbsolutePath(
  conversationId: number | string,
  storedName: string
): string | null {
  const dir = conversationUploadsDir(conversationId);
  const safe = path.basename(storedName);
  const fp = path.join(dir, safe);
  return fs.existsSync(fp) ? fp : null;
}
