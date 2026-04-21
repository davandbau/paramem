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
  },
  ignore: [".git", ".logs", ".state"],
};

export function loadConfig(cwd = repoPath()) {
  const p = path.join(cwd, ".claude-memory.json");
  if (!fs.existsSync(p)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return deepMerge(DEFAULT_CONFIG, raw);
  } catch {
    return DEFAULT_CONFIG;
  }
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
