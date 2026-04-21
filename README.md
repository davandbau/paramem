# claude-code-memory

**Persistent, git-synced memory for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).**
Your notes, projects, preferences — in every session, across every machine. Zero Anthropic API cost; uses your Claude Code MAX subscription.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

---

## Install

```bash
npm install -g github:davandbau/claude-code-memory
ccm init git@github.com:you/your-memory.git
```

Requires Node 20+, git, and the `claude` CLI (only if you want the nightly organizer). Works on macOS and Linux.

That's setup. Open a new Claude Code session and your memory is already loaded.

> No memory repo yet? Run `ccm init --empty` instead — it creates a starter PARA structure at `~/.claude/memory` that you can push to GitHub (or any git remote) later.

---

## Use

You don't really *run* commands. You just write files.

```bash
$EDITOR ~/.claude/memory/projects.md              # your notes sync in seconds
ccm inbox "prefer terse bullets over prose"       # dump unstructured thoughts
ccm inbox notes.md                                # or a file
echo "..." | ccm inbox -                          # or stdin
```

Everything under `~/.claude/memory/` is committed and pushed to your remote automatically within about 5 seconds. Other machines pull every 60 seconds. Every new Claude Code session loads your `MEMORY.md` index, active projects, areas, profile, and latest daily note as context — regardless of what directory you started Claude from.

---

## Let it organize itself (optional)

Once a day, an autonomous agent walks through your memory, classifies whatever's in `inbox/` into the right PARA location (projects, areas, resources, daily notes, or a new topic file), archives completed projects, rolls up old daily notes, dedupes resources, and fixes the index.

```bash
ccm maintain --install     # schedules it daily at 03:17 local
ccm maintain               # or run one pass now
```

Nothing is deleted — everything is a move or a merge. Every decision is one JSON line in `maintenance/ledger.jsonl` (source, target, reason, run ID), so any pass can be understood after the fact or undone with a single `git revert`.

Uses the `claude` CLI running on your MAX subscription — no API key, no separate billing.

---

## Troubleshooting

```bash
ccm status                         # what's running, what's stale, log tails
```

Most issues reveal themselves in `~/.claude/memory/.logs/{watchdog,puller,maintenance}.log`.

---

## Uninstall

```bash
ccm uninstall              # stops services and removes hooks; your data stays
```

To also delete the data: `rm -rf ~/.claude/memory`.

---

<details>
<summary><strong>How it works (architecture)</strong></summary>

```
       ┌────────────────────┐      git push      ┌────────────┐
       │  Machine A         │────────────────────▶│            │
       │  ~/.claude/memory  │◀────────────────────│  GitHub    │
       │  watchdog + hooks  │      git pull       │  (private) │
       └────────────────────┘                     │            │
                                                  │            │
       ┌────────────────────┐                     │            │
       │  Machine B         │◀────────────────────│            │
       │  ~/.claude/memory  │────────────────────▶│            │
       └────────────────────┘                     └────────────┘
```

- **Watchdog**: a local daemon (`chokidar` + debounced git) commits and pushes within ~5 s of any write.
- **Puller**: a 60 s timer (`launchd` on macOS, `systemd --user` on Linux) fetches remote changes.
- **`SessionStart` hook**: injects `MEMORY.md`, `projects.md`, `areas.md`, `user_profile.md`, and the latest daily note into every new session.
- **`UserPromptSubmit` hook**: throttled background pull + a one-line notice when the remote HEAD has moved mid-session.
- **Maintenance** (if enabled): a daily `claude -p` invocation that uses the prompt at `maintenance/prompt.md` to classify, archive, and compact.

All sync is plain git over SSH/HTTPS. No Anthropic API calls at runtime.

</details>

<details>
<summary><strong>Repo layout</strong></summary>

