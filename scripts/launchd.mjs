import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const LAUNCH_AGENT_LABEL = 'com.hermes.client';

export function getPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
}

export function getLaunchdDomain() {
  return `gui/${process.getuid()}`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {{ nodePath: string; runnerPath: string; workDir: string; stdoutPath: string; stderrPath: string }} opts
 */
export function writeLaunchAgentPlist(opts) {
  const { nodePath, runnerPath, workDir, stdoutPath, stderrPath } = opts;
  const nodeBin = path.dirname(nodePath);
  const sysPath = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  const fullPath = `${nodeBin}:${sysPath}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(runnerPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(workDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>${escapeXml(fullPath)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
  const plistPath = getPlistPath();
  mkdirSync(path.dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, xml, 'utf-8');
  return plistPath;
}

export function launchAgentIsLoaded() {
  const plistPath = getPlistPath();
  if (!existsSync(plistPath)) return false;
  try {
    execFileSync('launchctl', ['print', `${getLaunchdDomain()}/${LAUNCH_AGENT_LABEL}`], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export function bootoutLaunchAgent() {
  const plistPath = getPlistPath();
  if (!existsSync(plistPath)) return;
  try {
    execFileSync('launchctl', ['bootout', getLaunchdDomain(), plistPath], { stdio: 'pipe' });
  } catch {
    try {
      execFileSync('launchctl', ['bootout', getLaunchdDomain(), LAUNCH_AGENT_LABEL], { stdio: 'pipe' });
    } catch {
      /* not running */
    }
  }
}

export function bootstrapLaunchAgent() {
  const plistPath = getPlistPath();
  if (!existsSync(plistPath)) {
    throw new Error(`Missing LaunchAgent plist: ${plistPath}`);
  }
  execFileSync('launchctl', ['bootstrap', getLaunchdDomain(), plistPath], { stdio: 'inherit' });
}

/** Restart job after code/deploy changes (plist unchanged). */
export function kickstartLaunchAgent() {
  try {
    execFileSync('launchctl', ['kickstart', '-k', `${getLaunchdDomain()}/${LAUNCH_AGENT_LABEL}`], {
      stdio: 'inherit',
    });
  } catch {
    bootstrapLaunchAgent();
  }
}

export function removePlistFile() {
  const plistPath = getPlistPath();
  if (existsSync(plistPath)) unlinkSync(plistPath);
}
