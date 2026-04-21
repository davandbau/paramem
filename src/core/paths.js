import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const HOME = homedir();

export function repoPath() {
  return process.env.PARAMEM_REPO || process.env.MEMORY_REPO || path.join(HOME, ".claude", "memory");
}

export function logsDir() {
  return path.join(repoPath(), ".logs");
}

export function stateDir() {
  return path.join(repoPath(), ".state");
}

export function lockDir() {
  return path.join(stateDir(), "lock.d");
}

export function claudeSettingsPath() {
  return path.join(HOME, ".claude", "settings.json");
}

export function launchAgentsDir() {
  return path.join(HOME, "Library", "LaunchAgents");
}

export function systemdUserDir() {
  return path.join(HOME, ".config", "systemd", "user");
}

export function packageRoot() {
  // When bundled or installed globally, templates live two levels up from this file.
  const here = fileURLToPath(new URL(".", import.meta.url));
  return path.resolve(here, "..", "..");
}

export function templatesDir() {
  return path.join(packageRoot(), "templates");
}
