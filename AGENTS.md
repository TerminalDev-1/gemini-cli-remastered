# Gemini CLI AGY fork

This file records the intentional divergence of this private fork from the
official Google Gemini CLI repository. It is both an architecture note and a
maintenance guide. When rebasing from upstream, review every section below; the
upstream implementation still contains cloud Gemini authentication and update
behavior that this fork deliberately does not use.

## Product boundary

The fork keeps Gemini CLI's terminal-first React/Ink frontend, tool execution,
session handling, MCP support, ACP support, A2A support, recording, and fake
response facilities. The model backend is replaced with the locally installed
Antigravity CLI (AGY). Model requests are therefore sent to the local AGY
process rather than directly to Google's Gemini service.

AGY must be installed and authenticated separately. The frontend owns tool
execution; AGY is asked only to produce text or frontend tool-call requests.
This is a private fork and is not an upstream-compatible authentication build.

## Runtime architecture

The request path is:

1. `packages/cli` loads settings, forces the selected authentication type to
   `AuthType.AGY`, selects a model, and runs the Ink UI.
2. `packages/core` creates an `AgyContentGenerator` wrapped in the existing
   logging and optional response-recording layers.
3. `AgyContentGenerator` discovers models with `agy models`, then starts AGY
   with `--input-format stream-json --output-format stream-json`, disables AGY
   slash commands, and supplies a JSON response schema.
4. The adapter sends one JSON user event containing the Gemini request's system
   instruction, contents, tools, tool configuration, response MIME type, and
   response schema. AGY returns newline-delimited JSON events.
5. The terminal `result` event is converted back to `@google/genai` response
   objects. Text becomes a model text part and each requested frontend tool
   becomes a `functionCall` part. The existing Gemini CLI agent loop executes
   those tools and sends subsequent requests through the same adapter.

### AGY executable and models

- `AGY_PATH` overrides executable discovery.
- On Windows, discovery prefers `%LOCALAPPDATA%\agy\bin\agy.exe` when it exists;
  otherwise the executable name `agy` is resolved through PATH.
- `listAgyModels()` calls `agy models`, caches the parsed result, and can be
  forced to refresh. An empty or failed listing is reported as an AGY
  authentication/install error.
- The default model is `gemini-3.8-flash-high` (`DEFAULT_AGY_MODEL`).
- The model dialog and ACP model advertisement are populated dynamically from
  AGY, so all models returned by the installed AGY are selectable. At the time
  this document was written, the installation reported Gemini 3.8/3.7/3.6 Flash
  variants, Gemini 3.1 Pro variants, Claude Sonnet 4.6, Claude Opus 4.6, and
  GPT-OSS 120B. The installed AGY output is authoritative and may change.
- If a requested model is not in the discovered list, the adapter omits the
  `--model` argument and lets AGY use its default.

### Adapter compatibility behavior

`AgyContentGenerator` implements the normal `ContentGenerator` interface:

- `generateContent()` runs one AGY request.
- `generateContentStream()` currently yields the completed response as a
  one-item async stream; it is not token-level streaming.
- `countTokens()` uses a local deterministic approximation of one token per four
  serialized characters.
- `embedContent()` returns a deterministic normalized 128-dimensional vector
  derived from serialized content; it is not a cloud embedding.
- AGY input/output failures, non-success statuses, missing result events, and
  aborted requests become local errors.
- AGY usage fields are mapped into the `@google/genai` usage metadata fields.
- The adapter publishes `modelVersion: "antigravity-cli"`.

The adapter intentionally retains the `@google/genai` types and response shape
so the rest of the Gemini CLI agent loop remains reusable. It does not use the
Google client as a live model transport.

## Authentication and cloud-service removal

AGY is the only active authentication path.

- `AuthType.AGY` is `antigravity-cli`.
- `getAuthTypeFromEnv()` always returns AGY.
- CLI startup silently migrates any legacy selected auth type to AGY.
- `/auth` and the auth dialog expose only “Authenticated with AGY”. Validation
  calls `agy models` to verify the local session.
- Non-interactive auth and ACP authentication force AGY as well.
- The A2A server's authentication refresh always calls `config.refreshAuth` for
  AGY.
