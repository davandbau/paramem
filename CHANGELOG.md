# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
