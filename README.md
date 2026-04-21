# claude-code-memory

**Persistent, git-synced memory for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).**
PARA-organized context loaded on every session. Synced across machines in near-real time. Uses your OAuth Claude Code session, zero Anthropic API cost.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

## Why

Claude Code has built-in per-project memory, but it's scoped to a single working directory and doesn't move between machines. If you want Claude to know:

- who you are and how you work,
- which projects you're actually driving this week,
- lessons you've written down that apply everywhere,

you need one shared memory loaded in every session, editable like any markdown repo, and synced automatically. That's what this is.

## How it works

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

- **Watchdog**: a local daemon (`chokidar` + debounced git) commits and pushes within ~5s of any write.
- **Puller**: a 60s timer (`launchd` on macOS, `systemd --user` on Linux) fetches remote changes.
- **`SessionStart` hook**: injects `MEMORY.md`, `projects.md`, `areas.md`, `user_profile.md`, and the latest daily note as additional context on every new session.
- **`UserPromptSubmit` hook**: throttled background pull + a one-line notice when the remote HEAD has moved mid-session.

No runtime Anthropic API calls. All sync is git over SSH/HTTPS.

## Install

Requires Node 20+ and git. macOS or Linux.

```bash
npm install -g github:davandbau/claude-code-memory
```

_A tagged release on the npm registry (`npm install -g claude-code-memory`) is coming once v0.2.1 is hardened on two machines. Until then, install from the GitHub repo as above — you'll get `main`._

## First-time setup

**If you already have a memory repo on GitHub** (private is recommended):

```bash
ccm init git@github.com:you/your-memory.git
```

**Starting fresh:**

```bash
ccm init --empty
# creates ~/.claude/memory with PARA starter files
cd ~/.claude/memory
gh repo create you/your-memory --private --source=. --push
```

That's it. Next time you launch Claude Code, the memory is auto-loaded via the `SessionStart` hook.

## Commands

| Command                   | What it does                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| `ccm init`                | Clone/create repo, install services, wire hooks                         |
| `ccm status`              | Show SHA, service state, hook registration, maintenance state, log tails |
| `ccm sync`                | Force one pull+commit+push cycle                                        |
| `ccm maintain`            | Run one autonomous maintenance pass (ingest inbox, compact, archive…)   |
| `ccm maintain --dry-run`  | Preview what maintenance would do, without calling Claude or locking    |
| `ccm maintain --force`    | Bypass the 20h throttle and the coordinator-host check                  |
| `ccm maintain --install`  | Schedule a daily maintenance timer                                      |
| `ccm maintain --uninstall`| Remove the daily maintenance timer                                      |
| `ccm inbox <text\|file\|->` | Queue freeform content for the next maintenance pass                    |
| `ccm uninstall`           | Stop services, remove hooks (data is left intact)                       |

Internal commands (invoked by services/hooks — not typically run by hand): `ccm watch`, `ccm pull`, `ccm hook <event>`.

## Autonomous maintenance

The memory system organizes itself. On a schedule (default 03:17 local) or on demand (`ccm maintain`), an agent runs via `claude -p` on your Claude Code MAX subscription — no API key, no separate billing — and does the PARA housekeeping:

- **Inbox classification**: `inbox/*.md` files get routed into the right PARA location (project, area, resource, daily note, or a new topic file). Ambiguous content falls through to today's daily note. Originals move to `inbox/processed/` — never deleted.
- **Project compaction**: completed projects move from `projects.md` → `archive.md`.
- **Areas hygiene**: dormant areas (no activity in 180 days) archive; project-in-area sections get relocated to `projects.md`; overlapping areas merge.
- **Daily notes rollup**: notes >30 days old get a monthly summary in `archive.md`. The original daily files stay put.
- **Resources dedup**: duplicates in `resources.md` merge.
- **Index repair**: `MEMORY.md` is reconciled with what's actually in the repo.

**Nothing is deleted.** Everything moves. The safety net is git history.

### Provenance

Every maintenance run writes one JSON line per action to `maintenance/ledger.jsonl`:

```jsonl
{"v":1,"at":"2026-04-21T03:17:00Z","run":"202604210317-a1b2","action":"summarize_dailies","sources":["daily/2026-03-01.md","…"],"target":"archive.md","target_heading":"## 2026-03 Daily Notes","rationale":"monthly rollup"}
```

Run IDs map to git commits (`chore: memory maintenance (run <id>)`). To reconstruct any decision:

```bash
commit=$(git log --grep "run 202604210317" -1 --format=%H)
git show $commit:maintenance/prompt.md   # what the prompt was
git show $commit                          # exactly what changed
git show $commit^:daily/2026-03-14.md    # an input at the time
git revert $commit                        # undo the entire run
```

### Config

Drop `.claude-memory.json` in the repo root to override defaults:

```json
{
  "maintenance": {
    "enabled": true,
    "coordinatorHost": "my-macbook",
    "minHoursBetweenRuns": 20,
    "cron": "17 3 * * *",
    "timeoutSeconds": 600,
    "promptFile": null,
    "model": null
  }
}
```

- **`coordinatorHost`**: only the machine with this hostname runs maintenance. Leave `null` to let any machine run (safe via locks, but wasteful).
- **`minHoursBetweenRuns`**: throttle. `ccm maintain --force` bypasses it.
- **`model`**: override the model passed to `claude -p`. Defaults to whatever `claude` uses.
- **`promptFile`**: point at a custom prompt, relative to repo root. Defaults to `maintenance/prompt.md`.

### Customizing the prompt

The maintenance prompt lives at `maintenance/prompt.md` in your memory repo. Edit it to change rules (e.g. dormancy window from 180 to 90 days, add a new step, disable a step). Your change is versioned along with everything else. The prompt contains `{{RUN_ID}}`, `{{TODAY}}`, and `{{HOSTNAME}}` placeholders that the wrapper substitutes.

### Disabling maintenance

```bash
ccm maintain --uninstall   # stops the daily timer
```

or set `maintenance.enabled = false` in `.claude-memory.json`.

### Queuing content for the next pass

```bash
ccm inbox "Feedback: prefer terse bullet lists over prose"   # inline text
ccm inbox notes/meeting-2026-04-21.md                        # read a file
echo "unstructured thought" | ccm inbox -                    # from stdin
```

`ccm inbox <arg>` treats a single argument as a file **only if** it looks path-like (contains `/`, starts with `~`, or has a file extension) **and** exists. Otherwise the argument is treated as text, so `ccm inbox README` won't accidentally slurp a `README` file in cwd — you'd need to write `ccm inbox ./README` for that.

## Repo layout (your memory repo)

The `--empty` starter uses a [PARA](https://fortelabs.com/blog/para/)-inspired structure:

```
your-memory/
├── MEMORY.md           # index — Claude reads this on every session
├── projects.md         # active work, P1–P4
├── areas.md            # ongoing responsibilities
├── resources.md        # reference knowledge
├── archive.md          # completed projects
├── user_profile.md     # who you are
├── daily/
│   └── YYYY-MM-DD.md   # session summaries
├── feedback_*.md       # "do this / don't do this" rules you've learned
└── reference_*.md      # pointers to external systems (dashboards, vaults…)
```

The structure is **not enforced**. Tweak to taste. The SessionStart hook reads whatever files you list in `.claude-memory.json` (defaults: `MEMORY.md`, `projects.md`, `areas.md`, `user_profile.md`, plus the latest daily note).

## Config

Drop `.claude-memory.json` in your memory repo root to override defaults:

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
  "ignore": [".git", ".logs", ".state"]
}
```

## FAQ

**Where does my memory live on disk?**
`~/.claude/memory/` by default. Override with `MEMORY_REPO=/path/to/dir`.

**Does this touch Claude Code's built-in `/memory`?**
No. Built-in `/memory` stays cwd-scoped and untouched. `claude-code-memory` loads via hooks, which run regardless of cwd.

**Is this safe to run on multiple machines simultaneously?**
Yes. Each machine runs its own watchdog. Commits are tagged `[hostname]`. The watchdog does `pull --rebase --autostash` before each push, so races fall back to ordinary git rebase semantics.

**Can I keep secrets in my memory repo?**
Don't. The repo is plaintext on disk. Keep secrets in your password manager and reference them by name in memory files. See [resources.md starter](templates/starter/resources.md).

**What about Windows?**
v0.2 targets macOS (`launchd`) and Linux (`systemd --user`). Windows via WSL works. Native Windows (`schtasks` / Windows Service) is planned.

**Can I use this without GitHub?**
Yes — any git remote works (GitLab, self-hosted, Bitbucket). `ccm init <any-git-url>`.

**Will it slow down my prompts?**
The `UserPromptSubmit` hook returns in ~100 ms and does the git pull in a detached background process. You won't notice it.

## Uninstall

```bash
ccm uninstall          # stops services, removes hooks, leaves data
rm -rf ~/.claude/memory # if you also want to delete the data
```

## Contributing

Issues and PRs welcome. No contributor agreement.

## License

MIT © 2026 David Baum