- `Config.refreshAuth()` returns through the AGY path before Code Assist
  experiments, quota retrieval, preview access, admin controls, or other Google
  Code Assist network setup can run.
- API-key credential storage (`apiKeyCredentialStorage.ts` and its tests) was
  removed from core. API-key dialogs, API-key submit/cancel actions, API-key
  auth tests, and their snapshots were removed from the CLI.
- The auth environment whitelist is empty. `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
  and the legacy API-key configuration are not used by this fork.
- API keys are no longer copied into Docker/LXC sandbox environments.
- ACP no longer accepts API-key metadata, gateway URLs, or custom gateway
  headers. It advertises only the AGY authentication method and returns no
  remote credential details.
- Legacy enum values remain only as deprecated compatibility values so older
  callers can fail with a controlled “AGY only” error. They are not supported
  backends.

The repository still contains some upstream Google client types, legacy code,
and non-auth Google environment names for compile-time compatibility. Their
presence does not re-enable live Google authentication in the AGY generator.

## Model and protocol surfaces

- `packages/cli/src/ui/components/ModelDialog.tsx` loads and displays AGY's
  current model list instead of the upstream static Gemini/preview/quota model
  catalog. The dialog supports persistence toggling and closes with Escape.
- `packages/cli/src/acp/acpUtils.ts` and `acpSessionManager.ts` asynchronously
  advertise AGY's dynamic models and always create sessions with AGY.
- `packages/cli/src/acp/acpRpcDispatcher.ts` advertises and accepts only AGY
  authentication; gateway and API-key metadata handling was removed.
- `packages/a2a-server/src/config/config.ts` no longer chooses between CCPA,
  ADC, OAuth, and API-key fallback branches.
- The default model resolution in CLI config uses `DEFAULT_AGY_MODEL`; the
  `auto` spelling is retained as a simple alias for that default.

## Voice transcription

Cloud Gemini Live transcription was removed from the active voice path.

- Settings default to the local `whisper` backend and expose only that option.
- `TranscriptionFactory` always creates a `WhisperTranscriptionProvider` using
  `~/.gemini/whisper_models` (the normal Gemini directory), four threads, and
  the configured Whisper model or `ggml-base.en.bin`.
- Voice mode no longer reads or requires `GEMINI_API_KEY`; recorded audio is
  sent to the local Whisper provider.

## Local versioning

`packages/core/src/utils/version.ts` exports
`VERSION_LABEL = 'RR-release-preview'` for the current rolling-release preview
channel. `getVersion()` returns the existing build string followed by that
label, for example:

```text
0.61.0-nightly.20260908.gc647533d6 RR-release-preview
```

`CLI_VERSION` still overrides the build string, but the `RR-release-preview`
suffix is always appended. Version reads remain cached for the process lifetime.

## Local update and restart workflow

The upstream npm update path is intentionally disabled.

- The `latest-version` dependency was removed from the root and CLI packages and
  from the lockfile.
- `checkForUpdates()` always returns `null`; no npm registry query occurs.
- `handleAutoUpdate()` and `waitForUpdateCompletion()` are compatibility no-ops.
  They never run npm, npx, pnpm, bun, a binary updater, or another package
  manager.
- `installationInfo` reports that the local fork must be rebuilt and restarted
  instead of returning an npm update command.
- Interactive startup calls `startLocalUpdateWatcher()` and unregisters it on
  shutdown.

### Watcher

`startLocalUpdateWatcher()` recursively watches the local build tree. It batches
bursts for 300 ms and treats genuine changes to source, text, system-prompt,
configuration, backend, and documentation files as updates, while filtering
directory-only events, startup notifications, and generated or runtime trees
that cannot represent a user-facing build change.

- `GEMINI_CLI_BUILD_ROOT` overrides the watched root.
- The default root is found by walking upward from the compiled module until a
  `.git` directory or nearest `package.json` root is found.
- `GEMINI_CLI_UPDATE_STATE_PATH` overrides the pending-state file.
- The default pending file is
  `%LOCALAPPDATA%\gemini-cli-agy\pending-update.json` (or
  `~/.local/gemini-cli-agy/pending-update.json` when LOCALAPPDATA is absent).
- The persisted format is schema version 2. Legacy state without that schema is
  discarded instead of being replayed as an update.
- The watcher snapshots file signatures before subscribing, ignores startup
  notifications that do not change a file, ignores directory-only events and
  null Windows filenames, and filters generated/runtime trees (`.git`,
  `.gemini`, `.vscode`, `node_modules`, `coverage`, `dist`, `build`, `out`,
  `tmp`, `logs`, and similar tooling directories).
- Before emitting an update event, the watcher merges real changed paths into
  the pending file with the current build version and plain-English
  descriptions. A pending summary is consumed once when loaded after restart, so
  it cannot nag indefinitely.
- The event message is exactly `A new update has been found.`.

### Dialogs

- `UpdateDialog` is shown while the current process is still running. Its only
  choices are `1. Continue current session` and `2. Restart now`. The full box
  also lists the detected changes in plain English. Restart uses the existing
  active restart/relaunch action; it does not install anything.
- `WhatsNewDialog` is loaded from the pending state on startup after a restart.
  It is titled “What's New”, describes the update in plain English, groups
  repeated categories, and deliberately does not expose raw local filenames to
  the user. Keys `1`, `2`, or Escape dismiss it and delete the pending state.
- Update and post-restart dialogs are part of the normal blocking dialog state
  and are wired through `UIStateContext`, `UIActionsContext`, `AppContainer`,
  and `DialogManager`.
- The summary mapper now reports specific UI, command, core, model, auth, voice,
  configuration, test, build, and documentation categories. The former
  `Updated application behavior.` fallback is no longer emitted.

### Reasoning effort

`/effort low`, `/effort medium`, and `/effort high` set a session-level
reasoning override independent of the selected model name. `/effort auto` (or
`/effort` with no value to inspect the current state) returns to the model's
default. The setting is held by `Config` and passed to AGY as `--effort`, which
is supported by the installed local backend.

## Package and command layout

The CLI workspace remains `@google/gemini-cli`, with `packages/cli/package.json`
declaring `gemini -> dist/index.js`. The working installation was linked with
`npm link` from `packages/cli`, producing global shims under:

```text
C:\Users\gamer\AppData\Roaming\npm\gemini.ps1
C:\Users\gamer\AppData\Roaming\npm\gemini.cmd
```

The global junction targets this fork's `packages/cli`; rebuilding the CLI
refreshes `packages/cli/dist/index.js` used by the link.

For profile-free command discovery, the preferred launcher on this host is also
`C:\Users\gamer\AppData\Local\agy\bin\gemini.cmd`. It invokes the same
`packages/cli\dist\index.js` with the system Node.js executable and is on the
user PATH ahead of the npm shim. Both launchers start this fork; neither starts
the upstream Gemini service or the AGY interactive shell directly.

## File-level divergence map

### New files

- `packages/core/src/core/agyContentGenerator.ts` — AGY process adapter, model
  discovery, response translation, local token counting, and local deterministic
  embeddings.
- `packages/cli/src/ui/components/UpdateDialog.tsx` — pre-restart choices.
- `packages/cli/src/ui/components/WhatsNewDialog.tsx` — post-restart
  plain-English summary.
- `AGENTS.md` — this fork maintenance and architecture record.

### Core changes/removals

- `packages/core/src/core/contentGenerator.ts` — AGY-only auth and generator
  selection; legacy cloud paths rejected.
- `packages/core/src/config/config.ts` — AGY refresh short-circuit before Code
  Assist network setup.
- `packages/core/src/index.ts` — exports the AGY adapter and no longer exports
  API-key credential storage.
- `packages/core/src/utils/version.ts` and test — `RR-release-preview`
  rolling-release label.
- `packages/core/src/voice/transcriptionFactory.ts` — Whisper-only voice.
- `packages/core/src/core/apiKeyCredentialStorage.ts` and test — deleted.
- `packages/core/src/core/contentGenerator.test.ts` — upstream cloud-auth cases
  replaced with AGY/fake-generator coverage.

### CLI changes/removals

- Auth/config: `config/auth.ts`, `config/config.ts`, `config/settings.ts`,
  `config/settingsSchema.ts`, `gemini.tsx`, `validateNonInterActiveAuth.ts`,
  `ui/auth/AuthDialog.tsx`, `ui/auth/useAuth.ts`, and auth tests/snapshots.
- Model/protocol: `ui/components/ModelDialog.tsx`, ACP dispatcher/session/
  utility files, and related tests.
- Updates: `ui/utils/updateCheck.ts`, `utils/handleAutoUpdate.ts`,
  `utils/installationInfo.ts`, their tests, and `interactiveCli.tsx`.
- Reasoning effort: `ui/commands/effortCommand.ts` and its test,
  `services/BuiltinCommandLoader.ts`, `core/config/config.ts`, and
  `core/agyContentGenerator.ts`.
- UI state: `AppContainer.tsx`, `DialogManager.tsx`, UI state/actions/types, and
  test rendering fixtures.
- Voice/sandbox: `ui/hooks/useVoiceMode.ts` and `utils/sandbox.ts`.
- `packages/cli/package.json` — removes `latest-version`.

### Server and dependency changes

- `packages/a2a-server/src/config/config.ts` — AGY-only authentication.
- `package.json`, `packages/cli/package.json`, and `package-lock.json` — remove
  the npm latest-version updater dependency.

## Host setup outside the repository

These changes are local-machine integration, not source files in the upstream
repository:

- Windows PowerShell profile:
  `C:\Users\gamer\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
  appends `%APPDATA%\npm` when it is missing, preserving all existing PATH
  entries so the linked `gemini` command survives new shells.
