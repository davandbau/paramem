# Maintenance

This directory controls the autonomous memory maintenance pass.

- **`prompt.md`** — the instructions Claude follows when `paramem maintain` runs. Edit to tune behavior (e.g. change the 180-day dormancy window, add new steps, change rules). Changes take effect on the next run.
- **`ledger.jsonl`** — append-only decision log. Each line is one action taken by a maintenance run: what was moved/merged/summarized, when, why, and under which run ID.

## Querying the ledger

```bash
# All actions from a specific run:
grep '"run":"20260421' maintenance/ledger.jsonl | jq

# Everything ever done to a source file:
grep -F '"source":"inbox/notes-2026-03-15.md"' maintenance/ledger.jsonl | jq

# All daily-note summaries:
grep '"action":"summarize_dailies"' maintenance/ledger.jsonl | jq
```

## Reconstructing a decision

Every `run` ID corresponds to a git commit message `chore: memory maintenance (run <id>)`.

```bash
# Find the commit:
commit=$(git log --grep "run 20260421" -1 --format=%H)

# See what the prompt was at that time:
git show $commit:maintenance/prompt.md

# See exactly what changed:
git show $commit

# See what the inputs looked like:
git show $commit^:daily/2026-03-14.md   # the commit before maintenance
```

## Disabling maintenance

Set `maintenance.enabled = false` in `.claude-memory.json` at the repo root, or run:

```bash
paramem maintain --uninstall
```

…to remove the daily timer. The `paramem maintain` command still works manually, but no schedule.
