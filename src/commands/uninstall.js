import { removeHooks, resolveCcmBin } from "../core/settings.js";
import { uninstall, uninstallMaintenanceTimer } from "../core/services.js";
import { repoPath } from "../core/paths.js";
import { ok, info, heading } from "../core/logger.js";

export function runUninstall() {
  heading("claude-code-memory uninstall");
  const removedSvc = uninstall();
  ok(`watchdog + puller ${removedSvc ? "removed" : "not installed"}`);

  const removedTimer = uninstallMaintenanceTimer();
  ok(`maintenance timer ${removedTimer ? "removed" : "not installed"}`);

  const changed = removeHooks(resolveCcmBin());
  ok(`hooks ${changed ? "removed" : "not present"} in ~/.claude/settings.json`);

  info(`memory repo left intact at ${repoPath()}`);
}