- PowerShell execution policy is set to `Bypass` at `CurrentUser` scope. The
  machine-wide policy is not changed. This is required for the local
  `gemini.ps1` npm shim in this development environment.
- AGY is expected at `C:\Users\gamer\AppData\Local\agy\bin\agy.exe`, unless
  `AGY_PATH` is set.
- GitHub CLI was installed globally with WinGet. The executable is
  `C:\Program Files\GitHub CLI\gh.exe`; authenticate interactively with
  `gh auth login` when repository operations are needed.
- Git for Windows is installed at `C:\Program Files\Git\cmd\git.exe` and
  `C:\Program Files\Git\cmd` is now persisted in the current user's PATH. GH
  uses this executable for HTTPS repository operations.

## Resolved Windows command-discovery incident

The `gemini` command-resolution problem is fixed and guarded against the
specific failure mode observed on this system. The global npm shims and junction
were valid; the failure was caused by Windows PowerShell starting with the
profile blocked, then changing execution policy inside that already running
process. Changing policy does not rerun the profile or refresh that process's
`$env:Path`, so `gemini` remained undiscoverable in that one shell.

The prevention controls are:

- The user PATH persistently contains `C:\Users\gamer\AppData\Roaming\npm`.
- The linked package and both `gemini.ps1`/`gemini.cmd` shims are verified to
  target this fork's `packages\cli` and `dist\index.js`.
