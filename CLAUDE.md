# Mya

A personal desktop app that puts a custom 8-bit retro interface on top of
Claude Code, using the Claude Agent SDK. It can also run Codex and Gemini
through their own command-line tools. See [Providers](#providers).

## What it does

- Chat with coding agents, on Claude, Codex, or Gemini. Replies type out in an
  RPG-style dialogue box next to an animated pixel mascot.
- LOGINS screen: one card per provider. Install, sign in to, and sign out of
  the Codex and Gemini command-line tools. Claude's card is read only: it says
  whether Claude Code is signed in, and nothing more.
- Inbox: every agent conversation is a thread with a status (running,
  waiting for approval, done, error). Waiting threads count as unread.
- Agent manager: create, edit, and delete agents. Project agents are
  Markdown files in `<project>/.claude/agents/`, global agents are in
  `~/.claude/agents/`. Each agent can have a 16x16 PNG icon.
- Mascot manager: upload mascots as 64x64 spritesheets, one loop per state
  (idle, thinking, talking, working, asking).
- Popup notifications: a small always-on-top window with the mascot when a
  task finishes, needs approval, or fails.

## Stack

- Electron, React, TypeScript, built with electron-vite.
- `@anthropic-ai/claude-agent-sdk` for running Claude agents.
- The `codex` CLI (OpenAI) for Codex models, and the `gemini` CLI or the
  Antigravity CLI (`agy`) for Gemini models. They are programs on the user's
  machine that Mya starts as child processes. They are not package
  dependencies, and Mya does not bundle them.
- Plain CSS with CSS variables for the design tokens. No UI library.

## Architecture rules

- The Agent SDK runs in the Electron main process only. The renderer never
  imports it.
- The Codex and Gemini CLIs are also started from the main process only
  (`src/main/cliProviders.ts`). The renderer never starts them.
- Main and renderer talk over typed IPC through a preload script, with
  `contextIsolation` on and `nodeIntegration` off.
- The main process forwards SDK stream events to the renderer. The renderer
  only renders them. Codex and Gemini output is turned into the same events,
  so the renderer does not know which provider ran.
- Permission requests from the SDK go to the renderer as an event, and the
  user's Approve or Deny answer comes back over IPC. This is for Claude turns
  only. See [Permissions by provider](#permissions-by-provider).
- App data (mascots, agent icons, the icon mapping, settings) lives in
  Electron's `userData` folder. Never add custom fields to agent Markdown
  files; map agent file path to icon in a JSON file instead. The `model`
  field may hold a `codex:` or `gemini:` value (see Providers). That is a
  value of a standard field, not a custom field.
- Authentication for Claude: the app runs on the Claude Code login already on the
  machine, so usage counts against that person's Claude plan. The user
  signs in once by running `claude` and `/login` in a terminal. For Claude, the
  app has no API key, no `.env`, and no sign-in of its own (the Claude card on
  LOGINS is read only). It never
  reads, copies, stores, or displays Claude credentials or tokens. It removes
  `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the environment it
  gives the SDK, so a stray key cannot switch billing to the API. This rule is
  about Claude only and is not relaxed. Codex and Gemini follow
  [Credentials for Codex and Gemini](#credentials-for-codex-and-gemini).

## Providers

Mya runs Claude, Codex, and Gemini. A chat belongs to one provider for its
whole life. The NEW CHAT dialog picks it, and that provider runs every turn of
the chat. Switching provider means a new chat. A model of another provider is
refused for a chat. See "Providers" in `designs/DESIGN.md`.

| Provider | Model string | What runs |
| --- | --- | --- |
| `claude` | No prefix (`sonnet`, `opus`, ...) | The Agent SDK |
| `codex` | `codex:<model>`, for example `codex:o4-mini` | The `codex` CLI |
| `gemini` | `gemini:<model>`, for example `gemini:gemini-2.5-pro` | The Antigravity CLI (`agy`) when it is installed and no Gemini API key is saved. Otherwise the `gemini` CLI |

How it is wired:

- `providerOf()` in `src/shared/models.ts` reads the provider off the prefix.
  `EXTRA_MODELS` in that file holds the fixed Codex and Gemini models. Models
  the Codex CLI has cached in `~/.codex/models_cache.json` are added to the
  picker too (`src/main/models.ts`, read only).
- `MODEL_CHOICES` in `src/shared/agentRules.ts` is what an agent file's
  `model` field accepts. A new fixed Codex or Gemini model goes in both lists.
- `execute()` in `src/main/agent.ts` checks the provider before it loads the
  SDK. For `codex` or `gemini` it calls `executeCliProvider()` in
  `src/main/cliProviders.ts` and returns. That function starts the CLI, reads
  its JSON lines, and sends the same `AgentEvent`s the SDK path sends.
- Each chat keeps its own Codex thread or Gemini session id in its project's chat
  index (`userData/chats/<project-id>.json`, `providerSessionId`) and resumes
  from it. Only the main chat resumes. A called agent starts fresh.
- An agent the user calls runs as a task on the chat's provider. An agent whose
  `model` is a Claude alias or a `codex:` or `gemini:` value is pinned to that
  provider and can only be called in a chat of that provider (main refuses it
  otherwise). An agent with no `model`, or `inherit`, follows the chat. In a
  Claude chat, agents run through the SDK.
- A new chat can only start on a provider that is signed in. The first chat of a
  project starts on the first signed-in provider (Claude, then Codex, then
  Gemini), or on Claude when none is.

### Permissions by provider

The Approve / Deny rule covers Claude turns only.

- **Claude:** `Edit`, `Write`, and `Bash` wait for Approve or Deny. Unchanged.
- **Codex and Gemini:** not gated. Mya starts them in their no-approval modes:
  `codex exec --dangerously-bypass-approvals-and-sandbox`, `gemini --yolo`, and
  `agy --dangerously-skip-permissions`. Their tool cards show what ran, but
  there is no WAITING state and no Deny. STOP still works: it ends the child
  process.

This is on purpose. The project owner decided on 2026-11-19 to keep it. Do not
add approval gating to the Codex or Gemini processes, and do not take the
bypass flags out, unless asked. Do not copy this to Claude turns.

### Credentials for Codex and Gemini

The LOGINS screen is the only place these are handled. As built, and kept on
purpose (owner's decision, 2026-11-19):

- **Pasted API keys are stored in plain text.** They go in
  `provider-auth.json` in `userData` (`codexApiKey`, `geminiApiKey`). They are
  not encrypted, and `safeStorage` is not used. Do not change this unless asked.
- A saved key is passed to the CLI as environment variables: `OPENAI_API_KEY`
  and `CODEX_API_KEY` for Codex, `GEMINI_API_KEY` for Gemini. A saved Codex key
  is also sent to `codex login --with-api-key`, so the Codex CLI keeps its own
  copy in `~/.codex/auth.json`.
- The screen shows a saved key masked (first four and last four characters).
  The paste field has a show toggle for what the person is typing.
- **Codex browser sign-in** runs `codex login`. The Codex CLI writes
  `~/.codex/auth.json`. Mya reads that file to show the account, and reads the
  name, email, and plan from the token's claims. Sign out runs `codex logout`
  and deletes the file.
- **Gemini browser sign-in** is run by Mya itself: a one-time local callback
  server on `127.0.0.1`, then it writes the tokens to
  `~/.gemini/oauth_creds.json` and the account email to
  `~/.gemini/google_accounts.json`, and sets the auth type in
  `~/.gemini/settings.json`. The OAuth client id and secret are read at run
  time from the installed `@google/gemini-cli` bundle. They are not in the
  source. Sign out deletes the two files. Mya's own error text
  (`cleanCliStderr()` in `cliProviders.ts`) says Google has retired consumer
  sign-in for the standalone Gemini CLI and points to a pasted key. That has not
  been re-checked here.
- Mya also reads `OPENAI_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`, and
  `GOOGLE_API_KEY` from its own environment to detect a sign-in, and shows them
  masked.
- INSTALL CLI runs `npm install -g @openai/codex` or `@google/gemini-cli`.
- None of this applies to Claude. Never read, copy, store, or show anything from
  `~/.claude` or the Claude Code login.
- Prompts and file contents sent on a Codex or Gemini turn go to OpenAI or
  Google and count against that account, not the Claude plan.

## Design

- `designs/` holds static HTML mockups and `designs/DESIGN.md` holds the
  colors, type, and rules. Read `DESIGN.md` before building any UI and match
  the mockups.
- Do not copy the mockup HTML directly. It uses inline styles for
  everything. Build React components and put the tokens in CSS variables.
- Do not use Claude Code's own mascot, logo, or terminal visuals anywhere.

## Build order

1. Scaffold the app, with one window showing the nav shell.
2. One conversation: send a prompt, stream the reply as plain text.
3. Tool activity cards and permission requests with Approve / Deny.
4. Mascot component with the five states driven by stream events.
5. Agent manager: read, create, edit, delete agent files, plus icon upload.
6. Mascot manager: spritesheet upload, validation, per-state loops.
7. Multiple conversations and the inbox with statuses.
8. Popup notification window.

Work on one step at a time. Do not start the next step until I say so.

## Conventions

- Small commits, one per working change.
- Ask before adding a new dependency.
- Validate uploads strictly and show the exact error from `DESIGN.md`.
