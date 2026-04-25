import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STARTUP_CMD_NAME = 'HermesClient.cmd';

export function getStartupFolder() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

export function getStartupCmdPath() {
  return path.join(getStartupFolder(), STARTUP_CMD_NAME);
}

/**
 * Install a Startup-folder .cmd that launches the service-runner on login.
 * Uses `start "" /B` to avoid showing a console window.
 * @param {{ nodePath: string; runnerPath: string; workDir: string; logPath: string }} opts
 */
export function writeWindowsAutostart(opts) {
  const { nodePath, runnerPath, workDir, logPath } = opts;
  const folder = getStartupFolder();
  mkdirSync(folder, { recursive: true });
  const script = [
    '@echo off',
    `cd /d "${workDir}"`,
    `start "" /B "${nodePath}" "${runnerPath}" 1>> "${logPath}" 2>&1`,
    '',
  ].join('\r\n');
  writeFileSync(getStartupCmdPath(), script);
  return getStartupCmdPath();
}

export function removeWindowsAutostart() {
  const p = getStartupCmdPath();
  if (existsSync(p)) unlinkSync(p);
}

export function windowsAutostartInstalled() {
  return existsSync(getStartupCmdPath());
}
