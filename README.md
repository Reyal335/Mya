<p align="center">
  <img src="resources/icon.png" alt="Mya logo" width="256">
</p>

# Mya

Mya is a personal desktop app that puts a custom 8-bit retro interface on
top of Claude Code. You chat with coding agents, and the replies type out in an
RPG-style dialogue box next to a small pixel mascot. Besides Claude, it can run
OpenAI Codex and Google Gemini through their own command-line tools.

It is built with Electron and the Claude Agent SDK. It is for one person on one
machine. It is not a product and it has no accounts of its own.

## Features

### Working now

- **Multiple chats per project.** The CHAT screen shows the open chat. The HISTORY panel lists
  all past chats with search, rename, pin/unpin, fork, export, and delete. NEW CHAT starts a
  fresh conversation. Replies stream into the dialogue box, the mascot's state follows the run,
  and chats come back after a restart.
- **Collapsible dialogue box.** Press ▼ COLLAPSE to fold the box to a one-row bar so the
  history can use the room. The mascot and bar follow the reply's first line and keep typing.
  AUTO on (default) folds the box when you scroll back and opens it for new replies.
- **Composer with pasted images.** Type your message and paste images. Large pastes show as
  chips you can remove individually. Claude only.
- **Model and thinking picker.** Pick which of your chat's provider's models runs your next
  message, and how hard it thinks. A chat stays with its provider: to use another one, start
  a new chat. You can change the model or toggle thinking mid-run. The model shows an effort
  tag: "sonnet · MED". Claude only.
