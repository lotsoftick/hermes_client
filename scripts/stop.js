import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
execFileSync(process.execPath, [CLI, 'stop'], { stdio: 'inherit' });