[PARA](https://fortelabs.com/blog/para/)-inspired. The structure is a suggestion; the `SessionStart` hook reads whatever files you list in config.

```
your-memory/
├── MEMORY.md           # index — Claude reads this on every session
├── projects.md         # active work, P1–P4
├── areas.md            # ongoing responsibilities
├── resources.md        # reference knowledge
├── archive.md          # completed / dormant
├── user_profile.md     # who you are, how you work
├── daily/
│   └── YYYY-MM-DD.md   # session summaries
├── feedback_*.md       # "do this / don't do this" rules (never auto-modified)
├── reference_*.md      # pointers to external systems
├── inbox/
│   ├── *.md            # unstructured notes waiting to be classified
│   └── processed/      # originals after classification (never deleted)
└── maintenance/
    ├── prompt.md       # the agent's instructions — edit to tune behavior
    └── ledger.jsonl    # append-only decision log
```

</details>

<details>
<summary><strong>Config</strong></summary>

Drop `.claude-memory.json` at your memory repo root to override defaults:

```json
{
  "branch": "main",
  "pullIntervalSeconds": 60,
  "debounceSeconds": 5,
  "sessionStart": {
    "files": ["MEMORY.md", "projects.md", "areas.md", "user_profile.md"],
    "includeLatestDailyNote": true,
    "dailyNoteDir": "daily"
  },
  "promptSubmit": {
    "throttleSeconds": 30,
    "notifyOnShaChange": true
  },
  "maintenance": {
    "enabled": true,
    "coordinatorHost": null,
    "minHoursBetweenRuns": 20,
    "cron": "17 3 * * *",
    "timeoutSeconds": 600,
    "promptFile": null,
    "model": null
  },
  "ignore": [".git", ".logs", ".state"]
}
```

- **`coordinatorHost`** — only the machine with this hostname runs maintenance. `null` means any machine can (harmless but wasteful on a fleet).
- **`minHoursBetweenRuns`** — throttle. `ccm maintain --force` bypasses.
- **`model`** — override the model for `claude -p`. Defaults to Claude Code's default.
- **`promptFile`** — point at a custom maintenance prompt file (relative to repo root).

</details>

<details>
<summary><strong>Customizing the maintenance prompt</strong></summary>

Edit `~/.claude/memory/maintenance/prompt.md`. Your rules, your dormancy windows, your classification logic. The file is versioned with everything else, so every past run's behavior is reconstructible.

Placeholders the wrapper substitutes: `{{RUN_ID}}`, `{{TODAY}}`, `{{HOSTNAME}}`.

</details>

<details>
<summary><strong>Reconstructing or undoing a maintenance run</strong></summary>

Every run ID maps to a commit titled `chore: memory maintenance (run <id>)`.

```bash
commit=$(git log --grep "run 202604210317" -1 --format=%H)
git show "$commit":maintenance/prompt.md      # prompt at that time
git show "$commit"                             # diff of the run
git show "$commit^":daily/2026-03-14.md       # an input just before the run
git revert "$commit"                           # undo the whole pass
```

The ledger:

```jsonl
{"v":1,"at":"2026-04-21T03:17:00Z","run":"202604210317-a1b2","action":"summarize_dailies","sources":["daily/2026-03-01.md","…"],"target":"archive.md","target_heading":"## 2026-03 Daily Notes","rationale":"monthly rollup"}
```

Query with `jq`:

```bash
grep '"action":"classify_inbox"' maintenance/ledger.jsonl | jq
```

</details>

<details>
<summary><strong>Command reference</strong></summary>

Everyday: `ccm init`, `ccm inbox`, `ccm status`, `ccm uninstall`.

Occasional:
- `ccm sync` — force a pull + commit + push right now
- `ccm maintain` — run one maintenance pass now
- `ccm maintain --dry-run` — preview without calling Claude or taking the sync lock
- `ccm maintain --force` — bypass the 20 h throttle and the coordinator-host check
- `ccm maintain --install` / `--uninstall` — schedule or remove the daily timer

Internal (invoked by the services and hooks — don't run these by hand): `ccm watch`, `ccm pull`, `ccm hook <event>`.

</details>

---

## FAQ

**Where does my memory live on disk?**
`~/.claude/memory/` by default. Override with `MEMORY_REPO=/path/to/dir`.

**Does this touch Claude Code's built-in `/memory`?**
No. Built-in `/memory` stays per-project. This loads via hooks that run regardless of cwd.

**Is it safe on multiple machines at once?**
Yes. Each machine runs its own watchdog. Commits are tagged `[hostname]`. `pull --rebase --autostash` before every push; races fall back to ordinary git semantics.

**Can I keep secrets in my memory repo?**
No. The repo is plaintext on disk. Keep secrets in your password manager; reference them by name in memory files.

**What about Windows?**
v0.2 targets macOS and Linux. Windows via WSL works. Native Windows is planned.

**Will it slow down my prompts?**
The `UserPromptSubmit` hook returns in ~100 ms and kicks its git pull into a detached background process. You won't notice it.

**Can I use a non-GitHub remote?**
Yes. `ccm init <any-git-url>` works with GitLab, Bitbucket, self-hosted, whatever git understands.

---

## Contributing

Issues and PRs welcome. No contributor agreement.

## License

MIT © 2026 David Baum
