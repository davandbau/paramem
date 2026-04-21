import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HOME, repoPath, templatesDir } from "../core/paths.js";
import { loadConfig } from "../core/config.js";
import { mergeHooks, resolveCcmBin } from "../core/settings.js";
import { install, platform } from "../core/services.js";
import { ok, info, warn, err, heading } from "../core/logger.js";

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

function parseFlags(args) {
  const out = { remote: null, empty: false, force: false, path: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--remote" || a === "-r") out.remote = args[++i];
    else if (a === "--empty") out.empty = true;
    else if (a === "--force" || a === "-f") out.force = true;
    else if (a === "--path" || a === "-p") out.path = args[++i];
    else if (!a.startsWith("-") && !out.remote) out.remote = a;
  }
  return out;
}

export async function runInit(args) {
  const flags = parseFlags(args);
  if (flags.path) process.env.MEMORY_REPO = flags.path;

  const repo = repoPath();
  heading("claude-code-memory init");
  info(`target: ${repo}`);

  // 1. Dependencies
  for (const bin of ["git"]) {
    if (!which(bin)) { err(`${bin} not found on PATH`); process.exit(1); }
  }
  ok("git found");

  // 2. Create/clone repo
  if (exists(path.join(repo, ".git"))) {
    info("repo already initialized, pulling latest");
    const r = spawnSync("git", ["-C", repo, "pull", "--rebase", "--autostash"], { stdio: "inherit" });
    if (r.status !== 0) warn("pull failed; continuing");
  } else if (flags.empty || !flags.remote) {
    info(`creating new memory repo at ${repo}`);
    fs.mkdirSync(repo, { recursive: true });
    const gi = spawnSync("git", ["-C", repo, "init", "-b", "main"], { stdio: "inherit" });
    if (gi.status !== 0) { err("git init failed"); process.exit(1); }
    copyStarterContent(repo);
    spawnSync("git", ["-C", repo, "add", "-A"], { stdio: "inherit" });
    spawnSync("git", ["-C", repo, "commit", "-m", "chore: bootstrap claude-code-memory"], { stdio: "inherit" });
    if (flags.remote) {
      spawnSync("git", ["-C", repo, "remote", "add", "origin", flags.remote], { stdio: "inherit" });
      warn(`remote added as 'origin': ${flags.remote}. push manually when ready: git -C ${repo} push -u origin main`);
    }
  } else {
    info(`cloning ${flags.remote} -> ${repo}`);
    fs.mkdirSync(path.dirname(repo), { recursive: true });
    const r = spawnSync("git", ["clone", flags.remote, repo], { stdio: "inherit" });
    if (r.status !== 0) { err("clone failed"); process.exit(1); }
  }
  ok(`repo ready: ${repo}`);

  // 2b. Ensure maintenance assets exist even on a prior clone.
  ensureMaintenanceAssets(repo);

  // 3. Services
  const ccmBin = resolveCcmBin();
  const cfg = loadConfig(repo);
  try {
    install({ ccmBin, intervalSeconds: cfg.pullIntervalSeconds ?? 60 });
    ok(`${platform() === "darwin" ? "launchd" : "systemd"} services installed`);
  } catch (e) {
    err(`service install failed: ${e.message}`);
    process.exit(1);
  }

  // 4. Hooks
  const changed = mergeHooks(ccmBin);
  ok(`Claude Code hooks ${changed ? "merged into" : "already present in"} ~/.claude/settings.json`);

  heading("done");
  info(`tail logs:    tail -f ${repo}/.logs/watchdog.log ${repo}/.logs/puller.log`);
  info(`status:       ccm status`);
  info(`uninstall:    ccm uninstall`);
  info("");
  info("autonomous maintenance is opt-in. To enable:");
  info("  ccm maintain --install     # schedule daily (03:17 local by default)");
  info("  ccm maintain               # run one pass now");
  info("requires the 'claude' CLI (Claude Code MAX subscription, uses your OAuth session — no API key)");
  info("");
  info("new Claude Code sessions will auto-load memory via SessionStart hook");
}

function which(cmd) {
  const r = spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim();
}

function copyStarterContent(dest) {
  const src = path.join(templatesDir(), "starter");
  copyRecursive(src, dest);
}

function copyRecursive(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function ensureMaintenanceAssets(repo) {
  const src = path.join(templatesDir(), "starter");
  const copies = [
    ["maintenance/prompt.md", "maintenance/prompt.md"],
    ["maintenance/README.md", "maintenance/README.md"],
    ["maintenance/ledger.jsonl", "maintenance/ledger.jsonl"],
    ["inbox/README.md", "inbox/README.md"],
    ["inbox/processed/.gitkeep", "inbox/processed/.gitkeep"],
  ];
  for (const [rel, tpl] of copies) {
    const target = path.join(repo, rel);
    if (fs.existsSync(target)) continue;
    const source = path.join(src, tpl);
    if (!fs.existsSync(source)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}
