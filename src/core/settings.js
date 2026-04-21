import fs from "node:fs";
import path from "node:path";
import { claudeSettingsPath } from "./paths.js";

const HOOK_SUBCOMMANDS = new Set(["session-start", "prompt-submit"]);

function loadSettings() {
  const p = claudeSettingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`cannot parse ${p}: ${e.message}`);
  }
}

function writeSettings(data) {
  const p = claudeSettingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

function hookEntry(cmd) {
  return { matcher: ".*", hooks: [{ type: "command", command: cmd }] };
}

// Match any command whose tail is `hook session-start` or `hook prompt-submit`,
// regardless of the preceding path. This lets us dedup across npm upgrades and
// across machines with different node install paths.
function isOurHookCommand(cmd, subcommand) {
  if (typeof cmd !== "string") return false;
  const suffix = ` hook ${subcommand}`;
  if (!cmd.endsWith(suffix)) return false;
  const head = cmd.slice(0, -suffix.length).trim();
  // Head must look like an invocation of this tool:
  // - bare binary (ends in `paramem`, or legacy `ccm`)
  // - node script (ends in `cli.js` or any `.js`)
  return (
    head.endsWith("paramem") ||
    head.endsWith("ccm") ||           // legacy, pre-rename
    head.endsWith("cli.js") ||
    head.endsWith(".js")
  );
}

export function mergeHooks(ccmBin) {
  const data = loadSettings();
  data.hooks ||= {};
  const events = {
    SessionStart: `${ccmBin} hook session-start`,
    UserPromptSubmit: `${ccmBin} hook prompt-submit`,
  };
  let changed = false;

  for (const [event, cmd] of Object.entries(events)) {
    const sub = event === "SessionStart" ? "session-start" : "prompt-submit";
    const groups = (data.hooks[event] ||= []);

    // Strip any pre-existing ccm hooks for this event (stale paths, duplicates).
    let strippedAny = false;
    const cleaned = [];
    for (const g of groups) {
      const remaining = (g.hooks || []).filter((h) => !isOurHookCommand(h.command, sub));
      if (remaining.length !== (g.hooks || []).length) strippedAny = true;
      if (remaining.length) cleaned.push({ ...g, hooks: remaining });
    }
    data.hooks[event] = cleaned;
    if (strippedAny) changed = true;

    // Add the fresh entry.
    data.hooks[event].push(hookEntry(cmd));
    changed = true;
  }

  if (changed) writeSettings(data);
  return changed;
}

export function removeHooks() {
  const data = loadSettings();
  if (!data.hooks) return false;
  let changed = false;
  for (const event of Object.keys(data.hooks)) {
    const sub = event === "SessionStart" ? "session-start"
      : event === "UserPromptSubmit" ? "prompt-submit"
      : null;
    if (!sub) continue;
    const newGroups = [];
    for (const g of data.hooks[event]) {
      const hooks = (g.hooks || []).filter((h) => !isOurHookCommand(h.command, sub));
      if (hooks.length !== (g.hooks || []).length) changed = true;
      if (hooks.length) newGroups.push({ ...g, hooks });
    }
    if (newGroups.length) data.hooks[event] = newGroups;
    else delete data.hooks[event];
  }
  if (changed) writeSettings(data);
  return changed;
}

export function settingsSummary() {
  const data = loadSettings();
  const out = {};
  for (const [event, groups] of Object.entries(data.hooks || {})) {
    out[event] = groups.flatMap((g) => (g.hooks || []).map((h) => h.command));
  }
  return out;
}

/**
 * Resolve the absolute path to the paramem entry script for use in launchd
 * plists and settings.json hooks. We intentionally refuse to return a relative
 * path: launchd/systemd run from arbitrary cwds, and Claude Code hooks run
 * from the cwd of each session.
 */
export function resolveBin() {
  if (process.env.PARAMEM_BIN) return path.resolve(process.env.PARAMEM_BIN);
  if (process.env.CCM_BIN) return path.resolve(process.env.CCM_BIN); // legacy
  const argv1 = process.argv[1];
  if (argv1) {
    const resolved = path.resolve(argv1);
    if (path.isAbsolute(resolved)) return resolved;
  }
  return "paramem";
}

// Legacy export for call sites not yet migrated.
export const resolveCcmBin = resolveBin;

// Exported for tests.
export const _internal = { isOurHookCommand };