- Windows PowerShell CurrentUser execution policy is `Bypass`.
- The optional profile at
  `C:\Users\gamer\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
  appends the npm global directory only when a parent process supplied a stale
  PATH. It is a fallback, not an authentication or backend requirement.
- A clean Windows PowerShell 5.1 process resolves `gemini` and reports the
  fork's `RR-release-preview` build string. If a currently open shell predates
  the policy/PATH change, dot-source the profile once or close all Windows
  Terminal windows and open a new process.

The reproduced false-update loop is fixed: a restart event can only be emitted
after a real watched-file signature change, and stale or ambiguous pending state
is discarded. The schema version, startup baseline, generated-tree filters, and
regression tests are required guardrails; do not remove them when rebasing or
changing the updater.

This incident is considered a regression if reproduced: first inspect
`Get-ExecutionPolicy -List`, `$env:Path`, `Get-Command gemini -All`, and the
global npm prefix before changing repository code.

## Maintenance rules

- Keep the AGY boundary local. Do not reintroduce API-key prompts, Google OAuth,
  Vertex/Gateway transport, Code Assist quota/experiment calls, or npm self-
  updates without explicitly redesigning this fork.
- If AGY's stream schema or model-list format changes, update
  `agyContentGenerator.ts`, its tests, model dialogs, and ACP advertisements
  together.
- Any source/build/text/configuration change while the CLI is running should
  continue to produce the restart event. Update descriptions should remain
  user-facing and filename-free.
- After changes, rebuild the CLI workspace so the global `npm link` points at
  the current `dist` output, then run targeted tests/type checking appropriate
  to the touched packages.

## Exact touched-file inventory for this fork revision

The following list is the complete source-tree delta currently documented by
this file. `M` means modified, `D` means deleted, and `A` means added.

### Root and dependencies

- `M package.json`
- `M package-lock.json`
- `A AGENTS.md`

### A2A server

- `M packages/a2a-server/src/config/config.ts`

### CLI package and configuration

- `M packages/cli/package.json`
- `M packages/cli/src/config/auth.ts`
- `M packages/cli/src/config/config.ts`
- `M packages/cli/src/config/settings.ts`
- `M packages/cli/src/config/settingsSchema.ts`
- `M packages/cli/src/gemini.tsx`
- `M packages/cli/src/interactiveCli.tsx`
- `M packages/cli/src/validateNonInterActiveAuth.ts`
- `M packages/cli/src/test-utils/render.tsx`

### CLI authentication and commands

- `D packages/cli/src/ui/auth/ApiAuthDialog.tsx`
- `D packages/cli/src/ui/auth/ApiAuthDialog.test.tsx`
- `D packages/cli/src/ui/auth/__snapshots__/ApiAuthDialog.test.tsx.snap`
- `M packages/cli/src/ui/auth/AuthDialog.tsx`
- `M packages/cli/src/ui/auth/AuthDialog.test.tsx`
- `M packages/cli/src/ui/auth/__snapshots__/AuthDialog.test.tsx.snap`
- `M packages/cli/src/ui/auth/useAuth.ts`
- `M packages/cli/src/ui/auth/useAuth.test.tsx`
- `M packages/cli/src/ui/commands/authCommand.ts`

### CLI model, protocol, voice, and sandbox surfaces

- `M packages/cli/src/acp/acpRpcDispatcher.ts`
- `M packages/cli/src/acp/acpSessionManager.ts`
- `M packages/cli/src/acp/acpUtils.ts`
- `M packages/cli/src/ui/components/ModelDialog.tsx`
- `M packages/cli/src/ui/hooks/useVoiceMode.ts`
- `M packages/cli/src/utils/sandbox.ts`

### CLI UI state and update workflow

- `M packages/cli/src/ui/AppContainer.tsx`
- `M packages/cli/src/ui/components/DialogManager.tsx`
- `M packages/cli/src/ui/components/DialogManager.test.tsx`
- `A packages/cli/src/ui/components/UpdateDialog.tsx`
- `A packages/cli/src/ui/components/WhatsNewDialog.tsx`
- `M packages/cli/src/ui/contexts/UIActionsContext.tsx`
- `M packages/cli/src/ui/contexts/UIStateContext.tsx`
- `M packages/cli/src/ui/types.ts`
- `M packages/cli/src/ui/utils/updateCheck.ts`
- `M packages/cli/src/ui/utils/updateCheck.test.ts`
- `M packages/cli/src/utils/handleAutoUpdate.ts`
- `M packages/cli/src/utils/handleAutoUpdate.test.ts`
- `M packages/cli/src/utils/installationInfo.ts`
- `M packages/cli/src/utils/installationInfo.test.ts`

### Core package

- `A packages/core/src/core/agyContentGenerator.ts`
- `M packages/core/src/core/contentGenerator.ts`
- `M packages/core/src/core/contentGenerator.test.ts`
- `D packages/core/src/core/apiKeyCredentialStorage.ts`
- `D packages/core/src/core/apiKeyCredentialStorage.test.ts`
- `M packages/core/src/config/config.ts`
- `M packages/core/src/index.ts`
- `M packages/core/src/utils/version.ts`
- `M packages/core/src/utils/version.test.ts`
- `M packages/core/src/voice/transcriptionFactory.ts`
