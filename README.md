# Gemini CLI Remastered

> [!IMPORTANT]
>
> Gemini CLI Remastered is a community-maintained software fork of Google's
> Gemini CLI. TerminalDev-1 created the Remastered modifications, not the entire
> original Gemini CLI codebase. Although this repository is standalone on
> GitHub, its source and history remain derived from the upstream project.

Gemini CLI Remastered keeps the inherited terminal interface and agent loop, but
routes model requests through an installed Antigravity CLI (`agy`) session
instead of asking users for Gemini API keys or sending requests directly through
the original Google Gemini authentication backends.

## Why was this created?

TerminalDev-1 created the Gemini CLI Remastered fork and its modifications after
encountering a bug in Google's Antigravity desktop app and Antigravity CLI. In
that failure mode, everything the agent executed was launched as a subprocess,
and windowed applications would not open. The project took a lot of time and was
driven by rage, spite, and anger at the company. TerminalDev-1's account is that
Google would not fix the issue in time, so this project was released as an
independent response to Google Corporation's handling of the bug.

There is a second, practical reason this repository exists. After recovering an
HP Envy with HP Cloud Recovery, the maintainer accidentally lost an earlier,
uncommitted version of the project. This version is committed and published so
that the work and its history are preserved.

> If Google cannot fix its own bug in time, why should Google kill open-source
> apps?

That is TerminalDev-1's position and the motivation behind this project. Gemini
CLI Remastered is not an official Google product and is not affiliated with or
endorsed by Google.

## What is remastered?

- **AGY backend adapter:** model requests are translated into Antigravity CLI
  stream-JSON requests and the results are translated back into the response
  shape expected by the Gemini CLI agent loop.
- **AGY-only authentication:** `/auth` reports the local Antigravity session.
  Gemini API-key, Google OAuth, Vertex AI, and Code Assist authentication are
  not active model backends in this build.
- **Dynamic models:** `/model` displays the models returned by `agy models`, so
  the available list follows the installed Antigravity CLI rather than a
  hard-coded Gemini catalog.
- **Independent reasoning effort:** `/effort low`, `/effort medium`, and
  `/effort high` set AGY's reasoning effort without encoding effort in a model
  name. `/effort auto` restores the model default.
- **Local update workflow:** npm self-updates are disabled. When a local build
  input changes, the running CLI shows a boxed restart prompt with a
  plain-English summary.
- **What's New dialog:** after restarting into a changed build, the CLI shows a
  one-time summary of the user-facing changes.
- **Local voice transcription:** the active voice path uses local Whisper rather
  than Gemini Live transcription.
- **Remastered version label:** the upstream build string is retained and
  followed by `RR-release-preview` while the project is a rolling release.

## How it works

```text
gemini command
    │
    ▼
Gemini CLI React/Ink interface and agent loop
    │
    ▼
AgyContentGenerator
    │  stream-json request
    ▼
Installed Antigravity CLI (agy)
    │  result event / requested tool calls
    ▼
Gemini CLI executes tools and renders the response
```

The frontend still owns tool execution, sessions, MCP, ACP, A2A, and terminal
rendering. AGY supplies model responses and requested frontend tool calls. The
adapter retains `@google/genai` data types internally for compatibility with the
inherited agent loop; that does not make the original Google client the active
model transport.

## Requirements

- Node.js 20 or newer
- Git
- Antigravity CLI installed and authenticated separately
- An AGY installation that supports `agy models` and stream-JSON mode

Confirm the backend is ready before starting the remastered CLI:

```powershell
agy --version
agy models
```

`AGY_PATH` can point directly to the AGY executable. On Windows, the adapter
also checks `%LOCALAPPDATA%\agy\bin\agy.exe` before resolving `agy` through
PATH.

## Install from source

```powershell
git clone https://github.com/TerminalDev-1/gemini-cli-remastered.git
cd gemini-cli-remastered
npm ci
npm run build --workspace @google/gemini-cli-core
npm run build --workspace @google/gemini-cli
cd packages/cli
npm link
```

Open a fresh terminal after linking, then verify that the global command points
to this build:

```powershell
gemini --version
gemini
```

The version output should include `RR-release-preview`. This repository does not
publish or install itself through the upstream `@google/gemini-cli` npm release
channel.

## Using the remastered commands

Inside an interactive session:

```text
/auth
/model
/effort high
```

Use `/effort` without an argument to inspect the current setting. Valid values
are `low`, `medium`, `high`, and `auto`.

Normal non-interactive Gemini CLI syntax is retained:

```powershell
gemini -p "Explain this repository"
gemini -p "Summarize the tests" --output-format json
```

## Updates

This project deliberately does not query npm for updates and does not run a
package manager in the background. Its update watcher observes genuine changes
to the local source/build inputs. A detected change produces this prompt:

```text
╭────────────────────────────────────────────────────────────╮
│ A new update has been found.                               │
│ Here's what changed:                                      │
│ • A plain-English description of the detected change.     │
│                                                            │
│ 1. Continue current session                               │
│ 2. Restart now                                            │
╰────────────────────────────────────────────────────────────╯
```

Restarting loads the rebuilt process. The subsequent **What's New** dialog is
shown once and does not expose raw local filenames. Startup events, generated
directories, and stale update state are filtered to prevent false or repeated
notifications.

The watcher detects local changes; it does not fetch GitHub commits or rebuild
the project automatically. Pull and build a new revision before restarting when
updating from GitHub.

## Current limitations

- AGY responses are currently exposed to the frontend as a completed one-item
  stream rather than token-by-token streaming.
- Token counts are local deterministic estimates.
- Embeddings are deterministic compatibility vectors, not semantic cloud
  embeddings.
- The project requires a working AGY installation and session.
- The Windows integration is the best-tested host setup. Other platforms may
  require launcher and executable-discovery adjustments.

## Development

Useful checks for this project include:

```powershell
npm run typecheck --workspace @google/gemini-cli-core
npm run typecheck --workspace @google/gemini-cli
npm test --workspace @google/gemini-cli-core
npm test --workspace @google/gemini-cli
npm run build --workspace @google/gemini-cli
```

The complete architecture, divergence map, Windows setup, updater safeguards,
and maintenance rules are documented in [AGENTS.md](./AGENTS.md).

## Upstream and license

Gemini CLI Remastered is derived from the
[Google Gemini CLI](https://github.com/google-gemini/gemini-cli) source tree.
Upstream history and notices are retained. The project remains licensed under
the [Apache License 2.0](./LICENSE).
