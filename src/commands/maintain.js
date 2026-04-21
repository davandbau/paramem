import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../core/config.js";
import { git, hasStaged } from "../core/git.js";
import { acquire, release } from "../core/lock.js";
import { logsDir, repoPath, stateDir, templatesDir } from "../core/paths.js";
import { claudeInstalled, runClaudePrompt } from "../core/claude.js";
import { installMaintenanceTimer, uninstallMaintenanceTimer } from "../core/services.js";
import { resolveCcmBin } from "../core/settings.js";
import { err, heading, info, ok, warn } from "../core/logger.js";

const HOSTNAME = os.hostname().split(".")[0];
const FORBIDDEN_PATTERNS = [/^user_profile\.md$/, /^feedback_.*\.md$/];

function runId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const rand = crypto.randomBytes(2).toString("hex");
  return `${ts}-${rand}`;
}

function appendLog(line) {
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.appendFileSync(
    path.join(logsDir(), "maintenance.log"),
    `${new Date().toISOString()} ${line}\n`
  );
}

function ensureMaintenanceAssets(repo) {
  const maintDir = path.join(repo, "maintenance");
  fs.mkdirSync(maintDir, { recursive: true });
  const prompt = path.join(maintDir, "prompt.md");
  if (!fs.existsSync(prompt)) {
    const tpl = path.join(templatesDir(), "starter", "maintenance", "prompt.md");
    if (fs.existsSync(tpl)) fs.copyFileSync(tpl, prompt);
  }
  const ledger = path.join(maintDir, "ledger.jsonl");
  if (!fs.existsSync(ledger)) fs.writeFileSync(ledger, "");
  const readme = path.join(maintDir, "README.md");
  if (!fs.existsSync(readme)) {
    const tpl = path.join(templatesDir(), "starter", "maintenance", "README.md");
    if (fs.existsSync(tpl)) fs.copyFileSync(tpl, readme);
  }
  const inbox = path.join(repo, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(path.join(inbox, "processed"), { recursive: true });
  const inboxReadme = path.join(inbox, "README.md");
  if (!fs.existsSync(inboxReadme)) {
    const tpl = path.join(templatesDir(), "starter", "inbox", "README.md");
    if (fs.existsSync(tpl)) fs.copyFileSync(tpl, inboxReadme);
  }
}

function hoursSinceLastRun(repo) {
  const p = path.join(stateDir(), "last-maintenance-at");
  if (!fs.existsSync(p)) return Infinity;
  try {
    const ts = parseInt(fs.readFileSync(p, "utf8"), 10);
    return (Date.now() - ts) / 36e5;
  } catch {
    return Infinity;
  }
}

function writeLastRun() {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(
    path.join(stateDir(), "last-maintenance-at"),
    String(Date.now())
  );
}

function revertForbiddenChanges(repo) {
  const r = spawnSync(
    "git",
    ["-C", repo, "diff", "--cached", "--name-only"],
    { encoding: "utf8" }
  );
  const staged = (r.stdout || "").split("\n").filter(Boolean);
  const toRevert = staged.filter((f) =>
    FORBIDDEN_PATTERNS.some((re) => re.test(path.basename(f)))
  );
  if (!toRevert.length) return [];
  for (const f of toRevert) {
    spawnSync("git", ["-C", repo, "restore", "--staged", f], { stdio: "ignore" });
    spawnSync("git", ["-C", repo, "checkout", "--", f], { stdio: "ignore" });
  }
  return toRevert;
}

function parseFlags(args) {
  const out = { dryRun: false, install: false, uninstall: false, force: false };
  for (const a of args) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--install") out.install = true;
    else if (a === "--uninstall") out.uninstall = true;
    else if (a === "--force" || a === "-f") out.force = true;
  }
  return out;
}

