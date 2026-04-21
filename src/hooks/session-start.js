import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../core/config.js";
import { headSha } from "../core/git.js";
import { repoPath, stateDir } from "../core/paths.js";

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function latestDailyNote(repo, dir = "daily") {
  const full = path.join(repo, dir);
  if (!fs.existsSync(full)) return null;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  for (const d of [today, yesterday]) {
    const p = path.join(full, `${d}.md`);
    if (fs.existsSync(p)) return { date: d, content: read(p) };
  }
  // Fallback: newest .md in daily/
  const entries = fs.readdirSync(full).filter((f) => f.endsWith(".md")).sort().reverse();
  if (!entries.length) return null;
  const f = entries[0];
  return { date: f.replace(/\.md$/, ""), content: read(path.join(full, f)) };
}

export function runSessionStart(ccmBin) {
  const repo = repoPath();
  if (!fs.existsSync(path.join(repo, ".git"))) {
    process.stdout.write("{}\n");
    return;
  }

  // Kick a detached background pull. It runs independently of this hook; the
  // hook returns as soon as we emit JSON below, never stalling session start.
  const p = spawn(process.execPath, [ccmBin, "pull"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  p.unref();

  // Seed last-notified SHA for UserPromptSubmit diffing.
  fs.mkdirSync(stateDir(), { recursive: true });
  const sha = headSha();
  if (sha) fs.writeFileSync(path.join(stateDir(), "last-notified-sha"), sha);

  const cfg = loadConfig(repo);
  const parts = [
    "# Shared memory (auto-loaded by paramem)\n\n",
    "This content comes from the git-backed memory store mounted at the ",
    "configured location. Writes to files in this repo are synced to your remote ",
    "within seconds. To save a new memory, edit or create the appropriate file ",
    "with the Write tool and update MEMORY.md (the index).\n",
  ];

  for (const rel of cfg.sessionStart.files) {
    const content = read(path.join(repo, rel));
    if (!content) continue;
    parts.push(`\n## ${rel}\n\n`, content);
  }

  if (cfg.sessionStart.includeLatestDailyNote) {
    const note = latestDailyNote(repo, cfg.sessionStart.dailyNoteDir);
    if (note) parts.push(`\n\n## Daily note (${note.date})\n\n`, note.content);
  }

  const payload = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: parts.join(""),
    },
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
}
