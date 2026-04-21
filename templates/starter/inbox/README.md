# Inbox

Dump raw unstructured notes here. No format, no frontmatter required. The daily autonomous maintenance pass (`ccm maintain`) classifies each file and routes it into the right PARA location — projects, areas, resources, daily notes, or a new topic file — then moves the original into `processed/` for audit.

## Usage

```bash
# From anywhere, with the ccm CLI:
ccm inbox "your freeform content here"
ccm inbox path/to/notes.txt
echo "..." | ccm inbox -

# Or just drop a file here manually:
echo "some thoughts" > ~/.claude/memory/inbox/meeting-with-jim.md
```

The watchdog syncs it to your remote immediately. It stays here until the next maintenance pass (by default nightly at 03:17 local — configurable in `.claude-memory.json`). After classification, the file moves to `processed/YYYY-MM-DD-<name>.md` with the original content intact.

## Rules

- Files in the `inbox/` root are the work queue.
- Files in `inbox/processed/` are archived originals — never deleted, never re-processed.
- You can put any `.md` file here. The maintenance agent reads them all.

## If you need immediate classification

```bash
ccm maintain --force       # skips the throttle check
```