export async function runMaintain(args) {
  const flags = parseFlags(args);
  const repo = repoPath();
  const cfg = loadConfig(repo);
  const ccmBin = resolveCcmBin();

  if (flags.install) {
    heading("install maintenance timer");
    const [h, m] = parseCron(cfg.maintenance.cron);
    installMaintenanceTimer({ ccmBin, hour: h, minute: m });
    ok(`installed, runs daily at ${pad2(h)}:${pad2(m)} local time`);
    return;
  }
  if (flags.uninstall) {
    heading("uninstall maintenance timer");
    uninstallMaintenanceTimer();
    ok("removed");
    return;
  }

  if (!fs.existsSync(path.join(repo, ".git"))) {
    err(`not initialized: ${repo} (run 'ccm init' first)`);
    process.exit(1);
  }

  if (cfg.maintenance.coordinatorHost && cfg.maintenance.coordinatorHost !== HOSTNAME) {
    appendLog(`skip: coordinatorHost=${cfg.maintenance.coordinatorHost} != ${HOSTNAME}`);
    if (!flags.force) {
      info(`this host (${HOSTNAME}) is not the coordinator (${cfg.maintenance.coordinatorHost}); skipping`);
      return;
    }
  }

  if (!flags.force) {
    const hours = hoursSinceLastRun(repo);
    if (hours < cfg.maintenance.minHoursBetweenRuns) {
      appendLog(`skip: last run ${hours.toFixed(1)}h ago`);
      info(`skipping — last run ${hours.toFixed(1)}h ago (< ${cfg.maintenance.minHoursBetweenRuns}h throttle)`);
      return;
    }
  }

  if (!claudeInstalled()) {
    err("'claude' CLI not found on PATH. Install Claude Code to enable maintenance.");
    err("https://docs.claude.com/en/docs/claude-code/overview");
    process.exit(1);
  }

  const acquired = await acquire({ waitMs: 5_000 });
  if (!acquired) {
    warn("sync lock is busy; maintenance will retry on next cycle");
    return;
  }

  try {
    heading("claude-code-memory maintenance");
    ensureMaintenanceAssets(repo);

    // Fresh pull before reasoning.
    const pull = git(["pull", "--rebase", "--autostash", "origin", cfg.branch]);
    if (pull.code !== 0) warn(`pull non-zero: ${pull.stderr.split("\n")[0]}`);

    const rid = runId();
    const promptFile = cfg.maintenance.promptFile
      ? path.resolve(repo, cfg.maintenance.promptFile)
      : path.join(repo, "maintenance", "prompt.md");
    const rawPrompt = fs.readFileSync(promptFile, "utf8");
    const today = new Date().toISOString().slice(0, 10);
    const prompt = rawPrompt
      .replaceAll("{{RUN_ID}}", rid)
      .replaceAll("{{TODAY}}", today)
      .replaceAll("{{HOSTNAME}}", HOSTNAME);

    if (flags.dryRun) {
      info(`run id:      ${rid}`);
      info(`prompt file: ${promptFile}`);
      info(`model:       ${cfg.maintenance.model || "(claude default)"}`);
      info(`repo:        ${repo}`);
      info("dry-run — not calling claude");
      return;
    }

    info(`run ${rid} — calling claude -p (timeout ${cfg.maintenance.timeoutSeconds}s)`);
    appendLog(`run ${rid} start`);
    const result = runClaudePrompt({
      prompt,
      cwd: repo,
      addDirs: [repo],
      timeoutMs: cfg.maintenance.timeoutSeconds * 1000,
      model: cfg.maintenance.model,
      onLog: (stream, chunk) => {
        fs.appendFileSync(
          path.join(logsDir(), "maintenance.log"),
          `--- claude ${stream} ---\n${chunk}\n`
        );
      },
    });

    if (result.timedOut) {
      err(`claude -p timed out after ${cfg.maintenance.timeoutSeconds}s`);
      appendLog(`run ${rid} TIMEOUT`);
      return;
    }
    if (result.code !== 0) {
      err(`claude -p exited ${result.code}`);
      appendLog(`run ${rid} FAIL code=${result.code}`);
      return;
    }

    git(["add", "-A"]);
    if (!hasStaged()) {
      ok("no changes this run");
      writeLastRun();
      appendLog(`run ${rid} noop`);
      return;
    }

    const reverted = revertForbiddenChanges(repo);
    if (reverted.length) {
      warn(`reverted ${reverted.length} write(s) to forbidden files: ${reverted.join(", ")}`);
      appendLog(`run ${rid} reverted-forbidden=${reverted.join(",")}`);
      git(["add", "-A"]);
      if (!hasStaged()) { ok("nothing left to commit after reverting forbidden writes"); writeLastRun(); return; }
    }

    const msg = `chore: memory maintenance (run ${rid})`;
    const commit = git(["commit", "-m", msg]);
    if (commit.code !== 0) {
      err(`commit failed: ${commit.stderr}`);
      appendLog(`run ${rid} commit-failed`);
      return;
    }
    const push = git(["push", "origin", cfg.branch]);
    if (push.code !== 0) {
      err(`push failed: ${push.stderr}`);
      appendLog(`run ${rid} push-failed`);
      return;
    }

    writeLastRun();
    ok(`maintenance committed and pushed: ${msg}`);
    appendLog(`run ${rid} ok`);
  } finally {
    release();
  }
}

function parseCron(expr) {
  const parts = (expr || "17 3 * * *").trim().split(/\s+/);
  const minute = parseInt(parts[0], 10) || 17;
  const hour = parseInt(parts[1], 10) || 3;
  return [hour, minute];
}

function pad2(n) { return String(n).padStart(2, "0"); }
