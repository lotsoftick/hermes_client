#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, realpathSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploy } from './build-dist.mjs';
import {
  bootoutLaunchAgent,
  bootstrapLaunchAgent,
  getLaunchdDomain,
  getPlistPath,
  kickstartLaunchAgent,
  launchAgentIsLoaded,
  LAUNCH_AGENT_LABEL,
  removePlistFile,
  writeLaunchAgentPlist,
} from './launchd.mjs';
import { portEnv, readPorts } from './ports.mjs';
import { IS_DARWIN, IS_WINDOWS, NPM_BIN, killPort, portListening } from './proc.mjs';
import {
  getStartupCmdPath,
  removeWindowsAutostart,
  windowsAutostartInstalled,
  writeWindowsAutostart,
} from './windows-autostart.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(os.homedir(), '.hermes_client');
const API_DIST = path.join(DIST, 'api');
const CLIENT_DIST = path.join(DIST, 'client');
const DATA_DIR = path.join(DIST, 'data');
const LOG_FILE = path.join(DIST, 'hermes.log');

function currentPorts() {
  const { apiPort, clientPort } = readPorts();
  return { apiPort, clientPort, all: [apiPort, clientPort] };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function killPorts() {
  const { all } = currentPorts();
  for (const port of all) killPort(port);
}

function linkGlobal() {
  execFileSync(NPM_BIN, ['link'], { cwd: ROOT, stdio: 'pipe' });
}

function unlinkGlobal() {
  try { execFileSync(NPM_BIN, ['unlink', '-g', 'hermes-client'], { stdio: 'pipe' }); } catch { /* ok */ }
  try { execFileSync(NPM_BIN, ['unlink', '-g', 'hermes_client'], { stdio: 'pipe' }); } catch { /* ok */ }
}

function assertBuilt() {
  const required = [
    path.join(API_DIST, 'build', 'src', 'app.js'),
    path.join(CLIENT_DIST, 'serve.mjs'),
    path.join(CLIENT_DIST, 'dist'),
    path.join(DIST, 'service-runner.mjs'),
  ];
  const missing = required.filter((f) => !existsSync(f));
  if (missing.length) {
    console.log('❌ No build found. Run `npm start` from the hermes_client repo first.');
    process.exit(1);
  }
}

function installLaunchd() {
  const runner = path.join(DIST, 'service-runner.mjs');
  writeLaunchAgentPlist({
    nodePath: process.execPath,
    runnerPath: runner,
    workDir: DIST,
    stdoutPath: LOG_FILE,
    stderrPath: path.join(DIST, 'hermes.err.log'),
  });
  bootoutLaunchAgent();
  bootstrapLaunchAgent();
}

function installWindowsAutostart() {
  const runner = path.join(DIST, 'service-runner.mjs');
  writeWindowsAutostart({
    nodePath: process.execPath,
    runnerPath: runner,
    workDir: DIST,
    logPath: LOG_FILE,
  });
}

function detachStart() {
  const fd = openSync(LOG_FILE, 'w');
  const env = { ...process.env, NODE_ENV: 'production', ...portEnv() };
  const common = { stdio: ['ignore', fd, fd], env, detached: true };
  // On Windows, `detached: true` with `windowsHide: true` keeps the servers
  // alive after the parent exits without flashing a console window.
  if (IS_WINDOWS) common.windowsHide = true;
  const api = spawn(process.execPath, ['build/src/app.js'], { cwd: API_DIST, ...common });
  const client = spawn(process.execPath, ['serve.mjs'], { cwd: CLIENT_DIST, ...common });
  api.unref();
  client.unref();
  closeSync(fd);
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ── commands ─────────────────────────────────────────────────────────────────

/** npm start only — full build + deploy + autostart (os-specific) + global link */
export function fullStart() {
  deploy();
  killPorts();

  if (IS_DARWIN) {
    installLaunchd();
  } else if (IS_WINDOWS) {
    installWindowsAutostart();
    detachStart();
  } else {
    detachStart();
  }

  linkGlobal();

  const { clientPort } = currentPorts();
  console.log('');
  console.log('  🚀 Hermes Client is running');
  console.log(`  🌐 http://localhost:${clientPort}`);
  if (IS_DARWIN) console.log('  🔄 Starts automatically on login (LaunchAgent)');
  else if (IS_WINDOWS) console.log('  🔄 Starts automatically on login (Startup folder)');
  console.log('  📁 ~/.hermes_client');
  console.log('  ⚙️  Ports: ~/.hermes_client/.env');
  console.log('  🛠️  hermes_client status | stop | restart | uninstall');
  console.log('');
}

/** hermes_client start — run from existing build only */
function cmdStart() {
  assertBuilt();
  killPorts();

  if (IS_DARWIN) {
    installLaunchd();
  } else if (IS_WINDOWS) {
    installWindowsAutostart();
    detachStart();
  } else {
    detachStart();
  }

  const { clientPort } = currentPorts();
  console.log('');
  console.log('  🚀 Hermes Client started');
  console.log(`  🌐 http://localhost:${clientPort}`);
  console.log('');
}

function cmdStop() {
  if (IS_DARWIN) bootoutLaunchAgent();
  killPorts();
  console.log('  🛑 Hermes Client stopped');
}

function cmdRestart() {
  if (IS_DARWIN) {
    if (!existsSync(getPlistPath())) {
      console.log('❌ No LaunchAgent installed. Run `npm start` first.');
      return;
    }
    if (launchAgentIsLoaded()) {
      kickstartLaunchAgent();
    } else {
      bootstrapLaunchAgent();
    }
    const { clientPort } = currentPorts();
    console.log('  🔄 Hermes Client restarted');
    console.log(`  🌐 http://localhost:${clientPort}`);
    return;
  }
  cmdStop();
  cmdStart();
}

function cmdStatus() {
  console.log('');
  console.log('  📦 Hermes Client');
  console.log(`  📁 ${DIST}`);

  if (IS_DARWIN) {
    try {
      const out = execFileSync('launchctl', ['print', `${getLaunchdDomain()}/${LAUNCH_AGENT_LABEL}`], { encoding: 'utf-8' });
      const state = out.match(/^\s*state = (\S+)/m)?.[1] ?? 'unknown';
      const pid = out.match(/^\s*pid = (\d+)/m)?.[1];
      if (state === 'running') {
        console.log(`  ✅ LaunchAgent: running${pid ? ` (pid ${pid})` : ''}`);
      } else {
        console.log(`  ⚠️  LaunchAgent: ${state}`);
      }
    } catch {
      console.log('  ❌ LaunchAgent: not loaded');
    }
  } else if (IS_WINDOWS) {
    if (windowsAutostartInstalled()) {
      console.log(`  ✅ Autostart: installed (${getStartupCmdPath()})`);
    } else {
      console.log('  ❌ Autostart: not installed');
    }
  }

  const { apiPort, clientPort } = currentPorts();
  const api = portListening(apiPort);
  const ui = portListening(clientPort);
  console.log(`  ${api ? '✅' : '❌'} API:    port ${apiPort} ${api ? '(listening)' : '(down)'}`);
  console.log(`  ${ui ? '✅' : '❌'} Client: port ${clientPort} ${ui ? '(listening)' : '(down)'}`);
  console.log(`  📄 Logs: ~/.hermes_client/hermes.log`);
  console.log('');
}

async function cmdUninstall(args) {
  const purge = args.includes('--purge');

  if (purge) {
    const dbPath = path.join(DATA_DIR, 'hermes.sqlite');
    const dbExists = existsSync(dbPath);
    if (dbExists) {
      console.log('');
      console.log('  ⚠️  --purge will delete your Hermes Client database:');
      console.log(`     ${dbPath}`);
      console.log('');
      const ok = await confirm('  Are you sure? (y/N) ');
      if (!ok) {
        console.log('  Cancelled.');
        return;
      }
    }
  }

  if (IS_DARWIN) {
    bootoutLaunchAgent();
    removePlistFile();
  } else if (IS_WINDOWS) {
    removeWindowsAutostart();
  }
  killPorts();
  unlinkGlobal();

  if (existsSync(API_DIST)) rmSync(API_DIST, { recursive: true, force: true });
  if (existsSync(CLIENT_DIST)) rmSync(CLIENT_DIST, { recursive: true, force: true });
  const runner = path.join(DIST, 'service-runner.mjs');
  if (existsSync(runner)) rmSync(runner, { force: true });

  if (purge) {
    if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
    console.log('  🗑️  Uninstalled (all data removed)');
  } else {
    console.log('  🗑️  Uninstalled (database kept in ~/.hermes_client/data)');
  }
}

// ── CLI entry ────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
  Hermes Client

  npm start                   Build, deploy, register LaunchAgent, link global CLI
  hermes_client <command>     Control running service (from any directory)

  Commands:
    start       Start servers from ~/.hermes_client (no build)
    stop        Stop servers
    restart     Stop + start
    status      Show service status
    uninstall   Remove LaunchAgent, global CLI, api & client artifacts
    uninstall --purge   Also delete database (with confirmation)
`);
}

function isCliMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  const here = fileURLToPath(import.meta.url);
  try { return realpathSync(path.resolve(entry)) === realpathSync(here); }
  catch { return path.resolve(entry) === path.resolve(here); }
}

if (isCliMain()) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '-h' || cmd === '--help') {
    printUsage();
    process.exit(cmd ? 0 : 1);
  }

  try {
    switch (cmd) {
      case 'start': cmdStart(); break;
      case 'stop': cmdStop(); break;
      case 'restart': cmdRestart(); break;
      case 'status': cmdStatus(); break;
      case 'uninstall': await cmdUninstall(argv.slice(1)); break;
      default:
        console.error(`Unknown command: ${cmd}`);
        printUsage();
        process.exit(1);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
