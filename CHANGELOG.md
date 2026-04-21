# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-04-21

### Changed

- **Package renamed from `claude-code-memory` to `paramem`** after discovering a name collision on the npm registry. The GitHub repository was renamed from `davandbau/claude-code-memory` to `davandbau/paramem`.
- **CLI binary renamed from `ccm` to `paramem`**. The short `ccm` alias is gone (it was silently dropped by `npm` anyway when two bin entries pointed at the same file).
- **Service labels renamed**: `com.claude-code-memory.*` → `com.paramem.*` (launchd), `claude-code-memory-*.service` → `paramem-*.service` (systemd). Run `paramem init` after upgrading — the old labels are not automatically removed.
- **Config filename renamed**: `.claude-memory.json` → `.paramem.json`. The loader falls back to the old name for one release, so existing configs keep working during migration.
- **Environment variable renamed**: `MEMORY_REPO` → `PARAMEM_REPO`. The loader falls back to `MEMORY_REPO` for one release.
- **Hook dedup matcher** (v0.2.1's `isOurHookCommand`) now recognizes both `paramem` and legacy `ccm` in commands so that `paramem init` on a machine that had the old `ccm` hooks installed cleanly strips them before wiring up the new ones.

### Migration from v0.2.1

```bash
ccm uninstall                                      # old bash-scriptless version
npm uninstall -g claude-code-memory                # if you installed from the old name
npm install -g github:davandbau/paramem            # new name
paramem init                                        # re-wires everything
```

## [0.2.1] — 2026-04-21

### Fixed

- **CRITICAL**: `parseCron` treated `0` as unset, so `"0 4 * * *"` resolved to 04:17 instead of 04:00. Zero is now accepted for both minute and hour.
- **CRITICAL**: watchdog, puller, and `ccm sync` hardcoded `main`, ignoring `cfg.branch`. Any user whose remote default is `master` or another branch had a broken sync loop. All three now read from config.
- **HIGH**: hook dedup matched on exact command string, so upgrading npm globals (different install path) or switching between dev and prod left stale hook entries pointing at old paths. Dedup now matches by intent — any `… hook session-start` / `… hook prompt-submit` is treated as ours regardless of the prefix path.
- **HIGH**: `resolveCcmBin()` could return a relative path in dev contexts and write it into `~/.claude/settings.json`. Now enforces an absolute resolve.
- **MEDIUM**: the 3-second "kill timer" in the SessionStart hook was a no-op (timer unref'd, parent exited before it fired). Removed the dead code; the background pull is detached and already non-blocking.
- **MEDIUM**: `render()` for launchd plists didn't XML-escape substituted values, so paths containing `&`, `<`, `>`, `"`, or `'` produced invalid plist XML and `launchctl load` failures. Now escapes all five.
- **MEDIUM**: `settings.json` writes were non-atomic; a crash mid-write could corrupt it. Now writes to a temp file and atomically renames.
- **MEDIUM**: `runClaudePrompt` used `spawnSync`, which blocks SIGINT forwarding. Switched to `spawn` with explicit SIGINT/SIGTERM forwarding, streaming output, a 5s grace before SIGKILL, and no fixed `maxBuffer`.
- **MEDIUM**: the forbidden-file guard matched on `path.basename`, which would incorrectly revert legitimate archival of feedback files into nested directories. Now matches at the repo root only.

### Added

- Dry-run (`ccm maintain --dry-run`) no longer acquires the sync lock and now prints `branch` and `claude CLI` availability.
- Unit tests for `parseCron`, `isForbiddenPath`, hook intent matcher, XML escape.

### Changed

- Logger switched to ASCII tags (`[ok]`, `[warn]`, `[err]`) instead of Unicode glyphs.
- CLI version now read from `package.json` at runtime — no more out-of-sync string literals.
- Dropped `--max-turns` from `claude -p` invocation; Claude Code's defaults apply.

## [0.2.0] — 2026-04-21

### Added

- Autonomous memory maintenance via `ccm maintain`, running `claude -p` in headless mode on the user's OAuth MAX subscription (no API key).
- `inbox/` directory for freeform content dumps, classified and routed by the maintenance pass into projects, areas, resources, daily notes, or a new topic file.
- `maintenance/prompt.md` — the instructions the agent follows (editable, versioned with the repo).
- `maintenance/ledger.jsonl` — append-only decision log with source → target provenance for every action.
- `ccm inbox <text|file|->` convenience command.
- `ccm maintain --install` / `--uninstall` to schedule a daily timer (launchd or systemd).
- Coordinator host, throttle (minHoursBetweenRuns), and timeout config for multi-machine safety.
- Forbidden-file guard: writes to `user_profile.md` or `feedback_*.md` are reverted before commit.
- `areas.md` added to default `sessionStart.files` so ongoing responsibilities are always in session context.

### Safety model

- **Nothing is deleted from the working tree.** Inbox files move to `inbox/processed/` after classification. Old daily notes stay in `daily/` (summaries go into `archive.md` with a provenance footer).
- **Every decision is reconstructible.** Each maintenance run has a unique run ID, logged in both `maintenance/ledger.jsonl` and the commit message. `git checkout <run-sha>` recovers the exact inputs, config, and prompt that produced the output.
- **No human review gates.** Classification is deterministic. Ambiguous content falls through to today's daily note.

## [0.1.0] — 2026-04-21

### Added

- `ccm init` to clone or create a memory repo and install services/hooks in one shot.
- `ccm status`, `ccm sync`, `ccm uninstall` user-facing commands.
- `ccm watch`, `ccm pull`, `ccm hook <event>` internal commands for services/hooks.
- macOS `launchd` and Linux `systemd --user` service installers.
- `chokidar`-based file watchdog with debounced commit+push.
- `SessionStart` hook injects `MEMORY.md`, `projects.md`, `user_profile.md`, and the latest daily note.
- `UserPromptSubmit` hook does throttled background pull and notifies on SHA change.
- Starter PARA content for `ccm init --empty`.
- Optional `.claude-memory.json` per-repo config.
