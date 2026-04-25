# Hermes Client

A web-based chat interface for the [Hermes Agent](https://hermes-agent.nousresearch.com/) by Nous Research. Manage multiple Hermes profiles as separate "agents", run conversations with full streaming, and configure cron jobs, skills, and plugins — all through a clean modern UI.

## Features

- **Multi-agent via Hermes profiles** — every UI "agent" maps 1:1 to a Hermes [profile](https://hermes-agent.nousresearch.com/docs/user-guide/profiles), each with its own home directory, config, and sessions. Add, rename, and delete profiles from the UI; the corresponding `hermes profile …` commands run under the hood.
- **CLI-driven streaming chat** — every turn spawns `hermes -p <profile> chat -Q -q "<message>"` and streams its stdout to the browser over Server-Sent Events. No `hermes gateway` required, no extra ports to open, no separate API server to babysit.
- **Cross-app session sync** — sessions started in a standalone `hermes` REPL automatically appear in the sidebar within seconds. Continue a web-UI conversation from the terminal with `hermes -p <profile> chat -r <sessionKey>` and new turns stream straight back into the open chat.
- **Interactive setup terminal** — a `node-pty` + `xterm.js` drawer hosts the real `hermes -p <profile> model` (and other config) commands when you create or reconfigure an agent, so API key wizards and arrow-key model pickers Just Work.
- **Brand model icons** — each agent shows its provider's logo (OpenAI, Anthropic, Google, Mistral, OpenRouter, Nous, …) sourced from [`@lobehub/icons`](https://github.com/lobehub/lobe-icons), with a one-click "configure model" prompt when none is set.
- **File uploads** — drag files into the composer; they're stored under `~/.hermes_client/uploads/<conversationId>/` and Hermes is invoked with absolute paths via `--image` (for images) or referenced inline in the prompt (for everything else).
- **Cron, skills, plugins** — surface Hermes' `cron`, `skills list`, and `plugins list/enable/disable` subcommands through the same UI shell.
- **User authentication** — JWT-based auth with a default admin account created on first run.
- **Theming** — built-in color themes with a sidebar picker; the interactive terminal inherits the active theme's sidebar palette.
- **Installable PWA** — runs as a standalone desktop/mobile app via the browser's "Install app" feature.

## Architecture

- **Client** — React 19 + Vite + Material UI + Redux Toolkit Query, organized with [Feature-Sliced Design](https://feature-sliced.design/).
- **API** — Express + TypeScript + TypeORM + SQLite. Talks to Hermes purely via the `hermes` CLI: `child_process.spawn` for streaming chat, `execFile` for management commands, `node-pty` over a `/ws/pty` WebSocket for interactive subcommands.
- **Source of truth for messages** — Hermes' own session JSON files at `~/.hermes/sessions/session_<id>.json` (default profile) or `~/.hermes/profiles/<name>/sessions/session_<id>.json` (named profiles). The client SQLite mirrors them (with stable `<sessionId>:<index>` ids) so the UI can paginate and search without touching disk on every render, and so externally-added turns reconcile cleanly.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Hermes Agent](https://hermes-agent.nousresearch.com/docs/getting-started/installation) installed with `hermes` on your `PATH`

Verify Hermes is set up:

```bash
hermes --version
hermes status
```

That's it — no `hermes gateway`, no `API_SERVER_*` config, no shared API key. The backend resolves the binary itself via `$PATH` plus a curated list of fallback locations (`~/.local/bin`, `~/.hermes/hermes-agent/venv/bin`, Homebrew prefixes…), so launchers like Finder, Cursor, and `launchd` work without a custom shell login.

If you keep `hermes` somewhere unusual, set `HERMES_BIN` in `api/.env` to its absolute path.

### Platform notes

- **macOS / Linux** — works out of the box.
- **Windows 10/11** — supported. Additionally requires:
  - **Git for Windows** (the auto-update flow uses `git`)
  - **Visual Studio Build Tools** (for native modules `better-sqlite3` and `node-pty`).
  - Run **PowerShell as Administrator** the first time you execute `npm start` so that
    `npm link` can create the global `hermes_client` shim, and so that auto-start can
    be installed.

## Quick Start

```bash
git clone https://github.com/lotsoftick/hermes_client.git
cd hermes_client
npm start
```

`npm start` builds everything, deploys to `~/.hermes_client`, installs an OS-appropriate auto-start (macOS **LaunchAgent**, Windows **Startup folder** shortcut), and installs the global **`hermes_client`** command.

| Service  | URL                             |
| -------- | ------------------------------- |
| Client   | http://localhost:18888          |
| API      | http://localhost:18889          |
| API Docs | http://localhost:18889/api/docs |

> **Note:** API Docs (Swagger) are only available in development mode (`npm run dev`).

## Default Login

On first startup, a default admin user is created:

- **Email:** `admin@admin.com`
- **Password:** `123456`

## Service Commands

After `npm start`, the **`hermes_client`** command works from any directory:

| Command                            | What it does                                                           |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `hermes_client start`              | Start servers from `~/.hermes_client` (no build)                       |
| `hermes_client stop`               | Stop servers                                                           |
| `hermes_client restart`            | Stop + start                                                           |
| `hermes_client status`             | Show service status                                                    |
| `hermes_client uninstall`          | Remove auto-start, global CLI, api & client artifacts (keeps database) |
| `hermes_client uninstall --purge`  | Also delete database (asks for confirmation)                           |

To rebuild after code changes, run **`npm start`** from the repo again.

## npm Scripts

| Command         | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `npm start`     | Build, deploy to `~/.hermes_client`, LaunchAgent, global CLI |
| `npm run stop`  | Stop servers                                                 |
| `npm run dev`   | API (nodemon) + Client (Vite) in dev mode with hot reload    |
| `npm run setup` | Generate `api/.env` only                                     |

## Configuration

### Ports (`~/.hermes_client/.env`)

Port configuration lives in a single user-level file at **`~/.hermes_client/.env`**. It is created automatically on first run with sensible defaults.

| Variable      | Default | Description             |
| ------------- | ------- | ----------------------- |
| `API_PORT`    | `18889` | Port the API listens on |
| `CLIENT_PORT` | `18888` | Port the web UI uses    |

After changing a value, apply it with:

```bash
hermes_client restart       # production (installed via `npm start`)
npm run dev                 # development
```

### API environment (`api/.env`)

Generated automatically on first run (see `api/.env.example` for reference):

| Variable                      | Default                        | Description                                                    |
| ----------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                  | Environment mode                                               |
| `JWT_SECRET`                  | _(random)_                     | Secret for JWT signing (also authenticates `/ws/pty` upgrades) |
| `DB_PATH`                     | `./data/hermes.sqlite`         | Path to SQLite database file                                   |
| `PORT`                        | _(API_PORT)_                   | API listen port (driven by `~/.hermes_client/.env`)            |
| `ALLOWED_DOMAIN`              | _(CLIENT origin)_              | CORS allowed origin(s), comma-separated                        |
| `API_PUBLIC_URL`              | _(API origin)_                 | Public base URL used for generated upload URLs                 |
| `HERMES_BIN`                  | resolved automatically         | Override the absolute path to the `hermes` CLI binary          |
| `HERMES_HOME`                 | `~/.hermes`                    | Override Hermes home directory                                 |
| `HERMES_CLIENT_UPLOADS_DIR`   | `~/.hermes_client/uploads`     | Override where uploaded files are stored on disk               |

The client reads `VITE_API_BASE_URL` at build time; it is set automatically to match `API_PORT`. Override by setting it in `client/.env` only if you deploy behind a custom host.

To regenerate secrets, delete `api/.env` and run `npm run dev` or `npm run setup` again.

### Production Layout

When running `npm start`, built artifacts are deployed to `~/.hermes_client/`:

```
~/.hermes_client/
├── api/
│   ├── build/          # Compiled API (JavaScript)
│   ├── node_modules/   # Production dependencies only
│   └── .env            # Auto-generated on first deploy
├── client/
│   ├── dist/           # Built static frontend
│   └── serve.mjs       # Lightweight static file server
├── data/
│   └── hermes.sqlite   # SQLite database (UI metadata + a mirror of Hermes session messages)
├── uploads/
│   └── <conversationId>/   # Files attached to messages, passed to Hermes by absolute path
└── hermes.log          # Combined log output
```

Hermes' own conversation state continues to live under `~/.hermes/` (sessions, skills, plugins, profiles…). The Hermes Client never writes there directly — it only invokes the `hermes` CLI and reads session JSON files for sync.

The source directory is only needed for building. Production processes run entirely from `~/.hermes_client/`.

## How "agents" map to Hermes

Hermes has no built-in concept of "agents" with their own identity, persona, or budget. Each UI agent is therefore backed by a [Hermes profile](https://hermes-agent.nousresearch.com/docs/user-guide/profiles) — an isolated home directory with its own model, API keys, sessions, skills, and plugins. Creating an agent simply runs:

```bash
hermes profile create <name>
```

…then opens the interactive setup drawer with `hermes -p <name> model` so you can pick a provider, paste an API key, and choose a model — using the real Hermes wizards, not a re-implementation. Subsequent reconfiguration is one click on the model icon in the sidebar.

Every chat turn invokes the CLI directly:

```bash
hermes -p <name> chat -Q --source hermes-client \
  --resume <sessionId>             # omitted on the first turn
  --image /abs/path/to/file        # repeated per attached image
  -q "<your prompt>"
```

Stdout is streamed token-by-token to the browser over SSE; the resolved `session_id` (printed by `hermes chat -Q` on stderr) is captured and bound to the conversation row so subsequent turns resume the same session.

### Cross-app sync with the standalone CLI

Two flows make conversations bidirectional between the web UI and any standalone `hermes` REPL:

- **Discovery** — every few seconds the conversation list scans `~/.hermes[/profiles/<name>]/sessions/` for `session_*.json` files that aren't yet linked to a conversation. New sessions become new conversations in the sidebar (titled by the first user message), and their full history is pulled in.
- **Reconciliation** — every poll for an open conversation re-reads its session file. Turns added externally (by `hermes -r <sessionKey>` from a terminal) are stamped with stable `<sessionId>:<index>` ids and merged into the chat view. Rows that the chat handler wrote in the live request are claimed by role+text, so nothing is duplicated.

Practical workflow:

```bash
# In one window: chat in the web UI, watch the sessionKey for the conversation.
# In another window: continue the same conversation from your shell.
hermes -p <profile> chat -r <sessionKey>
```

Anything you type in the terminal appears in the open browser tab within one polling tick, and vice versa.

## Install as an App (PWA)

Once the client is running, Chromium-based browsers (Chrome, Edge, Brave, Arc, Opera) detect that the app is installable:

- An **Install app** banner appears in the sidebar — click it to install.
- Alternatively, click the install icon in the address bar, or use the browser menu (**More → Install Hermes…**).

After install, the app launches in its own window (no tabs, own dock/taskbar icon) and behaves like a native desktop app. It still communicates with the local API server — the PWA is a UI shell, not a replacement for the background service.

| Browser             | Support                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| Chrome / Edge / Arc | Full — custom install banner, standalone window, auto-updates via service worker |
| Brave / Opera       | Full                                                                             |
| Safari (macOS/iOS)  | "Add to Dock" / "Add to Home Screen" from the Share menu                         |
| Firefox             | Not installable (Firefox disabled PWA install on desktop); runs as a normal tab  |

App icons live in `client/public/` (`logo_256.png` master, plus `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-512-maskable.png`, `icons/apple-touch-icon.png`, `logo_128.png`). To regenerate them from a new master with the maskable safe-zone applied:

```bash
python3 -m venv /tmp/icon-venv && /tmp/icon-venv/bin/pip install --quiet Pillow
/tmp/icon-venv/bin/python3 - <<'PY'
from PIL import Image
import os
PUB = 'client/public'
src = Image.open(f'{PUB}/logo_256.png').convert('RGBA')
BG = (11, 11, 11, 255)  # matches PWA theme_color
def resize(s): return src.resize((s, s), Image.LANCZOS)
def write(s, out): resize(s).save(out, optimize=True)
def write_flat(s, out, bg=BG):
    c = Image.new('RGBA', (s, s), bg); c.alpha_composite(resize(s)); c.save(out, optimize=True)
def write_maskable(s, out, safe=0.8, bg=BG):
    inner = round(s * safe); fg = src.resize((inner, inner), Image.LANCZOS)
    c = Image.new('RGBA', (s, s), bg); c.alpha_composite(fg, dest=((s-inner)//2,)*2); c.save(out, optimize=True)
write(192, f'{PUB}/icons/icon-192.png')
write(512, f'{PUB}/icons/icon-512.png')
write(128, f'{PUB}/logo_128.png')
write_flat(180, f'{PUB}/icons/apple-touch-icon.png')
write_maskable(512, f'{PUB}/icons/icon-512-maskable.png')
PY
```
