# Hermes Client

A web-based chat interface for the [Hermes Agent](https://hermes-agent.nousresearch.com/) by Nous Research. Manage multiple Hermes profiles as separate "agents", run conversations with full streaming, and configure cron jobs, skills, and plugins — all through a clean modern UI.

https://github.com/user-attachments/assets/88351710-65c9-4052-bdca-7be3d788b7f0

## Features

- **Multi-agent via Hermes profiles** — every UI "agent" maps 1:1 to a Hermes [profile](https://hermes-agent.nousresearch.com/docs/user-guide/profiles), each with its own home directory, config, and sessions. Add, rename, and delete profiles from the UI; the corresponding `hermes profile …` commands run under the hood.
- **CLI-driven streaming chat** — every turn spawns `hermes -p <profile> chat -Q -q "<message>"` and streams its stdout to the browser over Server-Sent Events. No `hermes gateway` required, no extra ports to open, no separate API server to babysit.
- **Cross-app session sync** — sessions started in a standalone `hermes` REPL automatically appear in the sidebar within seconds. Continue a web-UI conversation from the terminal with `hermes -p <profile> chat -r <sessionKey>` and new turns stream straight back into the open chat.
- **Interactive setup terminal** — an `xterm.js` drawer (backed by a tiny Python PTY bridge that ships with the API) hosts the real `hermes -p <profile> model` (and other config) commands when you create or reconfigure an agent, so API key wizards and arrow-key model pickers Just Work.
- **Brand model icons** — each agent shows its provider's logo (OpenAI, Anthropic, Google, Mistral, OpenRouter, Nous, …) sourced from [`@lobehub/icons`](https://github.com/lobehub/lobe-icons), with a one-click "configure model" prompt when none is set.
- **File uploads** — drag files into the composer; they're stored under `~/.hermes_client/uploads/<conversationId>/` and Hermes is invoked with absolute paths via `--image` (for images) or referenced inline in the prompt (for everything else).
- **Cron, skills, plugins** — surface Hermes' `cron`, `skills list`, and `plugins list/enable/disable` subcommands through the same UI shell.
- **User authentication** — JWT-based auth with a default admin account created on first run.
- **Theming** — built-in color themes with a sidebar picker; the interactive terminal inherits the active theme's sidebar palette.
- **Installable PWA** — runs as a standalone desktop/mobile app via the browser's "Install app" feature.

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
  - **Visual Studio Build Tools** (for the native module `better-sqlite3`).
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

| Command                           | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `hermes_client start`             | Start servers from `~/.hermes_client` (no build)                       |
| `hermes_client stop`              | Stop servers                                                           |
| `hermes_client restart`           | Stop + start                                                           |
| `hermes_client status`            | Show service status                                                    |
| `hermes_client uninstall`         | Remove auto-start, global CLI, api & client artifacts (keeps database) |
| `hermes_client uninstall --purge` | Also delete database (asks for confirmation)                           |

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

| Variable                    | Default                    | Description                                                    |
| --------------------------- | -------------------------- | -------------------------------------------------------------- |
| `NODE_ENV`                  | `development`              | Environment mode                                               |
| `JWT_SECRET`                | _(random)_                 | Secret for JWT signing (also authenticates `/ws/pty` upgrades) |
| `DB_PATH`                   | `./data/hermes.sqlite`     | Path to SQLite database file                                   |
| `PORT`                      | _(API_PORT)_               | API listen port (driven by `~/.hermes_client/.env`)            |
| `ALLOWED_DOMAIN`            | _(unset — allow all)_      | CORS allowlist, comma-separated; only enforced when `HERMES_STRICT_CORS=1` |
| `HERMES_STRICT_CORS`        | _(off)_                    | Set to `1` to reject any origin not in `ALLOWED_DOMAIN`        |
| `API_PUBLIC_URL`            | _(derived from request)_   | Optional fallback origin for upload URLs when no `Host` header |
| `HERMES_BIN`                | resolved automatically     | Override the absolute path to the `hermes` CLI binary          |
| `HERMES_HOME`               | `~/.hermes`                | Override Hermes home directory                                 |
| `HERMES_CLIENT_UPLOADS_DIR` | `~/.hermes_client/uploads` | Override where uploaded files are stored on disk               |

> **CORS / remote access.** Hermes Client is a single-user local app. By
> default the API allows every origin and the client derives the API URL
> from `window.location`, so the same install works on `localhost`, on a
> LAN IP, and over Tailscale without any extra configuration. To lock it
> down to a fixed allowlist, set `ALLOWED_DOMAIN` and `HERMES_STRICT_CORS=1`
> in `api/.env` (or `~/.hermes_client/api/.env` for production installs).

The client picks its API origin at runtime: `__HERMES_CONFIG__.apiBaseUrl`
(injected by the production static server from the request host) ▸
`VITE_API_BASE_URL` (build-time override) ▸ derived from
`window.location` + `VITE_API_PORT`.

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
