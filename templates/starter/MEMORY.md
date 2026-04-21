# Memory Index

This is your persistent memory, auto-loaded by Claude Code on every session
through `paramem`. Writes are synced to your git remote within
seconds by a local watchdog. Other machines running `paramem` pull every 60s.

Edit these files directly to shape what Claude sees. Update the index below
when you add a new memory file.

## PARA

- [Projects](projects.md) — active work by priority (P1–P4)
- [Areas](areas.md) — ongoing responsibilities, not time-bounded
- [Resources](resources.md) — durable reference material
- [Archive](archive.md) — completed or dormant projects
- [Daily notes](daily/) — session summaries by date (YYYY-MM-DD.md)

## User

- [User profile](user_profile.md) — who you are, how you work

## Adding a new memory

1. Create `<topic>.md` in the repo root with frontmatter:
   ```
   ---
   name: Short title
   description: One-line hook shown in the index
   type: project | feedback | reference | user
   ---
   ```
2. Add a bullet to the appropriate section above pointing at the file.
3. Save. The watchdog commits and pushes within seconds.
