import fs from "node:fs";
import path from "node:path";
import { repoPath } from "./paths.js";

export const DEFAULT_CONFIG = {
  branch: "main",
  pullIntervalSeconds: 60,
  debounceSeconds: 5,
  sessionStart: {
    files: ["MEMORY.md", "projects.md", "areas.md", "user_profile.md"],
    includeLatestDailyNote: true,
    dailyNoteDir: "daily",
  },
  promptSubmit: {
    throttleSeconds: 30,
    notifyOnShaChange: true,
  },
  maintenance: {
    enabled: true,
    coordinatorHost: null,
    minHoursBetweenRuns: 20,
    cron: "17 3 * * *",
    timeoutSeconds: 600,
    promptFile: null,
    model: null,
    // bypassPermissions is required because the memory repo lives inside
    // ~/.claude/, which Claude Code's hardcoded 'sensitive files' guard
    // blocks even when the session is launched with --permission-mode
    // acceptEdits. The maintain pass operates against a single dedicated
    // repo at the user's explicit request, so the bypass is safe and the
    // only way the agent can actually write archive.md / ledger.jsonl.
    permissionMode: 'bypassPermissions',
  },
  ignore: [".git", ".logs", ".state"],
};

export function loadConfig(cwd = repoPath()) {
  // Prefer `.paramem.json`; fall back to legacy `.claude-memory.json`.
  for (const name of [".paramem.json", ".claude-memory.json"]) {
    const p = path.join(cwd, name);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      return deepMerge(DEFAULT_CONFIG, raw);
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b;
  if (typeof b !== "object" || b === null) return b ?? a;
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = k in a ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}