- **LOGINS.** One card per provider. Install, sign in to, and sign out of the Codex and
  Gemini command-line tools. Claude's card is read only: it shows whether Claude Code is signed
  in. See [Providers](#providers).
- **Chat themes.** Customize the colors and fade effect of the dialogue box. Upload, rename,
  and delete your own themes alongside built-in ones.
- **Custom title bar.** A styled title bar that fits the 8-bit retro aesthetic, with breadcrumb
  navigation showing the open chat.
- **The party.** Your agents show in a panel on the right of CHAT. Click one to call it for
  your next message, or Claude brings one in by itself. While an agent works, its row shows
  what it is doing and an agent card shows in the conversation. The panel collapses to an icon
  rail. Up to three agents can run at once. Claude only.
- **Inbox.** Every piece of work Claude hands to an agent is a task with a status (RUNNING,
  WAITING, DONE, ERROR, STOPPED), its activity, and its full report. A task waiting for your
  approval counts on the INBOX badge, and you can approve it there. Claude only.
- **Popup notifications.** A small always-on-top window with the mascot appears when a task
  finishes (visible for 6 seconds), needs approval, or fails (visible for 10 seconds). Can be
  toggled on/off in settings.
- **Tool cards.** Each tool call shows as a card with its name, its input, and a status:
  RUNNING, WAITING, DONE, FAILED, DENIED, or STOPPED.
- **Approve or deny (Claude).** On a Claude turn, reading files (`Read`, `Grep`, `Glob`) runs
  without asking. Editing files (`Edit`, `Write`) and shell commands (`Bash`) wait for your
  Approve or Deny. Codex and Gemini turns do not ask. See [Providers](#providers).
- **Stop.** The STOP button ends the current run. On a Claude turn, any tool still waiting is
  denied. On a Codex or Gemini turn, it ends the program.
- **Markdown rendering.** Chat replies render as Markdown, with syntax highlighting for code
  blocks.
- **Mascot with seven states.** The mascot reacts to the run: idle, thinking, talking, working,
  asking (waiting for you), victory (boss battles), and hurt (boss battles).
- **Mascot voice (Claude only).** Each mascot has a voice (name and personality) that adds
  emoji and character to Claude's replies without changing what Claude does. No voice shows
  plain Claude.
- **Mascot accessories.** Unlock cosmetic accessories for your mascot as you level up and
  complete achievements. Claude only.
- **Boss battles (Claude only).** Run your code against test suites. Claude plays as your
  party and fights the boss. Supports Jest, Vitest, node:test (Node.js), pytest (Python),
  dotnet (C#), PHPUnit (PHP), and Pest. Boss packs are uploaded as folders. Test output is
  parsed to show pass/fail, attack damage, loot, and XP.
- **Progression (Claude only).** Your agents level up and gain new classes as you use them.
  Victories grant XP and loot. Leveling unlocks new abilities and cosmetic rewards.
- **Achievements (Claude only).** Unlock titles and mascot accessories by reaching milestones.
  View them on the ACHIEVEMENTS screen.
- **Account screen.** View your 5-hour and 7-day usage on Claude (messages, cached tokens, API
  calls). Claude only.
- **Agent manager.** Create, edit, and delete agent files for the open project or for your
  whole machine. You can give an agent a 16x16 PNG icon and a short role label. CALL on a card
  opens CHAT with that agent called.
- **Mascot manager.** Upload your own mascots as spritesheets, with one loop per state. Sheets
  in a grid are cut into a strip in the sheet slicer. REVERSE AT END plays each loop forward
  then backward.
- **Boss manager.** Upload custom boss packs (folder format 2). Manage which bosses are in the
  random pool.

## Tech stack

- Electron, React, and TypeScript, built with electron-vite
- `@anthropic-ai/claude-agent-sdk`, which runs the Claude agents
- The `codex` CLI and the `gemini` or `agy` (Antigravity) CLI, which Mya starts
  to run Codex and Gemini. They are not package dependencies.
- Plain CSS with CSS variables for the colors and type. No UI library.

## Prerequisites

- **Node.js and npm.** The project does not pin a Node version in
  `package.json`.
- **Claude Code, signed in.** Mya uses the Claude Code login on your
  machine. See [Authentication](#authentication).
- **Optional: the Codex or Gemini CLI.** Only needed if you want those
  providers. The LOGINS screen can install them. See [Providers](#providers).

## Authentication

This section is about Claude. For Codex and Gemini, see
[Providers](#providers).

For Claude, Mya has no login screen and no API key. It runs on the Claude Code
login that is already on your machine, so usage counts against your Claude plan.

Sign in once in a terminal:

```bash
claude
```

Then type `/login` at the Claude Code prompt and follow the steps.

The app also:

- Does not read a `.env` file. There is no `.env` setup.
- Never reads, copies, stores, or displays your Claude credentials or tokens.
- Removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the environment it
  gives the agent. A stray API key on your machine cannot switch billing to the
  API.
- Stops a run with an error if Claude Code reports that it is using an API key
  instead of your account login.

## Providers

Mya runs three providers. You pick one for each chat in the NEW CHAT dialog, and
the chat stays with it. A provider that is not installed or not signed in is
greyed out there, with a link to LOGINS.

| Provider | Model name | What runs |
| --- | --- | --- |
| Claude | No prefix, for example `sonnet` | The Claude Agent SDK |
| Codex | `codex:` prefix, for example `codex:o4-mini` | The `codex` CLI |
| Gemini | `gemini:` prefix, for example `gemini:gemini-2.5-pro` | The Antigravity CLI (`agy`) when it is installed and no Gemini API key is saved. Otherwise the `gemini` CLI |

Codex and Gemini run as separate programs that Mya starts in your project
folder. Their replies and tool cards show in the same dialogue box and tool
cards as Claude's. Each keeps its own thread per project and picks it up again
on your next message, including after a restart. The threads are separate: a
Codex thread does not see what Claude said. After a restart, only a Claude chat
has its earlier messages drawn back on screen. Models that the Codex CLI has
cached in `~/.codex/models_cache.json` are added to the picker.

An agent you call runs as a task in the inbox, on the chat's provider. An agent
whose file sets a `model` (a Claude alias, or a `codex:` or `gemini:` value) is
pinned to that provider and can only be called in a chat of that provider. An
agent with no `model`, or `inherit`, follows the chat. In a Claude chat, agents
run through the Agent SDK.

A new chat can only start on a provider that is signed in. Codex and Gemini chats
lack: usage figures (see the ACCOUNT screen for Claude only), image support, mascot
voice (Claude only), and boss battles and progression (Claude only). Where you would
look for one of these on a Codex or Gemini chat, the app says so.

### Codex and Gemini do not ask for approval

Claude turns ask before they edit files or run commands. Codex and Gemini turns
do not. Mya starts them with their no-approval options:

- Codex: `--dangerously-bypass-approvals-and-sandbox`
- Gemini: `--yolo`
- Antigravity (`agy`): `--dangerously-skip-permissions`

Their tool cards show what ran, with no WAITING state and no Deny. STOP ends
the program. This is on purpose. Only run Codex or Gemini on a project you are
happy for them to change, and keep it under version control.

### Signing in to Codex and Gemini

Open **LOGINS** in the sidebar. For each provider you can install the CLI
(`npm install -g @openai/codex` or `@google/gemini-cli`), sign in in your
browser, paste an API key, or sign out.

- **Codex, browser sign-in.** Mya runs `codex login`. The Codex CLI saves its
  sign-in in `~/.codex/auth.json`. Mya reads that file to show who is signed in
  (name, email, and plan) and deletes it when you sign out.
- **Gemini, browser sign-in.** Mya runs the Google sign-in itself, with a
  one-time local page on `127.0.0.1`. It saves the sign-in in
  `~/.gemini/oauth_creds.json` and your email in
  `~/.gemini/google_accounts.json`, and sets the auth type in
  `~/.gemini/settings.json`. Mya's own error text says Google has retired this
  sign-in for the standalone Gemini CLI. If it fails, use the Antigravity CLI or
  paste a key. That has not been re-checked here.
- **Pasted API keys are saved in plain text.** They go in `provider-auth.json`
  in the `userData` folder (see [Where app data lives](#where-app-data-lives)).
  They are not encrypted. Anyone who can read your user profile can read them.
  Mya passes a saved key to the CLI as an environment variable. A saved Codex
  key is also given to `codex login --with-api-key`, so the Codex CLI keeps its
  own copy in `~/.codex/auth.json`. The LOGINS screen shows a saved key masked,
  with only the first and last four characters.
- Mya also looks for `OPENAI_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`, and
  `GOOGLE_API_KEY` in its own environment, and counts one as a sign-in.

What you send on a Codex or Gemini turn goes to OpenAI or Google and counts
against that account, not your Claude plan. None of the above applies to Claude:
Mya never reads or stores your Claude Code login.

## Getting started

Install the dependencies:

```bash
npm install
```

`npm install` also downloads Electron and rebuilds the app dependencies.

Start the app in development mode, with hot reload:

```bash
npm run dev
```

Build and check the app:

```bash
npm run build           # type checks, then builds the app into out/
npm run start           # runs the last build with electron-vite preview
```

Package the app:

```bash
npm run build:unpack    # builds, then makes an unpacked app folder
npm run build:win       # builds, then makes a Windows installer
npm run build:mac       # builds, then makes a macOS package
npm run build:linux     # builds, then makes Linux packages
```

Other scripts:

```bash
npm test                # runs node --test
npm run typecheck       # type checks the main and renderer code
npm run lint            # runs ESLint
npm run format          # runs Prettier on the whole project
npm run icon            # regenerates the app icon files from scripts/make-icon.mjs
```

### Opening a project

When you start Mya, click **OPEN** in the sidebar and pick a project folder.
Mya remembers the folder for next time. Chat runs in that folder, and the
project's agents are loaded from it.

## Project structure

```
mya/
├── src/
│   ├── main/        Electron main process: runs the Agent SDK and the Codex and Gemini CLIs, file access, IPC
│   ├── preload/     The typed bridge between the main process and the window
│   ├── shared/      Types and rules used by both sides (IPC channels, agent rules)
│   └── renderer/    The React app: screens, components, hooks, styles
├── docs/            Project memory and step notes (not in version control)
├── designs/         Static HTML mockups and DESIGN.md (colors, type, rules)
├── resources/       Built app resources (icon, installer, etc.)
├── build/           Build output and app packages
├── scripts/         make-icon.mjs, which draws the app icon
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

The Agent SDK runs only in the main process. The renderer never imports it. The
Codex and Gemini CLIs are also started only from the main process. The main
process forwards the stream events to the window, and the window only draws
them. Codex and Gemini output is turned into the same events. Claude permission
requests go to the window, and your Approve or Deny goes back to the main
process.

## Where app data lives

Mya keeps its data in Electron's `userData` folder. On Windows this is
normally under `%APPDATA%`.

| File or folder | What it holds |
| --- | --- |
| `settings.json` | Project path, active mascot id (`activeMascotId`), party panel mode (`partyPanel`), default model and effort for new chats (`defaultModel`, `defaultEffort`, `providerDefaults`), default theme (`defaultTheme`), and toggles: `popups`, `dialogueAutoCollapse`, `openInEditor`, `bossesOutOfPool` (bosses out of random selection), and per-project test command (`testCommands`) |
| `chats/<project-id>.json` | Live data for each project's chats: list, open chat id, and per-chat session ids and saved model/effort choices. Chat transcripts are in `.jsonl` files in the same folder |
| `provider-auth.json` | API keys you pasted on the LOGINS screen, **in plain text** (`codexApiKey`, `geminiApiKey`). Signing out of a provider removes its key |
| `tasks.json` | The inbox: each agent task with its status, activity, and report. A bad file is kept aside as `tasks.json.bad` |
| `progression.json` | Agent experience, levels, and loot for each agent in each project. Claude only |
| `boss-fights.json` | Records of your boss fight victories and defeats. Claude only |
| `usage.json` | Rolling 5-hour and 7-day usage snapshots. Claude only |
| `agent-icons/` | The 16x16 PNG icons you chose for agents |
| `agent-icons.json` | A map from each agent file path to its icon file |
| `agent-roles.json` | A map from each agent file path to its role label |
| `mascots/<id>/` | One folder per uploaded mascot: `manifest.json` with name and voice, and one PNG per state (`idle.png`, `thinking.png`, `talking.png`, `working.png`, `asking.png`, `victory.png`, `hurt.png`). A picked strip is stored exactly as picked; a sheet cut up in the slicer is stored as the strip it produced, never the original |
| `themes/<id>/` | One folder per uploaded theme: `theme.json` with colors and fade rules, and optionally background image |
| `bosses/` | Uploaded boss packs (folder format 2) |

The built-in default mascot ships with the app, and its files never change. If
you edit its name or loops, your changes are kept in `mascots/default/` in the
same format, and an empty slot for any missing state keeps the built-in one.
RESET on its card moves that folder to the trash. Deleting a mascot moves its
folder to the trash. If a mascot folder is broken, the MASCOTS screen lists it
with the reason, and the app uses the default.

The icon and role maps use the agent file path as the key. Mya never adds
its own fields to agent files, so Claude Code only sees the standard fields.

Deleting an agent in Mya moves its file to the trash. It also removes that
agent's icon and role entries.

## Agent files

Agents are Markdown files that Claude Code also reads.

- **Project agents** live in `<project>/.claude/agents/`. They are only listed
  when a project is open.
- **Global agents** live in `~/.claude/agents/`. If the `CLAUDE_CONFIG_DIR`
  environment variable is set, global agents live in `<that folder>/agents/`.

An agent file has a frontmatter block with `name` and `description`, and an
optional `tools` and `model`. The text after the block is the agent's system
prompt. For example:

```markdown
---
name: code-reader
description: Reads the project and explains how a part of it works.
tools: Read, Grep, Glob
model: sonnet
---

You explain code in plain words. Start with the big picture, then go into
detail only where it helps.
```

Notes on agent fields:

- `name` must be unique within its folder. It cannot contain `:` or line
  breaks, and it cannot start with `-`.
- `description` is required.
- `model` can be `inherit`, `sonnet`, `opus`, `haiku`, `fable`, `codex:gpt-5.3-codex`,
  `codex:o4-mini`, `gemini:gemini-2.5-pro`, `gemini:gemini-4-argon-high`,
  `gemini:gemini-4-hydrogen-high`, `gemini:gemini-3.8-flash-high`, or
  `gemini:gemini-2.5-flash`. Codex and Gemini values only take effect in a
  Codex or Gemini chat. See [Providers](#providers).
- The form lists these tools: `Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`,
  `WebFetch`, and `WebSearch`. All eight can run on Claude. An agent gets the
  ones it lists from that set (all eight when it lists none).
- Mya does not run an agent whose file sets `permissionMode` to
  `acceptEdits`, `auto`, or `bypassPermissions`, or sets `background: true`.
  Inside an agent, only `Read`, `Grep`, and `Glob` run without asking.
- A **role** is an optional label of up to 40 characters, such as
  `code-reader`. Mya stores it in `agent-roles.json`, not in the agent file.
- An **icon** is optional. It must be a square PNG from 16x16 to 32x32 pixels.
  Mya rejects any other size and does not resize it. Agents without an icon
  show a placeholder.

## Mascot spritesheets

The mascot is drawn from a spritesheet, uploaded on the MASCOTS screen. A sheet
in any other layout opens the sheet slicer, which cuts it into a strip. Each loop
can be set to REVERSE AT END, which plays the frames forward then backward.

The sheet format, from `designs/DESIGN.md`:

- PNG, with frames laid out in one horizontal strip.
- Each frame is 64x64 pixels. The sheet is exactly 64 pixels tall, and its width
  is a multiple of 64.
- At most 16 frames per loop.
- One loop per state: `idle`, `thinking`, `talking`, `working`, `asking`, `victory`,
  and `hurt`. Victory and hurt come with boss battles and are optional. `idle` is
  required. A state with no loop plays the idle loop or falls back to `talking`
  (victory only).
- The design calls for display at 1x, 2x, or 3x only, so the pixels stay sharp.

## Navigation

The sidebar has these main screens: CHAT, INBOX, AGENTS, MASCOTS, and ACHIEVEMENTS.
At the top is a NEW CHAT button. HISTORY lists all past chats and can be searched.
The gear icon opens LOGINS. At the bottom, ACCOUNT links to your sign-in and usage
(Claude only).

## Claude-only features

The following features work only on Claude chats:

- **Agents in the party.** Codex and Gemini chats do not support calling agents.
- **Tasks in the inbox.** Agent tasks only run on Claude.
- **Usage figures and account screen.** Codex and Gemini have no usage data.
- **Images in the composer.** Codex and Gemini do not accept pasted images.
- **Mascot voice.** Mascot personality only works with Claude.
- **Boss battles and progression.** Leveling, loot, and test runner integration are
  Claude only.
- **Achievements and mascot accessories.** Unlocks only on Claude.

## Current limits

- One run at a time per chat. Agents run inside that run, in the foreground,
  one level deep (an agent cannot start an agent), at most three at once. Only
  the main chat's agents run; background agents and agent-to-agent calls are
  not supported.
- `WebFetch` and `WebSearch` are gated by approval when Claude uses them, the
  same as Edit, Write, and Bash.
- Drag-and-drop of files is not supported.
- Continuing a finished agent (picking it up again later) is not supported.

## Roadmap

1. Scaffold the app with one window and the navigation shell. *Done*
2. One conversation with streamed replies. *Done*
3. Tool activity cards and Approve / Deny for permission requests. *Done*
4. Mascot with five states, driven by the stream. *Done* (now seven states with victory and hurt)
5. Agent manager: read, create, edit, and delete agent files, with icon upload. *Done*
6. Mascot manager: spritesheet upload, validation, and per-state loops. *Done*
7. Multiple conversations (chat history) and the inbox of tasks. *Done*
8. Popup notification window. *Done*
9. Chat history with search, rename, pin, fork, export, delete. *Done*
10. Model picker with effort tags. *Done*
11. Chat themes (upload, rename, delete). *Done*
12. Custom title bar with breadcrumb. *Done*
13. Account screen with usage bars. *Done*
14. Mascot voice system (adds name and emoji to Claude). *Done*
15. Boss battles and progression (level, loot, XP, achievements). *Done*
16. Composer with pasted images and large-paste chips. *Done*
17. Progression rewards (agent classes, loot tables). *Done*
18. Boss battles (test parsers for Jest, Vitest, node:test, pytest, dotnet, PHPUnit, Pest).
    *Done*
19. Custom boss packs (pack format 2). *Done*
20. Collapsible dialogue box with AUTO-collapse and REVERSE AT END loops. *Done*

Steps 21-22 exist as uncommitted work in the working tree (sidebar redesign and
one-provider-per-chat enforcement via NEW CHAT).

The build order and design rules are in `CLAUDE.md` and `designs/DESIGN.md`.

---

Written with love by April 9th.  🌸❄️
