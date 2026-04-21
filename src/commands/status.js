import fs from "node:fs";
import path from "node:path";
import { git, headSha, remoteHeadSha } from "../core/git.js";
import { logsDir, repoPath, stateDir } from "../core/paths.js";
import { serviceStatus } from "../core/services.js";
import { settingsSummary } from "../core/settings.js";
import { loadConfig } from "../core/config.js";
import { heading, info, ok, warn } from "../core/logger.js";

function tail(file, n = 5) {
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    return lines.slice(-n).join("\n");
  } catch {
    return "";
  }
}

export function runStatus() {
  const repo = repoPath();
  heading("paramem status");
  info(`repo: ${repo}`);
  if (!fs.existsSync(path.join(repo, ".git"))) {
    warn("not initialized — run: paramem init <git-url>");
    return;
  }

  const local = headSha();
  const remote = remoteHeadSha();
  info(`local HEAD:  ${local || "(none)"}`);
  info(`remote HEAD: ${remote || "(not fetched)"}`);
  if (local && remote && local !== remote) warn("local and remote HEAD diverge — try: paramem sync");
  else if (local && remote) ok("in sync with origin/main");

  heading("services");
  info(serviceStatus());

  heading("Claude Code hooks");
  const hooks = settingsSummary();
  const interesting = ["SessionStart", "UserPromptSubmit"];
  for (const event of interesting) {
    const cmds = hooks[event] || [];
    if (cmds.length) ok(`${event}: ${cmds.join(", ")}`);
    else warn(`${event}: no hook installed`);
  }

  heading("maintenance");
  const cfg = loadConfig(repo);
  info(`enabled:    ${cfg.maintenance.enabled}`);
  info(`schedule:   ${cfg.maintenance.cron} (local)`);
  info(`coordinator: ${cfg.maintenance.coordinatorHost || "(any host)"}`);
  const lastFile = path.join(stateDir(), "last-maintenance-at");
  if (fs.existsSync(lastFile)) {
    try {
      const ts = parseInt(fs.readFileSync(lastFile, "utf8"), 10);
      const ago = ((Date.now() - ts) / 36e5).toFixed(1);
      info(`last run:   ${new Date(ts).toISOString()} (${ago}h ago)`);
    } catch {}
  } else {
    info("last run:   never");
  }
  const ledger = path.join(repo, "maintenance", "ledger.jsonl");
  if (fs.existsSync(ledger)) {
    const lines = fs.readFileSync(ledger, "utf8").split("\n").filter(Boolean).length;
    info(`ledger:     ${lines} entries`);
  } else {
    info("ledger:     (not initialized)");
  }

  heading("recent watchdog log");
  info(tail(path.join(logsDir(), "watchdog.log")) || "(empty)");

  heading("recent puller log");
  info(tail(path.join(logsDir(), "puller.log")) || "(empty)");

  heading("recent maintenance log");
  info(tail(path.join(logsDir(), "maintenance.log")) || "(empty)");
}
